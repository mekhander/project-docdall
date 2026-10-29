"""규칙: 다음에 무엇을 할지는 코드가 정한다. (판단은 코드, 말은 AI)

이 파일은 AI도 파일 입출력도 쓰지 않는 순수한 상태 기계입니다.
상태(dict)와 판정 결과를 받아 상태를 바꾸고, 다음 행동(dict)을 돌려줍니다.
"""
import difflib
import unicodedata

from rubric import BY_KEY, KEYS, NAMES

CLEAR = "선명"
WEAK = "보완 필요"
EMPTY = "비어 있음"
VERDICTS = (CLEAR, WEAK, EMPTY)

OPENING_TEXT = "지금 가진 것을 알려 주세요. 한 줄 아이디어도, 이미 쓴 글도 괜찮습니다."
REVIEW_TEXT = (
    "인터뷰는 여기까지 정리할게요. 오른쪽 카드의 문장을 직접 고칠 수 있어요. "
    "한 줄 콘셉트가 선명하면 '출판 기획서 확정'을 누를 수 있습니다."
)
MAX_SUMMARY = 300


# ---------- 상태 만들기 ----------

def new_state(interview_id, now):
    return {
        "id": interview_id,
        "created_at": now,
        "updated_at": now,
        "phase": "interview",  # interview(인터뷰 중) / review(정리) / confirmed(확정)
        "current": KEYS[0],  # 지금 묻고 있는 차원. 모두 지나갔으면 None
        "dims": {
            k: {
                "verdict": EMPTY,
                "held": False,  # 보류(나중에) 여부
                "summary": "",  # 작가의 말로 쓴 한 문장 요약
                "quote": "",  # 요약의 근거가 된 작가 발화 일부
                "reason": "",  # 보완 필요인 이유
                "attempts": 0,  # 풀리지 않은 시도 횟수
                "prompted_at": 0,  # 3버튼 질문을 마지막으로 한 시도 횟수
                "options_shown": False,  # 선택지를 이미 보여 줬는지
                "edited": False,  # 작가가 카드에서 직접 고쳤는지
            }
            for k in KEYS
        },
        "answers": [],  # 작가가 직접 한 말(근거 확인용)
        "turns": [],  # 대화 기록 {role, text, kind, meta}
        "last": {"stuck": False, "off_topic": False},
        "pending": None,  # AI 단계가 끝나지 않았을 때 {"kind": "judge"|"speak", ...}
        "prompt": None,  # 마지막 편집자 질문 {kind, dim, text, options}
        "confirmed_at": None,
    }


def normalize(text):
    """비교용으로 공백, 문장부호, 기호, 따옴표(한글·영문)를 모두 없앤다."""
    return "".join(
        ch for ch in (text or "") if unicodedata.category(ch)[0] not in ("P", "S", "Z", "C")
    )


MIN_QUOTE = 6  # 정규화한 근거 인용의 최소 길이(너무 짧은 인용은 아무 데나 들어맞는다)
NEAR_RATIO = 0.9  # 거의 같은 글(글자 한두 개 차이)도 같은 문장으로 본다


def quote_supported(quote, answers):
    """quote 가 answers 중 한 답 안에 들어 있는지. 답마다 따로 검사한다(답끼리 이어 붙이지 않음)."""
    q = normalize(quote)
    if len(q) < MIN_QUOTE:
        return False
    for ans in answers:
        a = normalize(ans)
        if q in a:
            return True
        n = len(q)
        for i in range(0, len(a) - n + 1):  # 같은 길이의 창을 밀며 비슷한지 본다
            if difflib.SequenceMatcher(None, q, a[i:i + n]).ratio() >= NEAR_RATIO:
                return True
    return False


# ---------- 판정 결과 반영 ----------

def _parse(raw):
    """AI 판정이 형식에 맞는지 확인한다. 맞지 않으면 None."""
    if not isinstance(raw, dict):
        return None
    ups = raw.get("updates")
    if not isinstance(ups, list):
        return None
    if not isinstance(raw.get("stuck"), bool) or not isinstance(raw.get("off_topic"), bool):
        return None
    clean = []
    for u in ups:
        # 한 건이라도 형식이 틀리면 판정 전체를 형식 오류로 본다 (통과시키지 않는다)
        if not isinstance(u, dict):
            return None
        if not all(isinstance(u.get(f), str) for f in ("dim", "verdict", "summary", "quote", "reason")):
            return None
        if u["dim"] not in BY_KEY or u["verdict"] not in VERDICTS:
            return None
        clean.append(u)
    return {"updates": clean, "stuck": raw["stuck"], "off_topic": raw["off_topic"]}


def apply_judgment(state, raw, opening=False):
    """판정 결과를 상태에 반영한다 (코드 쪽 안전장치 포함).

    - 형식이 틀리면 아무것도 바꾸지 않고, 지금 차원만 '보완 필요'로 둔다.
    - 근거(quote)가 작가가 한 말에 그대로 들어 있지 않으면 그 차원의 갱신은 버린다.
    - 애매하면 통과시키지 않는다.
    """
    parsed = _parse(raw)
    cur = state["current"]
    accepted = set()
    rejected = set()  # 근거가 맞지 않아 버린 갱신의 차원
    stuck = off_topic = False
    if parsed:
        stuck, off_topic = parsed["stuck"], parsed["off_topic"]
        # 이번 판정은 방금 한 답에 대한 것이므로, 근거도 방금 한 답에서 나와야 한다.
        current_answer = state["answers"][-1] if state["answers"] else ""
        for u in parsed["updates"]:
            if u["verdict"] == EMPTY:
                continue  # '비어 있음'으로 되돌리는 갱신은 받지 않는다
            summary = u["summary"].strip()[:MAX_SUMMARY]
            quote = normalize(u["quote"])
            if not summary or not quote_supported(u["quote"], [current_answer]):
                rejected.add(u["dim"])
                continue  # 작가가 말하지 않은 내용은 카드에 넣지 않는다
            d = state["dims"][u["dim"]]
            d["verdict"] = u["verdict"]
            d["summary"] = summary
            d["quote"] = quote
            d["reason"] = u["reason"].strip() if u["verdict"] == WEAK else ""
            d["edited"] = False
            if u["verdict"] == CLEAR:
                d["held"] = False
            accepted.add(u["dim"])
    state["last"] = {"stuck": stuck, "off_topic": off_topic}
    if cur is None or stuck or off_topic:
        return
    d = state["dims"][cur]
    # 지금 차원에 대해 받아들인 갱신이 없으면 보완 필요로 둔다.
    # (첫 인사 답변은 여러 차원에 걸칠 수 있으므로, 형식이 틀렸을 때만 그렇게 한다.)
    forced = cur in rejected or not opening or parsed is None
    if cur not in accepted and d["verdict"] != CLEAR and forced:
        d["verdict"] = WEAK
        d["reason"] = d["reason"] or "답이 아직 분명하게 확인되지 않았어요."
    if d["verdict"] == WEAK:
        d["attempts"] += 1


# ---------- 이동 ----------

def advance(state):
    """지금 차원이 선명/보류면, 순서상 선명도 보류도 아닌 첫 차원으로 옮긴다."""
    cur = state["current"]
    if cur is not None:
        d = state["dims"][cur]
        if d["verdict"] != CLEAR and not d["held"]:
            return  # 해결될 때까지 같은 차원에 머문다
    nxt = next(
        (k for k in KEYS if state["dims"][k]["verdict"] != CLEAR and not state["dims"][k]["held"]),
        None,
    )
    state["current"] = nxt
    if nxt is None and not any(state["dims"][k]["held"] for k in KEYS):
        state["phase"] = "review"  # 전부 선명하면 바로 정리 단계


def hold(state):
    """'이 질문은 나중에': 지금 차원을 보류하고 다음으로 넘어간다."""
    cur = state["current"]
    if cur is None:
        return
    state["dims"][cur]["held"] = True
    state["last"] = {"stuck": False, "off_topic": False}
    advance(state)


def held_keys(state):
    return [k for k in KEYS if state["dims"][k]["held"] and state["dims"][k]["verdict"] != CLEAR]


# ---------- 다음 행동 ----------

def decide(state, request=None):
    """다음 행동을 정한다. request 는 작가가 버튼으로 요청한 것("options")."""
    if state["phase"] == "confirmed":
        return None
    if state["phase"] == "review":
        return {"kind": "review", "dim": None}
    cur = state["current"]
    if cur is None:
        return {"kind": "revisit", "dim": None}
    d = state["dims"][cur]
    attempts = d["attempts"]
    base = {"dim": cur, "attempt": attempts, "off_topic": state["last"]["off_topic"]}
    if request == "options":
        return {**base, "kind": "options"}
    if state["last"]["stuck"]:
        # 막힌 작가에게는 먼저 선택지를 보여 주고, 그래도 막히면 계속할지 묻는다.
        if not d["options_shown"]:
            return {**base, "kind": "options"}
        return {**base, "kind": "stuck_again"}
    if d["verdict"] == WEAK:
        if attempts >= 2 and attempts % 2 == 0 and d["prompted_at"] != attempts:
            return {**base, "kind": "choice"}
        angles = BY_KEY[cur]["angles"]
        return {**base, "kind": "probe", "angle": max(attempts - 1, 0) % len(angles)}
    return {**base, "kind": "ask"}


# 버튼이 필요한 질문 종류와 그 버튼들 (코드가 정한다)
BUTTONS = {
    "choice": [("continue", "계속 다듬기"), ("options", "선택지 보기"), ("skip", "일단 넘어가고 나중에 돌아오기")],
    "stuck_again": [("continue", "계속 다듬기"), ("skip", "일단 넘어가고 나중에 돌아오기")],
    "revisit": [("revisit_now", "지금 다시 보기"), ("finish_review", "이대로 정리하기")],
}


def fixed_text(action, state):
    """AI 없이 코드가 정한 고정 문장. AI를 쓰는 종류(ask/probe/options)는 None."""
    kind = action["kind"]
    name = NAMES.get(action.get("dim") or "", "")
    if kind == "choice":
        return f"'{name}' 항목이 아직 분명하지 않아요. 어떻게 할까요?"
    if kind == "stuck_again":
        return f"'{name}' 항목이 계속 어렵네요. 이어서 다듬을까요, 일단 넘어갈까요?"
    if kind == "revisit":
        names = ", ".join(NAMES[k] for k in held_keys(state))
        return f"나중으로 미룬 항목이 있어요: {names}. 지금 다시 볼까요, 이대로 정리할까요?"
    if kind == "review":
        return REVIEW_TEXT
    return None


# ---------- 확정 조건 ----------

def confirm_block_reason(state):
    """확정할 수 없는 이유(한국어). 확정할 수 있으면 None."""
    if state["phase"] == "confirmed":
        return "이미 확정된 기획서예요."
    if state["phase"] != "review":
        return "인터뷰를 정리 단계까지 마친 뒤에 확정할 수 있어요."
    c = state["dims"]["concept"]
    if c["verdict"] != CLEAR or not c["summary"].strip():
        return "한 줄 콘셉트가 선명해야 확정할 수 있어요."
    return None

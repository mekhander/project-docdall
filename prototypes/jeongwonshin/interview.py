"""인터뷰 진행: 저장소, AI, 규칙을 이어 붙이는 곳.

한 턴의 순서
1. 작가의 답을 상태에 넣고 먼저 저장한다 (AI가 실패해도 답은 남는다).
2. AI 판정 -> 규칙으로 반영 -> 저장.
3. 규칙이 다음 행동을 정하고, 필요하면 AI가 문장을 쓴다 -> 저장.
AI 단계가 실패하면 state["pending"] 에 남겨 두고, '다시 시도'가 그 지점부터 이어 간다.
"""
import time
import uuid

import rules
from editor_ai import AiError
from rubric import KEYS, NAMES
from rules import CLEAR, WEAK


class NotFound(Exception):
    pass


class RuleError(Exception):
    """규칙상 지금은 할 수 없는 요청. status 는 HTTP 상태 코드."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def view(state):
    """화면에 보낼 모습. 상태 전체에서 화면에 필요한 것만 추린다."""
    done = state["phase"] in ("review", "confirmed")
    dims = []
    for k in KEYS:
        d = state["dims"][k]
        if d["verdict"] == CLEAR:
            status = "clear"
        elif d["held"]:
            status = "held"
        elif d["verdict"] == WEAK:
            status = "working"
        else:
            status = "empty"
        dims.append(
            {
                "key": k,
                "name": NAMES[k],
                "verdict": d["verdict"],
                "status": status,
                "summary": d["summary"],
                "reason": d["reason"],
                "homework": done and d["verdict"] != CLEAR,
            }
        )
    reason = rules.confirm_block_reason(state)
    prompt = state["prompt"]
    return {
        "id": state["id"],
        "phase": state["phase"],
        "current": state["current"],
        "dims": dims,
        "turns": state["turns"],
        "prompt": prompt,
        "buttons": [
            {"action": a, "label": l} for a, l in rules.BUTTONS.get(prompt["kind"] if prompt else "", [])
        ],
        "pending": state["pending"] is not None,
        "can_hold": state["phase"] == "interview"
        and state["current"] is not None
        and state["pending"] is None
        and bool(state["answers"])
        and not (prompt and prompt["kind"] == "revisit"),
        "can_confirm": reason is None and state["pending"] is None,
        "confirm_hint": reason,
        "confirmed_at": state["confirmed_at"],
    }


class Interview:
    def __init__(self, store, ai, turn_budget=30.0, clock=time.monotonic):
        self.store = store
        self.ai = ai
        self.turn_budget = turn_budget  # 30초는 한 턴(판정+말하기) 전체 기준
        self.clock = clock

    # ----- 만들기 / 읽기 -----

    def create(self):
        state = rules.new_state(uuid.uuid4().hex[:12], _now())
        self._editor_turn(state, "opening", None, rules.OPENING_TEXT)
        self._save(state)
        return state

    def load(self, interview_id):
        state = self.store.load(interview_id)
        if state is None:
            raise NotFound(interview_id)
        return state

    def _save(self, state):
        state["updated_at"] = _now()
        self.store.save(state)

    @staticmethod
    def _editor_turn(state, kind, dim, text, options=None):
        state["turns"].append({"role": "editor", "kind": kind, "text": text})
        state["prompt"] = {"kind": kind, "dim": dim, "text": text, "options": options or []}

    # ----- 작가의 행동 -----

    def _require_idle(self, state):
        if state["pending"] is not None:
            raise RuleError("편집자가 아직 이전 답을 처리하지 못했어요. '다시 시도'를 눌러 주세요.")
        if state["phase"] == "confirmed":
            raise RuleError("이미 확정된 기획서예요.")

    def submit_answer(self, interview_id, text):
        state = self.load(interview_id)
        self._require_idle(state)
        if state["phase"] != "interview":
            raise RuleError("지금은 인터뷰 중이 아니에요.")
        text = (text or "").strip()
        if not text:
            raise RuleError("답을 적어 주세요.", 400)
        if len(text) > 4000:
            raise RuleError("답이 너무 길어요. 4000자 안으로 적어 주세요.", 400)
        opening = not state["answers"]
        state["answers"].append(text)
        state["turns"].append({"role": "writer", "kind": "answer", "text": text})
        state["pending"] = {"kind": "judge", "answer": text, "opening": opening}
        self._save(state)  # AI 호출 전에 먼저 저장
        return self._run(state)

    def act(self, interview_id, action, dim=None):
        state = self.load(interview_id)
        self._require_idle(state)
        phase, request = state["phase"], None
        if action in ("hold", "skip"):
            if phase != "interview" or state["current"] is None:
                raise RuleError("지금은 미룰 질문이 없어요.")
            if not state["answers"]:
                raise RuleError("첫 질문은 건너뛸 수 없어요. 아이디어를 먼저 적어 주세요.")
            self._writer_meta(state, "이 질문은 나중에")
            rules.hold(state)
        elif action == "continue":
            if phase != "interview":
                raise RuleError("지금은 인터뷰 중이 아니에요.")
            self._writer_meta(state, "계속 다듬기")
            state["last"] = {"stuck": False, "off_topic": False}
        elif action == "options":
            if phase != "interview" or state["current"] is None:
                raise RuleError("지금은 선택지를 볼 수 없어요.")
            self._writer_meta(state, "선택지 보기")
            request = "options"
        elif action == "revisit_now":
            held = rules.held_keys(state)
            if phase != "interview" or state["current"] is not None or not held:
                raise RuleError("다시 볼 항목이 없어요.")
            self._writer_meta(state, "지금 다시 보기")
            state["current"] = held[0]
            state["dims"][held[0]]["held"] = False
        elif action == "finish_review":
            if phase != "interview":
                raise RuleError("지금은 정리할 수 없어요.")
            self._writer_meta(state, "이대로 정리하기")
            state["phase"] = "review"
        elif action == "resume_dim":
            if phase != "review" or dim not in KEYS or state["dims"][dim]["verdict"] == CLEAR:
                raise RuleError("이어서 다듬을 수 없는 항목이에요.")
            self._writer_meta(state, f"'{NAMES[dim]}' 지금 이어서 다듬기")
            state["phase"] = "interview"
            state["current"] = dim
            state["dims"][dim]["held"] = False
            state["last"] = {"stuck": False, "off_topic": False}
        else:
            raise RuleError("알 수 없는 동작이에요.", 400)
        state["pending"] = {"kind": "speak", "request": request}
        self._save(state)
        return self._run(state)

    def retry(self, interview_id):
        state = self.load(interview_id)
        if state["pending"] is None:
            return state  # 이미 처리됐다면 아무것도 하지 않고 지금 상태를 돌려준다
        return self._run(state)

    def edit(self, interview_id, dim, summary):
        state = self.load(interview_id)
        self._require_idle(state)
        if state["phase"] != "review":
            raise RuleError("카드는 정리 단계에서만 고칠 수 있어요.")
        if dim not in KEYS:
            raise RuleError("알 수 없는 항목이에요.", 400)
        summary = (summary or "").strip()[: rules.MAX_SUMMARY]
        d = state["dims"][dim]
        d["summary"] = summary
        d["edited"] = True  # 작가가 직접 쓴 문장
        self._save(state)
        return state

    def confirm(self, interview_id):
        state = self.load(interview_id)
        self._require_idle(state)
        reason = rules.confirm_block_reason(state)
        if reason:
            raise RuleError(reason)
        state["phase"] = "confirmed"
        state["confirmed_at"] = _now()
        self._save(state)
        return state

    @staticmethod
    def _writer_meta(state, label):
        state["turns"].append({"role": "writer", "kind": "button", "text": label, "meta": True})

    # ----- AI 단계 실행 -----

    def _run(self, state):
        """pending 단계를 끝까지 실행한다. AiError 는 그대로 올려서 호출한 쪽이 처리한다.
        실패해도 지금까지의 진행은 이미 저장되어 있다."""
        p = state["pending"]
        t0 = self.clock()

        def remaining():
            left = self.turn_budget - (self.clock() - t0)
            if left < 2.0:  # 남은 시간이 너무 적으면 부르지 않고 다시 시도하게 한다
                raise AiError("timeout")
            return left

        if p["kind"] == "judge":
            raw = self.ai.judge(state, p["answer"], timeout=remaining())
            rules.apply_judgment(state, raw, opening=p.get("opening", False))
            rules.advance(state)
            state["pending"] = {"kind": "speak", "request": None}
            self._save(state)
        request = state["pending"].get("request")
        action = rules.decide(state, request)
        if action is None:
            state["pending"] = None
            self._save(state)
            return state
        text = rules.fixed_text(action, state)
        options = None
        if text is None:
            result = self.ai.speak(action, state, timeout=remaining())
            if action["kind"] == "options":
                options = result
                text = "이런 방향은 어떨까요? 고르거나 고쳐서 쓰세요. 고르는 것은 작가님입니다."
            else:
                text = result
        # 말하기까지 성공했으니 이제 기록한다.
        if action["kind"] == "choice":
            d = state["dims"][action["dim"]]
            d["prompted_at"] = d["attempts"]
        if action["kind"] == "options":
            state["dims"][action["dim"]]["options_shown"] = True
            state["last"] = {"stuck": False, "off_topic": False}
        self._editor_turn(state, action["kind"], action.get("dim"), text, options)
        state["pending"] = None
        self._save(state)
        return state

"""편집자 AI: 판정(judge)과 말하기(speak). 둘 다 Claude Haiku 5.5를 쓴다.

무엇을 물을지는 rules.py 가 정하고, 여기서는 판정과 문장 쓰기만 합니다.
테스트용 FakeAI 도 여기 있습니다 (네트워크 없이 동작).
"""
import json
import os
import sys

import anthropic

from rubric import BY_KEY, DIMS, KEYS, NAMES

MODEL = "claude-haiku-5-5"
TIMEOUT = 30.0


class AiError(Exception):
    """AI 호출 실패. code: timeout / auth / rejected / rate_limit / api / connection / no_key / bad_format"""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


EDITOR_SYSTEM = """당신은 책 쓰기를 돕는 AI 편집자입니다. 말투는 하나로 고정합니다: 따뜻하고 간결한 존댓말.
지켜야 할 약속:
- 한 번에 질문은 딱 하나만 합니다. 답은 1~2문장입니다.
- 작가가 한 말을 그대로 짧게 인용하며 이어 갑니다.
- 책 제목, 저자 이름, 통계 수치를 먼저 꺼내지 않습니다.
- 작가를 대신해 내용을 써 주거나 정해 주지 않습니다. 제안은 선택지로만 하고 고르는 것은 작가입니다.
- 작가가 하지 않은 말을 했다고 하지 않습니다."""


def _rubric_text():
    lines = []
    for d in DIMS:
        lines.append(
            f"- {d['key']} ({d['name']}): 확인할 것={d['check']} / 약한 신호={d['weak']}\n"
            f"    선명한 답 예: {d['clear_example']}\n    약한 답 예: {d['weak_example']}"
        )
    return "\n".join(lines)


JUDGE_SYSTEM = f"""당신은 출판 기획 인터뷰의 판정관입니다. 작가의 새 답을 읽고, 답이 영향을 준 차원만 골라 판정합니다.

차원 목록(순서 고정):
{_rubric_text()}

판정 값: 선명 / 보완 필요 / 비어 있음.
규칙:
- 애매하면 '보완 필요'로 판정합니다. 통과시키지 않습니다.
- summary: 작가의 말로, 한 문장으로 요약합니다. 작가가 하지 않은 내용을 덧붙이지 않습니다.
- quote: summary의 근거가 되는 문장을 작가의 말에서 글자 그대로 복사합니다. 고치거나 줄여 쓰지 않습니다.
- reason: '보완 필요'일 때 왜 약한지 한 줄. 아니면 빈 문자열.
- 한 답이 여러 차원에 영향을 줄 수 있습니다. 바뀐 차원만 updates 에 넣고, 영향이 없으면 빈 배열입니다.
- 작가가 '모르겠어요', '대신 정해 주세요'처럼 막혔다고 말하면 stuck=true.
- 질문과 무관한 답이면 off_topic=true.
JSON 만 출력합니다."""

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "updates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "dim": {"type": "string", "enum": KEYS},
                    "verdict": {"type": "string", "enum": ["선명", "보완 필요", "비어 있음"]},
                    "summary": {"type": "string"},
                    "quote": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["dim", "verdict", "summary", "quote", "reason"],
                "additionalProperties": False,
            },
        },
        "stuck": {"type": "boolean"},
        "off_topic": {"type": "boolean"},
    },
    "required": ["updates", "stuck", "off_topic"],
    "additionalProperties": False,
}

OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {"options": {"type": "array", "items": {"type": "string"}}},
    "required": ["options"],
    "additionalProperties": False,
}


def _recent(state, n=6):
    return "\n".join(
        f"{'작가' if t['role'] == 'writer' else '편집자'}: {t['text']}" for t in state["turns"][-n:]
    )


def _dims_text(state):
    return "\n".join(
        f"- {k} ({NAMES[k]}): {state['dims'][k]['verdict']}"
        + (f" / 요약: {state['dims'][k]['summary']}" if state["dims"][k]["summary"] else "")
        for k in KEYS
    )


class RealAI:
    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            if not key or key == "your_key_here":
                raise AiError("no_key")
            self._client = anthropic.Anthropic(api_key=key, timeout=TIMEOUT, max_retries=0)
        return self._client

    @staticmethod
    def _log(code, e):
        # 서버 로그는 조용히 해 두었으므로, 원인은 터미널(stderr)에 직접 남긴다.
        print(
            "[AI 오류] code=%s status=%s message=%s" % (code, getattr(e, "status_code", "-"), e),
            file=sys.stderr, flush=True,
        )

    def _create(self, timeout=None, **kwargs):
        client = self._get_client()
        if timeout is not None:
            kwargs["timeout"] = timeout  # 한 턴 30초 중 남은 시간
        try:
            resp = client.messages.create(model=MODEL, **kwargs)
        except anthropic.APITimeoutError as e:
            self._log("timeout", e)
            raise AiError("timeout")
        except anthropic.AuthenticationError as e:
            self._log("auth", e)
            raise AiError("auth")
        except (anthropic.BadRequestError, anthropic.NotFoundError, anthropic.PermissionDeniedError) as e:
            self._log("rejected", e)
            raise AiError("rejected")
        except anthropic.RateLimitError as e:
            self._log("rate_limit", e)
            raise AiError("rate_limit")
        except anthropic.APIStatusError as e:
            code = "api" if e.status_code >= 500 else "rejected"
            self._log(code, e)
            raise AiError(code)
        except anthropic.APIConnectionError as e:
            self._log("connection", e)
            raise AiError("connection")
        stop = getattr(resp, "stop_reason", None)
        if stop in ("max_tokens", "refusal"):
            print("[AI 경고] stop_reason=%s" % stop, file=sys.stderr, flush=True)
        return resp

    @staticmethod
    def _text(resp):
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                return block.text
        return ""

    def judge(self, state, answer, timeout=None):
        """판정 결과(dict)를 돌려준다. JSON 이 아니면 None (rules 가 보완 필요로 처리)."""
        user = (
            f"지금 묻고 있는 차원: {state['current']}\n\n"
            f"차원별 현재 판정:\n{_dims_text(state)}\n\n"
            f"최근 대화:\n{_recent(state)}\n\n"
            f"작가의 새 답:\n{answer}"
        )
        resp = self._create(
            max_tokens=4000, timeout=timeout,
            system=JUDGE_SYSTEM,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": JUDGE_SCHEMA}},
        )
        try:
            return json.loads(self._text(resp))
        except (ValueError, TypeError):
            return None

    def speak(self, action, state, timeout=None):
        """ask/probe 는 문장(str), options 는 선택지 목록(list[str])을 돌려준다."""
        kind, dim = action["kind"], action["dim"]
        d = BY_KEY[dim]
        said = "\n".join(f"- {a}" for a in state["answers"][-8:])
        head = (
            f"차원: {d['name']} (확인할 것: {d['check']}, 약한 신호: {d['weak']})\n"
            f"작가가 지금까지 한 말:\n{said}\n\n최근 대화:\n{_recent(state)}\n"
        )
        if kind == "options":
            extra = (
                "작가가 막혔습니다. 작가가 지금까지 한 말에서만 재료를 가져와 이 차원의 답 후보를 "
                "2~3개 제안하세요. 새로운 사실을 만들어 내지 마세요. 각 후보는 작가가 그대로 골라 "
                "자기 답으로 쓸 수 있는 한 문장(작가의 1인칭)입니다."
            )
            if dim == "concept":
                extra += " 한 줄 콘셉트 후보는 반드시 앞 차원에서 작가가 한 말로만 만드세요."
            resp = self._create(
                max_tokens=1000, timeout=timeout,
                system=EDITOR_SYSTEM,
                messages=[{"role": "user", "content": head + "\n" + extra}],
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": OPTIONS_SCHEMA}},
            )
            try:
                opts = json.loads(self._text(resp)).get("options")
            except (ValueError, TypeError, AttributeError):
                opts = None
            opts = [o.strip() for o in (opts or []) if isinstance(o, str) and o.strip()][:3]
            if len(opts) < 2:
                raise AiError("bad_format")
            return opts
        if kind == "probe":
            angles = d["angles"]
            angle = angles[action.get("angle", 0) % len(angles)]
            extra = (
                f"이 차원이 아직 약합니다(이유: {state['dims'][dim]['reason'] or '불분명'}). "
                f"다음 추궁 방향으로 한 가지만 물어보세요: \"{angle}\"\n"
                "방향만 참고하고, 작가가 한 말을 인용하며 그에 맞게 다시 쓰세요. 이전에 한 질문과 같은 질문은 피하세요."
            )
        else:  # ask
            extra = f"이 차원을 처음 묻습니다. '{d['check']}'를 확인할 수 있게 질문 하나를 하세요."
        if action.get("off_topic"):
            extra += " 직전 답이 질문과 조금 다른 이야기였으니, 부드럽게 질문으로 돌아오세요."
        resp = self._create(
            max_tokens=1000, timeout=timeout,
            system=EDITOR_SYSTEM,
            messages=[{"role": "user", "content": head + "\n" + extra}],
            output_config={"effort": "low"},
        )
        text = self._text(resp).strip()
        if not text or getattr(resp, "stop_reason", None) == "max_tokens":  # 잘렸거나 비었으면 쓰지 않는다
            raise AiError("bad_format")
        return text


class FakeAI:
    """테스트용 가짜 AI. 네트워크를 쓰지 않는다.

    judgments: 판정 결과를 순서대로 돌려줄 목록(없으면 '변화 없음').
    fail_judge / fail_speak: 앞으로 이 횟수만큼 AiError("timeout") 을 낸다.
    """

    def __init__(self, judgments=None):
        self.judgments = list(judgments or [])
        self.fail_judge = 0
        self.fail_speak = 0
        self.calls = []
        self.timeouts = []

    def judge(self, state, answer, timeout=None):
        self.timeouts.append(timeout)
        self.calls.append(("judge", answer))
        if self.fail_judge > 0:
            self.fail_judge -= 1
            raise AiError("timeout")
        if self.judgments:
            return self.judgments.pop(0)
        return {"updates": [], "stuck": False, "off_topic": False}

    def speak(self, action, state, timeout=None):
        self.timeouts.append(timeout)
        self.calls.append(("speak", action["kind"], action.get("dim")))
        if self.fail_speak > 0:
            self.fail_speak -= 1
            raise AiError("timeout")
        if action["kind"] == "options":
            return ["첫 번째 선택지 문장입니다", "두 번째 선택지 문장입니다"]
        return f"[{action['kind']}:{action['dim']}:{action.get('angle', '-')}] 가짜 편집자 질문"

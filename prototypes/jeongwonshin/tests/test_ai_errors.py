"""RealAI 의 오류 분류를 가짜 클라이언트로 확인한다 (네트워크 없음)."""
import contextlib
import io
import unittest
from types import SimpleNamespace

import anthropic
try:
    import httpx  # 구버전 SDK
except ImportError:
    import httpx2 as httpx  # SDK 2.x 가 쓰는 HTTP 라이브러리

from tests.helpers import judged  # noqa: F401 (sys.path 설정)
import rules
from editor_ai import AiError, RealAI


def status_error(cls, code):
    resp = httpx.Response(code, request=httpx.Request("POST", "http://x"))
    return cls("메시지 %d" % code, response=resp, body=None)


class FakeClient:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.kwargs = result, error, None
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.kwargs = kw
        if self.error:
            raise self.error
        return self.result


def reply(text, stop="end_turn"):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason=stop)


def make(client):
    ai = RealAI()
    ai._client = client
    return ai


def state():
    s = rules.new_state("t", "now")
    s["answers"].append("답")
    return s


ACTION = {"kind": "ask", "dim": "need", "attempt": 0, "off_topic": False}


class AiErrorTest(unittest.TestCase):
    def code_of(self, error):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(AiError) as cm:
            make(FakeClient(error=error)).speak(ACTION, state())
        return cm.exception.code, err.getvalue()

    def test_분류(self):
        cases = [
            (status_error(anthropic.BadRequestError, 400), "rejected"),
            (status_error(anthropic.NotFoundError, 404), "rejected"),
            (status_error(anthropic.PermissionDeniedError, 403), "rejected"),
            (status_error(anthropic.AuthenticationError, 401), "auth"),
            (status_error(anthropic.RateLimitError, 429), "rate_limit"),
            (status_error(anthropic.InternalServerError, 500), "api"),
            (anthropic.APITimeoutError(request=httpx.Request("POST", "http://x")), "timeout"),
            (anthropic.APIConnectionError(request=httpx.Request("POST", "http://x")), "connection"),
        ]
        for error, expected in cases:
            code, log = self.code_of(error)
            self.assertEqual(code, expected, type(error).__name__)
            self.assertIn("code=" + expected, log)  # 원인이 stderr 에 남는다

    def test_로그에_상태코드가_찍힌다(self):
        _, log = self.code_of(status_error(anthropic.BadRequestError, 400))
        self.assertIn("status=400", log)

    def test_서버_문구(self):
        import server
        self.assertEqual(server.AI_MESSAGES["rejected"], "요청이 거부됐어요 (키나 크레딧을 확인해 주세요)")
        self.assertEqual(server.AI_MESSAGES["auth"], server.AI_MESSAGES["rejected"])
        self.assertNotIn("rejected", server.AI_DEFAULT)
        self.assertIn("늦어지고", server.AI_DEFAULT)

    def test_말하기가_잘렸거나_비면_형식오류(self):
        for r in (reply("잘린 문장", "max_tokens"), reply("   ")):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), self.assertRaises(AiError) as cm:
                make(FakeClient(result=r)).speak(ACTION, state())
            self.assertEqual(cm.exception.code, "bad_format")

    def test_max_tokens_경고가_로그에_남는다(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err), self.assertRaises(AiError):
            make(FakeClient(result=reply("잘림", "max_tokens"))).speak(ACTION, state())
        self.assertIn("max_tokens", err.getvalue())

    def test_토큰_한도와_남은_시간이_전달된다(self):
        c = FakeClient(result=reply('{"updates": [], "stuck": false, "off_topic": false}'))
        make(c).judge(state(), "답", timeout=17.5)
        self.assertEqual(c.kwargs["max_tokens"], 4000)
        self.assertEqual(c.kwargs["timeout"], 17.5)
        c = FakeClient(result=reply("질문입니다"))
        self.assertEqual(make(c).speak(ACTION, state(), timeout=9.0), "질문입니다")
        self.assertEqual(c.kwargs["max_tokens"], 1000)
        self.assertEqual(c.kwargs["timeout"], 9.0)


if __name__ == "__main__":
    unittest.main()

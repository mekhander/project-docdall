"""서버를 실제로 띄워(가짜 AI) 오류 응답에도 지금 상태가 실리는지 확인한다."""
import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from tests.helpers import judged  # noqa: F401
import server
from editor_ai import FakeAI
from interview import Interview
from store import Store


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ai = FakeAI()
        engine = Interview(Store(self.dir), self.ai)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(engine))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        shutil.rmtree(self.dir, ignore_errors=True)

    def call(self, method, path, body=None):
        req = urllib.request.Request(
            "http://127.0.0.1:%d%s" % (self.port, path), method=method,
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_규칙_오류에도_지금_상태가_실린다(self):
        _, res = self.call("POST", "/api/interview")
        iid = res["state"]["id"]
        status, res = self.call("POST", "/api/interview/%s/action" % iid, {"action": "hold"})  # 첫 질문은 보류 불가
        self.assertEqual(status, 409)
        self.assertFalse(res["ok"])
        self.assertEqual(res["state"]["id"], iid)
        self.assertFalse(res["state"]["can_hold"])

    def test_대기_없는_다시시도는_성공한다(self):
        _, res = self.call("POST", "/api/interview")
        iid = res["state"]["id"]
        status, res = self.call("POST", "/api/interview/%s/retry" % iid)
        self.assertEqual(status, 200)
        self.assertTrue(res["ok"])
        self.assertFalse(res["state"]["pending"])


if __name__ == "__main__":
    unittest.main()

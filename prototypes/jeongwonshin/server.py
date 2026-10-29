"""서버: http://localhost:8000 에서 화면(public/index.html)과 JSON API를 제공한다.

표준 라이브러리만 씁니다 (웹 프레임워크 없음). 실행: .venv/bin/python server.py
"""
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from editor_ai import AiError, RealAI
from envfile import load_env
from interview import Interview, NotFound, RuleError, view
from store import Store

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8000
MAX_BODY = 64 * 1024

REJECTED = "요청이 거부됐어요 (키나 크레딧을 확인해 주세요)"
AI_MESSAGES = {
    "rejected": REJECTED,
    "auth": REJECTED,
    "no_key": "API 키가 없어요. .env 파일에 ANTHROPIC_API_KEY 를 넣고 서버를 다시 켜 주세요.",
    "rate_limit": "요청이 몰려 있거나 크레딧이 부족할 수 있어요. 잠시 뒤 다시 시도해 주세요.",
}
AI_DEFAULT = "편집자 응답이 늦어지고 있어요."

ROUTE = re.compile(r"^/api/interview(?:/([A-Za-z0-9_-]+)(?:/([a-z]+))?)?$")
_locks = {}
_locks_guard = threading.Lock()


def _lock_for(interview_id):
    with _locks_guard:
        return _locks.setdefault(interview_id, threading.Lock())


def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _send(self, status, body, ctype="application/json; charset=utf-8"):
            data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise RuleError("요청이 너무 커요.", 413)
            if n == 0:
                return {}
            try:
                data = json.loads(self.rfile.read(n).decode("utf-8"))
            except ValueError:
                raise RuleError("요청 형식이 올바르지 않아요.", 400)
            return data if isinstance(data, dict) else {}

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                with open(os.path.join(HERE, "public", "index.html"), "rb") as f:
                    return self._send(200, f.read(), "text/html; charset=utf-8")
            m = ROUTE.match(path)
            if m and m.group(1) and not m.group(2):
                try:
                    return self._send(200, {"ok": True, "state": view(engine.load(m.group(1)))})
                except NotFound:
                    return self._send(404, {"ok": False, "error": {"code": "not_found", "message": "저장된 인터뷰를 찾을 수 없어요."}})
            self._send(404, {"ok": False, "error": {"code": "not_found", "message": "없는 주소예요."}})

        def do_POST(self):
            m = ROUTE.match(self.path.split("?")[0])
            if not m:
                return self._send(404, {"ok": False, "error": {"code": "not_found", "message": "없는 주소예요."}})
            iid, op = m.group(1), m.group(2)
            try:
                body = self._body()
                if iid is None:  # 새 인터뷰
                    return self._send(200, {"ok": True, "state": view(engine.create())})
                with _lock_for(iid):
                    try:
                        state = self._dispatch(iid, op, body)
                    except AiError as e:
                        # 답은 이미 저장돼 있다. 화면에는 다시 시도 버튼을 보여 준다.
                        state = engine.load(iid)
                        return self._send(
                            200,
                            {
                                "ok": False,
                                "error": {"code": e.code, "message": AI_MESSAGES.get(e.code, AI_DEFAULT)},
                                "state": view(state),
                            },
                        )
                self._send(200, {"ok": True, "state": view(state)})
            except NotFound:
                self._send(404, {"ok": False, "error": {"code": "not_found", "message": "저장된 인터뷰를 찾을 수 없어요."}})
            except RuleError as e:
                body = {"ok": False, "error": {"code": "rule", "message": e.message}}
                try:  # 화면이 낡은 상태에 갇히지 않도록 지금 상태를 같이 보낸다
                    if iid and engine.store.exists(iid):
                        body["state"] = view(engine.load(iid))
                except Exception:
                    pass
                self._send(e.status, body)
            except Exception as e:  # 예상 못 한 오류도 화면에 알린다
                self._send(500, {"ok": False, "error": {"code": "server", "message": "서버 오류: %s" % e}})

        def _dispatch(self, iid, op, body):
            if op == "answer":
                return engine.submit_answer(iid, body.get("text"))
            if op == "action":
                return engine.act(iid, body.get("action"), body.get("dim"))
            if op == "retry":
                return engine.retry(iid)
            if op == "edit":
                return engine.edit(iid, body.get("dim"), body.get("summary"))
            if op == "confirm":
                return engine.confirm(iid)
            raise RuleError("알 수 없는 요청이에요.", 404)

    return Handler


def main():
    load_env(os.path.join(HERE, ".env"))
    engine = Interview(Store(os.path.join(HERE, "data")), RealAI())
    server = ThreadingHTTPServer(("127.0.0.1", PORT), make_handler(engine))
    print("닥달 소재 찾기 프로토타입: http://localhost:%d  (끄려면 Ctrl+C)" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

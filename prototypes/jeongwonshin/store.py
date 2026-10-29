"""저장소: 인터뷰 한 건을 data/<id>.json 으로 저장하고 다시 읽는다. (저장과 이어하기)"""
import json
import os
import re
import tempfile

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class Store:
    def __init__(self, directory):
        self.directory = directory
        os.makedirs(directory, exist_ok=True)

    def _path(self, interview_id):
        # 경로 조작을 막기 위해 id 모양을 제한한다.
        if not ID_RE.match(interview_id or ""):
            return None
        return os.path.join(self.directory, interview_id + ".json")

    def exists(self, interview_id):
        p = self._path(interview_id)
        return bool(p) and os.path.exists(p)

    def load(self, interview_id):
        """없으면 None."""
        p = self._path(interview_id)
        if not p or not os.path.exists(p):
            return None
        with open(p, encoding="utf-8") as f:
            return json.load(f)

    def save(self, state):
        """임시 파일에 쓴 뒤 바꿔치기해서, 쓰다 끊겨도 기존 파일이 깨지지 않게 한다."""
        p = self._path(state["id"])
        if not p:
            raise ValueError("잘못된 인터뷰 id")
        fd, tmp = tempfile.mkstemp(dir=self.directory, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, p)
        except BaseException:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise

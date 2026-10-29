"""아주 작은 .env 읽기 도구. (python-dotenv 없이 KEY=VALUE 줄만 읽습니다.)"""
import os


def load_env(path):
    """path 의 KEY=VALUE 줄을 환경변수로 넣는다. 이미 있는 환경변수는 덮어쓰지 않는다."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value

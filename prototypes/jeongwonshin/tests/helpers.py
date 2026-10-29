"""테스트 도우미."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ju(dim, verdict, summary, quote, reason=""):
    """판정 한 건."""
    return {"dim": dim, "verdict": verdict, "summary": summary, "quote": quote, "reason": reason}


def judged(*updates, stuck=False, off_topic=False):
    return {"updates": list(updates), "stuck": stuck, "off_topic": off_topic}

import shutil
import tempfile
import unittest

from tests.helpers import judged, ju
import rules
from editor_ai import AiError, FakeAI
from interview import Interview, RuleError, view
from rules import CLEAR, EMPTY, WEAK
from store import Store


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.store = Store(self.dir)
        self.ai = FakeAI()
        self.iv = Interview(self.store, self.ai)
        self.id = self.iv.create()["id"]

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def say(self, text, *updates, **kw):
        self.ai.judgments.append(judged(*updates, **kw))
        return self.iv.submit_answer(self.id, text)

    def start(self):
        """첫 질문(건너뛸 수 없음)에 아이디어를 하나 적어 둔다. 판정은 변화 없음."""
        return self.say("아이디어가 하나 있어요")

    def reload(self):
        return self.iv.load(self.id)

    def to_reader(self):
        """필요성·고유성을 선명하게 만들어 타깃 독자 차례로 간다."""
        return self.say(
            "퇴사 고민을 하는 사람에게 버티는 법을 알려 주고 싶고, 저는 10년 빵집을 했어요",
            ju("need", CLEAR, "버티는 법을 알려 주고 싶다", "버티는 법을 알려 주고 싶고"),
            ju("uniqueness", CLEAR, "10년 빵집", "저는 10년 빵집을 했어요"),
        )


class 인터뷰_흐름(Base):
    def test_첫_메시지는_고정_문구(self):
        s = self.reload()
        self.assertEqual(s["turns"][0]["text"], rules.OPENING_TEXT)
        self.assertEqual(self.ai.calls, [])

    def test_손확인1_타깃독자에_넓은_집단이면_보완필요와_추궁(self):
        s = self.to_reader()
        self.assertEqual(s["current"], "reader")
        s = self.say("20~30대 직장인이요", ju("reader", WEAK, "20~30대 직장인", "20~30대 직장인이요", "넓은 집단"))
        self.assertEqual(s["dims"]["reader"]["verdict"], WEAK)
        self.assertEqual(s["prompt"]["kind"], "probe")
        self.assertEqual(s["current"], "reader")

    def test_두번_풀리지_않으면_3버튼_질문(self):
        self.to_reader()
        self.say("20~30대 직장인이요", ju("reader", WEAK, "x", "20~30대 직장인이요", "넓음"))
        s = self.say("그냥 직장인이요", ju("reader", WEAK, "x", "그냥 직장인이요", "넓음"))
        self.assertEqual(s["prompt"]["kind"], "choice")
        self.assertEqual([b["action"] for b in view(s)["buttons"]], ["continue", "options", "skip"])
        s = self.iv.act(self.id, "continue")
        self.assertEqual(s["prompt"]["kind"], "probe")

    def test_막히면_선택지_그리고_선택지를_답으로_판정(self):
        s = self.say("모르겠어요", stuck=True)
        self.assertEqual(s["prompt"]["kind"], "options")
        self.assertEqual(len(s["prompt"]["options"]), 2)
        opt = s["prompt"]["options"][0]
        s = self.say(opt, ju("need", CLEAR, "골라서 정함", opt))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)
        self.assertEqual(s["current"], "uniqueness")

    def test_선택지_뒤에도_막히면_계속할지_묻기(self):
        self.say("모르겠어요", stuck=True)
        s = self.say("그래도 모르겠어요", stuck=True)
        self.assertEqual(s["prompt"]["kind"], "stuck_again")
        self.assertEqual([b["action"] for b in view(s)["buttons"]], ["continue", "skip"])

    def test_나중에_누르면_보류하고_다음_차원(self):
        self.start()
        s = self.iv.act(self.id, "hold")
        self.assertTrue(s["dims"]["need"]["held"])
        self.assertEqual(s["current"], "uniqueness")
        self.assertEqual(s["prompt"]["dim"], "uniqueness")

    def test_전부_지나가고_보류가_있으면_다시볼지_묻고_이어가기(self):
        self.start()
        for _ in range(7):
            s = self.iv.act(self.id, "hold")
        self.assertEqual(s["prompt"]["kind"], "revisit")
        self.assertFalse(view(s)["can_hold"])
        s = self.iv.act(self.id, "revisit_now")
        self.assertEqual(s["current"], "need")
        self.assertFalse(s["dims"]["need"]["held"])

    def test_이대로_정리하면_숙제로_표시(self):
        self.start()
        for _ in range(7):
            self.iv.act(self.id, "hold")
        s = self.iv.act(self.id, "finish_review")
        v = view(s)
        self.assertEqual(s["phase"], "review")
        self.assertTrue(all(d["homework"] for d in v["dims"]))

    def test_정리_단계에서_숙제_이어서_다듬기(self):
        self.start()
        for _ in range(7):
            self.iv.act(self.id, "hold")
        self.iv.act(self.id, "finish_review")
        s = self.iv.act(self.id, "resume_dim", "reader")
        self.assertEqual(s["phase"], "interview")
        self.assertEqual(s["current"], "reader")
        self.assertEqual(s["prompt"]["kind"], "ask")


class 확정(Base):
    def _review_with_concept(self, concept_clear):
        self.start()
        for k in ("need", "uniqueness", "reader", "change", "difference", "tone"):
            self.iv.act(self.id, "hold")
        if concept_clear:
            self.say("빵집 폐업 일기예요 정말로", ju("concept", CLEAR, "빵집 폐업 일기", "빵집 폐업 일기예요 정말로"))
            # 전부 지나갔고 보류가 있으니 다시볼지 묻는 상태
            return self.iv.act(self.id, "finish_review")
        self.iv.act(self.id, "hold")
        return self.iv.act(self.id, "finish_review")

    def test_손확인3_콘셉트_보류면_확정_거부(self):
        s = self._review_with_concept(False)
        self.assertEqual(s["phase"], "review")
        self.assertFalse(view(s)["can_confirm"])
        with self.assertRaises(RuleError):
            self.iv.confirm(self.id)
        self.assertEqual(self.reload()["phase"], "review")

    def test_콘셉트_선명이면_다른_차원이_숙제여도_확정(self):
        s = self._review_with_concept(True)
        self.assertTrue(view(s)["can_confirm"])
        s = self.iv.confirm(self.id)
        self.assertEqual(s["phase"], "confirmed")
        v = view(s)
        self.assertTrue(v["dims"][0]["homework"])
        self.assertFalse(v["dims"][6]["homework"])
        with self.assertRaises(RuleError):
            self.iv.edit(self.id, "need", "고침")  # 확정 뒤에는 고칠 수 없다

    def test_카드_문장_직접_고치기(self):
        self._review_with_concept(True)
        s = self.iv.edit(self.id, "concept", "내가 직접 고친 한 줄")
        self.assertEqual(s["dims"]["concept"]["summary"], "내가 직접 고친 한 줄")
        self.assertEqual(s["dims"]["concept"]["verdict"], CLEAR)

    def test_콘셉트를_비우면_확정_불가(self):
        self._review_with_concept(True)
        self.iv.edit(self.id, "concept", "  ")
        with self.assertRaises(RuleError):
            self.iv.confirm(self.id)


class 판정_안전장치(Base):
    def test_형식이_틀린_판정이면_지금_차원만_보완필요(self):
        self.ai.judgments.append("이건 JSON이 아님")
        s = self.iv.submit_answer(self.id, "아무 말")
        self.assertEqual(s["dims"]["need"]["verdict"], WEAK)
        self.assertEqual(s["prompt"]["kind"], "probe")
        self.assertTrue(all(s["dims"][k]["verdict"] == EMPTY for k in list(s["dims"])[1:]))

    def test_근거가_작가_말에_없으면_카드에_안_들어간다(self):
        s = self.say("빵집을 했어요", ju("need", CLEAR, "카페 사장", "카페를 했어요 오래도록"))
        self.assertEqual(s["dims"]["need"]["summary"], "")
        self.assertEqual(s["dims"]["need"]["verdict"], WEAK)


class AI_실패(Base):
    def test_판정_실패해도_답은_저장되고_다시시도로_이어진다(self):
        self.ai.fail_judge = 1
        self.ai.judgments.append(judged(ju("need", CLEAR, "요약", "버티는 법을 쓰고 싶어요")))
        with self.assertRaises(AiError):
            self.iv.submit_answer(self.id, "버티는 법을 쓰고 싶어요")
        s = self.reload()  # 디스크에서 다시 읽어도 남아 있다
        self.assertEqual(s["answers"], ["버티는 법을 쓰고 싶어요"])
        self.assertIsNotNone(s["pending"])
        self.assertTrue(view(s)["pending"])
        with self.assertRaises(RuleError):  # 대기 중에는 다른 동작 불가
            self.iv.act(self.id, "hold")
        s = self.iv.retry(self.id)
        self.assertIsNone(s["pending"])
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)
        self.assertEqual(s["answers"], ["버티는 법을 쓰고 싶어요"])  # 중복 저장 없음

    def test_말하기만_실패하면_판정은_다시_하지_않는다(self):
        self.ai.fail_speak = 1
        self.ai.judgments.append(judged(ju("need", CLEAR, "요약", "버티는 법을 쓰고 싶어요")))
        with self.assertRaises(AiError):
            self.iv.submit_answer(self.id, "버티는 법을 쓰고 싶어요")
        self.assertEqual(self.reload()["dims"]["need"]["verdict"], CLEAR)
        self.iv.retry(self.id)
        self.assertEqual([c for c in self.ai.calls if c[0] == "judge"].__len__(), 1)
        self.assertEqual(self.reload()["prompt"]["dim"], "uniqueness")

    def test_버튼_동작의_말하기_실패도_다시시도(self):
        self.start()
        self.ai.fail_speak = 1
        with self.assertRaises(AiError):
            self.iv.act(self.id, "hold")
        s = self.reload()
        self.assertTrue(s["dims"]["need"]["held"])
        s = self.iv.retry(self.id)
        self.assertEqual(s["prompt"]["dim"], "uniqueness")


class 저장과_이어하기(Base):
    def test_손확인2_세번째_차원에서_저장_후_다시_열기(self):
        self.to_reader()
        before = self.reload()
        # 서버를 껐다 켠 것처럼 새 객체로 다시 연다
        iv2 = Interview(Store(self.dir), FakeAI())
        after = iv2.load(self.id)
        self.assertEqual(before, after)
        self.assertEqual(after["current"], "reader")
        v = view(after)
        self.assertEqual([d["verdict"] for d in v["dims"]][:3], [CLEAR, CLEAR, EMPTY])
        self.assertEqual(v["dims"][0]["summary"], "버티는 법을 알려 주고 싶다")
        self.assertEqual(v["prompt"]["dim"], "reader")  # 마지막 질문이 멈춘 차원의 것

    def test_없는_인터뷰는_NotFound(self):
        from interview import NotFound
        with self.assertRaises(NotFound):
            self.iv.load("없는id")
        with self.assertRaises(NotFound):
            self.iv.load("../etc")


class 리뷰_반영(Base):
    def test_보류할_게_없으면_다시시도는_현재_상태를_돌려준다(self):
        before = self.reload()
        calls = len(self.ai.calls)
        s = self.iv.retry(self.id)  # 대기 중인 게 없어도 오류 없이
        self.assertEqual(s, before)
        self.assertEqual(len(self.ai.calls), calls)

    def test_두번_다시시도해도_안전(self):
        self.ai.fail_judge = 1
        with self.assertRaises(AiError):
            self.iv.submit_answer(self.id, "아이디어가 있어요")
        self.iv.retry(self.id)
        s = self.iv.retry(self.id)
        self.assertIsNone(s["pending"])
        self.assertEqual(len([c for c in self.ai.calls if c[0] == "judge"]), 2)  # 실패 1 + 성공 1

    def test_첫_질문은_건너뛸_수_없다(self):
        self.assertFalse(view(self.reload())["can_hold"])
        with self.assertRaises(RuleError):
            self.iv.act(self.id, "hold")
        self.assertFalse(self.reload()["dims"]["need"]["held"])
        self.start()
        self.assertTrue(view(self.reload())["can_hold"])


class 한턴_30초(Base):
    def _iv(self, times):
        it = iter(times)
        self.iv = Interview(self.store, self.ai, turn_budget=30.0, clock=lambda: next(it))

    def test_남은_시간을_두번째_호출에_넘긴다(self):
        self._iv([0, 0, 10, 10, 10])  # 턴 시작, 판정 전, 말하기 전
        self.ai.judgments.append(judged(ju("need", CLEAR, "요약", "버티는 법을 쓰고 싶어요")))
        self.iv.submit_answer(self.id, "버티는 법을 쓰고 싶어요")
        self.assertEqual(self.ai.timeouts, [30.0, 20.0])

    def test_남은_시간이_2초_미만이면_두번째_호출_대신_타임아웃(self):
        self._iv([0, 0, 29, 29, 29, 29])
        self.ai.judgments.append(judged(ju("need", CLEAR, "요약", "버티는 법을 쓰고 싶어요")))
        with self.assertRaises(AiError) as cm:
            self.iv.submit_answer(self.id, "버티는 법을 쓰고 싶어요")
        self.assertEqual(cm.exception.code, "timeout")
        s = self.reload()
        self.assertEqual(s["pending"]["kind"], "speak")  # 판정은 저장됨
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)
        self.assertEqual(len([c for c in self.ai.calls if c[0] == "speak"]), 0)
        # 새 턴(다시 시도)에서는 시간이 다시 주어진다
        self._iv([100, 100, 100])
        s = self.iv.retry(self.id)
        self.assertIsNone(s["pending"])
        self.assertEqual(len([c for c in self.ai.calls if c[0] == "judge"]), 1)


if __name__ == "__main__":
    unittest.main()

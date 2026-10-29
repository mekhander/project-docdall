import unittest

from tests.helpers import judged, ju  # noqa: F401 (sys.path 설정)
import rules
from rules import CLEAR, EMPTY, WEAK


def fresh():
    s = rules.new_state("t1", "now")
    return s


def say(s, text, raw, opening=False):
    s["answers"].append(text)
    rules.apply_judgment(s, raw, opening=opening)
    rules.advance(s)


class RulesTest(unittest.TestCase):
    def test_처음에는_필요성에서_질문(self):
        s = fresh()
        a = rules.decide(s)
        self.assertEqual((a["kind"], a["dim"]), ("ask", "need"))

    def test_선명하면_다음_차원으로(self):
        s = fresh()
        say(s, "독자가 불편해해요", judged(ju("need", CLEAR, "독자의 불편", "독자가 불편해해요")))
        self.assertEqual(s["current"], "uniqueness")

    def test_선명하지_않으면_같은_차원에_머문다(self):
        s = fresh()
        say(s, "그냥 쓰고 싶어요", judged(ju("need", WEAK, "쓰고 싶음", "그냥 쓰고 싶어요", "이유 약함")))
        self.assertEqual(s["current"], "need")
        self.assertEqual(rules.decide(s)["kind"], "probe")

    def test_추궁은_매번_다른_각도(self):
        s = fresh()
        angles = []
        for i in range(3):
            text = f"그냥 {i}"
            say(s, text, judged(ju("need", WEAK, "x", text, "약함")))
            a = rules.decide(s)
            if a["kind"] == "choice":  # 2회째에는 3버튼 질문
                s["dims"]["need"]["prompted_at"] = s["dims"]["need"]["attempts"]
                a = rules.decide(s)
            angles.append(a["angle"])
        self.assertEqual(len(set(angles)), 3)

    def test_두번_풀리지_않으면_3버튼_질문_그뒤_두번마다(self):
        s = fresh()
        kinds = []
        for i in range(5):
            text = f"애매 {i}"
            say(s, text, judged(ju("need", WEAK, "x", text, "약함")))
            a = rules.decide(s)
            kinds.append(a["kind"])
            if a["kind"] == "choice":
                s["dims"]["need"]["prompted_at"] = s["dims"]["need"]["attempts"]
                # 버튼에서 '계속 다듬기'를 누른 뒤에는 다시 추궁
                self.assertEqual(rules.decide(s)["kind"], "probe")
        self.assertEqual(kinds, ["probe", "choice", "probe", "choice", "probe"])
        self.assertEqual([b[0] for b in rules.BUTTONS["choice"]], ["continue", "options", "skip"])

    def test_막히면_선택지_먼저_또_막히면_계속할지_묻기(self):
        s = fresh()
        say(s, "모르겠어요", judged(stuck=True))
        self.assertEqual(rules.decide(s)["kind"], "options")
        s["dims"]["need"]["options_shown"] = True
        say(s, "그래도 모르겠어요", judged(stuck=True))
        self.assertEqual(rules.decide(s)["kind"], "stuck_again")

    def test_보류하면_다음_차원(self):
        s = fresh()
        rules.hold(s)
        self.assertEqual(s["current"], "uniqueness")
        self.assertTrue(s["dims"]["need"]["held"])

    def test_보류한_차원은_다시_묻지_않고_건너뛴다(self):
        s = fresh()
        rules.hold(s)
        say(s, "경험이 있어요", judged(ju("uniqueness", CLEAR, "경험", "경험이 있어요")))
        self.assertEqual(s["current"], "reader")

    def test_전부_지나가고_보류가_있으면_다시볼지_묻기(self):
        s = fresh()
        for _ in range(7):
            rules.hold(s)
        self.assertIsNone(s["current"])
        self.assertEqual(s["phase"], "interview")
        a = rules.decide(s)
        self.assertEqual(a["kind"], "revisit")
        self.assertEqual([b[0] for b in rules.BUTTONS["revisit"]], ["revisit_now", "finish_review"])

    def test_전부_선명하면_바로_정리_단계(self):
        s = fresh()
        ups = [ju(k, CLEAR, "요약", "전부 한꺼번에 말씀드릴게요") for k in ("need", "uniqueness", "reader", "change", "difference", "tone", "concept")]
        say(s, "전부 한꺼번에 말씀드릴게요", judged(*ups), opening=True)
        self.assertEqual(s["phase"], "review")
        self.assertEqual(rules.decide(s)["kind"], "review")

    def test_확정은_한줄콘셉트가_선명해야(self):
        s = fresh()
        s["phase"] = "review"
        s["dims"]["concept"]["held"] = True
        self.assertIsNotNone(rules.confirm_block_reason(s))
        s["dims"]["concept"]["held"] = False
        s["dims"]["concept"]["verdict"] = WEAK
        s["dims"]["concept"]["summary"] = "뭔가"
        self.assertIsNotNone(rules.confirm_block_reason(s))
        s["dims"]["concept"]["verdict"] = CLEAR
        self.assertIsNone(rules.confirm_block_reason(s))  # 다른 차원이 숙제여도 가능

    def test_인터뷰_중에는_확정_불가(self):
        s = fresh()
        s["dims"]["concept"]["verdict"] = CLEAR
        s["dims"]["concept"]["summary"] = "x"
        self.assertIsNotNone(rules.confirm_block_reason(s))

    def test_형식이_틀린_판정은_지금_차원만_보완필요(self):
        for bad in (None, "문자열", {}, {"updates": "x", "stuck": False, "off_topic": False},
                    {"updates": [], "stuck": "no", "off_topic": False}):
            s = fresh()
            s["answers"].append("답")
            rules.apply_judgment(s, bad, opening=True)
            self.assertEqual(s["dims"]["need"]["verdict"], WEAK)
            self.assertEqual(s["dims"]["need"]["attempts"], 1)
            for k in ("uniqueness", "reader", "change", "difference", "tone", "concept"):
                self.assertEqual(s["dims"][k]["verdict"], EMPTY)
            self.assertEqual(rules.decide(s)["kind"], "probe")

    def test_근거가_작가_말에_없으면_갱신_거부(self):
        s = fresh()
        s["answers"].append("저는 빵집을 했어요")
        rules.apply_judgment(s, judged(ju("need", CLEAR, "빵집 사장", "저는 카페를 했어요")))
        self.assertEqual(s["dims"]["need"]["verdict"], WEAK)  # 선명으로 통과하지 못함
        self.assertEqual(s["dims"]["need"]["summary"], "")

    def test_근거가_비어_있으면_거부(self):
        s = fresh()
        s["answers"].append("저는 빵집을 했어요")
        rules.apply_judgment(s, judged(ju("need", CLEAR, "요약", "")))
        self.assertEqual(s["dims"]["need"]["verdict"], WEAK)

    def test_근거는_공백_차이를_무시하고_비교(self):
        s = fresh()
        s["answers"].append("저는  빵집을\n했어요")
        rules.apply_judgment(s, judged(ju("need", CLEAR, "빵집", "저는 빵집을 했어요")))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_다른_차원의_거부된_갱신은_그냥_버린다(self):
        s = fresh()
        s["answers"].append("이 책은 꼭 필요해요")
        rules.apply_judgment(s, judged(ju("need", CLEAR, "필요", "이 책은 꼭 필요해요"), ju("reader", CLEAR, "지어냄", "없는 말을 지어낸 것")))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)
        self.assertEqual(s["dims"]["reader"]["verdict"], EMPTY)

    def test_한번의_답이_여러_차원을_갱신(self):
        s = fresh()
        s["answers"].append("입사 3년 차 직장인에게 이직 대신 버티는 법을 알려 주고 싶어요")
        rules.apply_judgment(
            s,
            judged(
                ju("need", CLEAR, "버티는 법", "이직 대신 버티는 법을 알려 주고 싶어요"),
                ju("reader", CLEAR, "입사 3년 차", "입사 3년 차 직장인"),
            ),
            opening=True,
        )
        self.assertEqual(s["dims"]["reader"]["verdict"], CLEAR)
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_비어있음_갱신은_받지_않는다(self):
        s = fresh()
        s["answers"].append("이 책은 꼭 필요해요")
        rules.apply_judgment(s, judged(ju("need", CLEAR, "필요", "이 책은 꼭 필요해요")))
        rules.apply_judgment(s, judged(ju("need", EMPTY, "", "")))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)

    # ----- 근거 인용 검사 강화 -----

    def _judge_once(self, answers, update, opening=False):
        s = fresh()
        s["answers"].extend(answers)
        rules.apply_judgment(s, judged(update), opening=opening)
        return s

    def test_문장부호와_따옴표_차이는_무시(self):
        s = self._judge_once(["저는 \u201c빵집\u201d을 10년 했어요, 정말로!"], ju("need", CLEAR, "빵집", "저는 \"빵집\"을 10년 했어요 정말로"))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_너무_짧은_근거는_거부(self):
        s = self._judge_once(["빵집을 했어요"], ju("need", CLEAR, "빵집", "빵집"))
        self.assertNotEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_이전_답에만_있는_근거는_이번_판정에서_거부(self):
        s = self._judge_once(["저는 10년 빵집을 했어요", "그냥 그렇습니다"], ju("need", CLEAR, "빵집", "저는 10년 빵집을 했어요"))
        self.assertNotEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_답과_답을_이어_붙인_근거는_거부(self):
        self.assertFalse(rules.quote_supported("빵집을 했어요 그래서 퇴사했어요", ["저는 빵집을 했어요", "그래서 퇴사했어요"]))

    def test_글자_하나_차이는_비슷한_글로_인정(self):
        s = self._judge_once(["저는 십 년 동안 빵집을 했습니다"], ju("need", CLEAR, "빵집", "저는 십 년 동안 빵집을 했읍니다"))
        self.assertEqual(s["dims"]["need"]["verdict"], CLEAR)

    def test_전혀_다른_글은_거부(self):
        self.assertFalse(rules.quote_supported("저는 카페를 오래 운영했습니다", ["저는 십 년 동안 빵집을 했습니다"]))

    # ----- 형식이 이상한 판정은 500이 아니라 형식 오류 -----

    def test_차원_값이_문자열이_아니어도_예외없이_형식오류(self):
        for bad_dim in (["need"], {"a": 1}, 3, None):
            s = fresh()
            s["answers"].append("저는 빵집을 오래 했어요")
            raw = judged(dict(ju("need", CLEAR, "x", "저는 빵집을 오래 했어요"), dim=bad_dim))
            rules.apply_judgment(s, raw, opening=True)
            self.assertEqual(s["dims"]["need"]["verdict"], WEAK)

    def test_고정_문장에_어색한_조사가_없다(self):
        s = fresh()
        for k in ("choice", "stuck_again"):
            t = rules.fixed_text({"kind": k, "dim": "need"}, s)
            self.assertNotIn("'가", t)
            self.assertIn("항목이", t)


if __name__ == "__main__":
    unittest.main()

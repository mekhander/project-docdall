import { DIMS } from "./logic.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TIMEOUT_MS = 30000;

export class AiError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const TONE =
  "말투 원칙: 실제 출판사 편집자처럼 따뜻하고 차분한 존댓말. 한 번에 질문은 하나만 한다. 작가의 직전 답을 한 구절로 짧게 되짚고('~하셨던 장면이군요') 다음 질문으로 간다. 작가의 말을 평가하지 않는다. '좋은 소재네요' 같은 칭찬 대신 '그 장면을 조금 더 듣고 싶어요' 같은 관심을 표현한다. 전체 3문장 이내. 이모지는 쓰지 않고 느낌표를 남발하지 않는다.";

const RULES =
  "- 작가를 대신해 내용을 정하거나 써 주지 않는다. 작가가 말한 내용만 쓴다.\n" +
  "- 책 제목, 저자 이름, 통계, 시장 정보를 지어내거나 먼저 언급하지 않는다.\n" +
  "- 판정 용어(clear, weak 등)와 루브릭 이름을 그대로 말하지 않는다.\n" +
  "- 작가가 사람이냐고 묻거나 AI인지 물으면 숨기지 말고 AI 편집자 소담이라고 솔직하게 답한다.";

function dimBlock(d) {
  return `이름: ${d.label}\n확인할 것: ${d.check}\n약한 신호: ${d.weak}\n약한 답 예: "${d.anchorWeak}"\n선명한 답 예: "${d.anchorStrong}"`;
}

export function buildPrompt({ state, cur, nxt, text }) {
  const recent = state.history
    .slice(-6)
    .map((h) => `${h.role === "author" ? "작가" : "편집자"}: ${h.text}`)
    .join("\n");
  const known = Object.values(DIMS)
    .map((d) => {
      const x = state.dims[d.key];
      return `- ${d.label}: ${x.status}${x.summary ? ` / "${x.summary}"` : ""}`;
    })
    .join("\n");
  return `너는 한국어 출판 편집자 '소담'이다. 글을 써 본 적 없는 예비 작가와 책의 기획서를 함께 만들고 있다.
${TONE}
${RULES}

[지금 다루는 칸]
${dimBlock(DIMS[cur])}

[선명해지면 다음에 물을 칸]
${nxt ? dimBlock(DIMS[nxt]) : "없음 (이 칸이 선명해지면 인터뷰를 마친다)"}

[지금까지의 상태]
${known}

[최근 대화]
${recent || "(없음)"}

[작가의 답]
${text}

할 일:
1. 작가의 답으로 "지금 다루는 칸"만 판정한다. 다른 칸 이야기를 했더라도 이번에는 지금 칸만 본다. 애매하면 weak로 둔다.
   - clear: 확인할 것이 채워짐. weak: 말은 했지만 약한 신호가 있음. empty: 이 칸에 대한 말이 없음.
2. summary는 작가가 한 말만으로 작가의 표현을 살려 쓴 한 문장(60자 이내). 작가가 말하지 않은 내용을 넣지 않는다. clear가 아니면 빈 문자열도 괜찮다.
3. gap은 비어 있는 곳을 한 줄로 쓴다.
4. 작가가 "모르겠어요"라고 하면 dont_know를 true, "대신 정해 주세요"라고 하면 delegate를 true로 한다.
5. probe_message: 아직 clear가 아닐 때 편집자가 하는 말. 직전 답을 한 구절로 되짚고, 같은 칸을 이전과 다른 각도로 묻는 질문 하나.
6. next_message: clear일 때 편집자가 하는 말. 직전 답을 한 구절로 되짚고, "다음 칸"을 묻는 질문 하나. 다음 칸이 없으면 빈 문자열.

출력(JSON만): {"status":"clear|weak|empty","summary":"","quote":"","gap":"","dont_know":false,"delegate":false,"probe_message":"","next_message":""}`;
}

function parseJson(raw) {
  const t = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) throw new AiError("bad_json");
    try {
      return JSON.parse(m[0]);
    } catch {
      throw new AiError("bad_json");
    }
  }
}

export async function gemini(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("no_key");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new AiError(res.status === 429 ? "rate_limited" : `http_${res.status}`);
    const data = await res.json();
    const raw = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    return parseJson(raw);
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e?.name === "AbortError") throw new AiError("timeout");
    throw new AiError("network");
  } finally {
    clearTimeout(timer);
  }
}

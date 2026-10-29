// 실제 Gemini 호출을 한 번 시험한다. 사용: node --env-file=.env try-ai.mjs "작가의 답"
import { startTurn, answerTurn } from "./logic.js";
import { gemini } from "./gemini.js";

const text = process.argv[2] || "힘들었던 경험이 많아요";
const { state } = startTurn();
const t0 = Date.now();
try {
  const msgs = await answerTurn(state, text, gemini);
  console.log(`ok ${Date.now() - t0}ms`);
  console.log("편집자:", msgs[0].text);
  console.log("소재 칸:", JSON.stringify(state.dims.material));
  console.log("현재 칸:", state.current);
} catch (e) {
  console.log(`failed ${e.code || e.message} ${Date.now() - t0}ms`);
}

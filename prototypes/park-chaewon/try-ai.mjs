// 실제 Gemini 호출을 한 번 시험한다. 사용: node --env-file=.env try-ai.mjs "작가의 답"
import { startTurn, answerTurn } from "./logic.js";
import { gemini } from "./gemini.js";

const text = process.argv[2] || "그냥 제 경험을 책으로 남기고 싶어서요";
const { state } = startTurn();
const t0 = Date.now();
try {
  const msgs = await answerTurn(state, text, gemini);
  console.log(`ok ${Date.now() - t0}ms`);
  console.log("편집자:", msgs[0].text);
  console.log("첫 칸(필요성·목적):", JSON.stringify(state.dims.purpose));
  console.log("현재 칸:", state.current);
} catch (e) {
  console.log(`failed ${e.code || e.message} ${Date.now() - t0}ms`);
}

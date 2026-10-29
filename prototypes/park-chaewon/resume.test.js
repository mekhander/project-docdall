import test from "node:test";
import assert from "node:assert/strict";
import { startTurn, bookmark, answerTurn, DIMS } from "./logic.js";
import { handleTurn } from "./server.js";

const clearAi = (summary) => async () => ({ status: "clear", summary, gap: "", probe_message: "", next_message: "" });
const weakAi = async () => ({ status: "weak", summary: "", gap: "비어 있음", probe_message: "조금 더 들려 주세요.", next_message: "" });

test("책갈피를 꽂으면 인터뷰는 다음 질문으로 이어진다", () => {
  const { state } = startTurn();
  const msgs = bookmark(state);
  assert.equal(state.phase, "interview");
  assert.equal(state.current, "reader");
  assert.equal(msgs.at(-1).text, DIMS.reader.firstAsk);
});

test("남은 칸을 모두 거친 뒤 같은 대화 안에서 책갈피 칸으로 돌아간다 (처음 인사 없음)", async () => {
  const { state } = startTurn();
  bookmark(state); // purpose 책갈피
  const ai = clearAi("입사 3년 차, 이직 사이트를 열었다 닫는 사람");
  for (const text of ["a", "b", "c"]) await answerTurn(state, text, ai); // reader, change, difference
  assert.equal(state.current, "tone");
  const [msg] = await answerTurn(state, "d", clearAi("라면을 끓였습니다"));
  assert.equal(state.phase, "interview");
  assert.equal(state.current, "purpose");
  assert.equal(state.dims.purpose.bookmark, false);
  assert.match(msg.text, /아까 책갈피를 꽂아 둔 필요성·목적 이야기/);
  assert.match(msg.text, /톤·문체로 '라면을 끓였습니다'/);
  assert.doesNotMatch(msg.text, /오늘은 완성된 원고가 없어도/);
  assert.doesNotMatch(msg.text, /다시 돌아와 주셨네요/);
});

test("돌아간 칸에 다시 책갈피를 꽂으면 끝나고, 같은 칸을 또 자동으로 돌아가지 않는다", async () => {
  const { state } = startTurn();
  bookmark(state); // purpose
  for (const t of ["a", "b", "c", "d"]) await answerTurn(state, t, clearAi("x"));
  assert.equal(state.current, "purpose");
  const last = bookmark(state);
  assert.equal(state.dims.purpose.revisited, true);
  assert.equal(state.phase, "done");
  assert.deepEqual(last.at(-1).actions.map((a) => a.id), ["resume:purpose"]);
});

test("답 없이 연달아 책갈피만 꽂으면 바로 돌아가지 않고 끝난다", () => {
  const { state } = startTurn();
  for (let i = 0; i < 5; i++) bookmark(state);
  assert.equal(state.phase, "done");
  assert.equal(state.dims.purpose.revisited, false);
});

test("이야기 이어가기 버튼은 인사 없이 이어 가는 말로 돌아온다", async () => {
  const { state } = startTurn();
  for (let i = 0; i < 5; i++) bookmark(state);
  const out = await handleTurn({ action: "resume", dim: "reader", state });
  assert.equal(out.state.phase, "interview");
  assert.equal(out.state.current, "reader");
  assert.equal(out.state.dims.reader.bookmark, false);
  assert.match(out.messages[0].text, /아까 책갈피를 꽂아 둔 타깃 독자 이야기/);
  assert.doesNotMatch(out.messages[0].text, /오늘은 완성된 원고가 없어도/);
});

test("끝난 대화에서 바로 쓴 글은 책갈피 첫 칸의 답이 된다", async () => {
  const { state } = startTurn();
  for (let i = 0; i < 5; i++) bookmark(state);
  let seen;
  const ai = async (input) => {
    seen = input.cur;
    return weakAi();
  };
  const out = await handleTurn({ action: "answer", text: "독자는 저 같은 사람이에요", state }, ai);
  assert.equal(seen, "purpose");
  assert.equal(out.state.phase, "interview");
  assert.equal(out.state.dims.reader.bookmark, true);
});

test("모든 칸이 분명하면 끝나고, 쓴 글은 받지 않는다", async () => {
  const { state } = startTurn();
  state.phase = "done";
  for (const k of Object.keys(state.dims)) {
    state.dims[k].status = "clear";
    state.dims[k].summary = "x";
  }
  const out = await handleTurn({ action: "answer", text: "더 있어요", state });
  assert.equal(out.error, "not_interview");
});

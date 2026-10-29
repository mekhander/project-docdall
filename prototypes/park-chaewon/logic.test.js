import { test } from "node:test";
import assert from "node:assert/strict";
import { startTurn, answerTurn, bookmark, keepRefining, PARK_MSG, ORDER } from "./logic.js";
import { handleTurn } from "./server.js";

// AI를 흉내 낸다. 규칙(코드)만 시험한다.
const fake = (r) => async () => ({ status: "weak", summary: "", quote: "", gap: "", dont_know: false, delegate: false, probe_message: "다른 각도 질문", next_message: "다음 칸 질문", ...r });

test("칸은 루브릭 핵심 5개이고 순서가 정해져 있다", () => {
  assert.deepEqual(ORDER, ["purpose", "reader", "change", "difference", "tone"]);
  const { state, dims } = startTurn();
  assert.deepEqual(Object.keys(state.dims), ORDER);
  assert.deepEqual(dims.map((d) => d.label), ["필요성·목적", "타깃 독자", "독자의 변화", "차별점", "톤·문체"]);
});

test("막연한 답은 선명으로 치지 않고 다시 묻는다 (확인 1)", async () => {
  const { state } = startTurn();
  const msgs = await answerTurn(state, "그냥 제 경험을 책으로 남기고 싶어서요", fake({ status: "weak", summary: "" }));
  assert.equal(state.dims.purpose.status, "weak");
  assert.equal(state.dims.purpose.summary, "");
  assert.equal(state.current, "purpose");
  assert.equal(msgs[0].text, "다른 각도 질문");
});

test("분명한 답은 카드를 채우고 다음 칸으로 간다 (확인 2)", async () => {
  const { state } = startTurn();
  const msgs = await answerTurn(state, "첫 6개월의 고립감을 덜어 주고 싶어요", fake({ status: "clear", summary: "퇴사 후 첫 6개월의 고립감을 덜어 주고 싶다" }));
  assert.equal(state.dims.purpose.status, "clear");
  assert.match(state.dims.purpose.summary, /고립감/);
  assert.equal(state.current, "reader");
  assert.equal(msgs[0].text, "다음 칸 질문");
});

test("선명이라고 해도 요약이 비면 선명으로 치지 않는다", async () => {
  const { state } = startTurn();
  await answerTurn(state, "그냥요", fake({ status: "clear", summary: "" }));
  assert.equal(state.dims.purpose.status, "weak");
});

test("두 번 시도해도 안 풀리면 계속/책갈피를 묻는다", async () => {
  const { state } = startTurn();
  await answerTurn(state, "음", fake({ status: "weak" }));
  const msgs = await answerTurn(state, "음...", fake({ status: "weak" }));
  assert.equal(msgs[0].actions.length, 2);
  assert.deepEqual(msgs[0].actions.map((a) => a.id), ["continue", "bookmark"]);
});

test("'나중에'는 책갈피가 되고 내용이 지어지지 않는다 (확인 3)", () => {
  const { state } = startTurn();
  const msgs = bookmark(state);
  assert.equal(state.dims.purpose.bookmark, true);
  assert.equal(state.dims.purpose.summary, "");
  assert.equal(state.current, "reader");
  assert.equal(msgs[0].text, PARK_MSG);
});

test("책갈피를 꽂아도 칸 순서와 관계없이 남은 칸을 계속 묻는다", () => {
  const { state } = startTurn();
  const seen = [];
  for (let i = 0; i < 4; i++) {
    bookmark(state);
    seen.push(state.current);
    assert.equal(state.phase, "interview");
  }
  assert.deepEqual(seen, ["reader", "change", "difference", "tone"]);
});

test("모든 칸이 책갈피이고 답한 적이 없으면 마무리한다", () => {
  const { state } = startTurn();
  for (let i = 0; i < 5; i++) bookmark(state);
  assert.equal(state.phase, "done");
});

test("'계속 다듬기'는 AI 없이 다른 각도 질문을 한다", () => {
  const { state } = startTurn();
  const a = keepRefining(state)[0].text;
  const b = keepRefining(state)[0].text;
  assert.notEqual(a, b);
});

test("AI가 실패하면 상태가 바뀌지 않는다 (확인 4)", async () => {
  const { state } = startTurn();
  const before = JSON.stringify(state);
  const failing = async () => { throw new Error("down"); };
  await assert.rejects(() => handleTurn({ action: "answer", text: "안녕", state }, failing));
  assert.equal(JSON.stringify(state), before);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { startTurn, answerTurn, bookmark, keepRefining, PARK_MSG } from "./logic.js";
import { handleTurn } from "./server.js";

// AI를 흉내 낸다. 규칙(코드)만 시험한다.
const fake = (r) => async () => ({ status: "weak", summary: "", quote: "", gap: "", dont_know: false, delegate: false, probe_message: "다른 각도 질문", next_message: "다음 칸 질문", ...r });

test("막연한 답은 선명으로 치지 않고 다시 묻는다 (확인 1)", async () => {
  const { state } = startTurn();
  const msgs = await answerTurn(state, "힘들었던 경험이 많아요", fake({ status: "weak", summary: "" }));
  assert.equal(state.dims.material.status, "weak");
  assert.equal(state.dims.material.summary, "");
  assert.equal(state.current, "material");
  assert.equal(msgs[0].text, "다른 각도 질문");
});

test("분명한 답은 카드를 채우고 다음 칸으로 간다 (확인 2)", async () => {
  const { state } = startTurn();
  const msgs = await answerTurn(state, "서랍에서 메모를 발견했어요", fake({ status: "clear", summary: "서랍에서 '버티자'라고만 적힌 메모를 발견했다" }));
  assert.equal(state.dims.material.status, "clear");
  assert.match(state.dims.material.summary, /버티자/);
  assert.equal(state.current, "content");
  assert.equal(msgs[0].text, "다음 칸 질문");
});

test("선명이라고 해도 요약이 비면 선명으로 치지 않는다", async () => {
  const { state } = startTurn();
  await answerTurn(state, "그냥요", fake({ status: "clear", summary: "" }));
  assert.equal(state.dims.material.status, "weak");
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
  assert.equal(state.dims.material.bookmark, true);
  assert.equal(state.dims.material.summary, "");
  assert.equal(state.current, "content");
  assert.equal(msgs[0].text, PARK_MSG);
});

test("두 칸이 모두 책갈피면 마무리하고 끝난다", () => {
  const { state } = startTurn();
  bookmark(state);
  bookmark(state);
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

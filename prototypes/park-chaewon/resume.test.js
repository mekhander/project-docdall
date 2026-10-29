import test from "node:test";
import assert from "node:assert/strict";
import { startTurn, bookmark } from "./logic.js";
import { handleTurn } from "./server.js";

test("두 칸 모두 책갈피여도 대화가 이어질 길이 있다", () => {
  const { state } = startTurn();
  bookmark(state);
  const last = bookmark(state);
  assert.equal(state.phase, "done");
  const done = last.at(-1);
  assert.deepEqual(done.actions.map((a) => a.id), ["resume:material", "resume:content"]);
});

test("이야기 이어가기 버튼은 그 칸 질문으로 돌아온다", async () => {
  const { state } = startTurn();
  bookmark(state);
  bookmark(state);
  const out = await handleTurn({ action: "resume", dim: "material", state });
  assert.equal(out.state.phase, "interview");
  assert.equal(out.state.current, "material");
  assert.equal(out.state.dims.material.bookmark, false);
  assert.match(out.messages[0].text, /가장 먼저 떠오르는 장면/);
});

test("끝난 대화에서 바로 쓴 글은 책갈피 첫 칸의 답이 된다", async () => {
  const { state } = startTurn();
  bookmark(state);
  bookmark(state);
  let seen;
  const ai = async (input) => {
    seen = input.cur;
    return { status: "weak", summary: "", gap: "장면", probe_message: "그 장면을 조금 더 들려 주세요." };
  };
  const out = await handleTurn({ action: "answer", text: "서랍에서 메모를 찾았어요", state }, ai);
  assert.equal(seen, "material");
  assert.equal(out.state.phase, "interview");
  assert.equal(out.state.dims.content.bookmark, true);
});

test("두 칸 모두 분명하면 끝나고, 쓴 글은 받지 않는다", async () => {
  const { state } = startTurn();
  state.phase = "done";
  for (const k of ["material", "content"]) {
    state.dims[k].status = "clear";
    state.dims[k].summary = "x";
  }
  const out = await handleTurn({ action: "answer", text: "더 있어요", state });
  assert.equal(out.error, "not_interview");
});

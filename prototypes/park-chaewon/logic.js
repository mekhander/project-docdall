// 규칙은 코드가 정한다. AI는 판정과 편집자 말투 문장만 쓴다. (스펙 7절)

export const ORDER = ["material", "content"];

export const DIMS = {
  material: {
    key: "material",
    label: "소재",
    check: "작가만의 구체적인 장면·경험·사건이 하나 이상 떠오른다. 언제, 어디서, 누가, 무슨 일이 있었는지가 잡힌다.",
    weak: "'힘들었던 경험이 많아요', '이런저런 일이 있었어요'처럼 장면 없이 큰 주제로만 말한다.",
    anchorWeak: "회사 다니면서 힘들었던 경험이 많아요.",
    anchorStrong: "퇴사 전날 밤 책상 서랍에서 입사 첫날 적은 메모를 발견했는데, '버티자'라고만 적혀 있었어요.",
    firstAsk: "오늘은 완성된 원고가 없어도 괜찮아요. 책으로 만들고 싶은 이야기가 마음속에 있다면, 가장 먼저 떠오르는 장면 하나만 들려주시겠어요? 한 줄이어도 괜찮습니다.",
    angles: [
      "그 장면은 언제, 어디에서 있었던 일인가요? 곁에 누가 있었나요?",
      "그 순간 무엇이 가장 마음에 남았나요?",
      "그 장면이 책에 들어간다면, 첫 문장은 어떻게 시작하고 싶으세요?",
    ],
  },
  content: {
    key: "content",
    label: "핵심 내용",
    check: "책이 전하려는 핵심 메시지 한 줄과, 그것을 이루는 이야기 덩어리 서너 개가 그려진다.",
    weak: "'성장에 대한 이야기'처럼 주제만 있고, 무엇을 말하는 책인지와 어떤 이야기들로 이루어지는지가 없다.",
    anchorWeak: "퇴사와 성장에 대한 이야기예요.",
    anchorStrong: "남을지 떠날지는 연봉이 아니라 '일요일 밤의 기분'으로 정하자는 이야기를, 세 번의 일요일 장면으로 풀고 싶어요.",
    firstAsk: "이 책이 결국 하고 싶은 말을 한 줄로 한다면, 어떤 말일까요? 그 말을 풀어 줄 이야기가 떠오르면 함께 들려 주세요.",
    angles: [
      "그 말을 뒷받침할 이야기가 있다면, 가장 먼저 떠오르는 장면은 무엇인가요?",
      "독자가 이 책을 덮을 때 마음에 남았으면 하는 한마디가 있다면요?",
      "친구에게 이 책이 무슨 이야기인지 한 문장으로 말한다면, 뭐라고 하시겠어요?",
    ],
  },
};

export const GREETING =
  "어서 오세요. 저는 Docdall 편집실에서 작가님을 맞는 AI 편집자, 소담이에요.\n" +
  "나만의 책 한 권 써 보고 싶은 마음은 있는데, 어디서부터 시작해야 할지 몰라 미뤄 두고 계셨나요? 그런 분들이 찾아오시는 곳이에요.\n" +
  "제가 한 번에 하나씩 여쭤보면서 책의 기획서를 함께 만들어 드릴게요. 대신 써 드리지는 않아요. 쓰는 사람은 언제나 작가님이니까요.";

export const PARK_MSG = "그럼 여기에 책갈피를 꽂아 둘게요. 생각나면 언제든 돌아오세요.";

export const STATUSES = ["clear", "weak", "empty"];

export function newDim(tries = 0) {
  return { status: "empty", summary: "", quote: "", gap: "", tries, nextOffer: 2, bookmark: false, angle: 0 };
}

export function newState() {
  return {
    phase: "interview",
    current: "material",
    dims: { material: newDim(1), content: newDim(0) },
    history: [],
  };
}

export function startTurn() {
  const state = newState();
  const messages = [
    { role: "editor", text: GREETING },
    { role: "editor", text: DIMS.material.firstAsk },
  ];
  state.history.push(...messages);
  return { state, messages };
}

export const unresolved = (state, key) => state.dims[key].status !== "clear" && !state.dims[key].bookmark;

export function offerMessage(key) {
  return {
    role: "editor",
    text: `${DIMS[key].label} 이야기, 조금 더 다듬어 볼까요? 아니면 여기에 책갈피를 꽂아 두고 다음으로 넘어가도 괜찮아요.`,
    actions: [
      { id: "continue", label: "계속 다듬기" },
      { id: "bookmark", label: "일단 책갈피 꽂아 두기" },
    ],
  };
}

export function doneMessage(state) {
  const marked = ORDER.filter((k) => state.dims[k].bookmark && state.dims[k].status !== "clear");
  const text = marked.length
    ? `오른쪽 카드에 작가님이 들려주신 말로 채웠어요. 책갈피를 꽂아 둔 곳(${marked.map((k) => DIMS[k].label).join(", ")})은 마음이 정리되면 다시 이야기 나눠요.`
    : "오른쪽 카드에 작가님이 들려주신 말로 채웠어요. 한번 읽어 보시고, 내 말이 아닌 곳이 있으면 알려 주세요.";
  const msg = { role: "editor", text };
  if (marked.length) msg.actions = marked.map((k) => ({ id: `resume:${k}`, label: `${DIMS[k].label} 이야기 이어가기` }));
  return msg;
}

// 책갈피를 꽂아 둔 칸이 남아 있으면 대화는 끝나지 않는다. (스펙 4절 8번)
export const marked = (state) => ORDER.filter((k) => state.dims[k].bookmark && state.dims[k].status !== "clear");

// 끝난 대화에서 책갈피 칸으로 돌아온다. key를 안 주면 책갈피 꽂은 첫 칸. 돌아갈 칸이 없으면 null.
export function reopen(state, key) {
  const k = key || marked(state)[0];
  if (!k || !marked(state).includes(k)) return null;
  state.dims[k].bookmark = false;
  state.dims[k].tries = Math.max(state.dims[k].tries, 1);
  state.current = k;
  state.phase = "interview";
  return k;
}

export function resume(state, key) {
  const k = reopen(state, key);
  if (!k) return null;
  const messages = [{ role: "editor", text: `다시 돌아와 주셨네요. ${DIMS[k].firstAsk}` }];
  state.history.push(...messages);
  return messages;
}

// 판정 결과를 칸에 반영한다. 선명인데 요약이 비면 선명으로 치지 않는다.
export function applyJudge(state, key, judge) {
  const d = state.dims[key];
  let status = STATUSES.includes(judge.status) ? judge.status : "weak";
  const summary = String(judge.summary || "").trim();
  if (status === "clear" && !summary) status = "weak";
  d.status = status;
  if (summary && status !== "empty") d.summary = summary;
  if (judge.quote && status !== "empty") d.quote = String(judge.quote).trim();
  d.gap = status === "clear" ? "" : String(judge.gap || "").trim();
}

function advance(state) {
  const nxt = ORDER.find((k) => unresolved(state, k));
  if (!nxt) {
    state.phase = "done";
    return null;
  }
  state.current = nxt;
  if (state.dims[nxt].tries === 0) state.dims[nxt].tries = 1;
  return nxt;
}

// 다음 행동을 코드가 정한다.
export function decide(state, judge) {
  const key = state.current;
  const d = state.dims[key];
  const stuck = !!(judge.dont_know || judge.delegate);
  if (d.status === "clear") {
    const nxt = advance(state);
    return nxt ? { type: "next", dim: nxt } : { type: "done" };
  }
  if (stuck || d.tries >= d.nextOffer) {
    d.nextOffer = d.tries + 2;
    return { type: "park_offer", dim: key };
  }
  d.tries += 1;
  return { type: "probe", dim: key };
}

// "이 질문은 나중에" 또는 제안에서 책갈피를 고른 경우. AI를 부르지 않는다.
export function bookmark(state) {
  state.dims[state.current].bookmark = true;
  const nxt = advance(state);
  const messages = [{ role: "editor", text: PARK_MSG }];
  if (nxt) messages.push({ role: "editor", text: DIMS[nxt].firstAsk });
  else messages.push(doneMessage(state));
  state.history.push(...messages);
  return messages;
}

// "계속 다듬기". 코드에 적어 둔 다른 각도 질문을 쓴다.
export function keepRefining(state) {
  const d = state.dims[state.current];
  const angles = DIMS[state.current].angles;
  const text = angles[d.angle % angles.length];
  d.angle += 1;
  d.tries += 1;
  const messages = [{ role: "editor", text }];
  state.history.push(...messages);
  return messages;
}

// 작가의 답 한 번. ai는 ({state, cur, nxt, text}) => {judge..., probe_message, next_message}
export async function answerTurn(state, text, ai) {
  const cur = state.current;
  const nxt = ORDER.find((k) => k !== cur && unresolved(state, k)) || null;
  const result = await ai({ state, cur, nxt, text });
  // 여기부터는 AI가 성공했을 때만 상태를 바꾼다.
  state.history.push({ role: "author", text });
  applyJudge(state, cur, result);
  const action = decide(state, result);
  let msg;
  if (action.type === "probe") {
    msg = { role: "editor", text: (result.probe_message || "").trim() || DIMS[cur].angles[0] };
  } else if (action.type === "next") {
    msg = { role: "editor", text: (result.next_message || "").trim() || DIMS[action.dim].firstAsk };
  } else if (action.type === "park_offer") {
    msg = offerMessage(cur);
  } else {
    msg = doneMessage(state);
  }
  state.history.push(msg);
  return [msg];
}

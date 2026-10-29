// 규칙은 코드가 정한다. AI는 판정과 편집자 말투 문장만 쓴다. (스펙 7절)
// 칸(차원)은 「AI 편집자 인터뷰: 루브릭과 작동 방식」의 핵심 5개다. 예시 문장은 그 문서의 앵커 예시(팀이 지어 본 초안)다.

export const ORDER = ["purpose", "reader", "change", "difference", "tone"];

export const DIMS = {
  purpose: {
    key: "purpose",
    label: "필요성·목적",
    check: "이 책이 왜 필요한지, 왜 지금 쓰는지가 말로 나온다.",
    weak: "이유가 '쓰고 싶어서', '남기고 싶어서'에 그친다.",
    anchorWeak: "그냥 제 경험을 책으로 남기고 싶어서요.",
    anchorStrong: "퇴사 후 혼자 일을 시작한 사람이 첫 6개월에 겪는 고립감을, 나처럼 겪는 사람이 덜 혼자라고 느끼게 하고 싶어요.",
    firstAsk: "오늘은 완성된 원고가 없어도 괜찮아요. 지금 가진 것을 들려주세요. 한 줄 아이디어도, 이미 쓴 글도 좋아요. 이 책이 왜 쓰고 싶으신지도 함께 들려주시면 좋겠어요.",
    revisitAsk: "이야기를 나누다 보니 이 책이 왜 필요한지 조금 더 또렷해지셨나요? 떠오르는 대로 들려 주세요.",
    angles: [
      "이 책이 없으면, 이 이야기를 읽게 될 분은 어떤 점이 불편할까요?",
      "이 책을 지금 쓰고 싶어진 계기가 있다면 무엇일까요?",
      "이 책이 세상에 있다면, 무엇이 달라질 것 같으세요?",
    ],
  },
  reader: {
    key: "reader",
    label: "타깃 독자",
    check: "특정한 한 사람의 상황이 그려진다.",
    weak: "'20~30대 직장인'처럼 넓은 집단으로만 말한다.",
    anchorWeak: "20~30대 직장인이요.",
    anchorStrong: "입사 3년 차인데 퇴근하고 이직 사이트를 열었다 닫았다 하다 잠드는 사람. 작년의 저예요.",
    firstAsk: "이 책이 가장 필요한 한 사람을 떠올려 보세요. 그분은 지금 어떤 상황에 있나요?",
    revisitAsk: "그 이야기를 하다 보니 이 책을 읽어 줄 한 사람이 떠오르셨나요? 어떤 분인지 들려 주세요.",
    angles: [
      "그중 최근에 이 고민을 한 사람 한 명을 떠올려 보세요. 어떤 상황이었나요?",
      "그분은 하루 중 언제 이 고민을 가장 많이 하실까요?",
      "그분이 작가님과 닮은 점이 있다면 무엇일까요?",
    ],
  },
  change: {
    key: "change",
    label: "독자의 변화",
    check: "읽고 난 뒤 독자가 무엇을 알게 되거나 하게 되는지가 그려진다.",
    weak: "'도움이 됐으면'처럼 막연하다.",
    anchorWeak: "읽고 도움이 됐으면 좋겠어요.",
    anchorStrong: "이직 사이트를 여는 대신, 자기 3년 치 업무를 한 장에 적어 보는 거요.",
    firstAsk: "이 책을 다 읽은 독자가 내일 아침 무엇을 다르게 하면 좋겠어요?",
    revisitAsk: "그 이야기를 하다 보니, 독자가 책을 덮고 무엇을 하면 좋을지 떠오르셨나요?",
    angles: [
      "다 읽은 독자가 내일 아침 무엇을 다르게 하나요?",
      "독자가 책을 덮고 가장 먼저 하는 행동이 있다면 무엇일까요?",
      "읽기 전에는 몰랐는데 읽고 나서 알게 되는 것이 있다면 무엇일까요?",
    ],
  },
  difference: {
    key: "difference",
    label: "차별점",
    check: "비슷한 책과 무엇이 다른지 말로 나온다.",
    weak: "비슷한 책을 모르거나 '다 다루겠다'고 한다.",
    anchorWeak: "다른 책보다 더 진솔해요.",
    anchorStrong: "이직 책은 대부분 옮긴 사람의 성공담인데, 이 책은 남기로 결정하기까지의 과정을 다뤄요.",
    firstAsk: "서점에서 이 책 옆에 놓일 것 같은 책이 있다면, 어떤 책일까요? 그 책에 없는 것은 무엇인가요?",
    revisitAsk: "이야기를 나누다 보니 이 책만의 다른 점이 떠오르셨나요? 한 가지만이라도 들려 주세요.",
    angles: [
      "서점에서 이 책 옆에 놓일 책은 뭘까요? 그 책에 없는 것은요?",
      "같은 주제의 다른 책을 읽으셨다면, 아쉬웠던 점이 있었나요?",
      "이 책만 할 수 있는 이야기를 한 가지만 꼽는다면 무엇일까요?",
    ],
  },
  tone: {
    key: "tone",
    label: "톤·문체",
    check: "말투가 일관되고, 실제 문장으로 확인된다.",
    weak: "말투 설명만 있고 문장이 없다.",
    anchorWeak: "친근하고 편하게 쓰고 싶어요.",
    anchorStrong: "'솔직히 말하면 그날 저는 사직서를 쓰다 말고 라면을 끓였습니다.' 이런 느낌이요.",
    firstAsk: "이 책의 말투가 가장 잘 드러나는 문장 하나를 직접 써서 보여 주시겠어요? 책의 첫 문장이어도 좋아요.",
    revisitAsk: "이야기를 나누다 보니 이 책에 어울리는 말투가 조금 잡히셨나요? 문장 하나로 보여 주세요.",
    angles: [
      "이 말투가 가장 잘 드러난 문장 하나를 보여 주세요.",
      "그 문장을 친구에게 소리 내어 읽어 준다면, 어떤 목소리일까요?",
      "책의 한 장면을 말하듯 한 문장으로 적어 보시겠어요?",
    ],
  },
};

export const GREETING =
  "어서 오세요. 저는 Docdall 편집실에서 작가님을 맞는 AI 편집자, 소담이에요.\n" +
  "나만의 책 한 권 써 보고 싶은 마음은 있는데, 어디서부터 시작해야 할지 몰라 미뤄 두고 계셨나요? 그런 분들이 찾아오시는 곳이에요.\n" +
  "제가 한 번에 하나씩 여쭤보면서 책의 기획서를 함께 만들어 드릴게요. 대신 써 드리지는 않아요. 쓰는 사람은 언제나 작가님이니까요.";

export const PARK_MSG = "그럼 여기에 책갈피를 꽂아 둘게요. 다른 이야기를 나누다 보면 생각이 떠오를 수도 있으니까요.";

export const STATUSES = ["clear", "weak", "empty"];

export function newDim(tries = 0) {
  return { status: "empty", summary: "", quote: "", gap: "", tries, nextOffer: 2, bookmark: false, bookmarkAt: 0, revisited: false, angle: 0 };
}

export function newState() {
  return {
    phase: "interview",
    current: ORDER[0],
    dims: Object.fromEntries(ORDER.map((k, i) => [k, newDim(i === 0 ? 1 : 0)])),
    history: [],
  };
}

export function startTurn() {
  const state = newState();
  const messages = [
    { role: "editor", text: GREETING },
    { role: "editor", text: DIMS[ORDER[0]].firstAsk },
  ];
  state.history.push(...messages);
  return { state, messages, dims: ORDER.map((k) => ({ key: k, label: DIMS[k].label })) };
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

// 책갈피를 꽂아 둔(아직 선명하지 않은) 칸들
export const marked = (state) => ORDER.filter((k) => state.dims[k].bookmark && state.dims[k].status !== "clear");

export function doneMessage(state) {
  const left = marked(state);
  const text = left.length
    ? `오른쪽 카드에 작가님이 들려주신 말로 채웠어요. 책갈피를 꽂아 둔 곳(${left.map((k) => DIMS[k].label).join(", ")})은 마음이 정리되면 이어서 이야기 나눠요.`
    : "오른쪽 카드에 작가님이 들려주신 말로 채웠어요. 한번 읽어 보시고, 내 말이 아닌 곳이 있으면 알려 주세요.";
  const msg = { role: "editor", text };
  if (left.length) msg.actions = left.map((k) => ({ id: `resume:${k}`, label: `${DIMS[k].label} 이야기 이어가기` }));
  return msg;
}

// 책갈피 칸으로 돌아간다. 처음 만나는 것처럼 인사하지 않고, 이어서 이야기한다. (스펙 4절 8번)
function backTo(state, k) {
  const d = state.dims[k];
  d.bookmark = false;
  d.revisited = true;
  d.tries = 1;
  d.nextOffer = 2;
  state.current = k;
  state.phase = "interview";
}

// 받침 있으면 으로 (ㄹ 받침은 로)
const ro = (w) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c % 28 !== 0 && c % 28 !== 8 ? "으로" : "로";
};

export function revisitMessage(state, k) {
  const said = ORDER.filter((o) => o !== k && state.dims[o].status === "clear" && state.dims[o].summary).at(-1);
  const recall = said ? `앞서 ${DIMS[said].label}${ro(DIMS[said].label)} '${state.dims[said].summary.replace(/[.。]$/, "")}'라고 들려주셨죠. ` : "";
  const text = `아까 책갈피를 꽂아 둔 ${DIMS[k].label} 이야기로 돌아가 볼까요? ${recall}${DIMS[k].revisitAsk} 아직이라면 이번에도 책갈피를 꽂아 두셔도 괜찮아요.`;
  return { role: "editor", text };
}

// 끝난 대화에서 책갈피 칸으로 돌아온다. key를 안 주면 책갈피 꽂은 첫 칸. 돌아갈 칸이 없으면 null.
export function reopen(state, key) {
  const k = key || marked(state)[0];
  if (!k || !marked(state).includes(k)) return null;
  backTo(state, k);
  return k;
}

export function resume(state, key) {
  const k = reopen(state, key);
  if (!k) return null;
  const messages = [revisitMessage(state, k)];
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

// 책갈피를 꽂은 뒤 작가가 다른 이야기에 한 번 이상 답했는가
const answeredSince = (state, at) => state.history.slice(at).some((h) => h.role === "author");

// 다음에 할 일: 아직 안 물은 칸 → (다른 이야기를 거친) 책갈피 칸으로 돌아가기 → 끝
function advance(state) {
  const nxt = ORDER.find((k) => unresolved(state, k));
  if (nxt) {
    state.current = nxt;
    if (state.dims[nxt].tries === 0) state.dims[nxt].tries = 1;
    return { type: "next", dim: nxt };
  }
  const back = ORDER.find((k) => {
    const d = state.dims[k];
    return d.bookmark && d.status !== "clear" && !d.revisited && answeredSince(state, d.bookmarkAt);
  });
  if (back) {
    backTo(state, back);
    return { type: "revisit", dim: back };
  }
  state.phase = "done";
  return { type: "done" };
}

// 다음 행동을 코드가 정한다.
export function decide(state, judge) {
  const key = state.current;
  const d = state.dims[key];
  const stuck = !!(judge.dont_know || judge.delegate);
  if (d.status === "clear") return advance(state);
  if (stuck || d.tries >= d.nextOffer) {
    d.nextOffer = d.tries + 2;
    return { type: "park_offer", dim: key };
  }
  d.tries += 1;
  return { type: "probe", dim: key };
}

// "이 질문은 나중에" 또는 제안에서 책갈피를 고른 경우. AI를 부르지 않는다.
export function bookmark(state) {
  const d = state.dims[state.current];
  d.bookmark = true;
  d.bookmarkAt = state.history.length;
  const act = advance(state);
  const messages = [{ role: "editor", text: PARK_MSG }];
  if (act.type === "next") messages.push({ role: "editor", text: DIMS[act.dim].firstAsk });
  else if (act.type === "revisit") messages.push(revisitMessage(state, act.dim));
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
  } else if (action.type === "revisit") {
    msg = revisitMessage(state, action.dim);
  } else {
    msg = doneMessage(state);
  }
  state.history.push(msg);
  return [msg];
}

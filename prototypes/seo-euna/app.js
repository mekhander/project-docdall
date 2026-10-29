// 러닝메이트 P0 화면. 규칙 계산은 logic.js, 공유 데이터는 Supabase rpc(supabase/schema.sql).
// 본문은 이 브라우저의 localStorage에만 저장하고, 서버에는 날짜·글자 수·진행률·약속만 보낸다.
(function () {
  const L = window.Logic;
  const R = L.RULES;
  const STORE_KEY = "docdall-runningmate-v1";
  const $app = document.getElementById("app");

  // ?today=YYYY-MM-DD 로 오늘 날짜를 바꿔 볼 수 있다 (점검용).
  const param = new URLSearchParams(location.search).get("today");
  const TODAY = L.isDay(param) ? param : L.localToday();
  const badge = document.getElementById("today-badge");
  badge.textContent = (L.isDay(param) ? "테스트 날짜 " : "오늘 ") + TODAY;
  if (L.isDay(param)) badge.classList.add("test");

  // ---------- 저장소 ----------
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  }
  const S = Object.assign({ plan: null, toc: [], nickname: "", group: null, entries: [], pending: { days: [], progress: false }, goals: [] }, load());
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  }

  // ---------- 서버 ----------
  const CFG = window.CONFIG || {};
  const hasConfig = CFG.SUPABASE_URL && CFG.SUPABASE_KEY && !CFG.SUPABASE_URL.includes("<project-ref>");

  async function rpc(name, args = {}) {
    if (!hasConfig) throw new Error("no_config");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: CFG.SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: ctrl.signal,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error((data && data.message) || `http_${res.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  const auth = () => ({ p_member: S.group.memberId, p_token: S.group.token });

  // 올리지 못한 기록을 올린다. 실패하면 다음에 다시 시도한다.
  async function flush() {
    if (!S.group) return true;
    const totals = L.dailyTotals(S.entries);
    try {
      for (const day of [...S.pending.days]) {
        await rpc("upsert_log", { ...auth(), p_day: day, p_chars: totals[day] || 0 });
        S.pending.days = S.pending.days.filter((d) => d !== day);
        save();
      }
      if (S.pending.progress) {
        const p = L.progress(S.toc, S.entries);
        await rpc("set_progress", { ...auth(), p_done: p.done, p_total: p.total });
        S.pending.progress = false;
        save();
      }
      return true;
    } catch {
      return false;
    }
  }

  let board = null;      // get_board 결과
  let boardError = false;
  async function loadBoard() {
    try {
      board = await rpc("get_board", { p_code: S.group.code });
      boardError = !board;
      const me = board && board.members.find((m) => m.id === S.group.memberId);
      if (me) {
        S.goals = me.goals;
        save();
      }
    } catch {
      boardError = true;
    }
  }

  // ---------- 도우미 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const WEEKDAY = ["월", "화", "수", "목", "금", "토", "일"];
  const errText = (e) =>
    ({
      no_config: "config.js가 없어요. README의 설정 단계를 따라 주세요.",
      no_group: "그 코드의 그룹이 없어요.",
      group_full: `그룹이 가득 찼어요 (최대 ${R.MAX_MEMBERS}명).`,
      nickname_taken: "그룹에 같은 닉네임이 이미 있어요.",
    }[e.message] || "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  const myLogs = () => Object.entries(L.dailyTotals(S.entries)).map(([day, chars]) => ({ day, chars }));

  // ---------- 1단계: 기획서와 목차 ----------
  function renderSetup() {
    $app.innerHTML = `
      <section class="card">
        <h2>1. 최소 기획서와 목차</h2>
        <form id="setup" class="grid">
          <div class="row">
            <label>책 제목<input name="title" required></label>
            <label>완성 목표일<input name="target" type="date" required></label>
          </div>
          <label>타겟 독자 (한두 문장)<textarea name="reader" rows="2" required></textarea></label>
          <label>목차 (꼭지 제목을 한 줄에 하나씩)<textarea name="toc" rows="5" required></textarea></label>
          <label>닉네임 (메이트에게 보이는 이름)<input name="nickname" maxlength="20" required></label>
          <p></p>
          <button class="primary">다음</button>
        </form>
      </section>`;
    document.getElementById("setup").onsubmit = (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const toc = String(f.get("toc")).split("\n").map((s) => s.trim()).filter(Boolean);
      S.plan = { title: f.get("title").trim(), reader: f.get("reader").trim(), targetDate: f.get("target") };
      S.toc = toc.map((title) => ({ id: uid(), title }));
      S.nickname = f.get("nickname").trim();
      save();
      render();
    };
  }

  // ---------- 2단계: 그룹 만들기 / 참여 ----------
  function renderGroupStep() {
    $app.innerHTML = `
      <section class="card">
        <h2>2. 러닝메이트 그룹</h2>
        <p class="hint">${esc(S.nickname)} 님, 목표일 ${esc(S.plan.targetDate)}. 같은 시기에 책을 끝내려는 ${R.MIN_MEMBERS}~${R.MAX_MEMBERS}명이 함께합니다.</p>
        <div class="cols">
          <div>
            <h3>새 그룹 만들기</h3>
            <button id="create" class="primary">그룹 만들기</button>
          </div>
          <div>
            <h3>코드로 참여</h3>
            <div class="row">
              <label>그룹 코드<input id="code" maxlength="6" placeholder="예: 3FA9C1"></label>
              <button id="check">확인</button>
            </div>
            <div id="preview"></div>
          </div>
        </div>
        <p id="group-msg"></p>
      </section>`;
    const msg = document.getElementById("group-msg");
    const join = async (code) => {
      try {
        const r = await rpc("join_group", { p_code: code, p_nickname: S.nickname, p_target_date: S.plan.targetDate });
        S.group = { code: code.toUpperCase(), memberId: r.member_id, token: r.token };
        S.pending.progress = true;
        save();
        render();
      } catch (e) {
        msg.className = "error";
        msg.textContent = errText(e);
      }
    };
    document.getElementById("create").onclick = async () => {
      try {
        await join(await rpc("create_group"));
      } catch (e) {
        msg.className = "error";
        msg.textContent = errText(e);
      }
    };
    document.getElementById("check").onclick = async () => {
      const code = document.getElementById("code").value.trim().toUpperCase();
      const box = document.getElementById("preview");
      msg.textContent = "";
      try {
        const b = await rpc("get_board", { p_code: code });
        if (!b) throw new Error("no_group");
        if (b.members.length >= R.MAX_MEMBERS) throw new Error("group_full");
        const far = L.targetDateWarnings(S.plan.targetDate, b.members);
        box.innerHTML = `
          <p class="hint">지금 ${b.members.length}명: ${b.members.map((m) => `${esc(m.nickname)}(${m.target_date})`).join(", ") || "아직 없음"}</p>
          ${far.length ? `<p class="warn">목표일이 ${R.TARGET_GAP_DAYS}일 넘게 차이 나는 메이트가 있어요: ${far.map((m) => `${esc(m.nickname)} ${m.target_date}`).join(", ")}</p>` : ""}
          <button id="join" class="primary">${far.length ? "그래도 참여하기" : "참여하기"}</button>`;
        document.getElementById("join").onclick = () => join(code);
      } catch (e) {
        box.innerHTML = "";
        msg.className = "error";
        msg.textContent = errText(e);
      }
    };
  }

  // ---------- 3단계: 보드와 쓰기 ----------
  function boardTable() {
    if (!board) return "";
    const days = L.weekDays(TODAY);
    const head = days.map((d, i) => `<th class="${d === TODAY ? "today" : ""}">${WEEKDAY[i]}<br>${d.slice(5)}</th>`).join("");
    const rows = board.members
      .map((m) => {
        const chars = Object.fromEntries(m.logs.map((l) => [l.day, l.chars]));
        const st = L.weekStatus(m.logs, m.goals, TODAY);
        const pct = L.progressPct(m.toc_done, m.toc_total);
        const cells = days
          .map((d) => {
            if (d > TODAY) return `<td class="cell future">·</td>`;
            const c = chars[d] || 0;
            return `<td class="cell ${L.isWrittenDay(c) ? "done" : ""}">${c ? c.toLocaleString() : "-"}</td>`;
          })
          .join("");
        return `<tr class="${m.id === S.group.memberId ? "me" : ""}">
          <td>${esc(m.nickname)}${m.id === S.group.memberId ? " (나)" : ""}</td>
          <td>${m.target_date}</td>
          <td><span class="bar"><i style="width:${pct}%"></i></span> ${pct}%</td>
          <td>${st.goal ? `${st.written}/${st.goal}` : "약속 없음"}</td>
          ${cells}</tr>`;
      })
      .join("");
    return `<div class="board-wrap"><table class="board">
      <thead><tr><th>메이트</th><th>목표일</th><th>진행률</th><th>약속</th>${head}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="hint">칸의 숫자는 그날 쓴 글자 수입니다. ${R.MIN_CHARS}자 이상이면 쓴 날(초록)로 셉니다. 본문은 보이지 않습니다.</p>`;
  }

  function renderMain() {
    const p = L.progress(S.toc, S.entries);
    const st = L.weekStatus(myLogs(), S.goals, TODAY);
    const ws = L.weekStart(TODAY);
    const next = S.goals.find((g) => g.week_start > ws);
    const todayChars = L.dailyTotals(S.entries)[TODAY] || 0;
    const count = board ? board.members.length : 0;
    const counts = {};
    for (const e of S.entries) counts[e.chapterId] = (counts[e.chapterId] || 0) + 1;
    const chapterChars = L.chapterTotals(S.entries);

    $app.innerHTML = `
      ${boardError ? `<div class="banner">메이트 현황을 불러오지 못했어요. 글쓰기와 저장은 그대로 되고, 기록은 연결되면 올라갑니다.</div>` : ""}
      ${S.pending.days.length || S.pending.progress ? `<p class="hint">아직 올라가지 않은 기록이 있어요.</p>` : ""}
      <section class="card">
        <h2>그룹 보드 <span class="code">${esc(S.group.code)}</span></h2>
        ${board && count < R.MIN_MEMBERS ? `<p class="warn">지금 ${count}명이에요. 메이트를 더 초대하세요 (코드 ${esc(S.group.code)}, ${R.MIN_MEMBERS}~${R.MAX_MEMBERS}명 권장).</p>` : ""}
        ${boardTable()}
      </section>

      <section class="card">
        <h2>이번 주 내 약속</h2>
        <div class="row">
          <p class="big">${st.goal ? `${st.written}/${st.goal}일` : "아직 약속이 없어요"}</p>
          <label>주 몇 일 쓸까요?
            <select id="goal-days">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === (st.goal || 3) ? "selected" : ""}>${n}</option>`).join("")}</select>
          </label>
          <button id="goal-save">약속하기</button>
        </div>
        <p class="hint">${next ? `다음 주(${next.week_start}~)부터 주 ${next.days}일로 바뀝니다. ` : ""}한 주는 월~일입니다. 이번 주 약속을 바꾸면 다음 주부터 적용됩니다.</p>
        <p id="goal-msg"></p>
      </section>

      <div class="cols write-cols">
        <section class="card">
          <h2>쓰기</h2>
          <form id="write" class="grid">
            <label>꼭지<select name="chapter">${S.toc.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("")}</select></label>
            <label>제목<input name="title"></label>
            <label>본문<textarea id="body" name="body" rows="18" required></textarea></label>
            <p class="counter">이 글 <b id="count">0</b>자 · 오늘 합계 <b id="today-total">${todayChars.toLocaleString()}</b>자 / ${R.MIN_CHARS}자</p>
            <button class="primary">저장</button>
          </form>
          <p id="write-msg"></p>
        </section>

        <section class="card">
          <h2>목차 · 진행률 ${p.pct}% <small class="hint">(${p.done}/${p.total}꼭지)</small></h2>
          <ul class="toc">${S.toc.map((c) => `<li class="${(chapterChars[c.id] || 0) >= R.MIN_CHARS ? "has" : ""}"><span>${esc(c.title)}</span><span>${counts[c.id] || 0}편 · ${(chapterChars[c.id] || 0).toLocaleString()}자</span></li>`).join("")}</ul>
          <p class="hint">꼭지에 쓴 글을 합쳐 ${R.MIN_CHARS}자 이상이면 진행률에 들어갑니다(초록).</p>
          <div class="row" style="margin-top:10px">
            <label>꼭지 추가<input id="new-chapter"></label>
            <button id="add-chapter">추가</button>
          </div>
          <h2 style="margin-top:20px">내 글</h2>
          <ul class="entries">${[...S.entries]
            .reverse()
            .slice(0, 10)
            .map((e) => `<li><span>${esc(e.title || "(제목 없음)")} <small>${esc((S.toc.find((c) => c.id === e.chapterId) || {}).title || "")}</small></span><small>${e.day} · ${L.charCount(e.body).toLocaleString()}자</small></li>`)
            .join("") || `<li><small>아직 저장한 글이 없어요.</small></li>`}</ul>
        </section>
      </div>`;

    const body = document.getElementById("body");
    body.oninput = () => {
      const n = L.charCount(body.value);
      document.getElementById("count").textContent = n.toLocaleString();
      document.getElementById("today-total").textContent = (todayChars + n).toLocaleString();
    };

    document.getElementById("write").onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      S.entries.push({ id: uid(), chapterId: f.get("chapter"), title: f.get("title").trim(), body: f.get("body"), day: TODAY, createdAt: new Date().toISOString() });
      if (!S.pending.days.includes(TODAY)) S.pending.days.push(TODAY);
      S.pending.progress = true;
      save();
      await refresh();
    };

    document.getElementById("add-chapter").onclick = async () => {
      const title = document.getElementById("new-chapter").value.trim();
      if (!title) return;
      S.toc.push({ id: uid(), title });
      S.pending.progress = true;
      save();
      await refresh();
    };

    document.getElementById("goal-save").onclick = async () => {
      const msg = document.getElementById("goal-msg");
      try {
        const r = await rpc("set_goal", { ...auth(), p_today: TODAY, p_days: Number(document.getElementById("goal-days").value) });
        msg.className = "hint";
        msg.textContent = r.week_start > ws ? `다음 주(${r.week_start})부터 주 ${r.days}일로 약속했어요.` : `이번 주 ${r.days}일로 약속했어요.`;
        await loadBoard();
        renderMain();
      } catch (e) {
        msg.className = "error";
        msg.textContent = errText(e);
      }
    };
  }

  // ---------- 돌아옴 화면 ----------
  function showReturnIfNeeded() {
    const last = L.lastWrittenDay(S.entries);
    if (!L.shouldShowReturn(last, TODAY)) return;
    const gap = L.daysBetween(last, TODAY);
    const st = L.weekStatus(myLogs(), S.goals, TODAY);
    document.getElementById("return-title").textContent = `${gap}일 만이에요`;
    const list = document.getElementById("return-mates");
    if (!board) {
      list.innerHTML = `<li>메이트 현황을 불러오지 못했어요.</li>`;
    } else {
      const mates = L.matesSince(board.members, S.group.memberId, last, TODAY);
      list.innerHTML = mates.length
        ? mates.map((m) => `<li><span>${esc(m.nickname)}</span><span>${m.days}일 · ${m.chars.toLocaleString()}자</span></li>`).join("")
        : `<li>아직 다른 메이트가 없어요.</li>`;
    }
    document.getElementById("return-goal").textContent = st.goal
      ? `${st.written}/${st.goal}일 · 남은 날 ${st.remaining}일`
      : `아직 약속이 없어요 · 남은 날 ${st.remaining}일`;
    const overlay = document.getElementById("return");
    overlay.hidden = false;
    document.getElementById("return-write").onclick = () => {
      overlay.hidden = true;
      document.getElementById("body").focus();
    };
  }

  async function refresh() {
    await flush();
    await loadBoard();
    renderMain();
  }

  async function render() {
    if (!S.plan) return renderSetup();
    if (!S.group) return renderGroupStep();
    S.pending.progress = true; // 열 때마다 진행률을 다시 올려 규칙이 바뀌어도 보드가 맞게 한다
    await refresh();
    showReturnIfNeeded();
  }

  render();
})();

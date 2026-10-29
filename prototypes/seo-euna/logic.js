// 러닝메이트 규칙 계산. 화면과 DB에 의존하지 않는 순수 함수만 둔다.
// 숫자는 docs/specs/seo-euna-runningmate.md 5절을 따른다.
(function (root) {
  const RULES = {
    MIN_CHARS: 600,      // 하루 합계가 이 이상이면 "쓴 날"
    RETURN_DAYS: 3,      // 마지막 저장 후 이만큼 지나면 돌아옴 화면
    MAX_MEMBERS: 7,
    MIN_MEMBERS: 4,      // 미만이면 초대 안내
    TARGET_GAP_DAYS: 30, // 목표일 차이가 이보다 크면 경고
  };

  // 날짜는 모두 "YYYY-MM-DD" 문자열로 다룬다. 계산은 UTC 자정 기준이라 시간대에 흔들리지 않는다.
  function toUTC(day) {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function fromUTC(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function isDay(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
  }
  function addDays(day, n) {
    return fromUTC(toUTC(day) + n * 86400000);
  }
  function daysBetween(from, to) {
    return Math.round((toUTC(to) - toUTC(from)) / 86400000);
  }
  function weekStart(day) {
    const dow = new Date(toUTC(day)).getUTCDay(); // 0 = 일요일
    return addDays(day, -((dow + 6) % 7));
  }
  function weekDays(day) {
    const start = weekStart(day);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  function localToday(now = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  }

  // 공백 포함 글자 수. 한글 조합 문자나 이모지도 한 글자로 센다.
  function charCount(text) {
    return [...(text || "")].length;
  }

  function dailyTotals(entries) {
    const totals = {};
    for (const e of entries) totals[e.day] = (totals[e.day] || 0) + charCount(e.body);
    return totals;
  }

  function isWrittenDay(chars) {
    return chars >= RULES.MIN_CHARS;
  }

  // 꼭지별 누적 글자 수.
  function chapterTotals(entries) {
    const totals = {};
    for (const e of entries) totals[e.chapterId] = (totals[e.chapterId] || 0) + charCount(e.body);
    return totals;
  }

  // 한 꼭지에 쓴 글을 합쳐 MIN_CHARS 이상이면 그 꼭지를 센다.
  function progress(toc, entries) {
    const totals = chapterTotals(entries);
    const done = toc.filter((c) => (totals[c.id] || 0) >= RULES.MIN_CHARS).length;
    const total = toc.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function progressPct(done, total) {
    return total ? Math.round((done / total) * 100) : 0;
  }

  // 그 주에 적용되는 약속: 시작 주가 그 주 이전인 것 중 가장 최근 것.
  function goalForWeek(goals, ws) {
    let found = null;
    for (const g of goals) if (g.week_start <= ws && (!found || g.week_start > found.week_start)) found = g;
    return found ? found.days : null;
  }

  // logs: [{day, chars}]. 오늘까지 이번 주에 쓴 날과 약속을 센다.
  function weekStatus(logs, goals, today) {
    const ws = weekStart(today);
    const chars = Object.fromEntries(logs.map((l) => [l.day, l.chars]));
    const days = weekDays(today);
    const written = days.filter((d) => d <= today && isWrittenDay(chars[d] || 0)).length;
    const remaining = days.filter((d) => d >= today).length;
    return { written, goal: goalForWeek(goals, ws), remaining };
  }

  function lastWrittenDay(entries) {
    return entries.reduce((last, e) => (!last || e.day > last ? e.day : last), null);
  }

  function shouldShowReturn(lastDay, today) {
    return !!lastDay && daysBetween(lastDay, today) >= RULES.RETURN_DAYS;
  }

  // 내가 쉬는 동안(lastDay 다음 날 ~ 오늘) 메이트들이 쓴 기록.
  function matesSince(members, myId, lastDay, today) {
    return members
      .filter((m) => m.id !== myId)
      .map((m) => {
        const logs = m.logs.filter((l) => l.day > lastDay && l.day <= today && l.chars > 0);
        return {
          nickname: m.nickname,
          days: logs.filter((l) => isWrittenDay(l.chars)).length,
          chars: logs.reduce((s, l) => s + l.chars, 0),
        };
      });
  }

  function targetDateWarnings(myTarget, members) {
    return members.filter((m) => Math.abs(daysBetween(myTarget, m.target_date)) > RULES.TARGET_GAP_DAYS);
  }

  const Logic = {
    RULES, isDay, addDays, daysBetween, weekStart, weekDays, localToday, charCount, dailyTotals,
    isWrittenDay, chapterTotals, progress, progressPct, goalForWeek, weekStatus, lastWrittenDay, shouldShowReturn,
    matesSince, targetDateWarnings,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);

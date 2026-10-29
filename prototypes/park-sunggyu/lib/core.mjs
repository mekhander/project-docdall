import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, randomBytes, createHash} from 'node:crypto';

export const ROLES = ['editor', 'fan'];
export const day = now => new Date(+new Date(now) + 9 * 3600000).toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const atKst = (date, time) => new Date(`${date}T${time}:00+09:00`).toISOString();
export const finalDue = s => s.chapters.map(c=>c.due).sort().at(-1);
export const activeChapter = s => s.chapters.find(c => !c.done);
export const overdue = (s, now) => s.chapters.some(c => !c.done && c.due < day(now));
const short = text => String(text).slice(0, 2000);
const sample = text => parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16) / 0x100000000;

export function initialState(fixture, now = new Date()) {
  return {
    schema: 1, revision: 0, seed: randomBytes(16).toString('hex'), book: fixture,
    chapters: fixture.chapters.map(c => ({id: c.id, title: c.title, due: addDays(day(now), c.dayOffset), done: false})),
    settings: {browserTime: '09:00', browserEnabled: false, telegramScheduleEnabled: false, editorTime: '19:30', editorReady: false, fanReady: false, fanFrequency: 'weekly1', quietStart: '09:00', quietEnd: '21:00'},
    connections: Object.fromEntries(ROLES.map(r => [r, {configured: false, chatId: null, userId: null, username: '', offset: 0, pairing: randomBytes(16).toString('hex'), error: '', profileWarning: ''}])),
    messages: {editor: [], fan: []}, pending: {}, deferred: {}, failures: {editor: false, fan: false},
    processed: [], deliveries: {}, jobs: [], outbox: [], browser: [], updatedAt: new Date(now).toISOString()
  };
}

export class Store {
  constructor(file, fixture, now = new Date()) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), {recursive: true});
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : initialState(fixture, now);
    // A network send interrupted by shutdown may already have reached Telegram.
    for (const item of this.state.outbox) if (item.status === 'sending') item.status = 'uncertain';
    this.save();
  }
  save() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), {mode: 0o600, flush: true});
    fs.renameSync(temp, this.file);
  }
  change(fn) {
    const previous = structuredClone(this.state);
    try {const result = fn(this.state); this.save(); return result;}
    catch (e) {this.state = previous; throw e;}
  }
}

export function append(s, role, who, text, now, transport = 'local', key = randomUUID()) {
  const m = {id: key, who, text: short(text), at: new Date(now).toISOString(), transport};
  s.messages[role].push(m);
  if (s.messages[role].length > 500) s.messages[role].shift();
  return m;
}

export function say(s, role, text, now, transport = 'local', eventKey) {
  const msg = append(s, role, 'persona', text, now, transport, eventKey || randomUUID());
  if (transport === 'telegram' && s.connections[role].chatId) {
    s.outbox.push({id: msg.id, role, text: msg.text, status: 'queued', attempts: 0, nextAt: new Date(now).toISOString(), chatId: s.connections[role].chatId, scheduleRevision: eventKey ? s.revision : null});
  }
  return msg;
}

export function summary(s) {
  return `${s.chapters.map(c => `${c.done ? '완료' : '집필 중'} · ${c.title}: ${c.due}`).join('\n')}\n최종 원고 마감: ${finalDue(s)}`;
}

export function replan(s, now = new Date()) {
  // Queued scheduled reminders are invalid after a confirmed change; replies remain.
  for (const m of s.outbox) if (m.status === 'queued' && m.scheduleRevision !== null && m.scheduleRevision !== s.revision) m.status = 'cancelled';
  for(const e of s.browser)if(e.status==='waiting'){e.status='cancelled';delete s.deliveries[e.id];}
  const jobs = [];
  const push = (id, role, dueAt, text, type = 'telegram') => {
    if (!s.deliveries[id] && Date.parse(dueAt) >= +new Date(now) - 60000) jobs.push({id, role, at: dueAt, text, type, revision: s.revision});
  };
  const active = s.chapters.filter(c => !c.done);
  if (!active.length) {s.jobs = []; return;}
  for (let i = 0; i < 15; i++) {
    const date = addDays(day(now), i);
    if (s.settings.telegramScheduleEnabled) push(`schedule-telegram:${date}`, 'editor', atKst(date, s.settings.browserTime), `일정 안내 · ${active[0].title}\n마감: ${active[0].due}\n오늘 쓰실 분량은 잘 진행되고 있나요?`);
    if (s.settings.browserEnabled) push(`browser:${date}`, null, atKst(date, s.settings.browserTime), `${active[0].title} · 마감 ${active[0].due}`, 'browser');
    if (s.settings.fanReady) {
      const late = active.some(c => c.due < date);
      const dow = new Date(date + 'T12:00:00Z').getUTCDay();
      const monday = addDays(date, -((dow + 6) % 7));
      const ordered = Array.from({length: 7}, (_, n) => n).sort((a,b) => sample(`${s.seed}:${monday}:${a}`) - sample(`${s.seed}:${monday}:${b}`));
      const count = s.settings.fanFrequency === 'daily' ? 7 : s.settings.fanFrequency === 'weekly23' ? 2 + (sample(`${s.seed}:${monday}:count`) > .5 ? 1 : 0) : 1;
      const selected = ordered.slice(0, count).includes((dow + 6) % 7);
      if (late || selected) {
        const minutes = t => Number(t.slice(0,2)) * 60 + Number(t.slice(3));
        const start = minutes(s.settings.quietStart), end = minutes(s.settings.quietEnd);
        const minute = start + Math.floor(sample(`${s.seed}:${date}:fan-time`) * Math.max(1,end-start));
        const time = `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
        const text = late ? `${active[0].title}의 다음 이야기를 기다리고 있어요. 약속한 날이 지났는데, 언제쯤 읽을 수 있을까요?` : `${s.book.title}의 다음 이야기가 궁금해요. 오늘은 어떤 장면을 쓰고 계세요?\n제가 너무 자주 연락드리나요? 매일 / 주 2~3회 / 주 1회 중 편한 빈도를 말씀해주세요.`;
        push(`fan:${date}`, 'fan', atKst(date, time), text);
      }
    }
  }
  if (s.settings.editorReady) for (const c of active) for (const [delta, name] of [[-3,'before'],[0,'due'],[1,'late']]) {
    const date = addDays(c.due, delta);
    const text = delta === -3 ? `${c.due}까지 ${c.title}을 마무리하기로 하셨죠. 잘 진행되고 있나요?` : delta === 0 ? `오늘 ${c.title} 마감인데, 기대해도 될까요? 혹시 일정이 늦어지나요?` : `${c.title} 원고 일정이 늦어졌네요. 언제까지 쓰실 계획인가요? 전체 일정을 함께 조정할까요?`;
    push(`editor:${c.id}:${c.due}:${name}`, 'editor', atKst(date, s.settings.editorTime), text);
  }
  s.jobs = jobs.sort((a,b) => a.at.localeCompare(b.at));
}

function parseTime(t) {
  let m = t.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  m = t.match(/(오전|오후|저녁|아침|밤)?\s*(\d{1,2})시(?:\s*(반|\d{1,2})분?)?/);
  if (!m) return null;
  let h = +m[2], min = m[3] === '반' ? 30 : +(m[3] || 0);
  if (h > 23 || min > 59) return null;
  if (['오후','저녁','밤'].includes(m[1]) && h < 12) h += 12;
  if (m[1] === '오전' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function parseTarget(t, current, now) {
  let m = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const date = new Date(m[1]+'T00:00:00Z');
    return Number.isFinite(+date) && date.toISOString().slice(0,10) === m[1] ? m[1] : null;
  }
  m = t.match(/(\d+)\s*일\s*(?:정도\s*)?(?:늦|뒤|미|연기)/);
  if (m) return +m[1] <= 365 ? addDays(current, +m[1]) : null;
  for (const [word,n] of [['하루',1],['이틀',2],['사흘',3]]) if (t.includes(word) && /늦|미뤄|연기/.test(t)) return addDays(current,n);
  if (t.includes('모레')) return addDays(day(now),2);
  if (t.includes('내일')) return addDays(day(now),1);
  const weekdays = [...t.matchAll(/([일월화수목금토])요일/g)];
  if (weekdays.length) {
    const target = '일월화수목금토'.indexOf(weekdays.at(-1)[1]);
    const today = new Date(day(now)+'T12:00:00Z').getUTCDay();
    if (t.includes('다음 주')) return addDays(day(now), 7 - ((today + 6)%7) + ((target + 6)%7));
    return addDays(day(now), (target - today + 7)%7);
  }
  return null;
}

function proposalText(s,p) {
  const lines = p.changes.map(c => `${c.title}: ${c.before} → ${c.after}`).join('\n');
  return `${lines}\n전체 일정이 ${p.delta}일 늦어져요.\n최종 원고 마감: ${p.finalBefore} → ${p.finalAfter}\n이렇게 변경해도 괜찮을까요? “확인” 또는 “취소”라고 답해주세요.`;
}

export function receive(s, role, raw, now = new Date(), {transport = 'local', eventId = randomUUID(), recovery = false} = {}) {
  if (!ROLES.includes(role)) throw new Error('잘못된 대화방입니다.');
  if (s.processed.includes(eventId)) return {duplicate: true};
  s.processed.push(eventId);
  // Telegram offsets provide durable dedup for older events; retain a bounded local ledger.
  if (s.processed.length > 5000) s.processed.splice(0,1000);
  const text = short(raw).trim();
  if (!text) return;
  append(s, role, 'user', text, now, transport);
  const reply = t => say(s,role,t,now,transport);
  if (s.failures[role] && !recovery) {
    s.deferred[role] = {text, transport, revision: s.revision, at: new Date(now).toISOString()};
    return reply('아, 지금은 바빠요. 제가 나중에 연락드릴게요.');
  }
  const pending = s.pending[role];
  const yes = /^(네|예|응|어|좋아|좋아요|괜찮아|괜찮아요|확인|동의|진행|그렇게 해|해줘)[.!\s]*$/.test(text);
  const no = /^(아니|아니요|취소|안 할래|그만)[.!\s]*$/.test(text);
  if (pending && (yes || no)) {
    delete s.pending[role];
    if (no) return reply('변경하지 않았어요. 기존 약속대로 둘게요.');
    if (pending.revision !== s.revision && ['reschedule','complete','settings'].includes(pending.kind)) return reply(`그 사이 집필 상태가 바뀌었어요. 일정·연락 설정을 최신 상태로 먼저 확인해주세요.\n${summary(s)}\n원하시는 변경을 다시 말씀해주실까요?`);
    if (pending.kind === 'reschedule') {
      for (const change of pending.changes) s.chapters.find(c => c.id === change.id).due = change.after;
      s.revision++;
      replan(s,now);
      reply(`확인했어요. 관련 마감을 ${pending.delta}일씩 옮겼고, 최종 원고 마감은 ${finalDue(s)}이에요. 새 일정으로 알림을 준비할게요.`);
      say(s,'fan',`편집자님께 일정이 ${pending.delta}일 늦어진다고 들었어요. 최종 마감은 ${finalDue(s)}이군요. 새 약속에 맞춰 기다릴게요.`,now,s.connections.fan.chatId ? 'telegram' : 'local');
    } else if (pending.kind === 'complete') {
      const c = s.chapters.find(c => c.id === pending.chapterId);
      c.done = true; s.revision++; replan(s,now);
      reply(role === 'editor' ? `${c.title} 완료로 기록했어요. 이 챕터의 마감 독촉은 멈출게요.\n${summary(s)}` : `${c.title}을 마무리하셨군요! 편집자님도 확인할 수 있게 완료로 기록했어요. 다음 이야기도 기다릴게요.`);
    } else if (pending.kind === 'settings') {
      Object.assign(s.settings,pending.values); s.revision++; replan(s,now);
      reply('좋아요. 말씀하신 연락 설정을 저장했어요. 이후 예약부터 반영할게요.');
    }
    return;
  }
  if (yes && !pending) return reply('지금 확인을 기다리는 변경안은 없어요. “일정 보여줘”, “이틀 미뤄줘”처럼 말씀해주세요.');
  if (no && !pending) return reply('괜찮아요. 어떤 점을 바꾸면 좋을지 조금 더 말씀해주세요.');
  if (/텔레그램/.test(text) && /일정|스케줄/.test(text) && /알림|알려|보내|켜|꺼|끄/.test(text)) {
    const enabled = !/꺼|끄|그만|중지/.test(text), time = parseTime(text) || s.settings.browserTime;
    if (enabled && (time < s.settings.quietStart || time >= s.settings.quietEnd)) return reply(`연락 허용 시간은 ${s.settings.quietStart}~${s.settings.quietEnd}예요. 이 안의 시간을 골라주세요.`);
    s.pending[role] = {kind:'settings',revision:s.revision,values:{telegramScheduleEnabled:enabled,...(enabled?{browserTime:time}:{})}};
    return reply(enabled ? `매일 ${time}에 텔레그램 편집자 방으로 집필 일정을 보내드릴까요? 브라우저 일정 알림도 같은 시간을 사용해요. “확인” 또는 “취소”라고 답해주세요.` : '텔레그램의 고정 시간 일정 안내를 끌까요? 편집자·팬의 대화 알림은 유지해요. “확인” 또는 “취소”라고 답해주세요.');
  }
  if (/일정|진도|진행률|진행 상황|마감|상태/.test(text) && /보여|알려|어때|확인|몇|언제/.test(text)) return reply(`${role==='fan'?'편집자님과 함께 확인한 일정이에요.':'현재 약속한 일정이에요.'}\n${summary(s)}`);
  const freq = /매일|하루\s*(한|1)\s*번/.test(text) ? 'daily' : /(?:일주일|주)\s*(?:에)?\s*(?:한|1)\s*(?:번|회)/.test(text) ? 'weekly1' : /(?:주|일주일).*2\s*[~∼~-]\s*3|주\s*2~3회/.test(text) ? 'weekly23' : null;
  if (freq) {
    s.pending[role] = {kind:'settings',revision:s.revision,values:{fanFrequency:freq,fanReady:true}};
    const name = {daily:'하루 한 번',weekly1:'일주일에 한 번',weekly23:'일주일에 2~3번'}[freq];
    return reply(`팬의 평소 연락 빈도를 ${name}으로 할까요? 허용 시간대는 ${s.settings.quietStart}~${s.settings.quietEnd}예요. 마감 지연 중에는 하루 한 번 연락해요. 괜찮으면 “확인”이라고 답해주세요.`);
  }
  const range = text.match(/(\d{1,2}:\d{2})\s*(?:부터|~|-|에서)\s*(\d{1,2}:\d{2})/);
  if (range) {
    const start = parseTime(' '+range[1]), end = parseTime(' '+range[2]);
    if (!start || !end || start >= end) return reply('시간대는 같은 날의 시작과 끝으로 알려주세요. 예: “09:00~21:00에 연락해줘”.');
    const adjust=s.settings.editorTime<start||s.settings.editorTime>=end;
    const adjustSchedule=s.settings.telegramScheduleEnabled&&(s.settings.browserTime<start||s.settings.browserTime>=end);
    s.pending[role] = {kind:'settings',revision:s.revision,values:{quietStart:start,quietEnd:end,...(adjust?{editorTime:start}:{}),...(adjustSchedule?{browserTime:start}:{})}};
    return reply(`연락 허용 시간대를 ${start}~${end}로 정할까요?${adjust?` 편집자 연락도 이 안의 ${start}로 조정할게요.`:''}${adjustSchedule?` 브라우저와 텔레그램의 고정 일정 안내도 ${start}로 옮길게요.`:''} “확인” 또는 “취소”라고 답해주세요.`);
  }
  const time = parseTime(text);
  if (time && /알림|연락|알려|시|브라우저/.test(text)) {
    const browser = text.includes('브라우저');
    if ((!browser || s.settings.telegramScheduleEnabled) && (time < s.settings.quietStart || time >= s.settings.quietEnd)) return reply(`지금 연락 허용 시간은 ${s.settings.quietStart}~${s.settings.quietEnd}예요. 이 안의 시간을 고르거나, 먼저 “09:00~22:00에 연락해줘”처럼 시간대를 바꿔주세요.`);
    const values = browser ? {browserTime:time} : {editorTime:time,editorReady:true};
    s.pending[role] = {kind:'settings',revision:s.revision,values};
    return reply(`${browser?(s.settings.telegramScheduleEnabled?'브라우저·텔레그램 고정 일정 안내':'브라우저 일정 알림'):'편집자의 연락'}을 ${time}에 할까요? “확인” 또는 “취소”라고 답해주세요.`);
  }
  if (/소개|누구|AI|인공지능|사람/.test(text)) return reply(`${s.book.personas[role].name} · ${s.book.personas[role].bio}\n저는 가상 페르소나예요. 이번 프로토타입은 외부 AI 없이 준비된 문구와 규칙으로 대화해요.`);
  if (/시작|설정|빈도|자주|연락.*어떻게|도움/.test(text) || text.startsWith('/start')) return reply(role==='editor' ? `안녕하세요. ${s.book.title}의 담당 편집자 ${s.book.personas.editor.name}입니다.\n마감 3일 전·당일·다음 날, 언제 연락드리면 좋을까요? 저는 19:30을 제안해요. “저녁 7시 반에 연락해줘”처럼 말씀해주세요. 연락 허용 시간은 “09:00~21:00”처럼 정할 수 있어요.` : `안녕하세요. 독자팬 ${s.book.personas.fan.name}예요. 이 책의 이야기를 기다리고 있어요.\n제가 얼마나 자주 연락드리면 좋을까요? “매일”, “주 2~3회”, “일주일에 한 번” 중 편하게 말씀해주세요.`);
  const chapterNumber = text.match(/(?:제)?\s*(\d+)\s*장/);
  const chapter = chapterNumber ? s.chapters[+chapterNumber[1]-1] : activeChapter(s);
  if (!chapter) return reply('남아 있는 집필 챕터가 없어요. 지금까지의 일정은 “일정 보여줘”로 확인할 수 있어요.');
  if (/완료|다\s*썼|마무리했|다\s*했/.test(text)) {
    if (chapter.done) return reply('이미 완료로 기록된 챕터예요.');
    s.pending[role] = {kind:'complete',revision:s.revision,chapterId:chapter.id};
    return reply(`${chapter.title}을 완료로 기록하고 해당 챕터의 독촉을 멈출까요? “확인” 또는 “취소”라고 답해주세요.`);
  }
  if (/미뤄|늦|연기|어려워|일요일|월요일|화요일|수요일|목요일|금요일|토요일/.test(text)) {
    if (role==='fan') return reply('편집자님과 전체 날짜를 함께 확인해주실래요? 편집자 방에 “이틀 미뤄줘”라고 말씀하시면, 새 마감이 확정된 뒤 저도 그 일정에 맞춰 기다릴게요.');
    if (chapter.done) return reply('완료된 챕터의 마감은 옮기지 않아요. 변경할 미완료 챕터를 알려주세요.');
    const target = parseTarget(text,chapter.due,now);
    if (!target) return reply(`${chapter.title}을 언제까지 쓰실 계획인가요? “이틀 미뤄줘” 또는 “${addDays(chapter.due,2)}로 미뤄줘”처럼 말씀해주세요.`);
    const delta = daysBetween(chapter.due,target);
    if (delta <= 0 || delta > 365) return reply('이번 버전은 현재 마감보다 1~365일 뒤로 옮기는 경우를 지원해요. 원하는 날짜를 다시 알려주시겠어요?');
    const index = s.chapters.indexOf(chapter);
    const changes = s.chapters.slice(index).filter(c=>!c.done).map(c=>({id:c.id,title:c.title,before:c.due,after:addDays(c.due,delta)}));
    const after=s.chapters.map(c=>changes.find(x=>x.id===c.id)?.after||c.due).sort().at(-1);
    const proposal = {kind:'reschedule',revision:s.revision,delta,changes,finalBefore:finalDue(s),finalAfter:after};
    s.pending[role]=proposal;
    return reply(proposalText(s,proposal));
  }
  return reply(role==='editor' ? '지금 상황을 함께 정리해볼까요? “일정 보여줘”, “이틀 미뤄줘”, “1장 다 썼어요”, “저녁 7시 반에 연락해줘”처럼 말씀해주세요. 이번 버전은 정해진 요청을 중심으로 도와드릴 수 있어요.' : '이야기를 들려주셔서 고마워요. 다음 글도 기다릴게요. 연락이 부담스럽다면 “일주일에 한 번만 연락해”라고 말씀해주세요. 일정 조정은 편집자님이 함께 확인해드려요.');
}

export function recover(s,role,now=new Date()) {
  s.failures[role]=false;
  const deferred=s.deferred[role];
  if (!deferred) return;
  delete s.deferred[role];
  delete s.pending[role];
  say(s,role,`이제 다시 이야기할 수 있어요. 앞서 “${deferred.text}”라고 말씀하셨죠.\n지금의 최신 일정부터 확인했어요.\n${summary(s)}\n이 상태를 기준으로 이어갈게요. 변경이 필요하면 다시 말씀해주세요.`,now,deferred.transport);
}

export function tick(s,now=new Date()) {
  const remaining=[];
  for (const job of s.jobs) {
    if (Date.parse(job.at)>+new Date(now)) {remaining.push(job);continue;}
    if (s.deliveries[job.id]) continue;
    const missed=+new Date(now)-Date.parse(job.at)>5*60000;
    s.deliveries[job.id]={at:new Date(now).toISOString(),status:missed?'expired':job.type==='browser'?'waiting':s.connections[job.role].chatId?'queued':'local-preview'};
    if (missed) continue;
    if (job.type==='browser') s.browser.push({id:job.id,text:job.text,at:job.at,status:'waiting'});
    else say(s,job.role,job.text,now,s.connections[job.role].chatId?'telegram':'local',job.id);
  }
  s.jobs=remaining;
  // Keep the date ledger for this single-book prototype; it also prevents catch-up duplicates.
}

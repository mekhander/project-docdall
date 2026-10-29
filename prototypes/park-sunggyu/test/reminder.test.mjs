import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialState,Store,receive,recover,replan,tick,finalDue,day,addDays,say} from '../lib/core.mjs';
import {Telegram} from '../lib/telegram.mjs';
import {createApp} from '../server.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/book.json'),'utf8'));
const now=new Date('2026-10-29T10:00:00+09:00');
const fresh=()=>initialState(fixture,now);
function turn(s,role,text,id){receive(s,role,text,now,{eventId:id});}

test('전체 변경안을 먼저 보여주고 동의 후 모든 미완료 챕터·최종 마감을 이동한다',()=>{
  const s=fresh(),before=structuredClone(s.chapters);
  turn(s,'editor','이틀 미뤄줘','request');
  assert.deepEqual(s.chapters,before);
  assert.match(s.messages.editor.at(-1).text,/최종 원고 마감/);
  assert.equal(s.pending.editor.delta,2);
  turn(s,'editor','확인','confirm');
  assert.deepEqual(s.chapters.map(c=>c.due),before.map(c=>addDays(c.due,2)));
  assert.equal(finalDue(s),addDays(before.at(-1).due,2));
  assert.match(s.messages.fan.at(-1).text,/편집자님께 일정이 2일 늦어진다고/);
  const updated=structuredClone(s.chapters);
  turn(s,'editor','확인','confirm');
  assert.deepEqual(s.chapters,updated);
});
test('금요일에서 일요일로 변경할 때 새 날짜와 전체 지연을 계산한다',()=>{
  const s=fresh();turn(s,'editor','금요일은 어려워요. 일요일로 미뤄줘');
  assert.equal(s.pending.editor.delta,2);
  assert.equal(s.pending.editor.changes[0].after,'2026-11-01');
});
test('완료된 챕터는 이동하지 않고 오래된 변경안은 확정하지 않는다',()=>{
  const s=fresh();turn(s,'editor','이틀 미뤄줘');turn(s,'fan','1장 다 썼어요');turn(s,'fan','확인');
  const updated=structuredClone(s.chapters);turn(s,'editor','확인');
  assert.deepEqual(s.chapters,updated);assert.match(s.messages.editor.at(-1).text,/그 사이 집필 상태가 바뀌었어요/);
  turn(s,'editor','이틀 미뤄줘');assert.equal(s.pending.editor.changes[0].id,'ch2');
});
test('취소와 모호한 날짜는 실제 일정을 바꾸지 않는다',()=>{
  const s=fresh(),before=structuredClone(s.chapters);turn(s,'editor','늦어질 것 같아요');assert.equal(s.pending.editor,undefined);
  turn(s,'editor','이틀 미뤄줘');turn(s,'editor','취소');assert.deepEqual(s.chapters,before);
  turn(s,'editor','2026-02-30으로 미뤄줘');assert.equal(s.pending.editor,undefined);
});
test('팬 빈도와 시간대 설정은 확인 후 저장되고 난수 예약은 재계획해도 같다',()=>{
  const s=fresh();turn(s,'fan','일주일에 한 번만 연락해');assert.equal(s.settings.fanReady,false);turn(s,'fan','확인');
  assert.equal(s.settings.fanReady,true);assert.equal(s.settings.fanFrequency,'weekly1');
  replan(s,now);const first=s.jobs.filter(j=>j.role==='fan');replan(s,now);assert.deepEqual(s.jobs.filter(j=>j.role==='fan'),first);
  turn(s,'editor','09:00~18:00에 연락해줘');turn(s,'editor','확인');assert.equal(s.settings.editorTime,'09:00');
});
test('지연 중 팬은 하루 한 번, 편집자의 지연 연락은 챕터당 다음 날 한 번이다',()=>{
  const s=fresh();s.chapters[0].due=addDays(day(now),-1);s.settings.fanReady=true;s.settings.editorReady=true;
  replan(s,now);
  const fan=s.jobs.filter(j=>j.role==='fan'),late=s.jobs.filter(j=>j.role==='editor'&&j.id.endsWith(':late'));
  const dates=fan.map(j=>day(j.at));assert.equal(dates.length,new Set(dates).size);
  assert.ok(dates.includes(addDays(day(now),1)));assert.equal(late.filter(j=>j.id.includes('ch1')).length,1);
  assert.match(fan.find(j=>day(j.at)===addDays(day(now),1)).text,/약속한 날/);
  turn(s,'editor','이틀 미뤄줘');turn(s,'editor','확인');
  assert.equal(s.settings.fanFrequency,'weekly1');assert.ok(s.jobs.filter(j=>j.role==='fan'&&day(j.at)===day(now)).length<=1);
});
test('실패 중 메시지를 보존하고 복구 시 최신 상태로 한 번만 재개한다',()=>{
  const s=fresh();s.failures.editor=true;turn(s,'editor','이틀 미뤄줘');assert.ok(s.deferred.editor);assert.match(s.messages.editor.at(-1).text,/나중에 연락/);
  turn(s,'fan','1장 다 썼어요');turn(s,'fan','확인');const before=structuredClone(s.chapters);
  recover(s,'editor',now);assert.deepEqual(s.chapters,before);assert.match(s.messages.editor.at(-1).text,/완료 · 1장/);
  const count=s.messages.editor.length;recover(s,'editor',now);assert.equal(s.messages.editor.length,count);
});
test('저장 후 재시작에도 상태·예약 유지, 중단된 전송은 자동 재발송하지 않는다',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docdall-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'state.json');const first=new Store(file,fixture,now);
  first.change(s=>{turn(s,'fan','매일');turn(s,'fan','확인');replan(s,now);s.outbox.push({id:'unknown',status:'sending'});});
  const next=new Store(file,fixture,now);assert.equal(next.state.settings.fanFrequency,'daily');assert.equal(next.state.outbox[0].status,'uncertain');assert.deepEqual(next.state.jobs,first.state.jobs);
});
test('기한이 지난 알림을 몰아서 보내지 않고 같은 이벤트를 두 번 발송하지 않는다',()=>{
  const s=fresh();s.jobs=[{id:'old',type:'browser',at:new Date(+now-10*60000).toISOString(),text:'old'},{id:'new',type:'browser',at:now.toISOString(),text:'new'}];
  tick(s,now);tick(s,now);assert.equal(s.browser.length,1);assert.equal(s.deliveries.old.status,'expired');assert.equal(s.browser[0].id,'new');
});
test('텔레그램은 연결 코드와 본인 계정이 맞는 1:1 대화만 받는다',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docdall-tg-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(path.join(dir,'state.json'),fixture,now);store.change(s=>{s.connections.editor.configured=true;});
  const updates=[{update_id:1,message:{chat:{id:11,type:'private'},from:{id:11},text:'/start wrong'}},{update_id:2,message:{chat:{id:22,type:'private'},from:{id:22},text:'/start '+store.state.connections.editor.pairing}},{update_id:3,message:{chat:{id:11,type:'private'},from:{id:11},text:'이틀 미뤄줘'}}];
  const tg=new Telegram(store,{editor:'test-placeholder'},root,{fetcher:async()=>({json:async()=>({ok:true,result:updates})})});await tg.poll('editor');
  assert.equal(store.state.connections.editor.chatId,22);assert.equal(store.state.connections.editor.offset,4);assert.equal(store.state.pending.editor,undefined);
  await tg.poll('editor');assert.equal(store.state.messages.editor.filter(m=>m.who==='user').length,1);
});
test('불명확한 네트워크 전송 결과는 재시도하지 않는다',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docdall-send-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(path.join(dir,'state.json'),fixture,now);store.change(s=>{s.connections.fan.chatId=1;say(s,'fan','test',new Date(Date.now()-1000),'telegram');});let calls=0;
  const tg=new Telegram(store,{fan:'placeholder'},root,{fetcher:async()=>{calls++;throw new Error('network');}});await tg.flush('fan');await tg.flush('fan');assert.equal(calls,1);assert.equal(store.state.outbox[0].status,'uncertain');
});
test('로컬 API 대화·브라우저 이벤트·요청 출처와 비공개 파일 경계',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docdall-http-'));fs.cpSync(path.join(root,'fixtures'),path.join(dir,'fixtures'),{recursive:true});fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  const app=createApp({root:dir,port:0});const port=await app.start();t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;const post=(route,obj,headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(obj)});
  let r=await post('message',{role:'editor',text:'이틀 미뤄줘',eventId:'one'});assert.equal(r.status,200);assert.equal((await r.json()).pending.editor.delta,2);
  r=await post('message',{role:'editor',text:'확인',eventId:'two'});assert.equal(r.status,200);
  assert.equal((await post('message',{role:'fan',text:'안녕'},{Origin:'https://example.invalid'})).status,403);
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/.data/state.json')).status,404);
  app.store.change(s=>{s.browser.push({id:'one-browser',status:'waiting',at:new Date().toISOString(),text:'test'});});
  r=await post('browser-claim',{});assert.equal((await r.json()).events.length,1);r=await post('browser-claim',{});assert.equal((await r.json()).events.length,0);
});


test('텔레그램 매일 일정 요청은 팬 빈도와 구분하고 확인 후 적용한다',()=>{
  const s=fresh();turn(s,'editor','매일 오전 9시 텔레그램으로 일정 알려줘');
  assert.equal(s.settings.telegramScheduleEnabled,false);
  assert.equal(s.pending.editor.values.telegramScheduleEnabled,true);
  turn(s,'editor','확인');assert.equal(s.settings.telegramScheduleEnabled,true);
  assert.equal(s.settings.fanFrequency,'weekly1');assert.equal(s.settings.browserTime,'09:00');
  turn(s,'editor','텔레그램 일정 알림 꺼줘');turn(s,'editor','확인');
  assert.equal(s.settings.telegramScheduleEnabled,false);
  assert.equal(s.jobs.some(j=>j.id.startsWith('schedule-telegram:')),false);
});
test('고정 일정은 브라우저와 독립적으로 편집자 방에 하루 한 번 최신 마감으로 예약한다',()=>{
  const s=fresh();s.settings.telegramScheduleEnabled=true;s.connections.editor.chatId=123;
  replan(s,now);const jobs=s.jobs.filter(j=>j.id.startsWith('schedule-telegram:'));
  assert.ok(jobs.length);assert.equal(new Set(jobs.map(j=>day(j.at))).size,jobs.length);
  assert.equal(s.jobs.some(j=>j.type==='browser'),false);
  const due=new Date(jobs[0].at);tick(s,due);tick(s,due);replan(s,due);tick(s,due);
  assert.equal(s.outbox.filter(m=>m.id===jobs[0].id).length,1);
  turn(s,'editor','이틀 미뤄줘');turn(s,'editor','확인');
  assert.ok(s.jobs.filter(j=>j.id.startsWith('schedule-telegram:')).every(j=>j.text.includes(s.chapters[0].due)));
});


test('다음 주 요일은 월요일 기준 다음 주 안의 날짜로 계산한다',()=>{
  for(let offset=0;offset<7;offset++){
    const date=addDays('2026-10-26',offset), clock=new Date(date+'T10:00:00+09:00');
    for(const [weekday,target] of [['월요일','2026-11-02'],['일요일','2026-11-08']]){
      const s=initialState(fixture,clock);s.chapters[0].due=date;
      receive(s,'editor',`다음 주 ${weekday}로 미뤄줘`,clock);
      assert.equal(s.pending.editor.changes[0].after,target,`${date}의 다음 주 ${weekday}`);
    }
  }
});
test('연락 시간대 변경은 고정 Telegram 안내 시각도 확인 후 이동한다',()=>{
  const s=fresh();s.settings.telegramScheduleEnabled=true;s.settings.browserEnabled=true;
  turn(s,'editor','10:00~18:00에 연락해줘');
  assert.equal(s.settings.browserTime,'09:00');assert.equal(s.settings.quietStart,'09:00');
  assert.match(s.messages.editor.at(-1).text,/고정 일정 안내.*10:00/);
  turn(s,'editor','확인');assert.equal(s.settings.browserTime,'10:00');
  assert.ok(s.jobs.filter(j=>j.id.startsWith('schedule-telegram:')||j.type==='browser').every(j=>j.at.endsWith('T01:00:00.000Z')));
  turn(s,'editor','11:00~17:00에 연락해줘');turn(s,'editor','취소');
  assert.equal(s.settings.browserTime,'10:00');assert.equal(s.settings.quietStart,'10:00');
});
test('공유 고정 시각을 바꿔 Telegram 연락 허용 시간대를 우회할 수 없다',()=>{
  const s=fresh();s.settings.telegramScheduleEnabled=true;
  turn(s,'editor','브라우저 알림을 오전 8시에 해줘');
  assert.equal(s.pending.editor,undefined);assert.equal(s.settings.browserTime,'09:00');
  assert.match(s.messages.editor.at(-1).text,/허용 시간/);
  turn(s,'editor','브라우저 알림을 오전 10시에 해줘');turn(s,'editor','확인');
  assert.equal(s.settings.browserTime,'10:00');
  turn(s,'editor','브라우저 알림을 오전 11시에 해줘');
  turn(s,'fan','12:00~18:00에 연락해줘');turn(s,'fan','확인');
  turn(s,'editor','확인');
  assert.equal(s.settings.browserTime,'12:00');
  assert.equal(s.settings.quietStart,'12:00');
});

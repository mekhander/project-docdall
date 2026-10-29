import {desktopEnabled,desktopResult,toggleDesktop,sendDesktop} from '/desktop.js';
const $=id=>document.getElementById(id);
let state, role='editor', lastMessages='', polling=false;
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=t=>new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(endpoint,data){
  const response=await fetch('/api/'+endpoint,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'처리하지 못했습니다.');return result;
}
let inboxFingerprint='', inboxSeen=null;
const readCache=new Map();
function readIds(key){
  if(!readCache.has(key)){
    try{readCache.set(key,new Set(JSON.parse(localStorage.getItem(key)||'[]')));}catch{readCache.set(key,new Set());}
  }
  return readCache.get(key);
}
function markRead(ids){
  const key='docdall-notification-read:'+state.book.id, read=readIds(key);
  ids.forEach(id=>read.add(id));
  try{localStorage.setItem(key,JSON.stringify([...read]));}catch{toast('읽음 상태를 이 브라우저에 저장하지 못했어요.');}
  inboxFingerprint='';renderInbox(state);
}
function renderInbox(s){
  const items=[...s.browser].reverse().slice(0,30), key='docdall-notification-read:'+s.book.id;
  const read=readIds(key), permission='Notification'in window?Notification.permission:'unsupported';
  if(inboxSeen===null)inboxSeen=new Set(s.browser.map(e=>e.id));
  else{
    const arrived=s.browser.filter(e=>!inboxSeen.has(e.id)&&e.status!=='cancelled');
    s.browser.forEach(e=>inboxSeen.add(e.id));
    if(arrived.length)toast('스케줄 알림함에 새 알림이 도착했어요.');
  }
  const signature=JSON.stringify([items,[...read],permission,items.map(e=>desktopResult(e.id))]);
  if(signature===inboxFingerprint)return;inboxFingerprint=signature;
  const unread=items.filter(e=>!read.has(e.id)&&e.status!=='cancelled').length;
  $('inbox-count').textContent=unread?`새 알림 ${unread}개`:'모두 확인했어요';
  $('read-all-notifications').disabled=!unread;
  const desktop=e=>{
    const result=desktopResult(e.id);
    if(result?.status==='failed')return 'Windows: 팝업 요청 실패';
    if(result?.status==='requested')return 'Windows: 이 브라우저에서 시스템 팝업 요청됨 · 실제 표시 확인 필요';
    if(result?.status==='requesting')return 'Windows: 시스템 팝업 요청 중';
    if(e.status==='cancelled')return '이전 일정의 알림 · 일정 변경으로 취소';
    if(!desktopEnabled())return 'Windows: 이 브라우저의 시스템 팝업 꺼짐';
    return permission==='granted'?'Windows: 팝업 요청 대기':'Windows: 브라우저 권한 미허용';
  };
  $('schedule-notifications').innerHTML=items.length?items.map(e=>`<li class="notification-item ${read.has(e.id)||e.status==='cancelled'?'is-read':'is-unread'}"><div class="notification-content"><span class="notification-app">앱 알림함에 저장됨</span><p>${esc(e.text)}</p><time>${localTime(e.at)}</time><span class="notification-desktop">${esc(desktop(e))}</span></div>${read.has(e.id)||e.status==='cancelled'?'<span class="notification-read-label">확인됨</span>':`<button class="button ghost small" data-notification-read="${esc(e.id)}">읽음</button>`}</li>`).join(''):'<li class="notification-empty">아직 도착한 스케줄 알림이 없어요. ‘직접 확인하기’의 ‘스케줄 알림 5초 뒤’로 시험해보세요.</li>';
  $('schedule-notifications').querySelectorAll('[data-notification-read]').forEach(b=>b.onclick=()=>markRead([b.dataset.notificationRead]));
}
function createConnectors(){
  if($('connectors').children.length)return;
  for(const r of ['editor','fan']){
    const p=state.book.personas[r], section=document.createElement('section');section.className='connector';
    section.innerHTML=`<div class="connector-head"><img src="/${r}.jpg" alt="가상 페르소나 예시 이미지"><div><h3>${esc(p.botName)}</h3><p>${esc(p.bio)}</p></div></div><form class="connect-form" data-connect="${r}"><label class="sr-only" for="token-${r}">${esc(p.role)} 봇 토큰</label><input id="token-${r}" name="token" type="password" autocomplete="off" spellcheck="false" placeholder="BotFather 토큰"><button class="button" type="submit">봇 연결·프로필 적용</button></form><div id="connect-state-${r}"></div>`;
    $('connectors').append(section);
    section.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();const button=e.target.querySelector('button'),input=e.target.querySelector('input');button.disabled=true;$('setup-error').hidden=true;
      try{const result=await api('connect',{role:r,token:input.value.trim()});input.value='';render(result);toast('프로필을 적용했어요. 대화방 시작 링크를 눌러주세요.');}
      catch(error){$('setup-error').textContent=error.message;$('setup-error').hidden=false;}
      finally{button.disabled=false;}
    });
  }
}
function render(s){
  state=s;$('global-error').hidden=true;renderInbox(s);
  const complete=s.chapters.filter(c=>c.done).length, final=[...s.chapters].map(c=>c.due).sort().at(-1);
  $('book-title').textContent=s.book.title;$('book-purpose').textContent=s.book.purpose;$('book-source').textContent=s.book.source;
  $('final-date').textContent=final;$('completion').textContent=`${s.chapters.length}개 챕터 중 ${complete}개 완료`;$('progress-bar').style.width=`${complete/s.chapters.length*100}%`;
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  $('chapters').innerHTML=s.chapters.map(c=>`<li><span class="badge">${c.done?'완료':c.due<today?'일정 지연':'집필 중'}</span><span class="chapter-title">${esc(c.title)}</span><span class="chapter-date ${!c.done&&c.due<today?'late':''}">${esc(c.due)} 마감</span></li>`).join('');
  const p=s.book.personas[role], c=s.connections[role];
  for(const r of ['editor','fan'])$(r+'-tab').setAttribute('aria-selected',String(r===role));
  $('person-image').src=p.avatar;$('person-image').alt=p.role+' 가상 페르소나 예시 이미지';$('person-role').textContent=p.role;$('person-name').textContent=p.name;$('person-bio').textContent=p.bio;
  $('room-connection').textContent=c.chatId?'텔레그램 연결됨':c.configured?'대화방 시작 필요':'텔레그램 미연결';
  $('room-note').textContent=c.chatId?'텔레그램에서도 이 역할과 대화할 수 있어요. 아래 연습에서 확정한 변경도 같은 일정에 반영돼요.':'앱에서 대화를 연습할 수 있어요. 확정한 변경은 실제 일정에도 반영돼요.';
  const messages=s.messages[role], fingerprint=role+JSON.stringify(messages);
  if(fingerprint!==lastMessages){
    lastMessages=fingerprint;
    $('messages').innerHTML=messages.length?messages.map(m=>`<div class="message ${m.who==='user'?'user':''}">${esc(m.text)}<span class="time">${m.who==='user'?'나':esc(p.name)} · ${localTime(m.at)} · ${m.transport==='telegram'?'텔레그램':'앱 연습'}</span></div>`).join(''):'<div class="empty">함께 한 권을 만들어가요.<br>아래 ‘소개 보기’로 첫 대화를 시작해보세요.</div>';
    $('messages').scrollTop=$('messages').scrollHeight;
  }
  $('pending').hidden=!s.pending[role];$('failure-status').hidden=!s.failures[role];$('toggle-failure').textContent=s.failures[role]?'현재 방 복구·대화 이어가기':'현재 방 응답 실패 시험';
  const permission='Notification'in window?Notification.permission:'unsupported';
  $('browser-status').textContent=s.settings.browserEnabled?`앱 알림함에 매일 ${s.settings.browserTime} 스케줄을 남겨드려요.`:'앱 스케줄 알림이 꺼져 있어요.';
  $('enable-browser').textContent=s.settings.browserEnabled?'스케줄 알림 끄기':'스케줄 알림함 켜기';
  $('desktop-status').textContent=desktopEnabled()?'이 브라우저에서 Windows 오른쪽 아래 시스템 팝업을 요청합니다. Windows에서도 이 브라우저의 알림이 허용되어 있어야 해요.':'Windows 팝업은 별도로 켜주세요. 일반 크롬·Edge에서 허용한 뒤 시험할 수 있어요. 알림함은 보조 기능이에요.';
  $('telegram-schedule-status').textContent=s.settings.telegramScheduleEnabled?`텔레그램 편집자 방: 매일 ${s.settings.browserTime} 일정 안내`:'텔레그램 고정 시간 일정 안내 꺼짐';
  $('enable-telegram-schedule').textContent=s.settings.telegramScheduleEnabled?'텔레그램 일정 안내 끄기':'텔레그램 일정 안내 켜기';
  $('enable-desktop').disabled=permission==='unsupported';
  $('enable-desktop').textContent=desktopEnabled()?'이 브라우저의 Windows 팝업 끄기':'Windows 팝업 켜기';
  const frequencies={daily:'매일',weekly1:'주 1회',weekly23:'주 2~3회'};
  $('settings-summary').textContent=`편집자: ${s.settings.editorReady?s.settings.editorTime:'대화로 시간 정하기'}\n팬: ${s.settings.fanReady?frequencies[s.settings.fanFrequency]:'대화로 빈도 정하기'}\n연락 허용: ${s.settings.quietStart}~${s.settings.quietEnd}`;
  $('jobs').innerHTML=s.jobs.slice(0,5).map(j=>`<li><strong>${j.id.startsWith('schedule-telegram:')?'텔레그램 일정 안내':j.type==='browser'?'브라우저 일정 안내':j.role==='editor'?'편집자 서윤':'독자팬 지우'}</strong><time>${localTime(j.at)}</time></li>`).join('')||'<li>연락 시간과 빈도를 대화로 정하면<br>다음 연락이 여기에 표시돼요.</li>';
  const labels={queued:'발송 대기',sending:'전송 중',sent:'텔레그램 전달 확인',failed:'전송 실패',uncertain:'전송 결과 확인 필요',cancelled:'일정 변경으로 취소'};
  $('deliveries').innerHTML=s.outbox.slice(-8).reverse().map(m=>`<p>${m.role==='editor'?'편집자':'팬'} · ${esc(labels[m.status]||m.status)}${m.error?'\n'+esc(m.error):''}</p>`).join('')||'<p>아직 실제 텔레그램 발송 기록이 없어요.</p>';
  createConnectors();
  for(const r of ['editor','fan']){
    const connection=s.connections[r], target=$('connect-state-'+r);
    target.innerHTML=connection.configured?`<p>${connection.chatId?'대화방이 연결됐어요.':'프로필 적용 완료. 아래 링크에서 시작을 눌러주세요.'}</p><a class="connect-link" href="${esc(connection.link)}" target="_blank" rel="noopener noreferrer">${r==='editor'?'편집자':'팬'} 대화방 시작 ↗</a>${connection.profileWarning?'<p>'+esc(connection.profileWarning)+'</p>':''}${connection.error?'<p class="error">'+esc(connection.error)+'</p>':''}`:'<p>아직 연결하지 않았어요.</p>';
  }
}
async function send(text){
  if(!text.trim())return;
  const button=$('message-form').querySelector('button');button.disabled=true;
  try{render(await api('message',{role,text,eventId:crypto.randomUUID()}));$('message-input').value='';}
  catch(error){toast(error.message);}finally{button.disabled=false;}
}
document.querySelectorAll('[data-role]').forEach(button=>button.addEventListener('click',()=>{role=button.dataset.role;lastMessages='';if(state)render(state);}));
document.querySelectorAll('[data-say]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.say)));
$('message-form').addEventListener('submit',e=>{e.preventDefault();send($('message-input').value);});
$('message-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e.target.value);}});
$('open-setup').onclick=()=>$('setup').showModal();$('close-setup').onclick=()=>$('setup').close();
$('read-all-notifications').onclick=()=>markRead(state.browser.filter(e=>e.status!=='cancelled').map(e=>e.id));
$('enable-browser').onclick=async()=>{
  try{const enabled=!state.settings.browserEnabled;render(await api('browser-enable',{enabled}));toast(enabled?'스케줄 알림함을 켰어요. Windows 권한 없이도 앱 안에서 볼 수 있어요.':'앱 스케줄 알림을 껐어요. 기존 기록은 알림함에 남아요.');}catch(error){toast(error.message);}
};
$('enable-telegram-schedule').onclick=async()=>{role='editor';await send(state.settings.telegramScheduleEnabled?'텔레그램 일정 알림 꺼줘':'텔레그램 일정 알림 켜줘');};
$('enable-desktop').onclick=async()=>{
  try{const enabled=await toggleDesktop();render(state);toast(enabled?'Windows 팝업을 켰어요. ‘스케줄 알림 5초 뒤’로 실제 오른쪽 아래 표시를 확인해주세요.':'이 브라우저의 Windows 팝업을 껐어요.');}
  catch(error){toast(error.message);}
};
window.addEventListener('docdall-desktop-status',()=>{if(state)render(state);});
document.querySelectorAll('[data-test]').forEach(button=>button.addEventListener('click',async()=>{
  try{render(await api('test-reminder',{role:button.dataset.test,delay:5}));$('test-result').textContent=button.dataset.test==='browser'?'5초 뒤 위쪽 스케줄 알림함을 확인해주세요. Windows 배너의 실제 표시는 별도입니다.':'5초 뒤 확인해주세요. 텔레그램 미연결 상태에서는 앱 연습에만 표시돼요.';}catch(error){toast(error.message);}
}));
$('toggle-failure').onclick=async()=>{try{render(await api('failure',{role,enabled:!state.failures[role]}));}catch(e){toast(e.message);}};
$('late-test').onclick=async()=>{if(!confirm('현재 미완료 챕터의 마감을 어제로 바꿔 지연 상태를 시험할까요? 예시 일정이 변경됩니다.'))return;try{render(await api('mark-late-test',{}));toast('지연 시험 상태로 바꿨어요.');}catch(e){toast(e.message);}};
async function refresh(){
  if(polling)return;polling=true;
  try{
    render(await api('state'));
    if(state.settings.browserEnabled){await sendDesktop(state.browser);renderInbox(state);}
  }catch{$('global-error').textContent='실행 프로그램과 연결되지 않았어요. 프로그램을 켠 뒤 다시 확인해주세요. 작성 중인 메시지는 그대로 남아 있어요.';$('global-error').hidden=false;}
  finally{polling=false;}
}
await refresh();setInterval(refresh,2000);

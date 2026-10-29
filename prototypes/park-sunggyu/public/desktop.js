const ENABLED='docdall-system-popup-enabled';
const ENABLED_AT='docdall-system-popup-enabled-at';
const RECORDS='docdall-system-popup-records';
const openedAt=Date.now();
const changed=()=>window.dispatchEvent(new Event('docdall-desktop-status'));
function records(){try{return JSON.parse(localStorage.getItem(RECORDS)||'{}');}catch{return {};}}
function record(id,status,detail=''){
  const all=records();all[id]={status,detail,at:Date.now()};
  const entries=Object.entries(all).slice(-300);
  localStorage.setItem(RECORDS,JSON.stringify(Object.fromEntries(entries)));changed();
}
export function desktopEnabled(){try{return localStorage.getItem(ENABLED)==='yes';}catch{return false;}}
export function desktopResult(id){return records()[id]||null;}
export async function toggleDesktop(){
  if(desktopEnabled()){localStorage.setItem(ENABLED,'no');changed();return false;}
  if(!('Notification'in window))throw new Error('이 브라우저는 시스템 팝업을 지원하지 않아요. 일반 Edge에서 열어주세요.');
  let permission=Notification.permission;
  if(permission==='default')permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('브라우저의 알림 허용이 필요해요. 사이트 권한을 확인해주세요.');
  localStorage.setItem(ENABLED,'yes');localStorage.setItem(ENABLED_AT,String(Date.now()));changed();return true;
}
async function display(event){
  const options={body:event.text,tag:event.id,icon:'/editor.jpg',requireInteraction:true,data:{id:event.id}};
  if('serviceWorker'in navigator){
    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    let timer;
    try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('팝업 준비 시간이 초과됐어요.')),8000);})]);}
    finally{clearTimeout(timer);}
    await reg.showNotification('Docdall · 집필 일정',options);
  }else{
    const notification=new Notification('Docdall · 집필 일정',options);
    notification.onclick=()=>{window.focus();notification.close();};
    notification.onerror=()=>record(event.id,'failed','브라우저가 알림 표시 오류를 보고했어요.');
  }
}
export async function sendDesktop(events){
  if(!desktopEnabled()||!('Notification'in window)||Notification.permission!=='granted')return;
  const work=async()=>{
    const since=Math.max(openedAt,Number(localStorage.getItem(ENABLED_AT)||0));
    for(const event of events){
      if(['cancelled','expired'].includes(event.status)||Date.parse(event.at)<since||Date.parse(event.at)>Date.now()||Date.now()-Date.parse(event.at)>300000||records()[event.id])continue;
      try{
        // Reserve before awaiting the browser. A second tab sees the same reservation.
        record(event.id,'requesting');await display(event);record(event.id,'requested');
      }catch{try{record(event.id,'failed','시스템 팝업 요청에 실패했어요. 브라우저 권한과 Windows 알림 설정을 확인해주세요.');}catch{}}
    }
  };
  if(navigator.locks)await navigator.locks.request('docdall-system-popup',work);
  else await work();
}

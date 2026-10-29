import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Store, ROLES, day, summary, receive, recover, replan, tick, say} from './lib/core.mjs';
import {Telegram} from './lib/telegram.mjs';

export function createApp({root=path.dirname(fileURLToPath(import.meta.url)), dataDir, port=Number(process.env.PORT||3001), telegramOptions}={}) {
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/book.json'),'utf8'));
  const store=new Store(path.join(dataDir||path.join(root,'.data'),'state.json'),fixture);
  const secrets={};
  const envPath=path.join(root,'.env');
  if(fs.existsSync(envPath))for(const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)){
    const m=line.match(/^(EDITOR_BOT_TOKEN|FAN_BOT_TOKEN)=([\w:-]+)\s*$/);
    if(m)secrets[m[1]==='EDITOR_BOT_TOKEN'?'editor':'fan']=m[2];
  }
  for(const r of ROLES)if(process.env[r.toUpperCase()+'_BOT_TOKEN'])secrets[r]=process.env[r.toUpperCase()+'_BOT_TOKEN'];
  const telegram=new Telegram(store,secrets,root,telegramOptions);
  let stopped=false, interval, lastDay=day(new Date());
  store.change(s=>replan(s));
  function saveSecrets(){
    const text=ROLES.map(r=>`${r.toUpperCase()}_BOT_TOKEN=${secrets[r]||''}`).join('\n')+'\n';
    fs.writeFileSync(envPath+'.tmp',text,{mode:0o600,flush:true});fs.renameSync(envPath+'.tmp',envPath);
  }
  const publicState=()=>{
    const s=structuredClone(store.state);
    for(const r of ROLES){s.connections[r].hasToken=!!secrets[r];s.connections[r].link=s.connections[r].username?`https://t.me/${s.connections[r].username}?start=${s.connections[r].pairing}`:'';}
    return s;
  };
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  async function body(req){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('JSON 요청이 필요합니다.');
    let text='';for await(const chunk of req){text+=chunk;if(text.length>12000)throw new Error('입력 길이가 너무 깁니다.');}
    return JSON.parse(text||'{}');
  }
  const server=http.createServer(async(req,res)=>{
    try{
      const address=server.address(), livePort=typeof address==='object'?address.port:port;
      const allowed=new Set([`localhost:${livePort}`,`127.0.0.1:${livePort}`]);
      if(!allowed.has(req.headers.host)){json(res,403,{error:'로컬 주소에서만 열 수 있습니다.'});return;}
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(url.pathname.startsWith('/api/')){
        if(req.headers.origin && !allowed.has(new URL(req.headers.origin).host)){json(res,403,{error:'다른 사이트에서는 요청할 수 없습니다.'});return;}
        if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'다른 사이트 요청입니다.'});return;}
        if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,publicState());return;}
        if(req.method!=='POST'){json(res,405,{error:'지원하지 않는 요청입니다.'});return;}
        const b=await body(req), now=new Date();
        if(url.pathname==='/api/message'){
          if(!ROLES.includes(b.role)||typeof b.text!=='string'||!b.text.trim())throw new Error('대화방과 메시지를 확인해주세요.');
          store.change(s=>receive(s,b.role,b.text,now,{eventId:typeof b.eventId==='string'?`web:${b.eventId}`:randomUUID()}));
        }else if(url.pathname==='/api/connect'){
          if(!ROLES.includes(b.role)||typeof b.token!=='string')throw new Error('연결 정보를 확인해주세요.');
          await telegram.connect(b.role,b.token.trim());saveSecrets();
        }else if(url.pathname==='/api/disconnect'){
          if(!ROLES.includes(b.role))throw new Error('대화방을 확인해주세요.');
          delete secrets[b.role];saveSecrets();
          store.change(s=>{Object.assign(s.connections[b.role],{configured:false,chatId:null,userId:null,username:'',offset:0,error:''});for(const m of s.outbox)if(m.role===b.role&&m.status==='queued')m.status='cancelled';});
        }else if(url.pathname==='/api/browser-enable'){
          if(typeof b.enabled!=='boolean')throw new Error('알림 상태를 확인해주세요.');
          store.change(s=>{s.settings.browserEnabled=b.enabled;replan(s,now);});
        }else if(url.pathname==='/api/browser-claim'){
          const events=store.change(s=>{
            const items=[];
            for(const item of s.browser)if(item.status==='waiting'){
              if(Date.parse(item.at)<Date.now()-5*60000){item.status='expired';continue;}
              item.status='claimed';items.push({...item});
            }
            return items;
          });json(res,200,{events});return;
        }else if(url.pathname==='/api/browser-ack'){
          store.change(s=>{const e=s.browser.find(x=>x.id===b.id);if(e?.status==='claimed'){e.status=b.ok?'display-requested':'failed';if(s.deliveries[b.id])s.deliveries[b.id].status=e.status;}});
        }else if(url.pathname==='/api/failure'){
          if(!ROLES.includes(b.role)||typeof b.enabled!=='boolean')throw new Error('시험 조건을 확인해주세요.');
          store.change(s=>{if(b.enabled)s.failures[b.role]=true;else recover(s,b.role,now);});
        }else if(url.pathname==='/api/test-reminder'){
          if(!['browser',...ROLES].includes(b.role))throw new Error('알림 종류를 확인해주세요.');
          store.change(s=>{
            const id=`test:${randomUUID()}`;
            const at=new Date(Date.now()+Math.max(3,Math.min(120,Number(b.delay)||5))*1000).toISOString();
            const chapter=s.chapters.find(c=>!c.done);
            s.jobs.push({id,role:b.role==='browser'?null:b.role,type:b.role==='browser'?'browser':'telegram',at,text:b.role==='browser'?`[시험 알림] ${chapter?.title||s.book.title} · ${chapter?.due||'집필 완료'}`:b.role==='editor'?`[시험 알림] ${chapter?.title||s.book.title}의 진행 상황을 함께 확인할까요?`: '[시험 알림] 다음 이야기를 기다리고 있어요. 지금 어떻게 지내세요?',revision:s.revision});
            s.jobs.sort((a,b)=>a.at.localeCompare(b.at));
          });
        }else if(url.pathname==='/api/mark-late-test'){
          // Changes test data through an explicit test action, never a hidden production clock.
          store.change(s=>{const c=s.chapters.find(x=>!x.done);if(!c)throw new Error('미완료 챕터가 없습니다.');c.due=day(new Date(Date.now()-86400000));s.revision++;replan(s,now);});
        }else{json(res,404,{error:'요청을 찾을 수 없습니다.'});return;}
        json(res,200,publicState());return;
      }
      if(req.method!=='GET'){res.writeHead(405);res.end();return;}
      const filename=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      const full=path.resolve(root,'public',filename), publicRoot=path.resolve(root,'public')+path.sep;
      if(!full.startsWith(publicRoot)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}
      const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(full)];
      if(!type){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(fs.readFileSync(full));
    }catch(e){json(res,400,{error:e.message?.includes('token')?'연결 정보를 확인해주세요.':String(e.message||'요청을 처리하지 못했습니다.').slice(0,200)});}
  });
  async function start(){
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    for(const r of ROLES)if(secrets[r]&&!store.state.connections[r].configured){telegram.connect(r,secrets[r]).catch(()=>store.change(s=>{s.connections[r].error='저장된 토큰 연결에 실패했습니다. 연결 화면에서 확인해주세요.';}));}
    interval=setInterval(()=>{
      if(stopped)return;
      store.change(s=>{
        if(lastDay!==day(new Date())){lastDay=day(new Date());replan(s);}
        tick(s);
      });
      for(const r of ROLES){void telegram.poll(r);void telegram.flush(r);}
    },1000);
    return server.address().port;
  }
  async function stop(){stopped=true;telegram.stopped=true;clearInterval(interval);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  return {server,store,telegram,start,stop,publicState};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();
  app.start().then(port=>console.log(`Docdall 집필방: http://localhost:${port}\n외부 AI 미연결 · 앱 탭과 실행 프로그램을 열어두세요.`)).catch(()=>{console.error('실행하지 못했습니다. 다른 프로그램이 3001번 주소를 사용 중인지 확인해주세요.');process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.stop().then(()=>process.exit(0)));
}

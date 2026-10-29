import fs from 'node:fs';
import path from 'node:path';
import {ROLES, receive, say} from './core.mjs';

export class Telegram {
  constructor(store, secrets, root, {base='https://api.telegram.org', fetcher=fetch}={}) {
    this.store=store; this.secrets=secrets; this.root=root; this.base=base; this.fetcher=fetcher;
    this.polling={}; this.sending={}; this.stopped=false;
  }
  async call(role,method,body,timeout=25000) {
    const token=this.secrets[role];
    if (!token) throw Object.assign(new Error('봇이 연결되지 않았습니다.'),{definite:true});
    let response;
    try {
      const form=body instanceof FormData;
      response=await this.fetcher(`${this.base}/bot${token}/${method}`,{method:'POST',headers:form?{}:{'Content-Type':'application/json'},body:form?body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
      const json=await response.json();
      if (!json.ok) throw Object.assign(new Error(`텔레그램 요청이 거절됐습니다 (${json.error_code||response.status}).`),{definite:true,code:json.error_code,retryAfter:json.parameters?.retry_after});
      return json.result;
    } catch(e) {
      // URLs contain tokens: never expose low-level fetch errors or Telegram descriptions.
      if(e.definite) throw e;
      throw Object.assign(new Error('텔레그램 연결 결과를 확인하지 못했습니다.'),{definite:false});
    }
  }
  async connect(role,token) {
    if(!ROLES.includes(role)||!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('BotFather에서 받은 토큰 형식을 확인해주세요.');
    const other=role==='editor'?'fan':'editor';
    if(token===this.secrets[other]) throw new Error('편집자와 팬은 서로 다른 봇이어야 합니다.');
    if(this.secrets[role] && this.secrets[role]!==token) throw new Error('기존 봇을 먼저 연결 해제해주세요.');
    const old=this.secrets[role];this.secrets[role]=token;
    try {
      const me=await this.call(role,'getMe',{});
      if(me.id===this.store.state.connections[other].botId) throw new Error('서로 다른 봇 두 개를 사용해주세요.');
      const info=await this.call(role,'getWebhookInfo',{});
      if(info.url) throw new Error('이 봇은 다른 서비스의 웹훅에 연결되어 있습니다. 전용 새 봇을 만들어주세요.');
      const persona=this.store.state.book.personas[role];
      await this.call(role,'setMyName',{name:persona.botName});
      await this.call(role,'setMyDescription',{description:persona.bio+' 외부 AI 미연결·규칙 기반 개인 과제 프로토타입입니다.'});
      await this.call(role,'setMyShortDescription',{short_description:persona.bio.slice(0,115)});
      let warning='';
      try {
        const form=new FormData();
        form.set('photo',JSON.stringify({type:'static',photo:'attach://profile'}));
        form.set('profile',new Blob([fs.readFileSync(path.join(this.root,'public',role+'.jpg'))],{type:'image/jpeg'}),'profile.jpg');
        await this.call(role,'setMyProfilePhoto',form);
      }catch{warning='이름과 소개는 적용됐지만 프로필 이미지는 적용하지 못했습니다. BotFather의 /setuserpic에서 public 폴더의 이미지를 올려주세요.';}
      this.store.change(s=>Object.assign(s.connections[role],{configured:true,botId:me.id,username:me.username,error:'',profileWarning:warning}));
      return me.username;
    } catch(e) {if(old)this.secrets[role]=old;else delete this.secrets[role];throw e;}
  }
  async poll(role) {
    if(this.stopped||this.polling[role]||!this.secrets[role]||!this.store.state.connections[role].configured)return;
    this.polling[role]=true;
    try {
      const c=this.store.state.connections[role];
      const updates=await this.call(role,'getUpdates',{offset:c.offset,timeout:15,allowed_updates:['message']},20000);
      for(const update of updates) this.store.change(s=>{
        const conn=s.connections[role];
        if(update.update_id<conn.offset)return;
        const m=update.message;
        if(m?.chat?.type==='private' && !m.from?.is_bot && typeof m.text==='string') {
          const other=s.connections[role==='editor'?'fan':'editor'];
          if(!conn.chatId && m.text===`/start ${conn.pairing}` && (!other.userId||other.userId===m.from.id)) {
            conn.chatId=m.chat.id;conn.userId=m.from.id;
          }
          if(conn.chatId===m.chat.id&&conn.userId===m.from.id) {
            receive(s,role,m.text,new Date(),{transport:'telegram',eventId:`tg:${role}:${update.update_id}`});
          }
        }
        conn.offset=update.update_id+1;conn.error='';
      });
    } catch(e) {
      this.store.change(s=>{s.connections[role].error=e.code===409?'다른 실행 프로그램이 같은 봇을 사용 중입니다. 한 프로그램만 켜주세요.':e.message;});
    } finally {this.polling[role]=false;}
  }
  async flush(role) {
    if(this.stopped||this.sending[role]||!this.secrets[role])return;
    const item=this.store.state.outbox.find(m=>m.role===role&&m.status==='queued'&&Date.parse(m.nextAt)<=Date.now());
    if(!item)return;
    this.sending[role]=true;
    this.store.change(s=>{const m=s.outbox.find(x=>x.id===item.id);m.status='sending';m.attempts++;});
    try {
      const response=await this.call(role,'sendMessage',{chat_id:item.chatId,text:item.text});
      this.store.change(s=>{const m=s.outbox.find(x=>x.id===item.id);m.status='sent';m.telegramMessageId=response.message_id;if(s.deliveries[item.id])s.deliveries[item.id].status='sent';});
    }catch(e){
      this.store.change(s=>{
        const m=s.outbox.find(x=>x.id===item.id);
        if(!e.definite)m.status='uncertain';
        else if((e.code===429||e.code>=500)&&m.attempts<5){m.status='queued';m.nextAt=new Date(Date.now()+(e.retryAfter||30*m.attempts)*1000).toISOString();}
        else m.status='failed';
        m.error=e.message;
        if(s.deliveries[item.id])s.deliveries[item.id].status=m.status;
      });
    }finally{this.sending[role]=false;}
  }
}

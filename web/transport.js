'use strict';
const clubSessionKey='club-operations-session-v1';
const clubFlowKey='club-operations-line-flow-v1';
const clubFlowPrefix='club-operations-line-pending-v1:';
function clubPruneFlows(){try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(!key?.startsWith(clubFlowPrefix))continue;let flow;try{flow=JSON.parse(localStorage.getItem(key));}catch{}if(!flow||!Number.isFinite(flow.createdAt)||Date.now()-flow.createdAt>600000)localStorage.removeItem(key);}}catch{}}
function clubSaveFlow(flow){sessionStorage.setItem(clubFlowKey,JSON.stringify(flow));clubPruneFlows();try{localStorage.setItem(clubFlowPrefix+flow.state,JSON.stringify(flow));}catch{}}
function clubTakeFlow(state){let flow;try{flow=JSON.parse(sessionStorage.getItem(clubFlowKey)||'null');}catch{}if(flow?.state===state)sessionStorage.removeItem(clubFlowKey);else{flow=null;try{flow=JSON.parse(localStorage.getItem(clubFlowPrefix+state)||'null');}catch{}}try{localStorage.removeItem(clubFlowPrefix+state);}catch{}clubPruneFlows();return flow;}
function clubSession(){try{const saved=localStorage.getItem(clubSessionKey);if(saved)return saved;}catch{}try{const legacy=sessionStorage.getItem(clubSessionKey)||'';if(legacy)clubRemember(legacy);return legacy;}catch{return '';}}
function clubRemember(token){try{localStorage.setItem(clubSessionKey,token);sessionStorage.removeItem(clubSessionKey);}catch{sessionStorage.setItem(clubSessionKey,token);}}
function clubClearSession(){try{localStorage.removeItem(clubSessionKey);}catch{}sessionStorage.removeItem(clubSessionKey);}
function clubForget(){clubClearSession();let flow;try{flow=JSON.parse(sessionStorage.getItem(clubFlowKey)||'null');}catch{}if(flow?.state){try{localStorage.removeItem(clubFlowPrefix+flow.state);}catch{}}sessionStorage.removeItem(clubFlowKey);}
async function clubRequest(path,method,data,csrf){
 const base=window.CLUB_HOSTING?.apiBase||'/api';
 const token=window.CLUB_HOSTING?clubSession():'';
 const r=await fetch(base+path,{method,credentials:window.CLUB_HOSTING?'omit':'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 let v;try{v=await r.json();}catch{throw Error('サーバーとの接続を確認してください');}
 if(!r.ok){if(r.status===401&&path==='/session')clubClearSession();const e=Error(v.detail||'保存できませんでした');e.status=r.status;throw e;}
 if(v.token&&['/register','/login','/auth/line/exchange'].includes(path)){clubRemember(v.token);delete v.token;}
 if(path==='/logout')clubForget();return v;
}
async function clubStartLine(link=false){
 if(!window.CLUB_HOSTING){if(link){const r=await api('/auth/line/link','POST',{});location.assign(r.authorizeUrl);}else location.assign('/api/auth/line/start');return;}
 const browserSecret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 const r=await api('/auth/line/'+(link?'link':'start'),'POST',{browserSecret});
 clubSaveFlow({browserSecret,state:r.state,createdAt:Date.now(),link});
 location.assign(r.authorizeUrl);
}
async function clubFinishLine(url){
 if(!window.CLUB_HOSTING||!url.searchParams.has('state'))return null;
 const state=url.searchParams.get('state'),code=url.searchParams.get('code'),error=url.searchParams.get('error');
 // Remove authorization codes before other requests or UI navigation.
 for(const k of ['state','code','error','error_description'])url.searchParams.delete(k);
 history.replaceState(null,'',url);
 const flow=clubTakeFlow(state);
 if(!flow||state!==flow.state){const e=Error('LINEログインを開始した情報が見つかりません。ログインを開始したアプリに確認コードを貼り付けてください。');if(code&&state&&state.length<=128&&code.length<=4096)e.handoffCode='CLUB-LINE:'+JSON.stringify({state,code});throw e;}
 if(!Number.isFinite(flow.createdAt)||Date.now()-flow.createdAt>600000)throw Error('LINEログインを開始してから10分が過ぎました。「LINEでログイン」からやり直してください。');
 if(flow.link&&!clubSession())throw Error('アカウント連携はログイン済みの元のタブでやり直してください。');
 if(clubSession()){try{await refreshSession();}catch(e){if(e.status!==401)throw e;}}
 const r=await api('/auth/line/exchange','POST',{state,code,error,browserSecret:flow.browserSecret});
 ctx.user=r.user;ctx.csrf=r.csrf;return r;
}

function clubPendingLine(){clubPruneFlows();let flows=[];try{const f=JSON.parse(sessionStorage.getItem(clubFlowKey)||'null');if(f)flows.push(f);}catch{}try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(clubFlowPrefix)){try{flows.push(JSON.parse(localStorage.getItem(k)));}catch{}}}}catch{}return flows.filter(f=>f&&Number.isFinite(f.createdAt)&&Date.now()-f.createdAt<600000).sort((a,b)=>b.createdAt-a.createdAt)[0]||null;}
async function clubImportLine(value){if(typeof value!=='string'||value.length>6000||!value.startsWith('CLUB-LINE:'))throw Error('Safariでコピーした確認コードを貼り付けてください');let data;try{data=JSON.parse(value.slice(10));}catch{throw Error('確認コードを確認してください');}const flow=clubPendingLine();if(!flow||data.state!==flow.state)throw Error('このアプリでLINEログインを開始してから、10分以内に確認コードを貼り付けてください');if(typeof data.code!=='string'||!data.code||data.code.length>4096)throw Error('確認コードを確認してください');const url=new URL(location.href);url.searchParams.set('state',data.state);url.searchParams.set('code',data.code);return clubFinishLine(url);}

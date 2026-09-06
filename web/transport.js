'use strict';
const clubSessionKey='club-operations-session-v1';
const clubFlowKey='club-operations-line-flow-v1';
function clubSession(){try{return sessionStorage.getItem(clubSessionKey)||'';}catch{return '';}}
function clubRemember(token){sessionStorage.setItem(clubSessionKey,token);}
function clubForget(){sessionStorage.removeItem(clubSessionKey);sessionStorage.removeItem(clubFlowKey);}
async function clubRequest(path,method,data,csrf){
 const base=window.CLUB_HOSTING?.apiBase||'/api';
 const token=window.CLUB_HOSTING?clubSession():'';
 const r=await fetch(base+path,{method,credentials:window.CLUB_HOSTING?'omit':'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 let v;try{v=await r.json();}catch{throw Error('サーバーとの接続を確認してください');}
 if(!r.ok){if(r.status===401&&path==='/session')clubForget();const e=Error(v.detail||'保存できませんでした');e.status=r.status;throw e;}
 if(v.token&&['/register','/login','/auth/line/exchange'].includes(path)){clubRemember(v.token);delete v.token;}
 if(path==='/logout')clubForget();return v;
}
async function clubStartLine(link=false){
 if(!window.CLUB_HOSTING){if(link){const r=await api('/auth/line/link','POST',{});location.assign(r.authorizeUrl);}else location.assign('/api/auth/line/start');return;}
 const browserSecret=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 const r=await api('/auth/line/'+(link?'link':'start'),'POST',{browserSecret});
 sessionStorage.setItem(clubFlowKey,JSON.stringify({browserSecret,state:r.state,createdAt:Date.now()}));
 location.assign(r.authorizeUrl);
}
async function clubFinishLine(url){
 if(!window.CLUB_HOSTING||!url.searchParams.has('state'))return null;
 const state=url.searchParams.get('state'),code=url.searchParams.get('code'),error=url.searchParams.get('error');
 // Remove authorization codes before other requests or UI navigation.
 for(const k of ['state','code','error','error_description'])url.searchParams.delete(k);
 history.replaceState(null,'',url);
 let flow;try{flow=JSON.parse(sessionStorage.getItem(clubFlowKey)||'null');}catch{}
 sessionStorage.removeItem(clubFlowKey);
 if(!flow||state!==flow.state||Date.now()-flow.createdAt>600000)throw Error('ログインの有効期限が切れたか、別のブラウザーです。もう一度開始してください。');
 if(clubSession()){try{await refreshSession();}catch(e){if(e.status!==401)throw e;}}
 const r=await api('/auth/line/exchange','POST',{state,code,error,browserSecret:flow.browserSecret});
 ctx.user=r.user;ctx.csrf=r.csrf;return r;
}

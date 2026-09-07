import {validateSubscription,scheduleJobs} from './push.mjs';
import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {HttpError,fail,text,object,emptyState,seedAttendance,equal,targeted,updateState} from './domain.mjs';
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const random=(n=32)=>randomBytes(n).toString('hex');
const sec=()=>Date.now()/1000;
export const safeEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
function hashPassword(password,salt=random(16)){return salt+':'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');}
export const APP_URL='https://iburigakko-picoloom.github.io/club-operations/';
export const APP_ORIGIN=new URL(APP_URL).origin;

// The database callback always runs inside a transaction as club_runtime.
// No client-supplied SQL, schema, role, identity or owner field is trusted.
export function createApi({transaction,lineConfig=()=>({enabled:false}),exchangeLine,pushConfig=async()=>({enabled:false,publicKey:''}),allowedOrigin=APP_ORIGIN,appUrl=APP_URL}){
 const query=(c,q,p=[])=>c.unsafe(q,p);
 async function member(c,gid,uid){const [g]=await query(c,'SELECT g.* FROM club.groups g JOIN club.memberships m ON m.group_id=g.id WHERE g.id=$1 AND m.user_id=$2',[gid,uid]);if(!g)fail('このグループにはアクセスできません',403);return g;}
 const bearer=req=>req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1]||'';
 async function userFor(c,req,mutate=false){const token=bearer(req);if(!token)fail('ログインしてください',401);const [u]=await query(c,'SELECT u.id,u.email,u.name,s.csrf FROM club.sessions s JOIN club.users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>$2',[digest(token),sec()]);if(!u)fail('ログインしてください',401);if(mutate&&!safeEqual(req.headers.get('x-csrf-token')||'',u.csrf))fail('画面を再読み込みしてください',403);return u;}
 async function publicUser(c,u){const linked=await query(c,"SELECT 1 FROM club.identities WHERE provider='line' AND user_id=$1",[u.id]);return {id:u.id,name:u.name,email:u.email.endsWith('@line.invalid')?'':u.email,lineLinked:!!linked.length};}
 async function issue(c,u){const token=random(),csrf=random(24);await query(c,'DELETE FROM club.sessions WHERE expires<$1',[sec()]);await query(c,'INSERT INTO club.sessions VALUES($1,$2,$3,$4)',[digest(token),u.id,csrf,sec()+86400*14]);return {user:await publicUser(c,u),csrf,token};}
 async function view(c,g,u){const s=JSON.parse(g.data);s.operators=await query(c,'SELECT u.id,u.name FROM club.memberships m JOIN club.users u ON u.id=m.user_id WHERE m.group_id=$1 ORDER BY u.name',[g.id]);s.currentUser=u.id;s.ownerId=g.owner_id;s.version=g.version;if(u.id!==g.owner_id)s.notices=s.notices.filter(n=>targeted(s,n,u.id));return s;}
 async function limit(key,max=12,window=300){return transaction(async c=>{await query(c,'DELETE FROM club.login_limits WHERE window_start<$1',[sec()-600]);const hash=digest(key);const [r]=await query(c,'SELECT * FROM club.login_limits WHERE client_hash=$1',[hash]);if(r&&r.window_start>sec()-window&&r.attempts>=max)fail('少し待ってから再試行してください',429);await query(c,'INSERT INTO club.login_limits VALUES($1,$2,1) ON CONFLICT(client_hash) DO UPDATE SET attempts=CASE WHEN club.login_limits.window_start<$3 THEN 1 ELSE club.login_limits.attempts+1 END,window_start=CASE WHEN club.login_limits.window_start<$3 THEN $2 ELSE club.login_limits.window_start END',[hash,sec(),sec()-window]);});}
 async function readBody(req){if(Number(req.headers.get('content-length'))>4000000)fail('データが大きすぎます',413);const reader=req.body?.getReader();if(!reader)return {};let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();fail('データが大きすぎます',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length;}try{const b=JSON.parse(new TextDecoder().decode(bytes)||'{}');if(!object(b))fail('JSONを確認してください');return b;}catch{fail('JSONを確認してください');}}
 async function route(req,path,b){
  const method=req.method,cfg=lineConfig();
  if(path==='/config'&&method==='GET'){const push=await pushConfig();return {server:true,publicOrigin:appUrl.replace(/\/$/,''),push:push.enabled,vapidPublic:push.publicKey,lineLogin:cfg.enabled,passwordLogin:true,hosting:'supabase',version:'1.0'};}
  if((path==='/register'||path==='/login')&&method==='POST'){
   const email=typeof b.email==='string'?b.email.trim().toLowerCase():'',password=b.password,name=typeof b.name==='string'?b.name.trim():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>256||email.endsWith('@line.invalid'))fail('メールと10文字以上のパスワードを確認してください');
   // Account and global registration limits persist across isolates. Do not trust forwarded IP headers.
   await limit('password:'+email);if(path==='/register')await limit('registration:global',100,600);
   if(path==='/register'){text(name,80,true);const passwordHash=hashPassword(password);return transaction(async c=>{const exists=await query(c,'SELECT 1 FROM club.users WHERE email=$1',[email]);if(exists.length)fail('このメールは使用できません');const u={id:random(16),email,name};await query(c,'INSERT INTO club.users VALUES($1,$2,$3,$4)',[u.id,email,name,passwordHash]);return issue(c,u);});}
   const u=await transaction(async c=>(await query(c,'SELECT * FROM club.users WHERE email=$1',[email]))[0]);
   // Equal-cost password work also for unknown accounts, without returning the stored hash.
   const hash=hashPassword(password,u?.password?.includes(':')?u.password.split(':')[0]:'0'.repeat(32));if(!u||!safeEqual(hash,u.password))fail('メールまたはパスワードが違います',401);
   return transaction(c=>issue(c,u));
  }
  if((path==='/auth/line/start'||path==='/auth/line/link')&&method==='POST'){
   if(!cfg.enabled)fail('LINEログインは接続設定前です',503);if(typeof b.browserSecret!=='string'||!/^[a-f0-9]{64}$/.test(b.browserSecret))fail('ログインをもう一度開始してください');
   await limit('line:global',100,600);
   return transaction(async c=>{let uid=null;if(path.endsWith('/link')){const u=await userFor(c,req,true);uid=u.id;const rows=await query(c,"SELECT 1 FROM club.identities WHERE provider='line' AND user_id=$1",[uid]);if(rows.length)fail('すでにLINE連携済みです',409);}
    const state=random(),nonce=random(),verifier=random(32);await query(c,'DELETE FROM club.login_flows WHERE expires<$1 OR cookie_hash=$2',[sec(),digest(b.browserSecret)]);await query(c,'INSERT INTO club.login_flows VALUES($1,$2,$3,$4,$5,$6)',[digest(state),digest(b.browserSecret),nonce,verifier,uid,sec()+600]);
    const params=new URLSearchParams({response_type:'code',client_id:cfg.channel,redirect_uri:appUrl,state,scope:'openid profile',nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});return {state,authorizeUrl:'https://access.line.me/oauth2/v2.1/authorize?'+params};
   });
  }
  if(path==='/auth/line/exchange'&&method==='POST'){
   if(!cfg.enabled)fail('LINEログインは接続設定前です',503);if(typeof b.state!=='string'||typeof b.browserSecret!=='string'||b.state.length>128||b.browserSecret.length!==64)fail('ログインをもう一度開始してください',401);
   const flow=await transaction(async c=>{const [f]=await query(c,'SELECT * FROM club.login_flows WHERE state_hash=$1',[digest(b.state)]);if(!f||f.expires<=sec()||!safeEqual(f.cookie_hash,digest(b.browserSecret)))fail('ログインの有効期限が切れたか、別のブラウザーです',401);if(f.link_user_id){const u=await userFor(c,req,true);if(u.id!==f.link_user_id)fail('連携前のログインが切れています',401);}await query(c,'DELETE FROM club.login_flows WHERE state_hash=$1',[digest(b.state)]);return f;});
   if(b.error)fail('LINEログインをキャンセルしました');text(b.code,4096,true);
   let claims;try{claims=await exchangeLine(b.code,flow,cfg,appUrl);}catch{fail('LINEでの本人確認ができませんでした。再試行してください',401);}
   return transaction(async c=>{const [existing]=await query(c,"SELECT user_id FROM club.identities WHERE provider='line' AND channel=$1 AND subject=$2",[cfg.channel,claims.sub]);let uid=flow.link_user_id;
    if(uid){if(existing&&existing.user_id!==uid)fail('このLINEは別のアカウントと連携済みです',409);const [other]=await query(c,"SELECT subject FROM club.identities WHERE provider='line' AND channel=$1 AND user_id=$2",[cfg.channel,uid]);if(other&&other.subject!==claims.sub)fail('すでに別のLINEと連携済みです',409);await userFor(c,req,true);}
    else if(existing)uid=existing.user_id;
    else{uid=random(16);const email='line-'+digest(cfg.channel+'|'+claims.sub)+'@line.invalid',name=String(claims.name||'運営メンバー').trim().slice(0,80)||'運営メンバー';await query(c,'INSERT INTO club.users VALUES($1,$2,$3,$4)',[uid,email,name,'!line-only']);}
    await query(c,"INSERT INTO club.identities VALUES('line',$1,$2,$3,$4) ON CONFLICT DO NOTHING",[cfg.channel,claims.sub,uid,sec()]);const [u]=await query(c,'SELECT * FROM club.users WHERE id=$1',[uid]);return {...await issue(c,u),linked:!!flow.link_user_id};
   });
  }
  return transaction(async c=>{
   if(path.startsWith('/invites/')&&method==='GET'){
    const token=path.slice('/invites/'.length);const [r]=await query(c,'SELECT g.id,g.data FROM club.invites i JOIN club.groups g ON g.id=i.group_id WHERE i.token=$1 AND i.used=0 AND i.expires>$2',[digest(token),sec()]);if(!r)fail('招待が無効または期限切れです');let u;try{u=await userFor(c,req);}catch(e){if(e.status!==401)throw e;}const isMember=!!u&&(await query(c,'SELECT 1 FROM club.memberships WHERE group_id=$1 AND user_id=$2',[r.id,u.id])).length>0;return {groupName:JSON.parse(r.data).group.name,isMember,groupId:isMember?r.id:null,access:'運営メンバー（閲覧）'};
   }
   const u=await userFor(c,req,!['GET','HEAD'].includes(method));
   if(path==='/push/subscription'&&method==='POST'){const sub=validateSubscription(b.subscription);await query(c,'INSERT INTO club.subscriptions VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,data=excluded.data',[digest(sub.endpoint),u.id,JSON.stringify(sub)]);return {ok:true};}
   if(path==='/push/subscription'&&method==='DELETE'){text(b.endpoint,4096,true);await query(c,'DELETE FROM club.subscriptions WHERE id=$1 AND user_id=$2',[digest(b.endpoint),u.id]);return {ok:true};}
   if(path==='/push/test'&&method==='POST'){text(b.groupId,100,true);await member(c,b.groupId,u.id);const subs=await query(c,'SELECT 1 FROM club.subscriptions WHERE user_id=$1',[u.id]);if(!subs.length)fail('先にこの端末の通知を有効にしてください');const recent=await query(c,"SELECT 1 FROM club.jobs WHERE recipient=$1 AND payload::jsonb->>'resourceType'='test' AND due>$2",[u.id,sec()-60]);if(recent.length)fail('1分待ってから再試行してください',429);await query(c,"INSERT INTO club.jobs VALUES($1,$2,$3,$4,$5,'pending',0,0)",[random(),b.groupId,u.id,sec(),JSON.stringify({title:'部活運営',body:'テスト通知が届きました',resourceType:'test',resourceId:'test',url:appUrl+'#notification-settings'})]);return {ok:true};}
   if(path==='/session'&&method==='GET'){const groups=(await query(c,'SELECT g.* FROM club.groups g JOIN club.memberships m ON m.group_id=g.id WHERE m.user_id=$1',[u.id])).map(g=>({id:g.id,name:JSON.parse(g.data).group.name,ownerId:g.owner_id}));return {user:await publicUser(c,u),csrf:u.csrf,groups};}
   if(path==='/logout'&&method==='POST'){await query(c,'DELETE FROM club.sessions WHERE token=$1',[digest(bearer(req))]);return {ok:true};}
   if(path==='/account'&&method==='PATCH'){if(Object.keys(b).join()!=='name')fail('変更できない項目です');text(b.name,80,true);await query(c,'UPDATE club.users SET name=$1 WHERE id=$2',[b.name.trim(),u.id]);return {ok:true};}
   if(path==='/groups'&&method==='POST'){text(b.name,100,true);const gid=random(16),s=emptyState(gid,b.name.trim());await query(c,'INSERT INTO club.groups VALUES($1,$2,$3,1)',[gid,u.id,JSON.stringify(s)]);await query(c,'INSERT INTO club.memberships VALUES($1,$2)',[gid,u.id]);return view(c,await member(c,gid,u.id),u);}
   if(path==='/join'&&method==='POST'){text(b.token,200,true);const token=digest(b.token),[r]=await query(c,'SELECT * FROM club.invites WHERE token=$1 AND used=0 AND expires>$2',[token,sec()]);if(!r)fail('招待が無効または期限切れです');if((await query(c,'SELECT 1 FROM club.memberships WHERE group_id=$1 AND user_id=$2',[r.group_id,u.id])).length)return {groupId:r.group_id,alreadyMember:true};await query(c,'INSERT INTO club.memberships VALUES($1,$2)',[r.group_id,u.id]);await query(c,'UPDATE club.invites SET use_count=use_count+1,used=CASE WHEN use_count+1>=max_uses THEN 1 ELSE 0 END WHERE token=$1',[token]);await query(c,'UPDATE club.groups SET version=version+1 WHERE id=$1',[r.group_id]);return {groupId:r.group_id};}
   const match=path.match(/^\/groups\/([a-f0-9]{32})\/(state|invite|invites|membership)(?:\/([a-f0-9]{64})\/revoke)?$/);if(!match)fail('見つかりません',404);
   const [,gid,action,iid]=match;let g=await member(c,gid,u.id);
   if(action==='state'&&method==='GET'){const s=JSON.parse(g.data),old=structuredClone(s);seedAttendance(s);if(!equal(s,old)){await query(c,'UPDATE club.groups SET data=$1,version=version+1 WHERE id=$2',[JSON.stringify(s),gid]);g=await member(c,gid,u.id);}return view(c,g,u);}
   if(action==='state'&&method==='PATCH'){if(b.version!==g.version)fail('別の担当者が更新しました。再読み込みしてください',409);const operators=new Set((await query(c,'SELECT user_id FROM club.memberships WHERE group_id=$1',[gid])).map(r=>r.user_id));const s=updateState(JSON.parse(g.data),b.changes??{},u,g.owner_id,gid,operators);await query(c,'UPDATE club.groups SET data=$1,version=version+1 WHERE id=$2',[JSON.stringify(s),gid]);await scheduleJobs(c,gid,s,JSON.parse(g.data),operators,g.owner_id,appUrl);await query(c,'INSERT INTO club.audit(group_id,user_id,action,created_at,details) VALUES($1,$2,$3,$4,$5)',[gid,u.id,'update',new Date().toISOString(),JSON.stringify(Object.keys(b.changes||{}))]);return view(c,await member(c,gid,u.id),u);}
   if(action==='invite'&&method==='POST'){if(g.owner_id!==u.id)fail('オーナーだけが招待できます',403);const maxUses=b.maxUses??1;if(!Number.isInteger(maxUses)||maxUses<1||maxUses>100)fail('招待人数は1〜100人で指定してください');const token=random(24),expiresAt=sec()+86400*7;await query(c,'INSERT INTO club.invites(token,group_id,expires,used,created_at,created_by,max_uses) VALUES($1,$2,$3,0,$4,$5,$6)',[digest(token),gid,expiresAt,sec(),u.id,maxUses]);return {token,expiresAt,expiresInDays:7,maxUses};}
   if(action==='invites'){if(g.owner_id!==u.id)fail('オーナーだけが確認できます',403);if(iid&&method==='POST'){const [r]=await query(c,'SELECT * FROM club.invites WHERE group_id=$1 AND token=$2',[gid,iid]);if(!r)fail('招待が見つかりません',404);if(r.used===0)await query(c,'UPDATE club.invites SET used=2 WHERE token=$1',[iid]);return {ok:true};}if(!iid&&method==='GET')return {invites:(await query(c,'SELECT * FROM club.invites WHERE group_id=$1 ORDER BY created_at DESC LIMIT 100',[gid])).map(r=>({id:r.token,createdAt:r.created_at,expiresAt:r.expires,maxUses:r.max_uses,useCount:r.use_count,status:r.used===1?'used':r.used===2?'revoked':r.expires<=sec()?'expired':'active'}))};}
   if(action==='membership'&&method==='POST'){text(b.userId,100,true);await member(c,gid,b.userId);if(b.action==='transfer'){if(g.owner_id!==u.id)fail('オーナーだけが移譲できます',403);await query(c,'UPDATE club.groups SET owner_id=$1,version=version+1 WHERE id=$2',[b.userId,gid]);}
    else if(b.action==='remove'){if(u.id!==g.owner_id&&b.userId!==u.id)fail('権限がありません',403);if(b.userId===g.owner_id)fail('オーナーを移譲してから退出してください');const s=JSON.parse(g.data);await query(c,'DELETE FROM club.memberships WHERE group_id=$1 AND user_id=$2',[gid,b.userId]);for(const role of Object.keys(s.roles))s.roles[role]=s.roles[role].filter(id=>id!==b.userId);for(const key of ['events','tasks','notices'])for(const item of s[key])if(item.assignees?.includes(b.userId)){item.formerAssignees=[...(item.formerAssignees||[]),b.userId];item.assignees=item.assignees.filter(id=>id!==b.userId);item.assignmentNeedsReview=!item.assignees.length;}await query(c,'UPDATE club.groups SET data=$1,version=version+1 WHERE id=$2',[JSON.stringify(s),gid]);await query(c,"UPDATE club.jobs SET status='cancelled' WHERE group_id=$1 AND recipient=$2 AND status='pending'",[gid,b.userId]);}
    else fail('操作が不明です');return {ok:true};
   }
   fail('見つかりません',404);
  });
 }
 return async req=>{
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
  const origin=req.headers.get('origin');if(origin===allowedOrigin){headers['Access-Control-Allow-Origin']=allowedOrigin;headers['Access-Control-Allow-Headers']='authorization, content-type, x-csrf-token';headers['Access-Control-Allow-Methods']='GET, POST, PATCH, OPTIONS';}
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&origin!==allowedOrigin)return response({detail:'送信元が一致しません'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{const url=new URL(req.url),path=url.pathname.replace(/^\/functions\/v1\/club-api/,'').replace(/^\/club-api/,'');const b=['POST','PATCH'].includes(req.method)?await readBody(req):{};return response(await route(req,path,b));}
  catch(e){if(e instanceof HttpError)return response({detail:e.message},e.status);if(e?.code==='23505')return response({detail:'同じデータがすでに登録されています'},409);console.error('club-api failure',e?.code||e?.name||'Error');return response({detail:'サーバーとの接続を確認して再試行してください'},503);}
 };
}

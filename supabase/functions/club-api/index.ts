import postgres from 'postgres';
import webpush from 'web-push';
import {dispatchPush} from './push.mjs';
import {safeEqual,APP_URL} from './api.mjs';
import {createApi} from './api.mjs';
import {exchangeLine} from './line.mjs';
import {createFcmSender} from './fcm.mjs';

const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,idle_timeout:20,connect_timeout:10});
const transaction=<T>(fn: (connection: postgres.TransactionSql)=>Promise<T>):Promise<T>=>sql.begin(async c=>{
 // Built-in credentials stay in Supabase. Restrict every transaction to the app role.
 await c.unsafe('SET LOCAL ROLE club_runtime');
 await c.unsafe("SET LOCAL statement_timeout='15s'");
 await c.unsafe("SET LOCAL lock_timeout='10s'");
 await c.unsafe("SELECT pg_advisory_xact_lock(hashtextextended('club-operations:club',0))");
 return await fn(c);
}) as Promise<T>;
const lineConfig=()=>{const channel=Deno.env.get('LINE_CHANNEL_ID')||'',secret=Deno.env.get('LINE_CHANNEL_SECRET')||'';return {channel,secret,enabled:Deno.env.get('LINE_LOGIN_ENABLED')==='1'&&/^\d+$/.test(channel)&&!!secret};};
const config=async()=>transaction(async c=>(await c.unsafe('SELECT * FROM club.push_config WHERE id=1'))[0]);
const fcmSecret=Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')||'';
let sendFcm: ReturnType<typeof createFcmSender> | null=null;
try{if(fcmSecret)sendFcm=createFcmSender(fcmSecret);}catch{/* Keep the existing web app available if FCM is misconfigured. */}
const api=createApi({transaction,lineConfig,exchangeLine,pushConfig:async()=>{const cfg=await config();return {enabled:!!cfg?.enabled,nativeEnabled:!!sendFcm,publicKey:cfg?.public_key||''};}});
Deno.serve(async req=>{
 if(new URL(req.url).pathname.endsWith('/internal/push')){
  const cfg=await config();if(req.method!=='POST'||!cfg?.worker_token||!(cfg.enabled||sendFcm)||!safeEqual(req.headers.get('authorization')||'','Bearer '+cfg.worker_token))return new Response('Unauthorized',{status:401});
  try{const result=await dispatchPush(transaction,async(sub: {endpoint:string,keys:{p256dh:string,auth:string},provider?:string,token?:string},payload:string)=>{
   if(sub.provider==='fcm'){if(!sendFcm)throw Error('FCM is not configured');await sendFcm(sub,payload);return;}
   if(!cfg.enabled)throw Error('Web push is not configured');
   const r=webpush.generateRequestDetails(sub,payload,{TTL:3600,vapidDetails:{subject:APP_URL,publicKey:cfg.public_key,privateKey:cfg.private_key}});
   const response=await fetch(r.endpoint,{method:'POST',headers:r.headers,body:r.body,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Object.assign(new Error('Push failed'),{statusCode:response.status});
  },APP_URL);return Response.json(result);}catch{return Response.json({error:'Push dispatch failed'},{status:500});}
 }
 return api(req);
});

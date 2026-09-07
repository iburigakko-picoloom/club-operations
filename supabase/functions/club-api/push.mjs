import {createHash} from 'node:crypto';
import {fail,targeted} from './domain.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validateSubscription(sub){
 let u;try{u=new URL(sub?.endpoint);}catch{fail('通知サービスのURLが不正です');}
 const host=u.hostname;
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||sub.endpoint.length>4096||!(host==='fcm.googleapis.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')||host.endsWith('.push.services.mozilla.com')))fail('通知サービスのURLが不正です');
 for(const [key,size] of [['p256dh',65],['auth',16]]){const v=sub.keys?.[key];if(typeof v!=='string'||!(/^[A-Za-z0-9_-]+={0,2}$/).test(v)||Buffer.from(v,'base64url').length!==size)fail('通知の登録情報が不正です');}
 return {endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}};
}
export function reminderDue(date,time,offset){
 const dt=new Date(`${date}T${time||'09:00'}+09:00`);if(!Number.isFinite(+dt))return NaN;
 if(offset==='P1M'){const d=new Date(+dt+9*3600000),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return (+d-9*3600000)/1000;}
 const days={P7D:7,P3D:3,P1D:1}[offset];return days?+dt/1000-days*86400:NaN;
}
export function reminderJobs(gid,s,operators,owner,appUrl,now=Date.now()/1000){
 const jobs=[];
 const add=(type,x,recipients,date,time,offsets)=>{
  if(x.cancelled||x.done||x.deleted||x.assignmentNeedsReview)return;
  for(const offset of offsets||[]){const due=reminderDue(date,time,offset);if(!Number.isFinite(due)||due<=now)continue;
   for(const uid of new Set(recipients)){if(!operators.has(uid))continue;const id=hash([gid,type,x.id,uid,offset,due,x.title||''].join('|'));
    jobs.push({id,recipient:uid,due,payload:{title:x.title||'配車を確認',body:`${date} ${time||'09:00'}`,url:appUrl+'#group-open/'+gid+'/'+type+'/'+x.id,groupId:gid,resourceId:x.id,resourceType:type}});
   }
  }
 };
 for(const [type,items] of [['event',s.events],['task',s.tasks]])for(const x of items||[])add(type,x,x.assignees?.length?x.assignees:operators,x.date,x.time||x.start,x.notifications);
 for(const p of s.plans||[]){const e=s.events.find(e=>e.id===p.eventId);if(!e||e.cancelled||p.status==='cancelled')continue;add('car',{...p,title:'配車を確認'},[...(s.roles?.['配車']||[]),owner],e.date,e.start,p.notifications??s.settings?.reminders);}
 return jobs;
}
export async function scheduleJobs(c,gid,s,old,operators,owner,appUrl,now=Date.now()/1000){
 const jobs=reminderJobs(gid,s,operators,owner,appUrl,now);
 // Pending future jobs are replaced after edits. Already due jobs are checked by the worker.
 await c.unsafe("UPDATE club.jobs SET status='cancelled' WHERE group_id=$1 AND status='pending' AND due>$2 AND payload::jsonb->>'resourceType'<>'notice'",[gid,now]);
 for(const n of s.notices||[]){const prev=old.notices?.find(x=>x.id===n.id);if(!n.notify||(prev&&n.notifyVersion===prev.notifyVersion))continue;
  for(const uid of operators)if(targeted(s,n,uid))jobs.push({id:hash([gid,'notice',n.id,n.notifyVersion||1,uid].join('|')),recipient:uid,due:now,payload:{title:n.title,body:s.group.name,url:appUrl+'#group-open/'+gid+'/notice/'+n.id,groupId:gid,resourceId:n.id,resourceType:'notice'}});
 }
 for(const j of jobs)await c.unsafe("INSERT INTO club.jobs(id,group_id,recipient,due,payload,status,attempts) VALUES($1,$2,$3,$4,$5,'pending',0) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN club.jobs.status='cancelled' THEN 'pending' ELSE club.jobs.status END",[j.id,gid,j.recipient,j.due,JSON.stringify(j.payload)]);
}
export function jobVisible(job,s,operators,owner,appUrl){
 if(!operators.has(job.recipient))return false;
 const p=JSON.parse(job.payload);
 if(p.resourceType==='test')return true;
 if(p.resourceType==='notice'){const n=s.notices?.find(n=>n.id===p.resourceId);return !!n&&n.notify&&targeted(s,n,job.recipient)&&job.id===hash([job.group_id,'notice',n.id,n.notifyVersion||1,job.recipient].join('|'));}
 return reminderJobs(job.group_id,s,operators,owner,appUrl,Number(job.due)-1).some(j=>j.id===job.id);
}
export async function dispatchPush(transaction,send,appUrl){
 const now=Date.now()/1000;
 const batch=await transaction(async c=>{
  // Rebuild future reminders from existing saved data as well as newly edited schedules.
  for(const g of await c.unsafe('SELECT * FROM club.groups')){const s=JSON.parse(g.data),ops=new Set((await c.unsafe('SELECT user_id FROM club.memberships WHERE group_id=$1',[g.id])).map(x=>x.user_id));await scheduleJobs(c,g.id,s,s,ops,g.owner_id,appUrl,now);}
  await c.unsafe("UPDATE club.jobs SET status=CASE WHEN attempts<3 THEN 'pending' ELSE 'failed' END WHERE status='sending' AND claimed_at<$1",[now-120]);
  const rows=await c.unsafe("SELECT * FROM club.jobs WHERE status='pending' AND due<=$1 AND attempts<3 ORDER BY due LIMIT 20 FOR UPDATE SKIP LOCKED",[now]);const out=[];
  for(const j of rows){const [g]=await c.unsafe('SELECT * FROM club.groups WHERE id=$1',[j.group_id]),ops=new Set((await c.unsafe('SELECT user_id FROM club.memberships WHERE group_id=$1',[j.group_id])).map(x=>x.user_id));
   if(!g||now-j.due>86400||!jobVisible(j,JSON.parse(g.data),ops,g.owner_id,appUrl)){await c.unsafe("UPDATE club.jobs SET status='cancelled' WHERE id=$1",[j.id]);continue;}
   const subs=await c.unsafe('SELECT * FROM club.subscriptions WHERE user_id=$1',[j.recipient]);
   await c.unsafe("UPDATE club.jobs SET status=$2,attempts=attempts+1,claimed_at=$3 WHERE id=$1",[j.id,subs.length?'sending':'no_subscription',now]);if(subs.length)out.push({...j,subs});
  }return out;
 });
 let sent=0,failed=0;
 for(const j of batch){let retry=false;
  for(const sub of j.subs){const done=await transaction(c=>c.unsafe('SELECT 1 FROM club.push_deliveries WHERE job_id=$1 AND subscription_id=$2',[j.id,sub.id]));if(done.length)continue;
   try{validateSubscription(JSON.parse(sub.data));await send(JSON.parse(sub.data),j.payload);await transaction(c=>c.unsafe('INSERT INTO club.push_deliveries VALUES($1,$2) ON CONFLICT DO NOTHING',[j.id,sub.id]));sent++;}
   catch(e){if([404,410].includes(e.statusCode))await transaction(c=>c.unsafe('DELETE FROM club.subscriptions WHERE id=$1',[sub.id]));else{retry=true;failed++;}}
  }
  await transaction(c=>c.unsafe('UPDATE club.jobs SET status=$2 WHERE id=$1',[j.id,retry?(j.attempts<2?'pending':'failed'):'sent']));
 }
 return {sent,failed,processed:batch.length};
}

// Integration against the deployed handler or an isolated CI Postgres instance.
// Test identities are recorded for precise cleanup; passwords/tokens are never written.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const base=process.env.CLUB_API_URL;if(!base)throw Error('Set CLUB_API_URL explicitly');
const run=randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex'),emails=[`qa-${run}-a@club-qa.invalid`,`qa-${run}-b@club-qa.invalid`],users=[],groups=[];let checks=0;
const record=()=>writeFile('.edge-test-run.json',JSON.stringify({run,emails,users,groups},null,2));await record();
const origin='https://iburigakko-picoloom.github.io';
async function call(path,method='GET',data,session,expected=200,extra={}){
 const r=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token,'X-CSRF-Token':session.csrf}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});let b;try{b=await r.json();}catch{b={detail:'Non-JSON response'};}assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(b)}`);assert.equal(r.headers.get('cache-control'),'no-store');checks++;return b;
}
try{
 const config=await call('/config');assert.equal(config.hosting,'supabase');assert.equal(config.push,false);
 await call('/session','GET',undefined,undefined,401);
 await call('/config','GET',undefined,undefined,403,{Origin:'https://evil.example'});
 const preflight=await fetch(base+'/groups',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type, x-csrf-token'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);checks++;
 const a=await call('/register','POST',{email:emails[0],password,name:'公開検証A'});users.push(a.user.id);await record();assert.ok(a.token&&!a.user.password);
 await call('/groups','POST',{name:'拒否される'},a,403,{'X-CSRF-Token':'wrong'});
 let s=await call('/groups','POST',{name:'公開検証 '+run},a);const gid=s.group.id;groups.push(gid);await record();
 const endpoint='/groups/'+gid+'/state',patch=(who,state,changes,status=200)=>call(endpoint,'PATCH',{version:state.version,changes},who,status);
 const initial=s;
 const equipment=[{id:'ball',name:'ボール',quantity:10,unit:'個',threshold:2}];s=await patch(a,s,{equipment});
 await patch(a,initial,{equipment:[]},409);
 assert.deepEqual((await call(endpoint,'GET',undefined,a)).equipment.map(x=>x.name),['ボール']);
 await patch(a,s,{ownerId:'spoof'},400);await patch(a,s,{plans:[{id:'invalid'}]},400);
 const b=await call('/register','POST',{email:emails[1],password,name:'公開検証B'});users.push(b.user.id);await record();
 await call(endpoint,'GET',undefined,b,403);
 const inv=await call('/groups/'+gid+'/invite','POST',{},a);assert.ok(inv.token);const info=await call('/invites/'+inv.token);assert.equal(info.groupId,null);assert.equal(info.groupName,'公開検証 '+run);
 await call('/join','POST',{token:inv.token},b);await call('/join','POST',{token:inv.token},b,400);
 s=await call(endpoint,'GET',undefined,b);await patch(b,s,{equipment:[]},403);await patch(b,s,{settings:{unitYen:1}},403);
 s=await call(endpoint,'GET',undefined,a);const roles=s.roles;roles['備品']=[b.user.id];roles['お知らせ']=[b.user.id];s=await patch(a,s,{roles,notices:[{id:'secret',title:'オーナーのみ',body:'非公開',assignees:[a.user.id]},{id:'all',title:'全員',body:'公開',assignees:[]}]});
 let sb=await call(endpoint,'GET',undefined,b);assert.equal(sb.notices.length,1);assert.equal(sb.notices[0].id,'all');
 sb=await patch(b,sb,{equipment:[{...equipment[0],quantity:8}],notices:[{...sb.notices[0],body:'変更'}]});assert.equal(sb.equipment[0].quantity,8);
 s=await call(endpoint,'GET',undefined,a);assert.equal(s.notices.length,2);assert.equal(s.notices.find(n=>n.id==='secret').body,'非公開');
 await patch(b,sb,{notices:s.notices},403);

 // Save/reload the new relation and the existing schedule/training structures through Postgres.
 const day=new Date().toISOString().slice(0,10),reminders=['P1M','P7D','P3D','P1D'];
 const events=[{id:'club',kind:'club',title:'練習',date:day,start:'19:00',end:'21:00',venueId:'v1',courts:3,assignees:[]},...['ex1','ex2'].map(id=>({id,kind:'executive',title:id,date:day,start:'18:00',end:'19:00',assignees:[],notifications:reminders}))];
 const training={categories:[],menus:[],sheets:[{id:'sheet',title:'保存済み',eventId:'club',patterns:[4,5],rows:[],context:{venue:'旧体育館',courts:3}}],history:[]};
 s=await patch(a,s,{events,training,venues:[{id:'v1',name:'旧体育館',courts:4},{id:'v2',name:'新体育館',courts:2}]});
 const originalEvents=structuredClone(s.events);
 s=await patch(a,s,{venueAssignments:{club:{venueId:'v2'}}});
 let loaded=await call(endpoint,'GET',undefined,a);assert.deepEqual(loaded.events,originalEvents);assert.deepEqual(loaded.training,training);assert.equal(loaded.venueAssignments.club.venueId,'v2');assert.equal(loaded.tasks.length,0);
 await patch(b,loaded,{venueAssignments:{club:{venueId:'v1'}}},403);
 await patch(a,loaded,{venueAssignments:{missing:{venueId:'v1'}}},400);
 const completed=structuredClone(loaded.events);completed[1].done=true;
 s=await patch(b,loaded,{events:completed});loaded=await call(endpoint,'GET',undefined,a);assert.equal(loaded.events[1].completedBy,b.user.id);assert.deepEqual(loaded.events[1].notifications,reminders);assert.equal(loaded.tasks.length,0);assert.equal(loaded.events.length,3);
 completed[1].title='unauthorized';await patch(b,loaded,{events:completed},403);
 s=loaded;
 const inv2=await call('/groups/'+gid+'/invite','POST',{},a);const list=await call('/groups/'+gid+'/invites','GET',undefined,a);const active=list.invites.find(i=>i.status==='active');assert.ok(active);await call('/groups/'+gid+'/invites/'+active.id+'/revoke','POST',{},a);await call('/invites/'+inv2.token,'GET',undefined,undefined,400);
 await call('/account','PATCH',{name:'変更した名前'},b);assert.equal((await call('/session','GET',undefined,b)).user.name,'変更した名前');
 await call('/groups/'+gid+'/membership','POST',{userId:b.user.id,action:'remove'},a);await call(endpoint,'GET',undefined,b,403);
 for(const maxUses of [0,101,1.5,true])await call('/groups/'+gid+'/invite','POST',{maxUses},a,400);
 const multi=await call('/groups/'+gid+'/invite','POST',{maxUses:2},a);assert.equal(multi.maxUses,2);
 await call('/join','POST',{token:multi.token},b);await call('/join','POST',{token:multi.token},b);
 const extraEmail=`qa-${run}-c@club-qa.invalid`;emails.push(extraEmail);const extra=await call('/register','POST',{email:extraEmail,password,name:'公開検証C'});users.push(extra.user.id);await record();
 await call('/join','POST',{token:multi.token},extra);await call('/join','POST',{token:multi.token},extra,400);
 const multiList=await call('/groups/'+gid+'/invites','GET',undefined,a);assert.ok(multiList.invites.some(i=>i.maxUses===2&&i.useCount===2&&i.status==='used'));
 await call('/logout','POST',{},extra);
 await call('/logout','POST',{},a);await call('/session','GET',undefined,a,401);
 await call('/login','POST',{email:emails[0],password:'wrong-password'},undefined,401);
 const signedIn=await call('/login','POST',{email:emails[0],password});assert.equal(signedIn.user.id,a.user.id);await call('/logout','POST',{},signedIn);await call('/logout','POST',{},b);
 console.log(`PASS: ${checks} API checks (run ${run}); cleanup identifiers in .edge-test-run.json`);
}catch(error){console.error(error.message);process.exitCode=1;}

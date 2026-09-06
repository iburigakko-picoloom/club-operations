// Shared-state rules. Keep authorization and settlement history checks on the server.
export class HttpError extends Error { constructor(detail, status=400){super(detail);this.status=status;} }
export function fail(message,status=400){throw new HttpError(message,status);}
export const MODULES={events:'予定',tasks:'やること',notices:'お知らせ',people:'部員',attendance:'出欠',plans:'配車',settlements:'配車',venues:'体育館',venueAssignments:'体育館',training:'練習メニュー',equipment:'備品',settings:'設定',roles:'権限',group:'グループ'};
const ARRAYS=['people','events','tasks','notices','plans','venues','equipment','settlements'];
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function text(x,limit=2000,required=false){if(typeof x!=='string'||x.length>limit||(required&&!x.trim()))fail('文字の入力を確認してください');}
function number(x,low=0,high=1e8,nullable=false){if(nullable&&x==null)return;if(!Number.isInteger(x)||x<low||x>high)fail('数値の入力を確認してください');}
function array(x,max=10000){if(!Array.isArray(x)||x.length>max)fail('データ件数を確認してください');return x;}
function dict(x){if(!object(x))fail('データ形式が不正です');return x;}
export function isdate(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;}
const istime=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
export function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
export const equal=(a,b)=>canonical(a)===canonical(b);
const without=(x,keys)=>Object.fromEntries(Object.entries(x).filter(([k])=>!keys.includes(k)));
export function emptyState(id,name){return {schema:2,group:{id,name},people:[],events:[],tasks:[],notices:[],plans:[],venues:[],equipment:[],settlements:[],attendance:{},training:{categories:[],menus:[],sheets:[],history:[]},settings:{unitYen:null,reminders:['P7D','P1D']},roles:Object.fromEntries(Object.values(MODULES).filter(v=>!['設定','権限','グループ'].includes(v)).map(v=>[v,[]]))};}
export function seedAttendance(s,start=today()){
 const d=new Date(start+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+3);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));const end=d.toISOString().slice(0,10);
 for(const e of array(s.events))if(e.kind==='club'&&!e.cancelled&&e.date>=start&&e.date<=end)for(const p of array(s.people))if(p.active!==false&&(p.joinedDate||'0000')<=e.date){const key=e.id+'|'+p.id;if(!(key in dict(s.attendance)))s.attendance[key]=p.defaultOverride??p.seniority==='below';}
}
export function targeted(s,n,uid){if(n.assignmentNeedsReview)return false;if(n.targetMode==='role')return (n.targetRoles||[]).some(r=>(s.roles[r]||[]).includes(uid));return !n.assignees?.length||n.assignees.includes(uid);}
export function validate(s,operators){
 for(const key of ARRAYS){const ids=[];for(const x of array(s[key])){dict(x);text(x.id,100,true);ids.push(x.id);}if(new Set(ids).size!==ids.length)fail('同じデータが重複しています');}
 for(const k of ['group','settings','roles','attendance','training'])dict(s[k]);
 const ps=new Map(s.people.map(p=>[p.id,p])),es=new Map(s.events.map(e=>[e.id,e])),vs=new Set(s.venues.map(v=>v.id));
 const assignees=x=>{if(array(x||[]).some(id=>!operators.has(id)))fail('担当者を確認してください');};
 for(const p of s.people){text(p.name,80,true);text(p.memo??'');number(p.grade,1,6);if(!['above','below'].includes(p.seniority)||!['university','station'].includes(p.pickup))fail('部員の区分を確認してください');if(p.defaultOverride!=null&&typeof p.defaultOverride!=='boolean')fail('参加設定を確認してください');}
 for(const e of s.events){if(e.done!==undefined&&typeof e.done!=='boolean')fail('完了状態を確認してください');text(e.title,200,true);if(!['club','executive'].includes(e.kind)||!isdate(e.date))fail('予定の日時を確認してください');const end=e.endDate||e.date;if(!isdate(end)||end<e.date)fail('終了日を確認してください');for(const k of ['start','end'])if(e[k]&&!istime(e[k]))fail('時刻を確認してください');if(end===e.date&&e.start&&e.end&&e.end<e.start)fail('終了時刻を確認してください');if(e.venueId&&!vs.has(e.venueId))fail('体育館が見つかりません');assignees(e.assignees);if(e.courts!=null)number(e.courts,1,30);}
 for(const [eid,a] of Object.entries(dict(s.venueAssignments===undefined?{}:s.venueAssignments))){if(es.get(eid)?.kind!=='club'||!object(a)||!vs.has(a.venueId))fail('体育館割当を確認してください');}
 for(const t of s.tasks){text(t.title,200,true);if(!isdate(t.date)||!istime(t.time))fail('期限日時を確認してください');assignees(t.assignees);if(t.relatedEventId&&!es.has(t.relatedEventId))fail('関連予定を確認してください');}
 for(const n of s.notices){text(n.title,200,true);text(n.body,20000,true);assignees(n.assignees);if(n.targetRoles)array(n.targetRoles);}
 for(const [k,v] of Object.entries(s.attendance)){const [eid,mid,...extra]=k.split('|');if(extra.length||!es.has(eid)||!ps.has(mid)||typeof v!=='boolean')fail('出欠の対象を確認してください');}
 const usedEvents=new Set();
 for(const p of s.plans){const e=es.get(p.eventId);if(!e||e.kind!=='club')fail('配車は部活予定に紐付けてください');if(usedEvents.has(e.id))fail('この予定の配車はすでにあります');usedEvents.add(e.id);number(p.unitYen,0,1e6,true);if(!['draft','registered','cancelled'].includes(p.status))fail('配車状態を確認してください');
  if(!object(p.enabled)||['outbound','return'].some(l=>typeof p.enabled[l]!=='boolean'))fail('往復の対象設定を確認してください');dict(p.legs);dict(p.need);
  for(const leg of ['outbound','return']){const seen=new Set(),ids=new Set();if(p.legDates?.[leg]&&!isdate(p.legDates[leg]))fail('利用日を確認してください');for(const c of array(p.legs[leg])){dict(c);text(c.id,100,true);if(ids.has(c.id))fail('車が重複しています');ids.add(c.id);if(!['university','station'].includes(c.pickup))fail('配車区分を確認してください');const riders=array(c.riders),people=[...(c.driver?[c.driver]:[]),...riders];if(riders.length>3||people.length>4)fail('運転者を含め4人までです');for(const mid of people){if(!ps.has(mid)||seen.has(mid))fail('部員が不明または重複しています');seen.add(mid);}}for(const [mid,value] of Object.entries(dict(p.need[leg])))if(!ps.has(mid)||typeof value!=='boolean')fail('配車対象が不明です');}
  if(p.linked&&(!equal(p.legs.outbound,p.legs.return)||!equal(p.need.outbound,p.need.return)))fail('往復のデータが一致しません');
  for(const [k,a] of Object.entries(dict(p.adjustments||{}))){const [leg,mid,...rest]=k.split('|');if(rest.length||!['outbound','return'].includes(leg)||!ps.has(mid))fail('精算調整の対象を確認してください');dict(a);number(a.count,0,999,true);number(a.unitYen,0,1e6,true);}
 }
 for(const v of s.venues){text(v.name,120,true);number(v.courts,1,30);}
 for(const i of s.equipment){text(i.name,120,true);number(i.quantity);text(i.unit,20,true);number(i.threshold,0,1e6,true);}
 for(const ids of Object.values(s.roles))assignees(ids);
 number(s.settings.unitYen,0,1e6,true);
 const tr=s.training,cats=new Set(array(tr.categories).map(x=>{dict(x);text(x.id,100,true);return x.id;}));
 for(const m of array(tr.menus)){dict(m);text(m.name,150,true);number(m.seconds,0,86400);if(!cats.has(m.categoryId))fail('種目の分類を確認してください');}
 for(const sh of array(tr.sheets)){dict(sh);text(sh.title,200,true);if(sh.eventId&&!es.has(sh.eventId))fail('練習予定が見つかりません');if(array(sh.patterns||[4,5],2).some(p=>!Number.isInteger(p)||p<1||p>5))fail('人数パターンを確認してください');for(const row of array(sh.rows||[])){dict(row);text(row.name,150,true);number(row.seconds,0,86400);for(const v of Object.values(dict(row.sets||{})))number(v,0,999);}}
 text(s.group.name,100,true);
}
function validateRegistered(s,p){
 if(!Object.values(p.enabled).some(Boolean))fail('片道を1つ以上有効にしてください');const ps=new Map(s.people.map(m=>[m.id,m]));const part=m=>s.attendance[p.eventId+'|'+m.id]??m.defaultOverride??m.seniority==='below';
 for(const leg of ['outbound','return']){if(!p.enabled[leg])continue;const used=new Set();for(const c of p.legs[leg]){if(!c.driver)fail('運転者を指定してください');for(const mid of [c.driver,...c.riders]){const m=ps.get(mid);if(m.active===false||!part(m))fail('不参加の人が配車に含まれています');used.add(mid);}}for(const m of ps.values())if(m.active!==false&&part(m)&&(p.need[leg][m.id]??m.seniority==='below')&&!used.has(m.id))fail('未配車の部員がいます');}
}
export function updateState(old,changes,user,owner,gid,operators){
 dict(changes);if(Object.keys(changes).some(k=>!Object.hasOwn(MODULES,k)))fail('変更できない項目です');const s=structuredClone(old);
 for(const [key,input] of Object.entries(changes)){let value=structuredClone(input);
  if(['settings','roles','group'].includes(key)){if(user.id!==owner)fail('オーナーだけが変更できます',403);if(key==='group'&&value?.id!==gid)fail('グループが一致しません',403);}
  else if(user.id!==owner&&!(old.roles[MODULES[key]]||[]).includes(user.id)){
   if(!['tasks','events'].includes(key))fail('編集権限がありません',403);
   const prev=new Map(old[key].map(t=>[t.id,t]));array(value);if(value.length!==prev.size||new Set(value.map(t=>t.id)).size!==prev.size)fail('やることの編集権限がありません',403);
   for(const t of value){const a=prev.get(t.id);if(!a)fail('やることの編集権限がありません',403);if(equal(a,t))continue;if(key==='events'&&a.kind!=='executive')fail('編集権限がありません',403);if(a.assignmentNeedsReview)fail('担当者の再設定が必要です',403);if(a.assignees?.length&&!a.assignees.includes(user.id))fail('担当者ではありません',403);if(!equal(without(a,['done','completedAt','completedBy']),without(t,['done','completedAt','completedBy'])))fail('完了操作だけ可能です',403);}
  }
  if(key==='notices'&&user.id!==owner){array(value);const hidden=old.notices.filter(n=>!targeted(old,n,user.id)),ids=new Set(value.map(n=>n.id));if(hidden.some(n=>ids.has(n.id)))fail('非公開のお知らせは編集できません',403);value=[...value,...hidden];}s[key]=value;
 }
 // Validate the shape before seeding; malformed client data must not cause an internal error.
 validate(s,operators);seedAttendance(s);if(s.group.id!==gid)fail('グループが一致しません',403);
 const snapshots=new Map(s.settlements.map(x=>[x.id,x]));for(const prev of old.settlements){const cur=snapshots.get(prev.id);if(!cur)fail('精算履歴は削除できません');if(!equal(without(prev,['locked']),without(cur,['locked'])))fail('精算履歴は直接変更できません');if(!prev.locked&&cur.locked)fail('再確定は新しい履歴として保存してください');}
 for(const key of ['events','people'])if(old[key].some(x=>!s[key].some(y=>y.id===x.id)))fail(key==='events'?'予定は削除ではなく中止してください':'部員は削除ではなく在籍状態を変更してください');
 const prior=new Map(old.plans.map(p=>[p.id,p])),locked=new Set(old.settlements.filter(x=>x.locked).flatMap(x=>x.planIds||[]));
 for(const id of locked)if(prior.has(id)&&!s.plans.some(p=>p.id===id))fail('精算確定済みの配車は削除できません。先に月の確定を解除してください',409);
 for(const p of s.plans){if(locked.has(p.id)&&!equal(p,prior.get(p.id)))fail('精算確定済みです。先に月の確定を解除してください',409);if(!equal(p,prior.get(p.id))&&p.status==='registered')validateRegistered(s,p);}
 for(const p of old.plans)if(locked.has(p.id)&&!equal(s.events.find(e=>e.id===p.eventId),old.events.find(e=>e.id===p.eventId)))fail('精算確定済みの予定は変更できません',409);
 for(const key of ['events','tasks','notices','equipment'])if(Object.hasOwn(changes,key))for(const x of s[key]){const prev=old[key].find(y=>y.id===x.id);if(equal(x,prev))continue;x.updatedAt=new Date().toISOString();x.updatedBy=user.id;if(key==='notices'){x.author=prev?.author??user.name;x.authorId=prev?.authorId??user.id;x.date=prev?.date??today();}if(key==='tasks'||(key==='events'&&x.kind==='executive')){x.completedBy=x.done?user.id:null;x.completedAt=x.done?new Date().toISOString():null;}}
 return s;
}

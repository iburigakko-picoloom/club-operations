import {fail,text,object,isdate} from './domain.mjs';

const validStatuses=new Set(['unpaid','paid','undetermined']);
const cleanText=(value,label,max,required=false)=>{text(value,max,required);return value.trim();};
function dateValue(value,optional=false){if(optional&&(value==null||value===''))return null;if(!isdate(value))fail('日付を確認してください');return value;}
function amountValue(value,optional=false,positive=false){if(optional&&value==null)return null;if(!Number.isInteger(value)||value<(positive?1:0)||value>1_000_000_000)fail('金額を確認してください');return value;}
function validId(value,label='ID'){text(value,100,true);return value;}
function currentAttendance(s,eventId,p){if(!eventId)return null;const value=s.attendance?.[eventId+'|'+p.id];const present=typeof value==='boolean'?value:(typeof p.defaultOverride==='boolean'?p.defaultOverride:p.seniority==='below');return present?'present':'absent';}
function validateEvent(s,eventId){if(eventId&&!s.events.some(e=>e.id===eventId))fail('関連予定が見つかりません');return eventId||null;}
function buildRows(s,b){
 const eventId=validateEvent(s,b.eventId||null),people=new Map(s.people.map(p=>[p.id,p]));
 if(!Array.isArray(b.memberIds)||b.memberIds.length>1000||b.memberIds.some(id=>typeof id!=='string')||new Set(b.memberIds).size!==b.memberIds.length)fail('徴収対象を確認してください');
 if(b.memberIds.some(id=>!people.has(id)))fail('部員が見つかりません');
 const unresolved=b.unresolvedMemberIds??[];if(!Array.isArray(unresolved)||new Set(unresolved).size!==unresolved.length||unresolved.some(id=>!b.memberIds.includes(id)))fail('未確定の対象を確認してください');
 const overrides=b.amountOverrides??{};if(!object(overrides)||Object.keys(overrides).some(id=>!b.memberIds.includes(id)))fail('個別金額を確認してください');
 const present=amountValue(b.presentAmount??b.defaultAmount??0),absent=amountValue(b.absentAmount??present),defaultAmount=amountValue(b.defaultAmount??present);
 return {eventId,rows:b.memberIds.map(mid=>{const snapshotStatus=currentAttendance(s,eventId,people.get(mid));if(unresolved.includes(mid))return {memberId:mid,snapshotStatus,amount:null,status:'undetermined',note:''};const base=eventId?(snapshotStatus==='present'?present:absent):defaultAmount;return {memberId:mid,snapshotStatus,amount:amountValue(Object.hasOwn(overrides,mid)?overrides[mid]:base),status:'unpaid',note:''};})};
}
const mapMember=r=>({memberId:r.member_id,snapshotStatus:r.snapshot_status,amount:r.amount,status:r.status,paidAt:r.paid_at,note:r.note,createdAt:r.created_at,updatedAt:r.updated_at});
const mapCollection=r=>({id:r.id,title:r.title,note:r.note,dueDate:r.due_date,eventId:r.event_id,status:r.status,createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at});
const mapTransaction=r=>({id:r.id,kind:r.kind,title:r.title,amount:r.amount,date:r.date,category:r.category,memo:r.memo,eventId:r.event_id,createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at});

export async function readAccounting(query,gid,s){
 const rows=await query('SELECT * FROM club.accounting_collections WHERE group_id=$1 ORDER BY created_at DESC,id DESC',[gid]);
 const allMembers=await query('SELECT * FROM club.accounting_collection_members WHERE group_id=$1 ORDER BY created_at,member_id',[gid]);
 const transactions=(await query('SELECT * FROM club.accounting_transactions WHERE group_id=$1 ORDER BY date DESC,created_at DESC,id DESC',[gid])).map(mapTransaction);
 const people=new Map(s.people.map(p=>[p.id,p]));
 const events=new Map(s.events.map(e=>[e.id,e]));
 const membersByCollection=new Map();for(const r of allMembers){const item=mapMember(r),person=people.get(item.memberId);item.memberName=person?.name||'';item.grade=person?.grade??null;item.active=person?.active!==false;if(!membersByCollection.has(r.collection_id))membersByCollection.set(r.collection_id,[]);membersByCollection.get(r.collection_id).push(item);}
 const collections=rows.map(r=>({...mapCollection(r),eventTitle:events.get(r.event_id)?.title||'',members:membersByCollection.get(r.id)||[]}));
 for(const tx of transactions)tx.eventTitle=events.get(tx.eventId)?.title||'';
 const received=collections.flatMap(c=>c.members).filter(m=>m.status==='paid').reduce((sum,m)=>sum+(m.amount||0),0);
 const outstanding=collections.flatMap(c=>c.members).filter(m=>m.status==='unpaid').reduce((sum,m)=>sum+(m.amount||0),0);
 const undeterminedCount=collections.flatMap(c=>c.members).filter(m=>m.status==='undetermined').length;
 const otherIncome=transactions.filter(t=>t.kind==='income').reduce((sum,t)=>sum+t.amount,0);
 const expense=transactions.filter(t=>t.kind==='expense').reduce((sum,t)=>sum+t.amount,0);
 const history=transactions.map(t=>({id:t.id,source:'transaction',kind:t.kind,date:t.date,title:t.title,category:t.category,amount:t.amount,eventId:t.eventId}));
 for(const c of collections)for(const m of c.members)if(m.status==='paid'&&m.paidAt)history.push({id:c.id+':'+m.memberId,source:'collection',kind:'income',date:m.paidAt.slice(0,10),title:c.title+' · '+(m.memberName||'部員'),category:'徴収',amount:m.amount||0,collectionId:c.id,eventId:c.eventId});
 history.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 return {collections,transactions,history,summary:{income:otherIncome+received,collectionIncome:received,otherIncome,expense,balance:otherIncome+received-expense,outstanding,undeterminedCount}};
}

export async function createCollection(query,{gid,userId,s,b,now,id}){
 const title=cleanText(b.title,'名称',120,true),note=cleanText(b.note??'','メモ',2000),dueDate=dateValue(b.dueDate,true),{eventId,rows}=buildRows(s,b);
 if(!rows.length)fail('徴収対象を選択してください');
 await query("INSERT INTO club.accounting_collections(id,group_id,title,note,due_date,event_id,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$8)",[id,gid,title,note,dueDate,eventId,userId,now]);
 for(const row of rows)await query('INSERT INTO club.accounting_collection_members(group_id,collection_id,member_id,snapshot_status,amount,status,paid_at,note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$8)',[gid,id,row.memberId,row.snapshotStatus,row.amount,row.status,row.note,now]);
}

export async function updateCollection(query,{gid,id,s,b,now}){
 validId(id,'徴収ID');const [old]=await query('SELECT * FROM club.accounting_collections WHERE group_id=$1 AND id=$2',[gid,id]);if(!old)fail('徴収が見つかりません',404);
 if(Object.keys(b).some(k=>!['title','note','dueDate','eventId','status'].includes(k)))fail('変更できない項目です');
 const title=Object.hasOwn(b,'title')?cleanText(b.title,'名称',120,true):old.title,note=Object.hasOwn(b,'note')?cleanText(b.note,'メモ',2000):old.note,dueDate=Object.hasOwn(b,'dueDate')?dateValue(b.dueDate,true):old.due_date,eventId=Object.hasOwn(b,'eventId')?validateEvent(s,b.eventId):old.event_id,status=Object.hasOwn(b,'status')?b.status:old.status;
 if(!['open','closed'].includes(status))fail('徴収状態を確認してください');
 await query('UPDATE club.accounting_collections SET title=$1,note=$2,due_date=$3,event_id=$4,status=$5,updated_at=$6 WHERE group_id=$7 AND id=$8',[title,note,dueDate,eventId,status,now,gid,id]);
}

export async function deleteCollection(query,{gid,id}){
 validId(id,'徴収ID');const [paid]=await query("SELECT 1 FROM club.accounting_collection_members WHERE group_id=$1 AND collection_id=$2 AND status='paid' LIMIT 1",[gid,id]);if(paid)fail('支払済みの記録がある徴収は削除できません',409);
 const result=await query('DELETE FROM club.accounting_collections WHERE group_id=$1 AND id=$2 RETURNING id',[gid,id]);if(!result.length)fail('徴収が見つかりません',404);
}

export async function addCollectionMember(query,{gid,id,s,b,now}){
 const [collection]=await query('SELECT event_id FROM club.accounting_collections WHERE group_id=$1 AND id=$2',[gid,id]);if(!collection)fail('徴収が見つかりません',404);
 const memberId=validId(b.memberId,'部員ID'),person=s.people.find(p=>p.id===memberId);if(!person)fail('部員が見つかりません');
 const unresolved=b.unresolved===true,snapshotStatus=currentAttendance(s,collection.event_id,person),amount=unresolved?null:amountValue(b.amount),status=unresolved?'undetermined':'unpaid';
 const note=cleanText(b.note??'','メモ',500);
 await query('INSERT INTO club.accounting_collection_members(group_id,collection_id,member_id,snapshot_status,amount,status,paid_at,note,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$8)',[gid,id,memberId,snapshotStatus,amount,status,note,now]);
}

export async function updateCollectionMembers(query,{gid,id,b,now}){
 if(Object.keys(b).some(k=>!['memberIds','status'].includes(k))||!Array.isArray(b.memberIds)||b.memberIds.length>1000||new Set(b.memberIds).size!==b.memberIds.length||b.memberIds.some(x=>typeof x!=='string')||!['paid','unpaid'].includes(b.status))fail('一括変更の内容を確認してください');
 const [collection]=await query('SELECT id FROM club.accounting_collections WHERE group_id=$1 AND id=$2',[gid,id]);if(!collection)fail('徴収が見つかりません',404);
 const rows=[];for(const mid of b.memberIds){const [row]=await query('SELECT amount,status,paid_at FROM club.accounting_collection_members WHERE group_id=$1 AND collection_id=$2 AND member_id=$3',[gid,id,mid]);if(!row)fail('徴収対象が見つかりません',404);if(row.status==='undetermined')fail('未確定の人は金額を決めてから状態を変更してください');if(b.status==='paid'&&row.amount==null)fail('金額を確認してください');rows.push({mid,...row});}
 for(const row of rows)await query('UPDATE club.accounting_collection_members SET status=$1,paid_at=$2,updated_at=$3 WHERE group_id=$4 AND collection_id=$5 AND member_id=$6',[b.status,b.status==='paid'?(row.status==='paid'?row.paid_at:now):null,now,gid,id,row.mid]);
}

export async function updateCollectionMember(query,{gid,id,memberId,b,now}){
 const [row]=await query('SELECT * FROM club.accounting_collection_members WHERE group_id=$1 AND collection_id=$2 AND member_id=$3',[gid,id,memberId]);if(!row)fail('徴収対象が見つかりません',404);
 if(Object.keys(b).some(k=>!['amount','status','note'].includes(k)))fail('変更できない項目です');
 if(row.status==='paid'&&(Object.hasOwn(b,'amount')||Object.hasOwn(b,'note')))fail('支払済みの金額・メモを変えるには、先に未払いに戻してください',409);
 let amount=Object.hasOwn(b,'amount')?amountValue(b.amount,true):row.amount,status=Object.hasOwn(b,'status')?b.status:row.status,note=Object.hasOwn(b,'note')?cleanText(b.note,'メモ',500):row.note,paidAt=row.paid_at;
 if(!validStatuses.has(status))fail('支払状態を確認してください');
 if(Object.hasOwn(b,'amount')&&status==='paid')fail('金額を変えるときは未払い状態にしてください');
 if(status==='undetermined'){if(amount!==null)fail('未確定には金額を設定できません');paidAt=null;}
 else{if(amount===null)fail('金額を決めてください');paidAt=status==='paid'?(row.status==='paid'&&row.paid_at?row.paid_at:now):null;}
 await query('UPDATE club.accounting_collection_members SET amount=$1,status=$2,paid_at=$3,note=$4,updated_at=$5 WHERE group_id=$6 AND collection_id=$7 AND member_id=$8',[amount,status,paidAt,note,now,gid,id,memberId]);
}

export async function deleteCollectionMember(query,{gid,id,memberId}){
 const [row]=await query('SELECT status FROM club.accounting_collection_members WHERE group_id=$1 AND collection_id=$2 AND member_id=$3',[gid,id,memberId]);if(!row)fail('徴収対象が見つかりません',404);if(row.status==='paid')fail('支払済みの記録は削除できません',409);
 await query('DELETE FROM club.accounting_collection_members WHERE group_id=$1 AND collection_id=$2 AND member_id=$3',[gid,id,memberId]);
}

function transactionValues(s,b,old=null){
 const allowed=['kind','title','amount','date','category','memo','eventId'];if(Object.keys(b).some(k=>!allowed.includes(k)))fail('変更できない項目です');
 const kind=Object.hasOwn(b,'kind')?b.kind:old.kind;if(!['income','expense'].includes(kind))fail('収支区分を確認してください');
 const title=Object.hasOwn(b,'title')?cleanText(b.title,'名称',120,true):old.title,amount=Object.hasOwn(b,'amount')?amountValue(b.amount,false,true):old.amount,date=Object.hasOwn(b,'date')?dateValue(b.date):old.date,category=Object.hasOwn(b,'category')?cleanText(b.category,'分類',80):old.category,memo=Object.hasOwn(b,'memo')?cleanText(b.memo,'メモ',2000):old.memo,eventId=Object.hasOwn(b,'eventId')?validateEvent(s,b.eventId):old.event_id;
 return {kind,title,amount,date,category,memo,eventId};
}
export async function createTransaction(query,{gid,userId,s,b,now,id}){
 const v=transactionValues(s,b,{kind:null,title:'',amount:null,date:'',category:'',memo:'',event_id:null});
 await query('INSERT INTO club.accounting_transactions(id,group_id,kind,title,amount,date,category,memo,event_id,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)',[id,gid,v.kind,v.title,v.amount,v.date,v.category,v.memo,v.eventId,userId,now]);
}
export async function updateTransaction(query,{gid,id,s,b,now}){
 const [old]=await query('SELECT * FROM club.accounting_transactions WHERE group_id=$1 AND id=$2',[gid,id]);if(!old)fail('取引が見つかりません',404);
 const v=transactionValues(s,b,old);await query('UPDATE club.accounting_transactions SET kind=$1,title=$2,amount=$3,date=$4,category=$5,memo=$6,event_id=$7,updated_at=$8 WHERE group_id=$9 AND id=$10',[v.kind,v.title,v.amount,v.date,v.category,v.memo,v.eventId,now,gid,id]);
}
export async function deleteTransaction(query,{gid,id}){const result=await query('DELETE FROM club.accounting_transactions WHERE group_id=$1 AND id=$2 RETURNING id',[gid,id]);if(!result.length)fail('取引が見つかりません',404);}

/* Framework-independent domain functions. No DOM, network, or mutable globals. */
(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const iso=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&iso(d)===s;}
function date(s){if(!validDate(s))throw Error('日付を確認してください');return new Date(s+'T12:00:00Z');}
function addDays(s,n){const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function addMonths(s,n){const d=date(s),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d);}
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function validTime(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');}
function secondsText(n){n=Math.max(0,Math.round(n));return `${Math.floor(n/60)}分${n%60?' '+n%60+'秒':''}`;}
function defaultAttendance(p){return p.defaultOverride===null||p.defaultOverride===undefined?p.seniority==='below':p.defaultOverride;}
function seedAttendance(s,from=today()){
 s.attendance ||= {};const until=addMonths(from,3);
 for(const e of s.events.filter(e=>e.kind==='club'&&!e.cancelled&&e.date>=from&&e.date<=until))
 for(const p of s.people.filter(p=>p.active!==false&&(!p.joinedDate||p.joinedDate<=e.date))){const k=e.id+'|'+p.id;if(!(k in s.attendance))s.attendance[k]=defaultAttendance(p);}
 return s;
}
function datesFor({date:dt,endDate,mode='single',repeatUntil,weekdays=[],selectedDates=[]}){
 date(dt);if(endDate&&(!validDate(endDate)||endDate<dt))throw Error('終了日を確認してください');
 if(mode==='single')return [dt];
 if(mode==='multiple'){const a=[...new Set(selectedDates)].sort();if(!a.length||a.some(x=>!validDate(x)))throw Error('日付を選択してください');if(a.length>120)throw Error('一度に120日まで');return a;}
 if(mode!=='weekly'||!validDate(repeatUntil)||repeatUntil<dt||repeatUntil>addMonths(dt,12))throw Error('繰り返し期間は1年以内で設定してください');
 if(!weekdays.length)throw Error('曜日を選択してください');
 const days=[];for(let d=dt;d<=repeatUntil;d=addDays(d,1))if(weekdays.includes(date(d).getUTCDay()))days.push(d);
 if(!days.length)throw Error('期間内に対象日がありません');if(days.length>120)throw Error('一度に120日まで');return days;
}
function calendarItems(s,day,showExec){
 let out=s.events.filter(e=>!e.cancelled&&!e.done&&e.date<=day&&(e.endDate||e.date)>=day&&(e.kind==='club'||showExec)).map(e=>({id:e.id,type:'event',kind:e.kind,title:e.title,time:e.start||'',end:e.end||'',venueId:e.venueId,assignees:e.assignees||[]}));
 if(showExec)out.push(...s.tasks.filter(t=>!t.done&&!t.deleted&&t.date===day).map(t=>({id:t.id,type:'task',kind:'task',title:t.title+'（締切）',time:t.time,assignees:t.assignees||[]})));
 return out.sort((a,b)=>a.time.localeCompare(b.time)||a.type.localeCompare(b.type));
}
function trainingTotals(rows,patterns=[4,5]){
 const pats=[...new Set(patterns.map(Number))].sort((a,b)=>a-b);if(pats.length>2||pats.some(p=>!Number.isInteger(p)||p<1||p>5))throw Error('人数パターンは1〜5人から2つまで');
 if(rows.some(r=>r.requiresSets)&&!pats.length)throw Error('人数パターンを選択してください');
 const totals={};for(const p of pats)totals[p]={sets:0,peopleSets:0,seconds:0};let fixed=0;const mismatchMenus=[];
 for(const row of rows){if(!Number.isInteger(row.seconds)||row.seconds<0)throw Error('時間は0以上の秒数で入力してください');
  if(!row.requiresSets){fixed+=row.seconds;continue;}
  const peopleSets=pats.map(p=>{const count=Number(row.sets?.[p]??0);if(!Number.isInteger(count)||count<0||count>999)throw Error('セット数を確認してください');return count*p;});
  if(peopleSets.length>1&&peopleSets.some(v=>v!==peopleSets[0]))mismatchMenus.push(row.name||'種目');
  pats.forEach((p,i)=>{const count=Number(row.sets?.[p]??0);totals[p].sets+=count;totals[p].peopleSets+=peopleSets[i];totals[p].seconds+=row.seconds*peopleSets[i];});
 }
 for(const p of pats)totals[p].seconds+=fixed;
 // `seconds` is kept as a compatibility field for older callers. The UI must show each pattern's own time.
 const basis=pats.length?Math.max(...pats):null;return {patterns:pats,totals,basis,seconds:basis?totals[basis].seconds:fixed,fixed,mismatch:pats.length>1&&pats.some(p=>totals[p].peopleSets!==totals[pats[0]].peopleSets),mismatchMenus};
}
function reconcileAbsent(s,eventIds){
 const locked=new Set((s.settlements||[]).filter(x=>x.locked).flatMap(x=>x.planIds||[]));
 for(const p of s.plans){const eventDate=s.events.find(e=>e.id===p.eventId)?.date;if(!eventIds.includes(p.eventId)||locked.has(p.id)||eventDate<today())continue;let changed=false;
  for(const leg of ['outbound','return'])for(const car of p.legs[leg]){
   if(car.driver&&!participating(s,p.eventId,car.driver)){car.driver=null;changed=true;}
   const riders=car.riders.filter(id=>participating(s,p.eventId,id));if(riders.length!==car.riders.length){car.riders=riders;changed=true;}
  }
  if(changed){p.version=(p.version||0)+1;}
 }
}
function planPeople(car){return [car.driver,...(car.riders||[])].filter(Boolean);}
function participating(s,eid,mid){const p=s.people.find(p=>p.id===mid);return Boolean(p&&p.active!==false&&(s.attendance[eid+'|'+mid]??defaultAttendance(p)));}
function need(s,p,leg,mid){return p.need?.[leg]?.[mid]??(s.people.find(m=>m.id===mid)?.seniority==='below');}
function missing(s,p,leg){const used=new Set(p.legs[leg].flatMap(planPeople));return s.people.filter(m=>participating(s,p.eventId,m.id)&&need(s,p,leg,m.id)&&!used.has(m.id)).map(m=>m.id);}
function planErrors(s,p){const errors=[];if(!p.enabled.outbound&&!p.enabled.return)errors.push('片道を1つ以上有効にしてください');
 for(const leg of ['outbound','return']){if(!p.enabled[leg])continue;const used=new Set();for(const c of p.legs[leg]){if(!c.driver)errors.push('運転者を指定');if(planPeople(c).length>5||c.riders.length>4)errors.push('運転者を含め5人まで');for(const mid of planPeople(c)){if(used.has(mid))errors.push('重複しています');used.add(mid);if(!participating(s,p.eventId,mid))errors.push('不参加の人が含まれています');}}const n=missing(s,p,leg).length;if(n)errors.push(`${leg==='outbound'?'行き':'帰り'}：未配車${n}人`);}
 return [...new Set(errors)];}
function move(s,p,mid,dest,leg){
 if(!participating(s,p.eventId,mid))throw Error('参加者から選択してください');if(!p.enabled[leg])throw Error('この片道は対象外です');
 const next=copy(p),cars=next.legs[leg];for(const c of cars){if(c.driver===mid)c.driver=null;c.riders=c.riders.filter(id=>id!==mid);}
 const c=cars.find(c=>c.id===dest.carId);
 if(dest.kind==='new')cars.push({id:dest.newId,pickup:dest.pickup,driver:mid,riders:[]});
 else if(dest.kind==='driver'){if(!c)throw Error('車が見つかりません');c.driver=mid;}
 else if(dest.kind==='passenger'){if(!c)throw Error('車が見つかりません');if(c.riders.length>=4)throw Error('同乗者は4人まで');c.riders.push(mid);}
 else if(dest.kind!=='pool')throw Error('移動先を確認してください');
 if(next.linked)next.legs[leg==='outbound'?'return':'outbound']=copy(cars);
 next.version=(next.version||0)+1;return next;
}
const EVENT_COST_KEYS=['gasoline','toll','parking','otherTransport','other'];
function eventCostTotal(cost={}){return EVENT_COST_KEYS.reduce((total,key)=>total+(Number.isInteger(cost[key])?cost[key]:0),0);}
function mergeEventCosts(p,targetLeg){
 if(!['outbound','return'].includes(targetLeg))throw Error('行き・帰りを確認してください');
 const otherLeg=targetLeg==='outbound'?'return':'outbound',targetCars=p.legs?.[targetLeg]||[],merged={};
 for(const leg of [targetLeg,otherLeg])for(const [carId,cost] of Object.entries(p.eventCosts?.[leg]||{})){
  if(!eventCostTotal(cost))continue;
  const sourceCar=p.legs?.[leg]?.find(car=>car.id===carId),targetCar=targetCars.find(car=>car.id===carId)||(sourceCar?.driver?targetCars.find(car=>car.driver===sourceCar.driver):null);
  if(!targetCar)throw Error('実費を残すため、行き・帰りで同じ運転者の車にまとめてください');
  merged[targetCar.id]||={};for(const key of EVENT_COST_KEYS)merged[targetCar.id][key]=(merged[targetCar.id][key]||0)+(Number.isInteger(cost[key])?cost[key]:0);
 }
 return {outbound:merged,return:{}};
}
function eventFeeSplit(total,occupants){
 if(!Number.isInteger(total)||total<0||!Number.isInteger(occupants)||occupants<1)throw Error('イベント配車の金額と人数を確認してください');
 const perPerson=Math.round(total/occupants/10)*10;
 return {total,occupants,perPerson,driverReceives:perPerson*Math.max(0,occupants-1)};
}
function legacyFixedCarFee(s,p,c){
 const override=p.unitYenOverride;
 if(Number.isInteger(override))return override;
 const categoryFee=s.settings?.carpoolFees?.[c?.pickup];
 if(Number.isInteger(categoryFee))return categoryFee;
 return p.unitYen??s.settings?.unitYen??s.settings?.carpoolFees?.gym??null;
}
function fixedCarFee(s,p,c){return p.fareMode==='event'?legacyFixedCarFee(s,p,c):50;}
// Integer arithmetic also keeps ties stable across reordering and recalculation.
function allocateCollected(total,drivers){
 if(!Number.isSafeInteger(total)||total<0)throw Error('回収額を確認してください');
 const ids=new Set(),rows=drivers.map(row=>{
  if(typeof row.driver!=='string'||!row.driver||ids.has(row.driver)||!Number.isSafeInteger(row.weight)||row.weight<1)throw Error('運転者と配分の重みを確認してください');
  ids.add(row.driver);return {...row};
 }).sort((a,b)=>a.driver<b.driver?-1:a.driver>b.driver?1:0);
 if(!rows.length){if(total)throw Error('回収額を配分する運転者がいません');return [];}
 const weight=rows.reduce((n,row)=>n+BigInt(row.weight),0n),yen=BigInt(total);
 for(const row of rows){const ideal=yen*BigInt(row.weight);row.amount=Number(ideal/weight);row.remainder=ideal%weight;}
 const residual=total-rows.reduce((n,row)=>n+row.amount,0);
 const ranked=[...rows].sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:0);
 for(let i=0;i<residual;i++)ranked[i].amount++;
 return rows.map(({remainder,...row})=>row);
}
function legacySettlement(s,month,now=today()){
 const lines=new Map();for(const p of s.plans){const e=s.events.find(e=>e.id===p.eventId);if(!e||e.cancelled||p.status!=='registered'||p.excluded)continue;
 const legs=p.fareMode==='event'&&p.linked?['outbound']:['outbound','return'];
 for(const leg of legs){const day=p.legDates?.[leg]|| (leg==='return'?(e.endDate||e.date):e.date);if(!p.enabled[leg]||day.slice(0,7)!==month)continue;
 for(const c of p.legs[leg]){if(!c.driver)continue;
 if(p.fareMode==='event'){
  const cost=p.eventCosts?.[leg]?.[c.id]||{},total=['gasoline','toll','parking','otherTransport','other'].reduce((sum,key)=>sum+(Number.isInteger(cost[key])?cost[key]:0),0);
  const occupants=[...new Set([c.driver,...(c.riders||[])].filter(Boolean))];if(total<=0||!occupants.length)continue;
  const split=eventFeeSplit(total,occupants.length);for(const mid of occupants){if(mid===c.driver||split.perPerson===0)continue;
   const key=mid+'|'+c.driver,line=lines.get(key)||{rider:mid,driver:c.driver,count:0,amount:0,unset:false,details:[]};
   line.count++;line.amount+=split.perPerson;line.details.push({planId:p.id,eventId:e.id,date:day,leg,count:1,unitYen:split.perPerson,amount:split.perPerson,fareMode:'event',eventTotal:total,occupants:occupants.length,driverReceives:split.driverReceives,carId:c.id});lines.set(key,line);
  }
  continue;
 }
 for(const mid of c.riders){if(mid===c.driver)continue;
 const a=p.adjustments?.[leg+'|'+mid]||{};if(a.excluded)continue;const count=a.count??1,price=a.unitYen??legacyFixedCarFee(s,p,c);
 const key=mid+'|'+c.driver;let line=lines.get(key)||{rider:mid,driver:c.driver,count:0,amount:0,unset:false,details:[]};
 line.count+=count;line.unset ||= !Number.isFinite(price);if(Number.isFinite(price))line.amount+=count*price;
 line.details.push({planId:p.id,eventId:e.id,date:day,leg,count,unitYen:price,amount:Number.isFinite(price)?count*price:null,reason:a.reason||''});lines.set(key,line);
 }} }
 }return [...lines.values()];}
function normalSettlement(s,month){
 const locked=new Set((s.settlements||[]).filter(x=>x.locked).flatMap(x=>x.planIds||[])),days=new Map(),registeredPlans=new Set(),draftPlans=new Set();
 const dayFor=date=>{if(!days.has(date))days.set(date,{date,collections:[],drivers:new Map(),planIds:new Set(),errors:[]});return days.get(date);};
 for(const p of s.plans){const e=s.events.find(e=>e.id===p.eventId);
  if(!e||p.fareMode==='event'||locked.has(p.id))continue;
  const inMonth=['outbound','return'].some(leg=>p.enabled[leg]&&(p.legDates?.[leg]||(leg==='return'?(e.endDate||e.date):e.date)).slice(0,7)===month);
  if(inMonth&&!e.cancelled&&!p.excluded){if(p.status==='registered')registeredPlans.add(p.id);else if(p.status==='draft')draftPlans.add(p.id);}
  const hasCollected=Object.values(p.collections||{}).some(x=>x.status==='collected');
  const invalidStatus=e.cancelled||p.status!=='registered'||p.excluded;
  if(invalidStatus&&!hasCollected)continue;
  for(const leg of ['outbound','return']){
   const date=p.legDates?.[leg]||(leg==='return'?(e.endDate||e.date):e.date);
   const collectedLeg=Object.entries(p.collections||{}).some(([key,x])=>key.startsWith(leg+'|')&&x.status==='collected');
   if((!p.enabled[leg]&&!collectedLeg)||date.slice(0,7)!==month)continue;
   const day=dayFor(date);day.planIds.add(p.id);const used=new Set();
   if(invalidStatus||!p.enabled[leg])day.errors.push('回収済みの配車の状態・対象の片道を確認してください');
   // The weight belongs to a driven leg, never to the number of passengers.
   for(const c of p.legs[leg]){
    if(c.driver){const weight={university:2,station:3}[c.pickup];
     if(!weight)day.errors.push('大学配車・駅配車の区分を確認してください');
     else{const driver=day.drivers.get(c.driver)||{driver:c.driver,weight:0};driver.weight+=weight;day.drivers.set(c.driver,driver);}
    }else if(c.riders.length)day.errors.push('運転者を指定してください');
    for(const rider of new Set(c.riders)){
     if(rider===c.driver)continue;
     if(used.has(rider)){day.errors.push('同じ片道に同乗者が重複しています');continue;}used.add(rider);
     const receipt=p.collections?.[leg+'|'+rider];let collectedAmount=0,status='uncollected';
     if(receipt?.status==='collected'){
      if(!Number.isInteger(receipt.amount)||receipt.amount<0||receipt.amount>50)day.errors.push('回収額は0〜50円の整数で入力してください');
      else{collectedAmount=receipt.amount;status='collected';}
     }else if(receipt&&receipt.status!=='uncollected')day.errors.push('回収状態を確認してください');
     day.collections.push({planId:p.id,eventId:e.id,eventTitle:e.title||'',date,leg,carId:c.id,rider,count:1,unitYen:50,amount:50,expectedAmount:invalidStatus||!p.enabled[leg]?0:50,status,collectedAmount});
    }
   }
   // A retained receipt must not disappear silently after a seat is edited.
   for(const [key,receipt] of Object.entries(p.collections||{}))if(key.startsWith(leg+'|')&&receipt.status==='collected'&&!used.has(key.slice(leg.length+1))){
    if(Number.isInteger(receipt.amount)&&receipt.amount>=0&&receipt.amount<=50){day.collections.push({planId:p.id,eventId:e.id,eventTitle:e.title||'',date,leg,rider:key.slice(leg.length+1),count:0,unitYen:50,amount:0,expectedAmount:0,status:'collected',collectedAmount:receipt.amount,orphaned:true});}
    day.errors.push('回収済みの同乗者と配車の配置が一致しません');
   }
  }
 }
 const daily=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>{
  const collectedAmount=day.collections.reduce((n,x)=>n+x.collectedAmount,0),expectedAmount=day.collections.reduce((n,x)=>n+x.expectedAmount,0),uncollectedAmount=day.collections.reduce((n,x)=>n+Math.max(0,x.expectedAmount-x.collectedAmount),0);let payouts=[],plannedPayouts=[];
  if(!day.errors.length){try{const drivers=[...day.drivers.values()];payouts=allocateCollected(collectedAmount,drivers);plannedPayouts=allocateCollected(expectedAmount,drivers);}catch(error){day.errors.push(error.message);}}
  const paidAmount=payouts.reduce((n,x)=>n+x.amount,0),plannedPaidAmount=plannedPayouts.reduce((n,x)=>n+x.amount,0);
  return {...day,drivers:[...day.drivers.values()],planIds:[...day.planIds].sort(),errors:[...new Set(day.errors)],expectedAmount,uncollectedAmount,plannedPaidAmount,unallocatedPlannedAmount:expectedAmount-plannedPaidAmount,plannedPayouts,collectedAmount,paidAmount,unallocatedAmount:collectedAmount-paidAmount,payouts};
 });
 const payouts=new Map();for(const day of daily)for(const payment of day.payouts){const row=payouts.get(payment.driver)||{rider:'',driver:payment.driver,fareMode:'pooled',count:0,amount:0,unset:false,details:[]};row.amount+=payment.amount;row.details.push({date:day.date,amount:payment.amount,weight:payment.weight,collectedAmount:day.collectedAmount,planIds:day.planIds,fareMode:'pooled'});payouts.set(payment.driver,row);}
 const plannedPayouts=new Map();for(const day of daily)for(const payment of day.plannedPayouts){const row=plannedPayouts.get(payment.driver)||{rider:'',driver:payment.driver,fareMode:'pooled',count:0,amount:0,unset:false,details:[]};row.amount+=payment.amount;row.details.push({date:day.date,amount:payment.amount,weight:payment.weight,expectedAmount:day.expectedAmount,planIds:day.planIds,fareMode:'pooled'});plannedPayouts.set(payment.driver,row);}
 const byDriver=(a,b)=>a.driver<b.driver?-1:a.driver>b.driver?1:0;
 return {days:daily,collections:daily.flatMap(x=>x.collections),payouts:[...payouts.values()].sort(byDriver),plannedPayouts:[...plannedPayouts.values()].sort(byDriver),expectedAmount:daily.reduce((n,x)=>n+x.expectedAmount,0),uncollectedAmount:daily.reduce((n,x)=>n+x.uncollectedAmount,0),plannedPaidAmount:daily.reduce((n,x)=>n+x.plannedPaidAmount,0),registeredPlanCount:registeredPlans.size,draftPlanCount:draftPlans.size,errors:daily.flatMap(x=>x.errors.map(message=>({date:x.date,message}))),collectedAmount:daily.reduce((n,x)=>n+x.collectedAmount,0),paidAmount:daily.reduce((n,x)=>n+x.paidAmount,0)};
}
function settlement(s,month,now=today()){
 const eventLines=legacySettlement({...s,plans:s.plans.filter(p=>p.fareMode==='event')},month,now);
 return [...normalSettlement(s,month).payouts,...eventLines];
}
function importLegacyTraining(s,data){if(!data||!Array.isArray(data.menus)||!Array.isArray(data.categories))throw Error('メニューのJSONを確認してください');const out=copy(s);out.training ||= {menus:[],categories:[],sheets:[]};let added=0;
 for(const cat of data.categories){if(!cat.id||typeof cat.name!=='string')throw Error('分類が不正です');if(!out.training.categories.some(c=>c.id===cat.id))out.training.categories.push({id:cat.id,name:cat.name});}
 for(const menu of data.menus){const seconds=menu.seconds??Number(menu.minutes||0)*60;if(!menu.id||!menu.name||!Number.isInteger(seconds)||seconds<0)throw Error('種目が不正です');if(!out.training.menus.some(m=>m.id===menu.id)){out.training.menus.push({id:menu.id,name:menu.name,categoryId:menu.categoryId,seconds,requiresSets:menu.requiresSets!==false});added++;}}
 return {state:out,added};}
root.ClubDomain={copy,validDate,validTime,addDays,addMonths,today,secondsText,defaultAttendance,seedAttendance,datesFor,calendarItems,trainingTotals,reconcileAbsent,planPeople,participating,need,missing,planErrors,move,eventFeeSplit,mergeEventCosts,legacyFixedCarFee,fixedCarFee,allocateCollected,legacySettlement,normalSettlement,settlement,importLegacyTraining};
if(typeof module!=='undefined')module.exports=root.ClubDomain;
})(typeof globalThis!=='undefined'?globalThis:this);

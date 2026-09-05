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
 let out=s.events.filter(e=>!e.cancelled&&e.date<=day&&(e.endDate||e.date)>=day&&(e.kind==='club'||showExec)).map(e=>({id:e.id,type:'event',kind:e.kind,title:e.title,time:e.start||'',end:e.end||'',venueId:e.venueId,assignees:e.assignees||[]}));
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
 const basis=pats.length?Math.max(...pats):null;return {patterns:pats,totals,basis,seconds:basis?totals[basis].seconds:fixed,fixed,mismatch:mismatchMenus.length>0,mismatchMenus};
}
function planPeople(car){return [car.driver,...(car.riders||[])].filter(Boolean);}
function participating(s,eid,mid){const p=s.people.find(p=>p.id===mid);return Boolean(p&&p.active!==false&&(s.attendance[eid+'|'+mid]??defaultAttendance(p)));}
function need(s,p,leg,mid){return p.need?.[leg]?.[mid]??(s.people.find(m=>m.id===mid)?.seniority==='below');}
function missing(s,p,leg){const used=new Set(p.legs[leg].flatMap(planPeople));return s.people.filter(m=>participating(s,p.eventId,m.id)&&need(s,p,leg,m.id)&&!used.has(m.id)).map(m=>m.id);}
function planErrors(s,p){const errors=[];if(!p.enabled.outbound&&!p.enabled.return)errors.push('片道を1つ以上有効にしてください');
 for(const leg of ['outbound','return']){if(!p.enabled[leg])continue;const used=new Set();for(const c of p.legs[leg]){if(!c.driver)errors.push('運転者を指定');if(planPeople(c).length>4||c.riders.length>3)errors.push('4人まで');for(const mid of planPeople(c)){if(used.has(mid))errors.push('重複しています');used.add(mid);if(!participating(s,p.eventId,mid))errors.push('不参加の人が含まれています');}}const n=missing(s,p,leg).length;if(n)errors.push(`${leg==='outbound'?'行き':'帰り'}：未配車${n}人`);}
 return [...new Set(errors)];}
function move(s,p,mid,dest,leg){
 if(!participating(s,p.eventId,mid))throw Error('参加者から選択してください');if(!p.enabled[leg])throw Error('この片道は対象外です');
 const next=copy(p),cars=next.legs[leg];for(const c of cars){if(c.driver===mid)c.driver=null;c.riders=c.riders.filter(id=>id!==mid);}
 const c=cars.find(c=>c.id===dest.carId);
 if(dest.kind==='new')cars.push({id:dest.newId,pickup:dest.pickup,driver:mid,riders:[]});
 else if(dest.kind==='driver'){if(!c)throw Error('車が見つかりません');c.driver=mid;}
 else if(dest.kind==='passenger'){if(!c)throw Error('車が見つかりません');if(c.riders.length>=3)throw Error('4人まで');c.riders.push(mid);}
 else if(dest.kind!=='pool')throw Error('移動先を確認してください');
 if(next.linked)next.legs[leg==='outbound'?'return':'outbound']=copy(cars);
 next.status='draft';next.version=(next.version||0)+1;return next;
}
function settlement(s,month,now=today()){
 const lines=new Map();for(const p of s.plans){const e=s.events.find(e=>e.id===p.eventId);if(!e||e.cancelled||p.status!=='registered'||p.excluded)continue;
 for(const leg of ['outbound','return']){const day=p.legDates?.[leg]||e.date;if(!p.enabled[leg]||day>now||day.slice(0,7)!==month)continue;
 for(const c of p.legs[leg]){if(!c.driver)continue;for(const mid of c.riders){if(mid===c.driver)continue;
 const a=p.adjustments?.[leg+'|'+mid]||{};if(a.excluded)continue;const count=a.count??1,price=a.unitYen??p.unitYen;
 const key=mid+'|'+c.driver;let line=lines.get(key)||{rider:mid,driver:c.driver,count:0,amount:0,unset:false,details:[]};
 line.count+=count;line.unset ||= !Number.isFinite(price);if(Number.isFinite(price))line.amount+=count*price;
 line.details.push({planId:p.id,eventId:e.id,date:day,leg,count,unitYen:price,amount:Number.isFinite(price)?count*price:null,reason:a.reason||''});lines.set(key,line);
 }}}
 }return [...lines.values()];}
function importLegacyTraining(s,data){if(!data||!Array.isArray(data.menus)||!Array.isArray(data.categories))throw Error('メニューのJSONを確認してください');const out=copy(s);out.training ||= {menus:[],categories:[],sheets:[]};let added=0;
 for(const cat of data.categories){if(!cat.id||typeof cat.name!=='string')throw Error('分類が不正です');if(!out.training.categories.some(c=>c.id===cat.id))out.training.categories.push({id:cat.id,name:cat.name});}
 for(const menu of data.menus){const seconds=menu.seconds??Number(menu.minutes||0)*60;if(!menu.id||!menu.name||!Number.isInteger(seconds)||seconds<0)throw Error('種目が不正です');if(!out.training.menus.some(m=>m.id===menu.id)){out.training.menus.push({id:menu.id,name:menu.name,categoryId:menu.categoryId,seconds,requiresSets:menu.requiresSets!==false});added++;}}
 return {state:out,added};}
root.ClubDomain={copy,validDate,validTime,addDays,addMonths,today,secondsText,defaultAttendance,seedAttendance,datesFor,calendarItems,trainingTotals,planPeople,participating,need,missing,planErrors,move,settlement,importLegacyTraining};
if(typeof module!=='undefined')module.exports=root.ClubDomain;
})(typeof globalThis!=='undefined'?globalThis:this);

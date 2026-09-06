const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const domain=require('../web/domain.js');
function setup(){
 const listeners={},s={group:{id:'g'},events:[],tasks:[],people:[],attendance:{},venues:[],settings:{reminders:[]}};let seq=0;
 const c={D:domain,state:s,ctx:{busy:false},ui:{calendarYear:2026,calendarMonth:8,showExec:false},DEMO_TODAY:'2026-09-06',window:{addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)},document:{querySelector:()=>null},setTimeout,clearTimeout,Date,Set,FormData:class{constructor(f){this.values=f.values}get(n){return this.values[n]?.[0]??null}getAll(n){return this.values[n]||[]}},edit:()=>true,event:id=>s.events.find(e=>e.id===id),UID:()=>`e${++seq}`,clone:x=>structuredClone(x),checkpoint:()=>{},persist:()=>{},closeModal:()=>{},render:()=>{},actHandled:()=>{},toast:()=>{}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/calendar.js'),'utf8'),c);
 function submit(values,{id='',mode='single',form='cal-event'}={}){const error={textContent:''},f={dataset:{form,id,mode},values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Array.isArray(v)?v:[v]])),querySelector:()=>error};listeners.submit[0]({target:f});return error.textContent;}
 return {c,s,submit};
}
const basic={title:'練習',date:'2026-09-07',kind:'club',colorId:'blue'};
test('multi-date entry preserves existing same-day records and attendance',()=>{const {s,submit}=setup();s.events.push({id:'existing',...basic});s.attendance['existing|m']='manual';assert.equal(submit({...basic,selectedDate:['2026-09-08','2026-09-07','2026-09-08']},{mode:'multiple'}),'');assert.equal(s.events.length,3);assert.equal(s.events[1].date,'2026-09-07');assert.equal(s.events[1].seriesId,s.events[2].seriesId);assert.equal(s.events[2].colorId,'blue');assert.equal(s.attendance['existing|m'],'manual');});
test('period and weekly entry retain their distinct date semantics',()=>{const {s,submit}=setup();assert.equal(submit({...basic,endDate:'2026-09-10'},{mode:'period'}),'');assert.equal(s.events.length,1);assert.equal(s.events[0].endDate,'2026-09-10');assert.equal(submit({...basic,repeatUntil:'2026-09-30',weekday:['1','3']},{mode:'weekly'}),'');assert.equal(s.events.length,9);assert.ok(s.events.slice(1).every(e=>e.date===e.endDate));});
test('invalid date range and time are atomic',()=>{const {s,submit}=setup();assert.match(submit({...basic,endDate:'2026-09-01'},{mode:'period'}),/終了日/);assert.match(submit({...basic,start:'20:00',end:'19:00'}),/時刻/);assert.equal(s.events.length,0);});
test('series edit preserves dates and ids; single edit detaches only that record',()=>{const {s,submit}=setup();submit({...basic,selectedDate:['2026-09-07','2026-09-09']},{mode:'multiple'});const [a,b]=s.events,ids=s.events.map(e=>e.id);assert.equal(submit({...basic,title:'大会',scope:'series'},{id:a.id}),'');assert.deepEqual(s.events.map(e=>e.id),ids);assert.equal(b.date,'2026-09-09');assert.equal(b.title,'大会');submit({...basic,title:'この日だけ',scope:'single'},{id:a.id});assert.equal(a.seriesId,null);assert.equal(b.title,'大会');});
test('read-only members and in-flight saves cannot mutate calendar',()=>{const {c,s,submit}=setup();c.edit=()=>false;assert.match(submit(basic),/編集権限/);c.edit=()=>true;c.ctx.busy=true;submit(basic);assert.equal(s.events.length,0);});

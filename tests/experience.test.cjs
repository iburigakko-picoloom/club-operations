const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){let route='home';const listeners={},texts=[];
 const painter={fillText:t=>texts.push(t),fillRect:()=>{},strokeRect:()=>{}};
 const p={eventId:'e',linked:true,enabled:{outbound:true,return:true}},e={date:'2026-09-06',title:'練習'};
 const c={ctx:{ready:false},window:{ClubApp:{},addEventListener:(type,fn)=>listeners[type]=fn},header:(title,back)=>({title,back}),render:()=>{},getRoute:()=>route.split('/'),document:{createElement:()=>({getContext:()=>painter})},plan:()=>p,event:()=>e,eventVenue:()=>null,jpDate:d=>d,tableParts:()=>[],missing:()=>[{name:'未配車A'},{name:'未配車B'}],measureLines:(_,text)=>[text],imageCanvas:(w,h)=>[{width:w*2,height:h*2},painter],pName:id=>id};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web/experience.js','utf8'),c);
 return {c,p,texts,route:r=>route=r,run:s=>vm.runInContext(s,c),click:(target,back=false)=>listeners.click({target:{closest:()=>({getAttribute:()=>`#${target}`,closest:()=>null,classList:{contains:()=>back}})}})};
}
test('home detail and nested editor return to their actual entry screens',()=>{const t=setup();t.c.window.scrollY=0;t.click('task/t');t.route('task/t');assert.equal(t.run("header('task','tasks').back"),'home');t.click('task-edit/t');t.route('task-edit/t');assert.equal(t.run("header('edit','tasks').back"),'task/t');t.click('task/t',true);t.route('task/t');assert.equal(t.run("header('task','tasks').back"),'home');});
test('unallocated passengers are excluded from a landscape image',()=>{const t=setup(),cv=t.run("drawCarCanvas('p')");assert.ok(cv.width>cv.height);assert.ok(!t.texts.includes('未配車A'));assert.ok(!t.texts.includes('未配車B'));});
test('driverless cars show their passengers without claiming an assigned driver',()=>{const t=setup();t.c.tableParts=()=>[{label:'大学配車',legLabel:'往復',cars:[{driver:null,riders:['同乗者']}]}];const cv=t.run("drawCarCanvas('p')");assert.ok(cv.width>cv.height);assert.ok(t.texts.includes('運転者未定'));assert.ok(t.texts.includes('同乗者'));});

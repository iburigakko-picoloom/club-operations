const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('calendar fits five glyphs to measured width including padding and font differences',()=>{
 const labels=[34,42,58,80].map(clientWidth=>({clientWidth,textContent:'あいうえお',style:{}}));
 const c={document:{createElement:()=>({getContext:()=>({measureText:t=>({width:Array.from(t).length*13})})}),querySelectorAll:()=>labels},getComputedStyle:()=>({paddingLeft:'3',paddingRight:'3',fontWeight:'500',fontFamily:'sans-serif'})};vm.createContext(c);const s=fs.readFileSync('web/calendar.js','utf8');vm.runInContext(s.slice(s.indexOf('function calFitLabels('),s.indexOf("if(typeof MutationObserver")),c);c.calFitLabels();for(const el of labels){const font=parseFloat(el.style.fontSize);assert.ok(font<=12);assert.ok(65*font/12<=el.clientWidth-7);}
});
test('calendar image centers month, enlarges entries and omits venue suffix without changing data',()=>{
 const text=[],painter={fillText(textValue,x,y){text.push({text:textValue,x,y,font:this.font,align:this.textAlign});},fillRect(){},strokeRect(){}};
 const item={id:'e',kind:'club',title:'練習'},c={ui:{calendarYear:2026,calendarMonth:8},state:{},document:{createElement:()=>({getContext:()=>({})})},D:{calendarItems:(_,date)=>date==='2026-09-01'?[item]:[]},event:()=>item,measureLines:(_,t)=>[t],calVenueName:()=> '西部体育館',imageCanvas:(w,h)=>[{width:w,height:h},painter]};vm.createContext(c);
 const s=fs.readFileSync('web/app.js','utf8');vm.runInContext(s.slice(s.indexOf('function drawCalendar('),s.indexOf("/* Carpool's single")),c);const cv=c.drawCalendar();const month=text.find(t=>t.text==='2026年9月');assert.equal(month.x,cv.width/2);assert.equal(month.align,'center');assert.match(month.font,/36px/);assert.match(text.find(t=>t.text==='練習').font,/18px/);assert.ok(text.some(t=>t.text==='西部'));assert.ok(!text.some(t=>t.text.includes('体育館')));assert.equal(item.title,'練習');
});
test('attendance date picker includes past and distant months and filters days by selected month',()=>{
 const events=[{id:'old',date:'2026-01-03',title:'練習'},{id:'now',date:'2026-09-18',title:'練習'},{id:'later',date:'2027-02-04',title:'練習'}];
 const c={clubEvents:()=>events,DEMO_TODAY:'2026-09-18',esc:s=>s,jpDate:s=>s,eventVenue:()=>null};vm.createContext(c);const s=fs.readFileSync('web/base.js','utf8');vm.runInContext(s.slice(s.indexOf('function attendanceDatePicker('),s.indexOf('function renderAttendance()')),c);
 const html=c.attendanceDatePicker(events[1]);assert.match(html,/value="2026-01"/);assert.match(html,/value="2027-02"/);assert.match(html,/value="now" selected/);assert.doesNotMatch(html,/value="old"|value="later"/);
 assert.match(c.attendanceDatePicker(events[2]),/value="later" selected/);
});
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

test('home customization persists per account and group and retains authentication guard',()=>{
 const data=new Map(),events={};let route='';const c={ctx:{ready:false,mode:'server'},state:{currentUser:'u1',group:{id:'g1'}},ui:{taskTab:'all'},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},renderHome:()=>'<main></main>',renderOperations:()=>'<main></main>',wfRenderRoute:()=>null,entry:(name,id)=>`<a href="#${id}">${name}</a>`,shell:(title,nav,body)=>body,window:{addEventListener:(k,f)=>events[k]=f},render:()=>{},go:r=>route=r,toast:()=>{}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web/home.js','utf8'),c);
 events.submit({target:{matches:()=>true,querySelectorAll:()=>[{value:'courts'},{value:'practice'}]},preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(route,'home');assert.match(c.renderHome(),/#courts/);assert.match(c.renderHome(),/#practice/);assert.doesNotMatch(c.renderHome(),/#equipment/);
 c.state.currentUser='u2';assert.doesNotMatch(c.renderHome(),/#courts/);c.state.currentUser='u1';c.state.group.id='g2';assert.doesNotMatch(c.renderHome(),/#courts/);c.state.group.id='g1';assert.match(c.wfRenderRoute('home-customize'),/checked/);
 events.click({target:{closest:()=>true}});assert.equal(c.ui.taskTab,'self');
});
test('home tasks show the first three and link to the remaining tasks',()=>{
 const source=fs.readFileSync('web/app.js','utf8').split('\n').find(l=>l.startsWith('renderHome=function'));
 const tasks=Array.from({length:5},(_,i)=>({id:'t'+i,date:'2026-09-0'+(5-i),time:'09:00'}));
 const c={state:{group:{name:'club'},notices:[]},operationalTasks:()=>tasks,ownTask:()=>true,noticeVisible:()=>true,shell:(a,b,html)=>html,taskRow:t=>`[${t.id}]`,action:()=>'',icon:()=>'',esc:x=>x};vm.createContext(c);vm.runInContext(source,c);const html=c.renderHome();assert.match(html,/残り2件/);assert.match(html,/\[t4\]\[t3\]\[t2\]/);assert.doesNotMatch(html,/\[t1\]|\[t0\]/);
});

test('member attendance groups dates by month and remembers expanded months during editing',()=>{const source=fs.readFileSync('web/base.js','utf8').split('function attendanceMemberMonths(p){')[1].split("window.addEventListener('toggle'")[0];const events=[{id:'a',date:'2026-09-10'},{id:'b',date:'2026-10-01'}];const c={ui:{},state:{group:{id:'g'}},DEMO_TODAY:'2026-09-09',ClubDomain:{addMonths:()=> '2026-12-09'},clubEvents:()=>events,esc:x=>x.replaceAll('"','&quot;'),jpDate:x=>x,eventVenue:()=>null,participates:()=>true};vm.createContext(c);vm.runInContext('function attendanceMemberMonths(p){'+source,c);let html=c.attendanceMemberMonths({id:'p'});assert.equal((html.match(/ open>/g)||[]).length,1);assert.match(html,/open><summary>2026年9月/);assert.match(html,/data-eid="b"/);c.ui.attendanceMonths={[JSON.stringify(['g','p','2026-10'])]:true};html=c.attendanceMemberMonths({id:'p'});assert.equal((html.match(/ open>/g)||[]).length,2);});

test('reload restores the active workspace and view only for an authorized member',async()=>{const source=fs.readFileSync('web/workflow.js','utf8').split('async function wfRestoreWorkspace(){')[1];let calls=0;const c={ctx:{user:{id:'u'},groups:[{id:'g'}]},location:{hash:'#attendance'},getRoute:()=>['attendance'],localStorage:{getItem:()=> 'g'},sessionStorage:{getItem:()=>JSON.stringify({user:'u',group:'g',hash:'#attendance',ui:{attendanceMode:'member',attendanceMember:'m'}})},api:async()=>{calls++;return {group:{id:'g'}};},normalize:x=>x,clone:x=>x,ui:{},state:{},window:{addEventListener:()=>{}}};vm.createContext(c);vm.runInContext('async function wfRestoreWorkspace(){'+source,c);await c.wfRestoreWorkspace();assert.equal(calls,1);assert.equal(c.ctx.base.group.id,'g');assert.equal(c.ui.attendanceMember,'m');c.ctx.groups=[];await c.wfRestoreWorkspace();assert.equal(calls,1);c.ctx.user=null;await c.wfRestoreWorkspace();assert.equal(calls,1);});

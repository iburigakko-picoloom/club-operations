const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('Android bridge shows only this account’s pending tasks and registers its permitted token',async()=>{
 const saved=[],registered=[];
 let tasks=[{title:'自分の期限',date:'2026-10-02',time:'09:00',assignees:['u'],done:false},{title:'幹部全員',date:'2026-10-03',time:'',assignees:[],done:false},{title:'他の人',date:'2026-10-01',time:'',assignees:['v'],done:false},{title:'完了',date:'2026-10-04',time:'',assignees:['u'],done:true}];
 const sandbox={window:{ClubNative:{getPushToken:()=> 'token',isNotificationsAllowed:()=>true,saveWidgetSnapshot:x=>saved.push(JSON.parse(x)),requestNotifications:()=>{}},ClubApp:{},addEventListener:()=>{}},ctx:{ready:true,mode:'server',user:{id:'u'},base:{},pushConfig:{nativePush:true}},state:{group:{name:'部活'},currentUser:'u',settings:{reminders:[]}},operationalTasks:()=>tasks,ownTask:t=>!t.assignees.length||t.assignees.includes('u'),render:()=>{},enablePush:()=>{},renderNotificationSettings:()=>{},downloadCanvas:()=>{},shareCanvas:async()=>{},downloadJSON:()=>{},queueMicrotask:queueMicrotask,api:async(path,method,data)=>registered.push({path,method,data}),getRoute:()=>['home'],toast:()=>{}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('web/native.js','utf8'),sandbox);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.at(-1).total,2);
 assert.deepEqual(saved.at(-1).tasks.map(t=>t.title),['自分の期限','幹部全員']);
 assert.equal(registered.length,1);
 assert.equal(registered[0].path,'/push/native');
 tasks=tasks.map(t=>t.title==='自分の期限'?{...t,done:true}:t);
 sandbox.render();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(saved.at(-1).tasks.map(t=>t.title),['幹部全員']);
 sandbox.ctx.user=null;sandbox.render();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.at(-1),null);
});

test('Android notification URL is resolved from FCM data extras and remains same-origin validated',()=>{
 const java=fs.readFileSync('android/app/src/main/java/app/cluboperations/MainActivity.java','utf8');assert.match(java,/getStringExtra\(EXTRA_URL\)/);assert.match(java,/getStringExtra\("url"\)/);assert.match(java,/return isAppUri\(uri\) \? uri\.toString\(\) : APP_URL/);assert.match(java,/iburigakko-picoloom\.github\.io/);
});

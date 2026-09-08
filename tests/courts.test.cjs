const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../web/court-domain.js');
function random(seed=1){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('four people by default; remainders and limited gyms are balanced',()=>{
 for(const [n,c,expected] of [[16,6,[4,4,4,4]],[17,4,[5,4,4,4]],[19,4,[5,5,5,4]],[22,4,[6,6,5,5]],[7,3,[4,3]],[11,3,[4,4,3]],[3,6,[3]],[0,4,[]]])assert.deepEqual(D.sizes(n,c),expected);
 assert.throws(()=>D.sizes(10,0));assert.throws(()=>D.sizes(10,1.5));
});
test('every participant appears exactly once, court counts and sizes hold, input stays untouched',()=>{
 for(const n of [1,3,4,7,11,16,17,22,31,48,65])for(const c of [1,2,4,6,10]){const ids=Array.from({length:n},(_,i)=>'m'+i),before=[...ids],out=D.create(ids,c,random(n+c));for(const groups of [out.level,out.balanced]){assert.ok(groups.length<=c);assert.deepEqual(groups.flat().sort(),[...ids].sort());const ns=groups.map(g=>g.length);assert.ok(Math.max(...ns)-Math.min(...ns)<=1);}assert.deepEqual(out.level.flat(),ids);assert.deepEqual(ids,before);}
});
test('equal version mixes level bands and improves average-rank balance while varying the draw',()=>{
 const ids=Array.from({length:24},(_,i)=>'m'+i),rank=new Map(ids.map((id,i)=>[id,i+1])),variants=new Set();
 for(let seed=1;seed<12;seed++){const out=D.create(ids,6,random(seed));assert.ok(D.meanSpread(out.balanced,rank)<D.meanSpread(out.level,rank));assert.ok(D.meanSpread(out.balanced,rank)<=2);for(const group of out.balanced)assert.deepEqual(group.map(id=>Math.floor(rank.get(id)-1)/6|0).sort(),[0,1,2,3]);variants.add(JSON.stringify(out.balanced));}assert.ok(variants.size>5);
});
function harness(){
 const listeners={},state={group:{id:'g'},people:Array.from({length:9},(_,i)=>({id:'m'+i,name:'部員'+i,active:true})),events:[{id:'e',date:'2026-09-10',title:'練習',kind:'club'}],venues:[{id:'v',name:'体育館',courts:2}],attendance:{},training:{unchanged:true},plans:[{unchanged:true}]};let saved='',route=['courts'];
 const c={state,CourtDomain:D,ctx:{ready:false,busy:false,user:{}},window:{addEventListener:(k,f)=>(listeners[k]||=[]).push(f),scrollY:0,scrollTo:()=>{}},renderOperations:()=>'',wfRenderRoute:()=>c.ctx.user?null:'LOGIN',render:()=>{},entry:()=>'',getRoute:()=>route,edit:()=>true,esc:String,jpDate:String,DEMO_TODAY:'2026-09-09',event:id=>c.state.events.find(e=>e.id===id),eventVenue:()=>c.state.venues[0],participants:()=>c.state.people.filter(p=>p.active&&c.state.attendance[p.id]!==false),clubEvents:()=>c.state.events,pName:id=>c.state.people.find(p=>p.id===id)?.name,shell:(a,b,html)=>html,action:(a,label,attrs='')=>`<button data-act="${a}" ${attrs}>${label}</button>`,segments:()=>'',actHandled:()=>{},toast:()=>{},go:r=>route=[r],wfSave:async fn=>{fn();saved=JSON.stringify(c.state);}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web/courts.js','utf8'),c);
 return {c,run:s=>vm.runInContext(s,c),click:async(act,id)=>listeners.click[0]({target:{closest:()=>({dataset:{act,id}})}}),reload:()=>{c.state=JSON.parse(saved);},saved:()=>saved};
}
test('UI workflow ranks, saves both versions, reloads, flags attendance changes and leaves training/car data alone',async()=>{
 const t=harness(),original=JSON.stringify({training:t.c.state.training,plans:t.c.state.plans,events:t.c.state.events});t.run('renderCourts()');assert.match(t.run('renderCourts()'),/参加者のレベル順/);t.run('renderCourtRanking()');await t.click('court-up','m1');await t.click('court-rank-save');assert.equal(t.c.state.courtAssignments.ranking[0],'m1');await t.click('court-create');const level=JSON.stringify(t.c.state.courtAssignments.sessions.e.level);assert.equal(t.c.state.courtAssignments.sessions.e.balanced.flat().length,9);t.reload();assert.match(t.run('renderCourts()'),/コート1/);await t.click('court-shuffle');assert.equal(JSON.stringify(t.c.state.courtAssignments.sessions.e.level),level);t.c.state.attendance.m1=false;assert.match(t.run('renderCourts()'),/再作成してください/);await t.click('court-create');assert.ok(!t.c.state.courtAssignments.sessions.e.balanced.flat().includes('m1'));assert.equal(JSON.stringify({training:t.c.state.training,plans:t.c.state.plans,events:t.c.state.events}),original);
});
test('read-only UI cannot save rankings or generate; unauthenticated routes retain login guard',async()=>{const t=harness();t.run('renderCourts();renderCourtRanking()');t.c.edit=()=>false;await t.click('court-rank-save');await t.click('court-create');assert.equal(t.saved(),'');t.c.ctx.user=null;assert.equal(t.run("wfRenderRoute('courts')"),'LOGIN');});

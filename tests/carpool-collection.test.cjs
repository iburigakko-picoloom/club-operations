const test=require('node:test'),assert=require('node:assert/strict'),D=require('../web/domain.js');
test('collected yen use university 2 / station 3 and conserve every yen',()=>{
 assert.deepEqual(D.allocateCollected(101,[{driver:'u',weight:2},{driver:'s',weight:3}]),[{driver:'s',weight:3,amount:61},{driver:'u',weight:2,amount:40}]);
 for(let total=0;total<1001;total++){
  const rows=D.allocateCollected(total,[{driver:'u',weight:2},{driver:'s',weight:3}]);
  assert.equal(rows.reduce((n,x)=>n+x.amount,0),total);assert(rows.every(x=>Number.isInteger(x.amount)));
 }
});
test('tied remainders use immutable member ID order across retries and input reorder',()=>{
 const drivers=[{driver:'c',weight:2},{driver:'b',weight:2},{driver:'a',weight:2}],before=structuredClone(drivers);
 const expected=[{driver:'a',weight:2,amount:17},{driver:'b',weight:2,amount:17},{driver:'c',weight:2,amount:16}];
 assert.deepEqual(D.allocateCollected(50,drivers),expected);
 assert.deepEqual(D.allocateCollected(50,drivers.reverse()),expected);
 assert.deepEqual(D.allocateCollected(50,before),expected);
});
test('zero collection and no drivers are explicit; invalid input cannot silently pay',()=>{
 assert.deepEqual(D.allocateCollected(0,[]),[]);
 assert.deepEqual(D.allocateCollected(0,[{driver:'u',weight:2}]),[{driver:'u',weight:2,amount:0}]);
 assert.throws(()=>D.allocateCollected(50,[]),/運転者/);
 for(const total of [-1,0.5,NaN,Infinity])assert.throws(()=>D.allocateCollected(total,[]));
 for(const row of [{driver:'',weight:2},{driver:'u',weight:0},{driver:'u',weight:1.5}])assert.throws(()=>D.allocateCollected(50,[row]));
 assert.throws(()=>D.allocateCollected(50,[{driver:'u',weight:2},{driver:'u',weight:3}]));
});
test('large safe-integer amounts retain exact largest remainders',()=>{
 const total=Number.MAX_SAFE_INTEGER,rows=D.allocateCollected(total,[{driver:'u',weight:2},{driver:'s',weight:3}]);
 assert.equal(rows.reduce((n,x)=>n+x.amount,0),total);assert.equal(rows.find(x=>x.driver==='u').amount,3602879701896396);
});
function state(){return {people:['u','s','a','b','c','d','e'].map(id=>({id,name:id,active:true,seniority:'below',pickup:'university'})),events:[{id:'ev',kind:'club',date:'2026-09-02',venueId:'gym1'}],plans:[],settlements:[],attendance:{},settings:{unitYen:999,carpoolFees:{gym:900,university:800,station:700}}};}
function plan(id='p',eventId='ev',cars=[{id:'u-car',driver:'u',pickup:'university',riders:['a']},{id:'s-car',driver:'s',pickup:'station',riders:['b']}]){return {id,eventId,status:'registered',fareMode:'fixed',linked:true,enabled:{outbound:true,return:true},legs:{outbound:structuredClone(cars),return:structuredClone(cars)},need:{outbound:{},return:{}},unitYen:300,unitYenOverride:400,adjustments:{'outbound|a':{count:9,unitYen:600,reason:'旧調整'}},collections:{}};}
function receive(p,leg,rider,amount=50){p.collections[leg+'|'+rider]={status:'collected',amount};}
function receiveAll(p){for(const leg of ['outbound','return'])if(p.enabled[leg])for(const car of p.legs[leg])for(const rider of car.riders)if(rider!==car.driver)receive(p,leg,rider);}
test('unrecorded collection still has a full bill and planned allocation without inventing receipts',()=>{
 const s=state();s.plans=[plan()];delete s.plans[0].collections;const before=structuredClone(s),r=D.normalSettlement(s,'2026-09');
 assert.equal(r.expectedAmount,200);assert.equal(r.plannedPaidAmount,200);assert.equal(r.uncollectedAmount,200);assert.equal(r.registeredPlanCount,1);assert.equal(r.draftPlanCount,0);
 assert.deepEqual(r.days[0].plannedPayouts,[{driver:'s',weight:6,amount:120},{driver:'u',weight:4,amount:80}]);
 assert.equal(r.collectedAmount,0);assert.equal(r.paidAmount,0);assert.deepEqual(s,before);
});
test('partial and zero receipts change actual payouts and outstanding money but never planned allocation',()=>{
 const s=state(),p=plan();s.plans=[p];const fullPlan=D.normalSettlement(s,'2026-09').plannedPayouts;
 receive(p,'outbound','a',49);receive(p,'return','b',0);const before=structuredClone(s),r=D.normalSettlement(s,'2026-09');
 assert.equal(r.expectedAmount,200);assert.equal(r.plannedPaidAmount,200);assert.equal(r.uncollectedAmount,151);assert.equal(r.collectedAmount,49);assert.equal(r.paidAmount,49);
 assert.deepEqual(r.plannedPayouts,fullPlan);assert.equal(D.settlement(s,'2026-09').reduce((n,x)=>n+x.amount,0),49);assert.deepEqual(s,before);
});
test('planned largest remainders are daily, stable on ties, and independent from actual receipts',()=>{
 const s=state(),p=plan('p','ev',[{id:'a-car',driver:'a-driver',pickup:'university',riders:['a']},{id:'b-car',driver:'b-driver',pickup:'university',riders:[]},{id:'c-car',driver:'c-driver',pickup:'university',riders:[]}]);p.enabled.return=false;s.plans=[p];receive(p,'outbound','a',49);
 const r=D.normalSettlement(s,'2026-09');assert.deepEqual(r.days[0].plannedPayouts.map(x=>x.amount),[17,17,16]);assert.deepEqual(r.days[0].payouts.map(x=>x.amount),[17,16,16]);
 p.legs.outbound.reverse();assert.deepEqual(D.normalSettlement(s,'2026-09').plannedPayouts,r.plannedPayouts);
 s.events.push({id:'ev2',date:'2026-09-03',kind:'club'});const p2=structuredClone(p);p2.id='p2';p2.eventId='ev2';p2.collections={};s.plans.push(p2);
 const multiple=D.normalSettlement(s,'2026-09');assert.equal(multiple.expectedAmount,100);assert.equal(multiple.plannedPaidAmount,100);assert.deepEqual(multiple.plannedPayouts.map(x=>x.amount),[34,34,32]);assert.equal(multiple.paidAmount,49);
 s.plans.reverse();assert.deepEqual(D.normalSettlement(s,'2026-09').plannedPayouts,multiple.plannedPayouts);
});
test('planned route weights combine multiple same-day plans without using passenger counts',()=>{
 const s=state(),p=plan(),extra=plan('extra','ev2',[{id:'extra-car',driver:'u',pickup:'station',riders:['c']}]);extra.enabled.return=false;s.events.push({id:'ev2',date:'2026-09-02',kind:'club'});s.plans=[p,extra];
 const r=D.normalSettlement(s,'2026-09');assert.equal(r.expectedAmount,250);assert.deepEqual(r.days[0].plannedPayouts,[{driver:'s',weight:6,amount:115},{driver:'u',weight:7,amount:135}]);assert.equal(r.paidAmount,0);
});
test('draft, excluded, cancelled and locked plans are not presented as completed monthly bills',()=>{
 const s=state(),completed=plan(),draft=plan('draft','draft-event');draft.status='draft';s.events.push({id:'draft-event',date:'2026-09-04',kind:'club'});s.plans=[completed,draft];
 const r=D.normalSettlement(s,'2026-09');assert.equal(r.expectedAmount,200);assert.equal(r.registeredPlanCount,1);assert.equal(r.draftPlanCount,1);assert.equal(r.collections.length,4);
 for(const kind of ['excluded','cancelled','locked']){const isolated=state(),p=plan();isolated.plans=[p];if(kind==='excluded')p.excluded=true;if(kind==='cancelled')isolated.events[0].cancelled=true;if(kind==='locked')isolated.settlements=[{month:'2026-09',locked:true,planIds:['p'],lines:[{amount:777}]}];const before=structuredClone(isolated),n=D.normalSettlement(isolated,'2026-09');assert.equal(n.expectedAmount,0,kind);assert.equal(n.plannedPaidAmount,0,kind);assert.equal(n.registeredPlanCount,0,kind);assert.deepEqual(isolated,before);}
});
test('planned bills use enabled service dates across months and handle empty carpools',()=>{
 const s=state(),p=plan();p.legDates={outbound:'2026-08-31',return:'2026-09-01'};s.plans=[p];
 for(const month of ['2026-08','2026-09']){const r=D.normalSettlement(s,month);assert.equal(r.expectedAmount,100);assert.equal(r.plannedPaidAmount,100);assert.equal(r.uncollectedAmount,100);}
 p.enabled.return=false;assert.equal(D.normalSettlement(s,'2026-09').expectedAmount,0);assert.equal(D.normalSettlement(s,'2026-09').registeredPlanCount,0);
 s.plans=[plan('empty','ev',[])];const r=D.normalSettlement(s,'2026-09');assert.equal(r.expectedAmount,0);assert.equal(r.plannedPaidAmount,0);assert.deepEqual(r.plannedPayouts,[]);assert.deepEqual(r.errors,[]);
});
test('unknown driver or route prevents a misleading planned distribution and keeps actual money visible',()=>{
 for(const patch of [{driver:null},{pickup:null}]){const s=state(),p=plan('p','ev',[{id:'bad',driver:'u',pickup:'university',riders:['a'],...patch}]);p.enabled.return=false;s.plans=[p];receive(p,'outbound','a',49);const r=D.normalSettlement(s,'2026-09');assert.equal(r.expectedAmount,50);assert.equal(r.plannedPaidAmount,0);assert.equal(r.days[0].unallocatedPlannedAmount,50);assert.equal(r.collectedAmount,49);assert.equal(r.paidAmount,0);assert(r.errors.length);}
});
test('a retained receipt on a draft or disabled leg never creates a planned bill',()=>{
 for(const kind of ['draft','disabled']){const s=state(),p=plan();p.enabled.return=false;s.plans=[p];receive(p,'outbound','a',50);if(kind==='draft')p.status='draft';else p.enabled.outbound=false;const r=D.normalSettlement(s,'2026-09');assert.equal(r.expectedAmount,0,kind);assert.equal(r.collectedAmount,50,kind);assert.equal(r.plannedPaidAmount,0,kind);assert(r.errors.length);}
});
test('existing normal carpools charge only riders 50 per leg and preserve stored old rates',()=>{
 const s=state(),p=plan();s.plans=[p];const before=structuredClone(s),normal=D.normalSettlement(s,'2026-09');
 assert.equal(normal.collections.length,4);assert.equal(normal.collections.reduce((n,x)=>n+x.amount,0),200);
 assert(normal.collections.every(x=>x.unitYen===50&&x.count===1&&x.status==='uncollected'));assert.equal(normal.collectedAmount,0);assert.equal(normal.paidAmount,0);
 assert.equal(D.fixedCarFee(s,p,p.legs.outbound[0]),50);assert.deepEqual(s,before);
 assert.equal(D.legacySettlement(s,'2026-09').find(x=>x.rider==='a').amount,5800);
});
test('roundtrip collects 100 per rider and daily driver payments use 2:3',()=>{
 const s=state(),p=plan();s.plans=[p];receiveAll(p);const r=D.normalSettlement(s,'2026-09');
 assert.equal(r.collectedAmount,200);assert.equal(r.paidAmount,200);assert.deepEqual(r.days[0].payouts,[{driver:'s',weight:6,amount:120},{driver:'u',weight:4,amount:80}]);
 assert.equal(D.settlement(s,'2026-09').reduce((n,x)=>n+x.amount,0),200);
});
test('uncollected riders contribute no money while the driven car still gets its route weight',()=>{
 const s=state(),p=plan();s.plans=[p];receive(p,'outbound','a');p.collections['return|a']={status:'uncollected',amount:0};
 const r=D.normalSettlement(s,'2026-09');assert.equal(r.collectedAmount,50);assert.equal(r.paidAmount,50);assert.deepEqual(r.days[0].payouts.map(x=>x.amount),[30,20]);
});
test('passenger counts never increase driver weight; every gym uses the same ratio',()=>{
 const s=state(),p=plan('p','ev',[{id:'u-car',driver:'u',pickup:'university',riders:['a','c','d','e']},{id:'s-car',driver:'s',pickup:'station',riders:['b']}]);p.enabled.return=false;s.plans=[p];receiveAll(p);
 const r=D.normalSettlement(s,'2026-09');assert.equal(r.collectedAmount,250);assert.deepEqual(r.days[0].payouts,[{driver:'s',weight:3,amount:150},{driver:'u',weight:2,amount:100}]);
 s.events[0].venueId='another-gym';s.settings.carpoolFees={gym:1,station:1,university:1000000};assert.deepEqual(D.normalSettlement(s,'2026-09').payouts,r.payouts);
});
test('odd actual collection is distributed at one yen and remains deterministic',()=>{
 const s=state(),p=plan();s.plans=[p];receive(p,'outbound','a',49);const before=structuredClone(s),r=D.normalSettlement(s,'2026-09');
 assert.equal(r.collectedAmount,49);assert.equal(r.paidAmount,49);assert.deepEqual(r.days[0].payouts.map(x=>x.amount),[29,20]);
 p.legs.outbound.reverse();p.legs.return.reverse();assert.deepEqual(D.normalSettlement(s,'2026-09').payouts,r.payouts);s.plans=[before.plans[0]];assert.deepEqual(D.normalSettlement(s,'2026-09').payouts,r.payouts);
});
test('same driver across multiple same-day plans and legs is paid once with accumulated route weights',()=>{
 const s=state(),p=plan();s.events.push({id:'ev2',kind:'club',date:'2026-09-02',venueId:'gym2'});
 const p2=plan('p2','ev2',[{id:'extra',driver:'u',pickup:'station',riders:['c']}]);p2.enabled.return=false;s.plans=[p,p2];receiveAll(p);receiveAll(p2);
 const r=D.normalSettlement(s,'2026-09');assert.equal(r.days.length,1);assert.equal(r.payouts.length,2);assert.equal(r.collectedAmount,250);assert.equal(r.paidAmount,250);assert.deepEqual(r.days[0].payouts,[{driver:'s',weight:6,amount:115},{driver:'u',weight:7,amount:135}]);
 s.plans.reverse();assert.deepEqual(D.normalSettlement(s,'2026-09').payouts,r.payouts);
});
test('daily pools and different-month legs are independent',()=>{
 const s=state(),p=plan();p.legDates={outbound:'2026-08-31',return:'2026-09-01'};s.plans=[p];receive(p,'outbound','a',49);receive(p,'return','b',50);
 const aug=D.normalSettlement(s,'2026-08'),sep=D.normalSettlement(s,'2026-09');assert.equal(aug.collectedAmount,49);assert.equal(aug.paidAmount,49);assert.equal(sep.collectedAmount,50);assert.equal(sep.paidAmount,50);assert(aug.collections.every(x=>x.date==='2026-08-31'));assert(sep.collections.every(x=>x.date==='2026-09-01'));
});
test('driver on one leg and passenger on another owes only the passenger leg',()=>{
 const s=state(),p=plan('p','ev',[{id:'u-car',driver:'u',pickup:'university',riders:['a']}]);p.linked=false;p.legs.return=[{id:'s-car',driver:'s',pickup:'station',riders:['u']}];s.plans=[p];receiveAll(p);
 const r=D.normalSettlement(s,'2026-09');assert.deepEqual(r.collections.map(x=>[x.rider,x.leg,x.amount]),[['a','outbound',50],['u','return',50]]);assert.equal(r.paidAmount,100);
});
test('zero driver or missing pickup blocks payout and keeps the recovered amount visible',()=>{
 for(const patch of [{driver:null},{pickup:null}]){const s=state(),p=plan('p','ev',[{id:'bad',driver:'u',pickup:'university',riders:['a'],...patch}]);p.enabled.return=false;s.plans=[p];receive(p,'outbound','a');const r=D.normalSettlement(s,'2026-09');assert.equal(r.collectedAmount,50);assert.equal(r.paidAmount,0);assert.equal(r.days[0].unallocatedAmount,50);assert(r.errors.length);}
});
test('cancelled, draft, disabled or changed seating cannot hide collected money',()=>{
 for(const change of ['cancelled','draft','disabled','seat']){const s=state(),p=plan();s.plans=[p];receive(p,'outbound','a');if(change==='cancelled')s.events[0].cancelled=true;if(change==='draft')p.status='draft';if(change==='disabled')p.enabled.outbound=false;if(change==='seat')p.legs.outbound[0].riders=[];const r=D.normalSettlement(s,'2026-09');assert.equal(r.collectedAmount,50,change);assert.equal(r.paidAmount,0,change);assert(r.errors.length,change);}
});
test('event expenses and event records retain the old exact behavior alongside normal collection',()=>{
 const s=state(),p=plan(),ev=plan('event-plan','ev2',[{id:'trip',driver:'u',pickup:'university',riders:['a','b','c']}]);ev.fareMode='event';ev.eventCosts={outbound:{trip:{gasoline:4000,toll:7000,parking:1050}},return:{}};s.events.push({id:'ev2',kind:'club',date:'2026-09-02'});s.plans=[p,ev];receiveAll(p);const before=structuredClone(ev);
 const old=D.legacySettlement({...s,plans:[ev]},'2026-09'),rows=D.settlement(s,'2026-09');assert.deepEqual(rows.filter(x=>x.fareMode!=='pooled'),old);assert.equal(old.reduce((n,x)=>n+x.amount,0),9030);assert.equal(D.normalSettlement(s,'2026-09').collectedAmount,200);assert.deepEqual(ev,before);
});
test('locked old statements and their plans never recalculate, and the original state is immutable',()=>{
 const s=state(),p=plan();s.plans=[p];receiveAll(p);const lines=D.legacySettlement(s,'2026-09');s.settlements=[{id:'old-paid',month:'2026-09',locked:true,planIds:['p'],lines}];const before=structuredClone(s);
 assert.equal(D.normalSettlement(s,'2026-09').collections.length,0);assert.equal(D.settlement(s,'2026-09').length,0);assert.deepEqual(s,before);assert.deepEqual(s.settlements[0].lines,lines);
});
test('0 collected is recorded as collected and distinct from an absent receipt',()=>{
 const s=state(),p=plan();s.plans=[p];receive(p,'outbound','a',0);const r=D.normalSettlement(s,'2026-09');assert.equal(r.collections.find(x=>x.rider==='a'&&x.leg==='outbound').status,'collected');assert.equal(r.collections.find(x=>x.rider==='a'&&x.leg==='return').status,'uncollected');assert.equal(r.paidAmount,0);
});
test('monthly collection totals combine each rider across dates and legs while retaining receipts',()=>{
 const s=state(),p=plan(),next=plan('next','next-event');s.events.push({id:'next-event',kind:'club',date:'2026-09-03'});next.enabled.return=false;s.plans=[p,next];receive(p,'outbound','a',49);receive(next,'outbound','a',0);
 const normal=D.normalSettlement(s,'2026-09'),before=structuredClone(normal),rows=D.collectionTotalsByRider(normal.collections);
 assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>[x.rider,x.count,x.expectedAmount,x.collectedAmount,x.uncollectedAmount,x.recordedCount]),[['a',3,150,49,101,2],['b',3,150,0,150,0]]);
 assert.deepEqual(rows[0].details.map(x=>[x.date,x.leg,x.status,x.collectedAmount]),[['2026-09-02','outbound','collected',49],['2026-09-02','return','uncollected',0],['2026-09-03','outbound','collected',0]]);
 assert.equal(rows.reduce((n,x)=>n+x.expectedAmount,0),normal.expectedAmount);assert.equal(rows.reduce((n,x)=>n+x.collectedAmount,0),normal.collectedAmount);assert.equal(rows.reduce((n,x)=>n+x.uncollectedAmount,0),normal.uncollectedAmount);assert.deepEqual(normal,before);
});
test('grouped receipts do not offset another leg with money from a removed seat',()=>{
 const s=state(),p=plan();s.plans=[p];receive(p,'outbound','a',50);p.legs.outbound[0].riders=[];
 const normal=D.normalSettlement(s,'2026-09'),row=D.collectionTotalsByRider(normal.collections).find(x=>x.rider==='a');
 assert.equal(row.expectedAmount,50);assert.equal(row.collectedAmount,50);assert.equal(row.uncollectedAmount,50);assert.equal(row.count,1);assert.equal(row.orphaned,true);assert.equal(row.details.length,2);assert(normal.errors.length>0);
});
test('collection grouping uses member IDs even when names match and has a stable empty result',()=>{
 const s=state();s.people.forEach(x=>x.name='同じ名前');s.plans=[plan()];const normal=D.normalSettlement(s,'2026-09');
 assert.deepEqual(D.collectionTotalsByRider(normal.collections).map(x=>[x.rider,x.expectedAmount]),[['a',100],['b',100]]);assert.deepEqual(D.collectionTotalsByRider([...normal.collections].reverse()).map(x=>[x.rider,x.expectedAmount]),[['a',100],['b',100]]);assert.deepEqual(D.collectionTotalsByRider([]),[]);
});

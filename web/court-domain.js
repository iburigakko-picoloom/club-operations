(function(root){
'use strict';
function sizes(n,courts){
 if(!Number.isInteger(n)||n<0||!Number.isInteger(courts)||courts<1||courts>30)throw Error('参加人数と体育館のコート数を確認してください');
 if(!n)return [];
 const count=Math.min(courts,Math.max(1,Math.floor(n/4),Math.ceil(n/5))),base=Math.floor(n/count),extra=n%count;
 return Array.from({length:count},(_,i)=>base+(i<extra?1:0));
}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function meanSpread(groups,rank){const means=groups.map(g=>g.reduce((a,id)=>a+rank.get(id),0)/g.length);return Math.max(...means)-Math.min(...means);}
function create(ids,courts,rng=Math.random){
 if(new Set(ids).size!==ids.length)throw Error('参加者が重複しています');
 const capacities=shuffle(sizes(ids.length,courts),rng),level=[];let offset=0;
 for(const n of capacities){level.push(ids.slice(offset,offset+n));offset+=n;}
 if(!ids.length)return {level:[],balanced:[]};
 const rank=new Map(ids.map((id,i)=>[id,i+1]));
 // Odd courts use one adjacent triple, so the extra player has close peers.
 // Remaining slots are adjacent pairs; even crowded gyms never split a unit.
 const slots=capacities.map(n=>{const units=[];if(n%2){units.push(n===1?1:3);n-=units[0];}while(n>0){units.push(2);n-=2;}return units;});
 const candidates=[];let bestScore=Infinity;
 for(let trial=0;trial<300;trial++){
  const unitSizes=shuffle(slots.flat(),rng),units={1:[],2:[],3:[]};let cursor=0;
  for(const size of unitSizes){units[size].push(ids.slice(cursor,cursor+size));cursor+=size;}
  for(const size of [1,2,3])shuffle(units[size],rng);
  const groups=slots.map(court=>court.flatMap(size=>units[size].pop()));
  const score=meanSpread(groups,rank);bestScore=Math.min(bestScore,score);candidates.push({groups,score});
 }
 // Keep a little variation instead of always pairing the strongest with the weakest.
 const close=candidates.filter(x=>x.score<=bestScore+1.5),best=close[Math.floor(rng()*close.length)].groups;
 return {level,balanced:shuffle(best,rng).map(g=>g.sort((a,b)=>rank.get(a)-rank.get(b)))};
}
const api={sizes,create,meanSpread};root.CourtDomain=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

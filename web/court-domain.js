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
 // Deal each rank band once, independently, without optimizing court averages.
 const balanced=capacities.map(()=>[]);let cursor=0;
 for(let row=0;cursor<ids.length;row++){
  const targets=shuffle(capacities.map((n,i)=>n>row?i:-1).filter(i=>i>=0),rng);
  for(const i of targets)balanced[i].push(ids[cursor++]);
 }
 return {level,balanced};
}
const api={sizes,create,meanSpread};root.CourtDomain=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

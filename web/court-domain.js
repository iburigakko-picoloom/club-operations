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
// Only penalize extremes; a moderate difference between court means is fine.
function allocationScore(groups,n){
 let isolated=0,penalty=0;const means=[];
 for(const group of groups){const ranks=[...group].sort((a,b)=>a-b);means.push(ranks.reduce((a,b)=>a+b,0)/ranks.length);
  if(ranks.length<2)continue;
  for(let i=0;i<ranks.length;i++){const gap=Math.min(i?ranks[i]-ranks[i-1]:Infinity,i+1<ranks.length?ranks[i+1]-ranks[i]:Infinity);if(gap>4)isolated++;}
  const largest=Math.max(...ranks.slice(1).map((r,i)=>r-ranks[i]));
  penalty+=Math.pow(Math.max(0,largest-Math.max(4,n*.22))/n,2)*8;
  penalty+=Math.pow(Math.max(0,ranks[ranks.length-1]-ranks[0]-n*.65)/n,2)*2;
 }
 penalty+=Math.pow(Math.max(0,Math.max(...means)-Math.min(...means)-n*.32)/n,2)*12;
 return {isolated,penalty,total:isolated*5+penalty};
}
function mixedCourts(capacities,n,rng){
 const split=order=>{let offset=0;return capacities.map(size=>{const group=order.slice(offset,offset+size);offset+=size;return group;});};
 const candidates=[],fallback=split(Array.from({length:n},(_,i)=>i));
 candidates.push({groups:fallback,score:allocationScore(fallback,n).penalty});
 if(capacities.length===1)return fallback;
 for(let attempt=0;attempt<24;attempt++){
  const groups=split(shuffle(Array.from({length:n},(_,i)=>i),rng));let score=allocationScore(groups,n);
  for(let step=0;step<400;step++){
   const a=Math.floor(rng()*groups.length),b=(a+1+Math.floor(rng()*(groups.length-1)))%groups.length,ai=Math.floor(rng()*groups[a].length),bi=Math.floor(rng()*groups[b].length);
   [groups[a][ai],groups[b][bi]]=[groups[b][bi],groups[a][ai]];
   const next=allocationScore(groups,n),temperature=.12*(1-step/400);
   if(next.total<=score.total||rng()<Math.exp((score.total-next.total)/Math.max(.001,temperature)))score=next;
   else [groups[a][ai],groups[b][bi]]=[groups[b][bi],groups[a][ai]];
   if(!score.isolated&&step%20===0)candidates.push({groups:groups.map(g=>[...g]),score:score.penalty});
  }
 }
 const best=Math.min(...candidates.map(c=>c.score)),acceptable=candidates.filter(c=>c.score<=best+.025);
 return acceptable[Math.floor(rng()*acceptable.length)].groups;
}
function create(ids,courts,rng=Math.random){
 if(new Set(ids).size!==ids.length)throw Error('参加者が重複しています');
 const capacities=shuffle(sizes(ids.length,courts),rng),level=[];let offset=0;
 for(const n of capacities){level.push(ids.slice(offset,offset+n));offset+=n;}
 if(!ids.length)return {level:[],balanced:[]};
 const balanced=mixedCourts(capacities,ids.length,rng);
 return {level,balanced:shuffle(balanced,rng).map(group=>group.sort((a,b)=>a-b).map(i=>ids[i]))};
}
const api={sizes,create,meanSpread};root.CourtDomain=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

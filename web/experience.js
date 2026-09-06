'use strict';
// Keep the user's entry point when opening a detail, including nested editors.
const uxParents=new Map(),uxScroll=new Map();let uxLastRoute='',uxGroup='';
const uxHeader=header;
header=function(title,back='',right=''){
 const route=getRoute().join('/').replace(/\/+$/,'');
 return uxHeader(title,uxParents.get(route)||back,right);
};
window.addEventListener('click',ev=>{
 const link=ev.target.closest('a[href^="#"]');if(!link||link.closest('#modal-root'))return;
 const target=link.getAttribute('href').slice(1),source=getRoute().join('/').replace(/\/+$/,'');if(!target||target===source)return;
 uxScroll.set(source,window.scrollY);
 if(link.closest('.nav')){uxParents.delete(target);return;}
 if(!link.classList.contains('back'))uxParents.set(target,source);
},true);
const uxRender=render;
render=function(){
 const group=state?.group?.id;if(group!==uxGroup){uxParents.clear();uxScroll.clear();uxGroup=group;}
 const route=getRoute().join('/').replace(/\/+$/,'');uxRender();
 document.body.dataset.screen=getRoute()[0];
 if(route!==uxLastRoute){
  uxLastRoute=route;requestAnimationFrame(()=>{window.scrollTo(0,uxScroll.get(route)||0);const main=document.querySelector('#app main,#app .wf-content');if(main&&!matchMedia('(prefers-reduced-motion: reduce)').matches)main.animate([{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:150,easing:'ease-out'});});
 }
};
// A landscape sheet may be shared while allocation is still in progress.
drawCarCanvas=function(id){
 const p=plan(id),e=event(p?.eventId);if(!p||!e)throw Error('配車が見つかりません');
 const colW=180,gap=26,pad=32,probe=document.createElement('canvas').getContext('2d');
 const font=(n,bold=false)=>`${bold?'600':'400'} ${n}px sans-serif`;
 const sections=tableParts(p).map(part=>({...part,cards:part.cars.map(car=>({title:car.driver?pName(car.driver):'運転者未定',names:car.riders.map(pName),pending:!car.driver}))}));
 for(const leg of p.linked?['outbound']:['outbound','return']){
  if(!p.enabled[leg])continue;const names=missing(p,leg).map(m=>m.name);
  if(names.length)sections.push({label:'未配車',legLabel:p.linked?'往復':leg==='outbound'?'行き':'帰り',cards:Array.from({length:Math.ceil(names.length/4)},(_,i)=>({title:'未配車',names:names.slice(i*4,i*4+4),pending:true}))});
 }
 if(!sections.length)sections.push({label:'配車',legLabel:p.linked?'往復':'',cards:[{title:'配置なし',names:[],pending:true}]});
 // Wrap sections into rows, then grow width if the sheet would be portrait.
 const blocks=sections.map(s=>{
  probe.font=font(18,true);const titles=s.cards.map(c=>measureLines(probe,c.title,colW-20));probe.font=font(17);const names=s.cards.map(c=>c.names.flatMap(name=>measureLines(probe,name,colW-20)));
  return {...s,titles,names,width:s.cards.length*colW,height:46+Math.max(...titles.map(a=>a.length*24+20))+Math.max(1,...names.map(a=>a.length))*25+28};
 });
 let width=Math.max(1000,...blocks.map(b=>b.width+pad*2)),rows,height;
 function layout(){rows=[];let row={blocks:[],width:0,height:0};for(const b of blocks){if(row.blocks.length&&row.width+gap+b.width>width-pad*2){rows.push(row);row={blocks:[],width:0,height:0};}row.blocks.push(b);row.width+=(row.blocks.length>1?gap:0)+b.width;row.height=Math.max(row.height,b.height);}if(row.blocks.length)rows.push(row);height=125+rows.reduce((n,r)=>n+r.height+gap,0);}
 layout();while(height>width*.72&&width<7600){width+=240;layout();}
 if(width>8000||height>12000)throw Error('画像にするデータが大きすぎます');
 const [cv,c]=imageCanvas(width,Math.max(340,height));c.fillStyle='#18211c';c.font=font(24,true);
 const title=`${jpDate(e.date)} ${venue(e.venueId)?.name||e.title}${p.linked?'（往復）':''}`;measureLines(c,title,width-pad*2).slice(0,2).forEach((line,i)=>c.fillText(line,pad,42+i*29));
 let y=115;for(const row of rows){let x=pad;for(const b of row.blocks){c.font=font(16,true);c.fillStyle='#3e5044';c.fillText(`${b.label}${b.legLabel?' · '+b.legLabel:''}`,x,y);const hh=Math.max(...b.titles.map(a=>a.length*24+20));
  b.cards.forEach((card,i)=>{const cx=x+i*colW;c.fillStyle=card.pending?'#fff0d6':'#edf7f0';c.fillRect(cx,y+14,colW,hh);c.strokeStyle='#dce5df';c.strokeRect(cx,y+14,colW,row.height-32);c.strokeRect(cx,y+14,colW,hh);c.fillStyle='#18211c';c.font=font(18,true);b.titles[i].forEach((line,j)=>c.fillText(line,cx+10,y+43+j*24));c.font=font(17);b.names[i].forEach((line,j)=>c.fillText(line,cx+10,y+hh+43+j*25));});x+=b.width+gap;
 }y+=row.height+gap;}
 return cv;
};
window.ClubApp.drawCarCanvas=(id)=>drawCarCanvas(id);
if(ctx.ready)render();

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
 if(!sections.length)sections.push({label:'配車',legLabel:p.linked?'往復':'',cards:[{title:'配置なし',names:[],pending:true}]});
 // Wrap sections into rows, then grow width if the sheet would be portrait.
 const blocks=sections.map(s=>{
  probe.font=font(18,true);const titles=s.cards.map(c=>measureLines(probe,c.title,colW-20));probe.font=font(17);const names=s.cards.map(c=>c.names.flatMap(name=>measureLines(probe,name,colW-20)));
  return {...s,titles,names,width:s.cards.length*colW,height:46+Math.max(...titles.map(a=>a.length*24+20))+Math.max(1,...names.map(a=>a.length))*25+28};
 });
 const title=`${jpDate(e.date)} ${eventVenue(e)?.name||e.title}${p.linked?'（往復）':''}`;
 let width=Math.max(600,Math.min(1600,blocks.reduce((n,b)=>n+b.width+gap,0)+pad*2-gap),...blocks.map(b=>b.width+pad*2)),rows,height,titleLines,headHeight;
 function layout(){rows=[];let row={blocks:[],width:0,height:0};for(const b of blocks){if(row.blocks.length&&row.width+gap+b.width>width-pad*2){rows.push(row);row={blocks:[],width:0,height:0};}row.blocks.push(b);row.width+=(row.blocks.length>1?gap:0)+b.width;row.height=Math.max(row.height,b.height);}if(row.blocks.length)rows.push(row);probe.font=font(24,true);titleLines=measureLines(probe,title,width-pad*2);headHeight=60+titleLines.length*29;height=headHeight+rows.reduce((n,r)=>n+r.height+gap,0);}
 layout();while(height>width*.72&&width<7600){width+=240;layout();}
 if(width>8000||height>12000)throw Error('画像にするデータが大きすぎます');
 const [cv,c]=imageCanvas(width,Math.max(340,height));c.fillStyle='#18211c';c.font=font(24,true);
 titleLines.forEach((line,i)=>c.fillText(line,pad,42+i*29));
 let y=headHeight;for(const row of rows){let x=pad;for(const b of row.blocks){c.font=font(16,true);c.fillStyle='#3e5044';c.fillText(`${b.label}${!p.linked&&b.legLabel?' · '+b.legLabel:''}`,x,y);const hh=Math.max(...b.titles.map(a=>a.length*24+20));
  b.cards.forEach((card,i)=>{const cx=x+i*colW;c.fillStyle=card.pending?'#fff0d6':'#edf7f0';c.fillRect(cx,y+14,colW,hh);c.strokeStyle='#dce5df';c.strokeRect(cx,y+14,colW,row.height-32);c.strokeRect(cx,y+14,colW,hh);c.fillStyle='#18211c';c.font=font(18,true);b.titles[i].forEach((line,j)=>c.fillText(line,cx+10,y+43+j*24));c.font=font(17);b.names[i].forEach((line,j)=>c.fillText(line,cx+10,y+hh+43+j*25));});x+=b.width+gap;
 }y+=row.height+gap;}
 return cv;
};
window.ClubApp.drawCarCanvas=(id)=>drawCarCanvas(id);
function drawScheduleCanvas(id){
 const p=plan(id),e=event(p?.eventId);if(!p||!e)throw Error('配車が見つかりません');
 const pad=28,colW=196,carGap=12,categoryGap=18,carRowGap=14,probe=document.createElement('canvas').getContext('2d'),font=(n,b=false)=>`${b?'600':'400'} ${n}px sans-serif`,imageName=id=>String(pName(id)).replace(/^[\s・･·•●○◦▪]+|[\s・･·•●○◦▪]+$/gu,'');
 const categories=[['university','大学配車'],['station','駅配車']];
 const legs=['outbound','return'].filter(leg=>p.enabled[leg]);
 const allDirections=new Map();
 const buckets=categories.map(([key,label])=>{
  const carsById=new Map();
  for(const leg of legs)for(const car of p.legs[leg]||[]){
   if(car.pickup!==key||(!car.driver&&!(car.riders||[]).length))continue;
   const id=String(car.id||`${key}:${car.driver||'car'}`);let merged=carsById.get(id);if(!merged){merged={id,drivers:new Map(),riders:new Map()};carsById.set(id,merged);}
   const add=(map,personId)=>{if(!personId)return;let directions=map.get(personId);if(!directions){directions=new Set();map.set(personId,directions);}directions.add(leg);let all=allDirections.get(personId);if(!all){all=new Set();allDirections.set(personId,all);}all.add(leg);};
   add(merged.drivers,car.driver);for(const rider of car.riders||[])add(merged.riders,rider);
  }
  const cars=[...carsById.values()].map(car=>{
   const personRows=(people,bold)=>[...people].map(([id,directions])=>{const all=allDirections.get(id)||directions,direction=all.size===1?(all.has('outbound')?'行き':'帰り'):'';probe.font=font(bold?17:16,bold);const lines=measureLines(probe,imageName(id),colW-(direction?58:20));return {lines,direction};});
   const drivers=personRows(car.drivers,true),riders=personRows(car.riders,false);
   const driverHeight=Math.max(56,drivers.reduce((n,row)=>n+Math.max(24,row.lines.length*21+8),0));
   const riderHeights=riders.map(row=>Math.max(42,row.lines.length*21+16));
   return {drivers,riders,driverHeight,riderHeights,height:driverHeight+riderHeights.reduce((a,b)=>a+b,0)};
  });
  const rowCount=Math.max(1,Math.ceil(cars.length/2)),rowHeights=Array.from({length:rowCount},(_,i)=>Math.max(48,...cars.slice(i*2,i*2+2).map(car=>car.height)));
  const width=Math.max(1,Math.min(2,cars.length||1))*colW+(Math.min(2,cars.length||1)-1)*carGap;
  const bodyHeight=cars.length?rowHeights.reduce((n,h)=>n+h,0)+Math.max(0,rowCount-1)*carRowGap:48;
  return {key,label,cars,width,rowHeights,bodyHeight};
 });
 const gridWidth=buckets.reduce((n,b)=>n+b.width,0)+categoryGap;
 const width=Math.max(520,pad*2+gridWidth);
 const height=pad*2+38+Math.max(48,...buckets.map(b=>b.bodyHeight));
 if(width>8000||height>12000)throw Error('画像にするデータが大きすぎます');
 const [cv,c]=imageCanvas(width,height);c.fillStyle='#fff';c.fillRect(0,0,width,height);c.fillStyle='#14813b';c.fillRect(0,0,width,10);
 const textWithDirection=(row,x,y,size,bold,lineHeight)=>{
  c.font=font(size,bold);c.fillStyle='#17251b';row.lines.forEach((line,i)=>c.fillText(line,x,y+i*lineHeight));
  if(row.direction){const last=row.lines[row.lines.length-1]||'';const directionX=x+c.measureText(last).width+7;c.font=font(13,true);c.fillStyle='#2463eb';c.fillText(row.direction,directionX,y+(row.lines.length-1)*lineHeight);}
 };
 let x=pad+(width-pad*2-gridWidth)/2;const headingY=pad,bodyTop=pad+38;
 for(const [index,bucket] of buckets.entries()){
  c.fillStyle='#eaf4ec';c.fillRect(x,headingY,bucket.width,32);c.fillStyle='#26392b';c.font=font(17,true);c.textAlign='center';c.fillText(bucket.label,x+bucket.width/2,headingY+22);c.textAlign='left';
  for(let rowIndex=0;rowIndex<bucket.rowHeights.length;rowIndex++){
   const rowY=bodyTop+bucket.rowHeights.slice(0,rowIndex).reduce((a,b)=>a+b,0)+rowIndex*carRowGap;
   bucket.cars.slice(rowIndex*2,rowIndex*2+2).forEach((car,i)=>{
    const cx=x+i*(colW+carGap);let cy=rowY;c.fillStyle='#eaf4ec';c.fillRect(cx,cy,colW,car.driverHeight);c.strokeStyle='#cbd9cd';c.strokeRect(cx,cy,colW,car.driverHeight);
    if(car.drivers.length){let dy=cy+24;for(const driver of car.drivers){textWithDirection(driver,cx+10,dy,17,true,21);dy+=Math.max(24,driver.lines.length*21+8);}}
    else{c.font=font(15);c.fillStyle='#68746c';c.fillText('運転者未定',cx+10,cy+25);}
    cy+=car.driverHeight;
    car.riders.forEach((rider,row)=>{const rowH=car.riderHeights[row];c.fillStyle='#fff';c.fillRect(cx,cy,colW,rowH);c.strokeStyle='#d9e2da';c.strokeRect(cx,cy,colW,rowH);textWithDirection(rider,cx+10,cy+25,16,false,21);cy+=rowH;});
   });
  }
  c.fillStyle='#d7e2d9';c.fillRect(x+bucket.width+categoryGap/2,headingY,1,height-pad-headingY);x+=bucket.width+categoryGap;
 }
 return cv;
}
window.ClubApp.drawScheduleCanvas=(id)=>drawScheduleCanvas(id);
if(ctx.ready)render();

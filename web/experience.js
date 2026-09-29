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
 const pad=40,colW=190,gap=22,probe=document.createElement('canvas').getContext('2d'),font=(n,b=false)=>`${b?'600':'400'} ${n}px sans-serif`;
 const people=participants(e.id).map(m=>m.name),peopleLines=[];probe.font=font(17);for(const name of people)peopleLines.push(...measureLines(probe,name,880));
 const legs=['outbound','return'].filter(leg=>p.enabled[leg]);
 const sections=legs.map(leg=>{const cars=['university','station'].flatMap(key=>p.legs[leg].filter(c=>c.pickup===key&&(c.driver||c.riders.length)).map(c=>({...c,pickupLabel:key==='university'?'大学配車':'駅配車'})));return {leg,cars};});
 const carCount=Math.max(1,...sections.map(s=>s.cars.length)),width=Math.max(900,pad*2+carCount*colW+Math.max(0,carCount-1)*gap);
 probe.font=font(25,true);const titleLines=measureLines(probe,e.title||'部活予定',width-pad*2);
 probe.font=font(16);const meta=[`${jpDate(e.date,true)}${e.endDate&&e.endDate!==e.date?'〜'+jpDate(e.endDate,true):''}${e.start?'　'+e.start+(e.end?'〜'+e.end:''):''}`,eventVenue(e)?.name||'',e.memo||''].filter(Boolean),metaLines=meta.flatMap(line=>measureLines(probe,line,width-pad*2));
 const blocks=sections.map(section=>{const names=section.cars.map(c=>({driver:measureLines(probe,c.driver?pName(c.driver):'運転者未定',colW-24),riders:c.riders.flatMap(mid=>measureLines(probe,pName(mid),colW-24))}));const rows=Math.max(1,...names.map(c=>Math.ceil(c.riders.length/2)));const feeLines=p.fareMode==='event'?(p.linked&&section.leg==='return'&&section.cars.length?['イベント実費は往復合計']:section.cars.map(car=>{const cost=p.eventCosts?.[section.leg]?.[car.id]||{},sum=['gasoline','toll','parking','otherTransport','other'].reduce((n,key)=>n+(Number.isInteger(cost[key])?cost[key]:0),0),occupants=new Set([car.driver,...car.riders].filter(Boolean)).size,split=sum&&occupants?D.eventFeeSplit(sum,occupants):null;return `${pName(car.driver)}　実費 ${money(sum)}${split?`　1人 ${money(split.perPerson)}　運転者受取 ${money(split.driverReceives)}`:''}`;})):section.cars.length?[...new Set(section.cars.map(car=>car.pickup))].map(key=>{const car=section.cars.find(item=>item.pickup===key),yen=D.fixedCarFee(state,p,car);return `${key==='university'?'大学':'駅'}配車　片道 ${Number.isInteger(yen)?money(yen):'未設定'} / 人`;}):[];probe.font=font(13);const footerLines=feeLines.flatMap(line=>measureLines(probe,line,width-pad*2-8));return {...section,names,rows,headerH:Math.max(58,...names.map(c=>c.driver.length*22+22)),rowH:rows*38,footerLines};});
 const participantH=peopleLines.length?36+peopleLines.length*24:0,memo=e.contactMemo||e.memo||p.memo||'';probe.font=font(15);const memoLines=memo?measureLines(probe,'連絡事項: '+memo,width-pad*2):[];
 const blockHeight=b=>42+(b.cars.length?b.headerH+b.rowH+10:46)+b.footerLines.length*22+14;
 const height=pad+34+titleLines.length*32+metaLines.length*24+participantH+blocks.reduce((n,b)=>n+blockHeight(b),0)+memoLines.length*22+pad+20;if(width>8000||height>12000)throw Error('画像にするデータが大きすぎます');
 const [cv,c]=imageCanvas(width,height);c.fillStyle='#14813b';c.fillRect(0,0,width,12);let y=pad+28;c.fillStyle='#18211c';c.font=font(25,true);titleLines.forEach(line=>{c.fillText(line,pad,y);y+=32;});c.font=font(16);c.fillStyle='#46564b';metaLines.forEach(line=>{c.fillText(line,pad,y);y+=24;});
 if(peopleLines.length){y+=12;c.fillStyle='#eaf4ec';c.fillRect(pad,y,width-pad*2,34+peopleLines.length*24);c.fillStyle='#246b38';c.font=font(15,true);c.fillText(`参加者 ${people.length}人`,pad+12,y+22);c.fillStyle='#26332a';c.font=font(15);peopleLines.forEach((line,i)=>c.fillText(line,pad+132,y+22+i*24));y+=34+peopleLines.length*24+16;}
 for(const b of blocks){const isOut=b.leg==='outbound',label=isOut?'行き':'帰り',day=p.legDates?.[b.leg]||(isOut?e.date:(e.endDate||e.date));c.fillStyle='#e8f4eb';c.fillRect(pad,y,width-pad*2,36);c.fillStyle='#176d35';c.font=font(20,true);c.fillText(`${label}　${jpDate(day)}`,pad+12,y+25);y+=42;
  if(!b.cars.length){c.fillStyle='#68746c';c.font=font(16);c.fillText('配車なし',pad+8,y+24);y+=46;}
  else{const top=y;for(let i=0;i<b.cars.length;i++){const car=b.cars[i],x=pad+i*(colW+gap),driver=b.names[i].driver;c.fillStyle='#f2f7f3';c.fillRect(x,y,colW,b.headerH);c.strokeStyle='#bdcfbf';c.strokeRect(x,y,colW,b.headerH);c.fillStyle='#526457';c.font=font(12);c.fillText(car.pickupLabel,x+10,y+17);c.fillStyle='#17251b';c.font=font(18,true);driver.forEach((line,j)=>c.fillText(line,x+10,y+42+j*22));let cy=y+b.headerH;for(let row=0;row<b.rows;row++){c.fillStyle='#fff';c.fillRect(x,cy,colW,38);c.strokeStyle='#d9e2da';c.strokeRect(x,cy,colW,38);const lines=b.names[i].riders.slice(row*2,row*2+2);c.fillStyle='#26332a';c.font=font(15);lines.forEach((line,j)=>c.fillText(line,x+10,cy+24+j*17));cy+=38;} }
   y=top+b.headerH+b.rowH+8;c.fillStyle='#405447';c.font=font(13);for(const line of b.footerLines){c.fillText(line,pad+4,y);y+=22;}
  }
  y+=14;
 }
 if(memoLines.length){c.fillStyle='#8a2c24';c.font=font(15);memoLines.forEach(line=>{c.fillText(line,pad,y);y+=22;});}
 return cv;
}
window.ClubApp.drawScheduleCanvas=(id)=>drawScheduleCanvas(id);
if(ctx.ready)render();

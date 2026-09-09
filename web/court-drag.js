'use strict';
let courtPress=null,courtDrag=null,courtDragFrame=0,courtDragSuppress=0;
function courtDragAllowed(){return getRoute()[0]==='court-ranking'&&edit('courtAssignments')&&!ctx.busy&&!ctx.conflict;}
function courtDragStart(){
 const p=courtPress;if(!p||!p.row.isConnected||!courtDragAllowed())return courtDragClean();
 const rows=[...document.querySelectorAll('[data-rank-person]')],from=rows.indexOf(p.row);if(from<0)return courtDragClean();
 window.getSelection?.()?.removeAllRanges();
 const box=p.row.getBoundingClientRect(),ghost=p.row.cloneNode(true);ghost.removeAttribute('data-rank-person');ghost.classList.add('court-rank-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
 Object.assign(ghost.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});document.body.appendChild(ghost);
 courtDrag={rows,from,to:from,id:p.row.dataset.rankPerson,ghost,height:box.height,offset:p.y-box.top,y:p.y};p.row.classList.add('court-rank-lifted');rows.forEach(el=>el.classList.add('court-rank-sorting'));courtDragTick();
}
function courtDragPosition(y){
 const d=courtDrag;if(!d)return;d.y=y;d.ghost.style.top=(y-d.offset)+'px';
 const start=d.rows[0].parentElement.getBoundingClientRect().top,center=y-d.offset+d.height/2;
 d.to=Math.max(0,Math.min(d.rows.length-1,Math.floor((center-start)/d.height)));
 d.rows.forEach((el,i)=>{const shift=i===d.from?0:d.to>d.from&&i>d.from&&i<=d.to?-d.height:d.to<d.from&&i>=d.to&&i<d.from?d.height:0;el.dataset.rankShift=String(shift);el.style.transform=`translateY(${shift}px)`;});
}
function courtDragTick(){
 const d=courtDrag;if(!d)return;if(!courtDragAllowed()||!d.rows[0].isConnected){courtDragClean();return;}
 const delta=d.y<110?-8:d.y>window.innerHeight-90?8:0;if(delta)window.scrollBy(0,delta);courtDragPosition(d.y);courtDragFrame=requestAnimationFrame(courtDragTick);
}
function courtDragClean(){
 clearTimeout(courtPress?.timer);cancelAnimationFrame(courtDragFrame);courtDragFrame=0;
 if(courtDrag){courtDrag.ghost.remove();courtDrag.rows.forEach(el=>{el.style.transform='';delete el.dataset.rankShift;el.classList.remove('court-rank-sorting','court-rank-lifted');});}
 courtDrag=null;courtPress=null;
}
function courtDragFinish(cancel=false){
 const d=courtDrag;if(!d){courtDragClean();return;}
 const before=courtRankRects();before.set(d.id,d.ghost.getBoundingClientRect());const allowed=courtDragAllowed();courtDragSuppress=Date.now()+500;courtDragClean();
 if(!cancel&&allowed&&d.to!==d.from)courtMove(d.id,d.to,before);else courtRankAnimate(before,d.id);
}
function courtDragPress(ev,x,y,touch,id){
 if(!courtDragAllowed()||ev.target.closest('select,input,button,a'))return;
 const row=ev.target.closest('[data-rank-person]');if(!row)return;courtDragClean();courtPress={row,x,y,touch,id};if(touch)courtPress.timer=setTimeout(courtDragStart,150);
}
function courtDragMove(x,y){const p=courtPress;if(!p)return;if(!courtDrag){if(Math.hypot(x-p.x,y-p.y)>8){if(p.touch)courtDragClean();else courtDragStart();}}if(courtDrag)courtDragPosition(y);}
window.addEventListener('touchstart',ev=>{if(ev.touches.length!==1){courtDragFinish(true);return;}const t=ev.touches[0];courtDragPress(ev,t.clientX,t.clientY,true,t.identifier);},{capture:true,passive:true});
window.addEventListener('touchmove',ev=>{if(!courtPress?.touch)return;const t=[...ev.touches].find(t=>t.identifier===courtPress.id);if(!t||ev.touches.length!==1){courtDragFinish(true);return;}courtDragMove(t.clientX,t.clientY);if(courtDrag)ev.preventDefault();},{capture:true,passive:false});
for(const type of ['touchend','touchcancel'])window.addEventListener(type,ev=>{if(!courtPress?.touch||![...ev.changedTouches].some(t=>t.identifier===courtPress.id))return;if(courtDrag)ev.preventDefault();courtDragFinish(type==='touchcancel');},{capture:true,passive:false});
window.addEventListener('pointerdown',ev=>{if(ev.pointerType==='touch'||ev.button!==0)return;courtDragPress(ev,ev.clientX,ev.clientY,false,ev.pointerId);});
window.addEventListener('pointermove',ev=>{if(!courtPress||courtPress.touch||courtPress.id!==ev.pointerId)return;courtDragMove(ev.clientX,ev.clientY);if(courtDrag)ev.preventDefault();});
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,ev=>{if(courtPress&&!courtPress.touch&&courtPress.id===ev.pointerId)courtDragFinish(type==='pointercancel');});
for(const type of ['blur','hashchange','resize'])window.addEventListener(type,()=>courtDragFinish(true));
window.addEventListener('contextmenu',ev=>{if(courtPress||ev.target.closest('[data-rank-person]'))ev.preventDefault();});
window.addEventListener('click',ev=>{if((courtDrag||Date.now()<courtDragSuppress)&&getRoute()[0]==='court-ranking'){ev.preventDefault();ev.stopImmediatePropagation();}},true);

window.addEventListener('selectstart',ev=>{if(ev.target.closest?.('.court-rank-row')&&!ev.target.closest('select,input,textarea'))ev.preventDefault();},true);
window.addEventListener('dragstart',ev=>{if(ev.target.closest?.('.court-rank-row'))ev.preventDefault();},true);

'use strict';
/* Focused workflow changes; stored events, training calculations and settlements stay intact. */
const opTaskRow=taskRow;
taskRow=function(t,show=false){if(!t.executiveId)return opTaskRow(t,show);return `<div class="row">${action('op-exec-toggle',t.done?icon('check'):'',`data-id="${esc(t.executiveId)}" ${edit('events')||ownTask(t)?'':'disabled'} aria-label="${esc(t.title)}を${t.done?'未完了':'完了'}にする"`,'check '+(t.done?'on':''))}<a class="row-main" href="#event/${esc(t.executiveId)}"><div class="row-title">${esc(t.title)}</div>${show?`<div class="row-sub">${esc(aNames(t.assignees))}</div>`:''}</a><span class="deadline">${jpDate(t.date)}<br>${esc(t.time)}</span></div>`;};
const opEvent=renderEvent;
renderEvent=function(id){const e=event(id);if(!e)return opEvent(id);if(e.kind==='club')return shell('部活予定','calendar',`<h2>${esc(e.title)}</h2><p>${jpDate(e.date,true)}${e.endDate>e.date?'〜'+jpDate(e.endDate):''}</p>${e.cancelled?'<p class="warning">中止</p>':''}${e.memo?`<p class="memo-text">${esc(e.memo)}</p>`:''}<hr class="rule"><h2>参加者</h2><div class="name-list">${participants(id).map(m=>`<span>${esc(m.name)}</span>`).join('')}</div>`,'calendar',edit('events')?action('op-event-edit','編集',`data-id="${esc(id)}"`,'text-btn'):'');
 return shell('幹部予定','calendar',`<h2>${esc(e.title)}</h2><p>${jpDate(e.date,true)}${e.endDate>e.date?'〜'+jpDate(e.endDate):''} ${esc(e.start||'')}${e.end?'〜'+esc(e.end):''}</p><p>${esc(aNames(e.assignees))}</p>${e.cancelled?'<p class="warning">中止</p>':''}${e.memo?`<p class="memo-text">${esc(e.memo)}</p>`:''}<div class="form-actions">${action('op-exec-toggle',e.done?'未完了に戻す':'完了',`data-id="${esc(id)}" ${e.cancelled||(!edit('events')&&!ownTask(e))?'disabled':''}`,'primary full')}</div>`,'calendar',edit('events')?action('op-event-edit','編集',`data-id="${esc(id)}"`,'text-btn'):'');
};
// Old edit URLs remain usable, but no longer expose the retired fields.
renderEventEdit=function(id,day){return shell('予定','calendar',action('op-event-edit','予定を編集',`data-id="${esc(id||'')}" data-date="${esc(day||DEMO_TODAY)}"`,'primary full'),id?'event/'+id:'calendar');};
const opTaskEdit=renderTaskEdit;
renderTaskEdit=function(id,related=''){if(related&&event(related)?.kind==='executive')return renderEvent(related);return opTaskEdit(id,related);};
renderDay=function(day){return shell(jpDate(day,true),'calendar',calItems(day).map(x=>`<a class="row" href="#${x.type}/${esc(x.id)}"><span class="row-main">${esc(x.title)}</span><span>${x.type==='task'?'':esc(x.time)}</span></a>`).join('')||'<p class="empty">予定はありません</p>','calendar');};
let opVenueTab='assign',opVenueId='',opVenueGroup='',opVenueMonth=null;
renderVenues=function(){
 if(opVenueGroup!==state.group.id){opVenueGroup=state.group.id;opVenueId='';opVenueTab='assign';opVenueMonth=null;}
 if(opVenueMonth===null)opVenueMonth=new Date().getMonth()+1;
 if(!venue(opVenueId))opVenueId=state.venues[0]?.id||'';
 const tabs=segments([['assign','日程への割当'],['venues','体育館編集'],['booking','体育館取り']],opVenueTab,'op-venue-tab');
 if(opVenueTab==='booking')return shell('体育館','operations',tabs+'<p class="empty">体育館取り支援ツール · 準備中</p>','operations');
 if(opVenueTab==='venues')return shell('体育館','operations',tabs+state.venues.map(v=>`<a class="row" href="#venue-edit/${esc(v.id)}"><span class="row-main">${esc(v.name)}</span><span>${v.courts}面</span>${icon('chev')}</a>`).join(''),'operations',edit('venues')?`<a class="icon-btn" href="#venue-edit" aria-label="体育館を追加">${icon('plus')}</a>`:'');
 const days=clubEvents().filter(e=>(e.endDate||e.date)>=DEMO_TODAY&&Number(e.date.slice(5,7))===opVenueMonth);
 return shell('体育館','operations',tabs+(state.venues.length?`<form data-form="op-venue-assign"><div class="op-venue-filters"><label class="field"><span class="label">月</span><select name="venueMonth" aria-label="割当する月">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${opVenueMonth===i+1?'selected':''}>${i+1}月</option>`).join('')}</select></label><label class="field"><span class="label">体育館</span><select name="venueId" ${edit('venues')?'':'disabled'}>${state.venues.map(v=>`<option value="${esc(v.id)}" ${opVenueId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label></div>${days.map(e=>`<label class="row"><input type="checkbox" name="eventId" value="${esc(e.id)}" ${edit('venues')?'':'disabled'}><span class="row-main">${jpDate(e.date)}${e.endDate>e.date?'〜'+jpDate(e.endDate):''}　${esc(e.title)}</span><span class="row-sub">${esc(eventVenue(e)?.name||'未設定')}</span></label>`).join('')||'<p class="empty">この月の今後の部活予定はありません</p>'}${edit('venues')&&days.length?'<div class="sticky-action"><button class="primary full">適用</button></div>':''}<p class="op-error" role="alert"></p></form>`:`<p class="empty">体育館を登録してください</p>${edit('venues')?'<a class="primary full" href="#venue-edit">体育館を追加</a>':''}`),'operations');
};
window.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-act^="op-"]');if(!b||b.disabled)return;actHandled(ev);const d=b.dataset;
 try{
  if(d.act==='op-car-menu'){const p=plan(d.id),ro=!edit('plans')||lockedPlan(d.id)||event(p.eventId)?.cancelled;modal('配車の操作',action('op-car-copy','前回の配車をコピー',`data-id="${esc(d.id)}" ${ro?'disabled':''}`,'row')+action('car-options','配車設定',`data-id="${esc(d.id)}"`,'row')+`<a class="row" href="#car-table/${esc(d.id)}" data-act="close-modal">配車表を確認</a>`+action('wf-car-image','画像出力',`data-id="${esc(d.id)}" ${event(p.eventId)?.cancelled?'disabled':''}`,'row'));return;}
  if(d.act==='op-car-copy'){wfCarMutable(d.id);closeModal();go('car-copy/'+d.id);return;}
  if(d.act==='op-venue-tab'){opVenueTab=d.value;render();return;}
  if(d.act==='op-event-edit'){if(!edit('events'))throw Error('編集権限がありません');calEditor({id:d.id,date:d.date||DEMO_TODAY});return;}
  if(d.act==='op-exec-toggle'){const e=event(d.id);if(!e||e.kind!=='executive'||e.cancelled)throw Error('予定を確認してください');if(!edit('events')&&!ownTask(e))throw Error('担当者ではありません');await wfSave(()=>{e.done=!e.done;e.completedAt=e.done?new Date().toISOString():null;e.completedBy=e.done?state.currentUser:null;});}
 }catch(error){toast(error.message);}
},true);
window.addEventListener('change',ev=>{const f=ev.target.closest('[data-form="op-venue-assign"]');if(!f)return;if(ev.target.name==='venueId')opVenueId=ev.target.value;if(ev.target.name==='venueMonth'){opVenueId=f.elements.venueId.value;opVenueMonth=Number(ev.target.value);render();}},true);
window.addEventListener('submit',async ev=>{
 const f=ev.target;if(f.dataset.form!=='op-venue-assign')return;actHandled(ev);const fd=new FormData(f),vid=String(fd.get('venueId')||''),ids=fd.getAll('eventId');
 try{if(!edit('venues'))throw Error('編集権限がありません');if(!venue(vid)||!ids.length)throw Error('体育館と日程を選択してください');
 const changed=ids.map(event).filter(e=>eventVenue(e)&&eventVenue(e).id!==vid);
 if(changed.length&&!confirm(`${changed.map(e=>jpDate(e.date)).join('・')}の体育館を${venue(vid).name}に変更しますか？`))return;
 await wfSave(()=>{state.venueAssignments||={};for(const id of ids)state.venueAssignments[id]={venueId:vid};});opVenueId=vid;toast('割り当てました');render();
 }catch(error){const box=f.querySelector('.op-error');if(box)box.textContent=error.message;toast(error.message);}
},true);
// Reuse the current car movement model and copy flow; only the editor surface changes.
memberChip=function(mid,needed=false,driver=false){const m=person(mid);return `<button class="person ${needed?'needed':''} ${driver?'op-driver-name':''} ${ui.selectedPerson===mid?'selected':''}" data-act="person-select" data-person="${esc(mid)}" title="${esc(m?.name)}">${driver?'<small>運転</small>':''}<span class="person-name">${esc(m?.name)}</span></button>`;};
function opGradeGroups(members){const groups=new Map();for(const m of members){const grade=Number(m.grade)||0;if(!groups.has(grade))groups.set(grade,[]);groups.get(grade).push(m);}return [...groups].sort(([a],[b])=>b-a);}
renderCar=function(id){
 const p=plan(id);if(!p)return shell('配車','operations','見つかりません','carpools');const e=event(p.eventId),leg=legOf(p),ro=!edit('plans')||lockedPlan(id)||e.cancelled,used=assigned(p,leg),unassigned=participants(e.id).filter(m=>!used.has(m.id)),needed=unassigned.filter(m=>needs(p,leg,m.id)),optional=state.people.filter(m=>m.active&&!used.has(m.id)&&!needs(p,leg,m.id));
 const columns=key=>p.legs[leg].filter(c=>c.pickup===key).map(c=>`<section class="op-car-column" data-car="${esc(c.id)}"><div class="op-car-heading"><div class="driver-slot" data-drop="driver" data-car-id="${esc(c.id)}">${c.driver?memberChip(c.driver,false,true):action('drop-tap','運転手',`data-drop="driver" data-car-id="${esc(c.id)}" aria-label="運転手を配置"`,'op-empty-driver')}</div>${action('car-menu','⋯',`data-id="${esc(c.id)}" aria-label="${esc(c.driver?pName(c.driver):'車')}の操作"`,'tiny-icon')}</div><div class="op-riders" data-drop="passenger" data-car-id="${esc(c.id)}">${c.riders.map(mid=>memberChip(mid)).join('')}${Array.from({length:3-c.riders.length},()=>action('drop-tap','＋',`data-drop="passenger" data-car-id="${esc(c.id)}" aria-label="同乗者を追加"`,'empty-seat')).join('')}</div><span class="op-car-count">${carPeople(c).length}/4</span></section>`).join('');
 let html=header('配車','carpools',action('register-car','完了',`data-id="${esc(id)}" ${ro?'disabled':''}`,'text-btn')+action('op-car-menu','⋯',`data-id="${esc(id)}" aria-label="配車の操作"`,'icon-btn')).replace('<h1>配車</h1>',`<h1 class="op-header-title">配車<small title="${esc(eventVenue(e)?.name||e.title)}">${jpDate(e.date)} ${esc(eventVenue(e)?.name||e.title)}</small></h1>`)+`<main class="op-car-editor"><div class="wf-mode-switch">${[['same','往復同じ'],['separate','行き・帰り別']].map(([v,t])=>action('wf-car-mode',t,`data-id="${esc(id)}" data-value="${v}" ${ro?'disabled':''}`,p.linked===(v==='same')?'active':'')).join('')}</div>${!p.linked?segments([['outbound','行き'],['return','帰り']],leg,'car-leg'):''}${!p.enabled[leg]?'<p class="warning">この片道は対象外です</p>':''}<div class="op-car-columns scroll-pane" data-car-scroll="cars" tabindex="0" role="region" aria-label="車の一覧（横スクロール）">${[['university','大学配車'],['station','駅配車']].map(([key,label])=>`<section class="op-car-section"><h3>${label}</h3><div class="op-car-group-cars">${columns(key)}${action('new-car','＋ 車',`data-drop="new" data-pickup="${key}" ${ro?'disabled':''}`,'op-add-car')}</div></section>`).join('')}</div><section class="op-pool ${needed.length?'has-missing':''}" data-drop="pool"><h3 class="op-pool-heading"><span>未配車 ${needed.length}</span><span class="op-drag-hint">↑ 名前を長押しして移動</span></h3><div class="op-people-strip scroll-pane" data-car-scroll="people" tabindex="0" role="region" aria-label="人の一覧（横スクロール）">${[['university','大学'],['station','駅'],['optional','配車不要']].map(([key,label])=>{const ms=key==='optional'?optional:needed.filter(m=>m.pickup===key);return (key==='optional'&&!ms.length?'<div class="op-people-group op-optional-end"><span>配車不要</span><span class="row-sub">該当者なし</span></div>':'')+opGradeGroups(ms).map(([grade,members])=>`<div class="op-people-group ${key==='optional'?'op-optional-end':''}"><span>${label} · ${grade?grade+'年':'その他'}</span><div class="op-people-grid">${members.map(m=>memberChip(m.id,key!=='optional')).join('')}</div></div>`).join('');}).join('')||'<span class="row-sub">全員配置済み</span>'}</div></section></main>`+nav('operations');
 if(ro)html=html.replaceAll('data-act="person-select"','disabled data-act="person-select"').replaceAll('data-act="drop-tap"','disabled data-act="drop-tap"').replaceAll('data-act="car-menu"','disabled data-act="car-menu"');return html;
};
// Entire name is the handle. Movement before the hold threshold is normal scrolling.
let opHold=null,opGhost=null,opDrag=null,opFrame=0,opSuppress=0;
function opDragClean(){clearTimeout(opHold?.timer);opHold?.el.classList?.remove('is-dragging');opHold=null;opGhost?.remove();opGhost=null;opDrag=null;cancelAnimationFrame(opFrame);document.querySelectorAll('.drop-over').forEach(e=>e.classList.remove('drop-over'));}
function opDragStart(){if(!opHold||opDrag)return;clearTimeout(opHold.timer);opDrag={...opHold};opHold.el.classList?.add('is-dragging');opGhost=document.createElement('div');opGhost.className='drag-ghost';opGhost.textContent=pName(opDrag.mid);document.body.appendChild(opGhost);opDragMove(opDrag.x,opDrag.y);if(!opHold.touch)try{opHold.el.setPointerCapture(opHold.id);}catch{}opFrame=requestAnimationFrame(opDragScroll);}
function opDragMove(x,y){opDrag.x=x;opDrag.y=y;opGhost.style.transform=`translate(${x-35}px,${y-20}px)`;document.querySelectorAll('.drop-over').forEach(e=>e.classList.remove('drop-over'));opDrag.target=document.elementFromPoint(x,y)?.closest('[data-drop]');opDrag.target?.classList.add('drop-over');}
function opDragScroll(){if(!opDrag)return;const hit=document.elementFromPoint(opDrag.x,opDrag.y),pane=hit?.closest('[data-car-scroll]');if(pane){const r=pane.getBoundingClientRect();if(opDrag.x<r.left+32)pane.scrollLeft-=9;if(opDrag.x>r.right-32)pane.scrollLeft+=9;document.querySelectorAll('.drop-over').forEach(e=>e.classList.remove('drop-over'));opDrag.target=document.elementFromPoint(opDrag.x,opDrag.y)?.closest('[data-drop]');opDrag.target?.classList.add('drop-over');}opFrame=requestAnimationFrame(opDragScroll);}
window.addEventListener('pointerdown',ev=>{
 const el=ev.target.closest('[data-person]');if(!el||getRoute()[0]!=='car')return;ev.stopImmediatePropagation();if(ev.pointerType==='touch')return;if(el.disabled||ev.button!==0||ctx.busy||!edit('plans')||lockedPlan(getRoute()[1]))return;
 opDragClean();opHold={el,mid:el.dataset.person,id:ev.pointerId,x:ev.clientX,y:ev.clientY};opHold.mouse=ev.pointerType==='mouse';opHold.timer=setTimeout(opDragStart,60);
},true);
window.addEventListener('pointermove',ev=>{if(!opHold||opHold.touch||ev.pointerId!==opHold.id)return;ev.stopImmediatePropagation();if(!opDrag){if(Math.hypot(ev.clientX-opHold.x,ev.clientY-opHold.y)<=10)return;if(opHold.mouse)opDragStart();else{opDragClean();return;}}ev.preventDefault();opDragMove(ev.clientX,ev.clientY);},{capture:true,passive:false});
// Touch owns its gesture so native horizontal panning cannot cancel a held name.
window.addEventListener('touchstart',ev=>{
 const el=ev.target.closest('[data-person]');if(!el||getRoute()[0]!=='car')return;
 if(ev.touches.length!==1){opDragClean();return;}
 if(el.disabled||ctx.busy||!edit('plans')||lockedPlan(getRoute()[1]))return;
 const t=ev.touches[0];opDragClean();opHold={el,mid:el.dataset.person,id:t.identifier,x:t.clientX,y:t.clientY,touch:true};opHold.timer=setTimeout(opDragStart,60);
},{capture:true,passive:false});
window.addEventListener('touchmove',ev=>{
 if(!opHold?.touch)return;const t=Array.from(ev.touches).find(t=>t.identifier===opHold.id);if(!t)return;
 if(!opDrag){if(Math.hypot(t.clientX-opHold.x,t.clientY-opHold.y)>10)opDragClean();return;}
 ev.preventDefault();ev.stopImmediatePropagation();opDragMove(t.clientX,t.clientY);
},{passive:false,capture:true});
for(const type of ['touchend','touchcancel'])window.addEventListener(type,ev=>{
 if(!opHold?.touch||!Array.from(ev.changedTouches).some(t=>t.identifier===opHold.id))return;
 if(opDrag){ev.preventDefault();opSuppress=Date.now()+700;lastDragUntil=opSuppress;if(type==='touchend'&&opDrag.target)performMove(opDrag.mid,destinationFrom(opDrag.target));}opDragClean();
},{capture:true,passive:false});
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,ev=>{if(!opHold||opHold.touch||ev.pointerId!==opHold.id)return;ev.stopImmediatePropagation();const d=opDrag;if(d){opSuppress=Date.now()+700;lastDragUntil=opSuppress;if(type==='pointerup'&&d.target)performMove(d.mid,destinationFrom(d.target));}opDragClean();},true);
window.addEventListener('blur',opDragClean);
window.addEventListener('contextmenu',ev=>{if(ev.target.closest('[data-person]')&&getRoute()[0]==='car')ev.preventDefault();});
window.addEventListener('click',ev=>{
 if(getRoute()[0]!=='car')return;const b=ev.target.closest('[data-act]');if(!b)return;
 if(Date.now()<opSuppress){actHandled(ev);return;}
 if(b.dataset.act==='drop-tap'&&!ui.selectedPerson){actHandled(ev);const dest=destinationFrom(b),p=plan(getRoute()[1]);if(!edit('plans')||lockedPlan(p.id)||event(p.eventId).cancelled)return;modal(dest.kind==='driver'?'運転者を選ぶ':'同乗者を選ぶ',participants(p.eventId).map(m=>action('assign-choice',esc(m.name),`data-mid="${esc(m.id)}" data-kind="${dest.kind}" data-car-id="${esc(dest.carId)}"`,'row')).join(''));}
},true);
// Keep both horizontal positions through selection, movement and asynchronous saves.
function opFitNames(){if(getRoute()[0]!=='car')return;document.querySelectorAll('.op-car-editor .person-name').forEach(el=>{if(!el.matches?.('.person-name'))return;el.style.fontSize='';const width=el.clientWidth;if(!width)return;let size=parseFloat(getComputedStyle(el).fontSize);for(let i=0;i<3&&el.scrollWidth>width;i++){size=Math.max(1,size*width/el.scrollWidth-.2);el.style.fontSize=size+'px';}});}
window.addEventListener('resize',opFitNames);
if(document.fonts?.ready)document.fonts.ready.then(opFitNames);
const opScrollRender=render;let opScrollRoute='';
render=function(){const key=state?.group?.id+'|'+getRoute().join('/'),positions={};if(key===opScrollRoute)document.querySelectorAll('[data-car-scroll]').forEach(el=>positions[el.dataset.carScroll]=el.scrollLeft);opScrollRender();document.querySelectorAll('[data-car-scroll]').forEach(el=>{el.scrollLeft=positions[el.dataset.carScroll]||0;});opScrollRoute=key;opFitNames();};

// Listing is derived from club dates; opening the list never creates a plan.
function opCarMonths(){const months=new Map(),current=DEMO_TODAY.slice(0,7);months.set(current,[]);for(const e of clubEvents()){const key=e.date.slice(0,7);if(!months.has(key))months.set(key,[]);months.get(key).push(e);}return [...months].sort(([a],[b])=>a.localeCompare(b));}
renderCarpools=function(){return shell('配車','operations',opCarMonths().map(([month,events])=>`<details class="op-car-month" ${month===DEMO_TODAY.slice(0,7)?'open':''}><summary>${Number(month.slice(0,4))}年${Number(month.slice(5))}月</summary>${events.map(e=>{const p=state.plans.find(p=>p.eventId===e.id),gym=eventVenue(e)?.name;const body=`<span class="row-main"><span class="row-title">${jpDate(e.date)}${e.endDate>e.date?'〜'+jpDate(e.endDate):''}</span><span class="row-sub op-car-date-name">${esc(e.title)}${gym?' · '+esc(gym):''}</span></span><span class="op-date-status">${p?(p.status==='draft'?'下書き':'作成済み'):'作成'}</span>${icon('chev','chev')}`;return p?`<a class="row" href="#car/${esc(p.id)}">${body}</a>`:`<button class="row" data-act="car-create" data-id="${esc(e.id)}" ${edit('plans')?'':'disabled'}>${body}</button>`;}).join('')||'<p class="empty">部活予定はありません</p>'}</details>`).join('')+`<hr class="rule">${entry('月次精算','settlement','paper')}`,'operations');};

if(ctx.ready)render();

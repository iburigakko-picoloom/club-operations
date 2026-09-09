'use strict';
const courtUI={eventId:'',mode:'level',groupId:'',rank:null,months:{}};
function courtData(){return state.courtAssignments||{ranking:[],sessions:{}};}
function courtParticipants(eid){const ids=new Set(participants(eid).map(p=>p.id));return courtData().ranking.filter(id=>ids.has(id));}
function courtSnapshot(eid){return {participants:participants(eid).map(p=>p.id).sort(),ranking:courtParticipants(eid),courts:eventVenue(event(eid))?.courts||0,venueId:eventVenue(event(eid))?.id||''};}
function courtStale(saved,eid){return JSON.stringify(saved.source)!==JSON.stringify(courtSnapshot(eid));}
function renderCourts(){
 if(courtUI.groupId!==state.group.id){courtUI.groupId=state.group.id;courtUI.eventId='';courtUI.rank=null;courtUI.months={};}
 const days=clubEvents().filter(e=>!e.cancelled),upcoming=days.find(e=>(e.endDate||e.date)>=DEMO_TODAY);
 if(!days.some(e=>e.id===courtUI.eventId))courtUI.eventId=(upcoming||days[days.length-1])?.id||'';
 const e=event(courtUI.eventId),gym=e&&eventVenue(e),count=e?participants(e.id).length:0,ranked=e?courtParticipants(e.id):[],saved=courtData().sessions[e?.id],ready=e&&gym?.courts&&count&&ranked.length===count,ro=!edit('courtAssignments');
 let html=`<div class="court-toolbar"><a class="secondary" href="#court-ranking">レベル順を設定</a><a class="secondary" href="#attendance" data-court-attendance>出欠を調整</a></div>`;
 const months=new Map();for(const day of [...days].sort((a,b)=>a.date.localeCompare(b.date))){const month=day.date.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(day);}
 html+=`<section class="court-date-picker"><h2 class="label">日程</h2>${[...months].map(([month,dates])=>`<details class="op-car-month" data-court-month="${month}" ${(courtUI.months[month]??(month===DEMO_TODAY.slice(0,7)))?'open':''}><summary>${Number(month.slice(0,4))}年${Number(month.slice(5))}月</summary>${dates.map(d=>`<label class="row court-date-option"><input type="radio" name="court-date" data-court-date value="${esc(d.id)}" ${d.id===e?.id?'checked':''}><span>${jpDate(d.date,true)}　${esc(d.title)}</span></label>`).join('')}</details>`).join('')}</section>`;
 html+=segments([['level','レベル順'],['balanced','均等']],courtUI.mode,'court-mode');
 if(!e)html+='<p class="empty">部活予定を登録してください</p>';
 else if(!gym?.courts)html+='<a class="row" href="#venues">体育館を割り当てる</a>';
 else if(count&&ranked.length!==count)html+='<a class="row" href="#court-ranking">参加者のレベル順を設定してください</a>';
 else if(!count)html+='<a class="row" href="#attendance">参加者を確認してください</a>';
 if(!ro||saved)html+=`<div class="form-actions court-create-actions">${!ro?action('court-create',saved?'再作成':'コート割を作成',ready?'':'disabled','primary'):''}${saved?`<a class="secondary" href="#court-result/${esc(e.id)}/${courtUI.mode}">保存済みを開く</a>`:''}</div>`;
 return shell('コート割','operations',html,'operations');
}
function renderCourtResult(id,mode){
 const e=event(id),saved=courtData().sessions[id];if(!e||!saved)return shell('コート割','operations','<p class="empty">コート割を作成してください</p>','courts');
 const selected=mode==='balanced'?'balanced':'level',groups=saved[selected]||[],gym=eventVenue(e);
 return shell('コート割','operations',`<div class="court-result-heading"><strong>${jpDate(e.date)}</strong><span>${esc(gym?.name||'')}</span><small>${selected==='balanced'?'均等':'レベル順'}</small></div>${courtStale(saved,id)?'<p class="warning">出欠などが変わっています。作成画面から再作成してください。</p>':''}<div class="court-result-grid" style="--court-columns:${Math.max(1,Math.ceil(groups.length/2))}">${groups.map((members,i)=>`<section class="court-column"><h3>コート${i+1}</h3>${members.map(mid=>`<div class="court-name">${esc(pName(mid))}</div>`).join('')}</section>`).join('')}</div>`,'courts');
}

function renderCourtRanking(){
 if(courtUI.groupId!==state.group.id){courtUI.groupId=state.group.id;courtUI.rank=null;}
 const members=state.people.filter(p=>p.active!==false),ids=new Set(members.map(p=>p.id));
 if(!courtUI.rank)courtUI.rank=[...courtData().ranking.filter(id=>ids.has(id)),...members.filter(p=>!courtData().ranking.includes(p.id)).map(p=>p.id)];
 const ro=!edit('courtAssignments');
 return shell('レベル順','courts',`<p class="note">上ほどレベルが高い順。名前を長押しして移動。</p><div class="court-ranking">${courtUI.rank.map((id,i)=>`<div class="row court-rank-row" data-rank-person="${esc(id)}"><span class="court-rank-no">${i+1}</span><button type="button" class="row-main court-rank-name" data-rank-drag aria-label="${esc(pName(id))}をドラッグで移動"><small class="court-rank-grade">${esc(state.people.find(p=>p.id===id)?.grade||"")}年</small>${esc(pName(id))}</button><select data-court-rank="${esc(id)}" aria-label="${esc(pName(id))}の順位" ${ro?'disabled':''}>${courtUI.rank.map((_,j)=>`<option value="${j}" ${i===j?'selected':''}>${j+1}位</option>`).join('')}</select><button type="button" class="court-rank-grip" data-rank-drag aria-label="${esc(pName(id))}をドラッグで移動">⠿</button></div>`).join('')||'<p class="empty">部員を登録してください</p>'}</div>`,'courts',ro?'':action('court-rank-save','保存','','text-btn'));
}
function courtRankRects(){return new Map([...document.querySelectorAll('[data-rank-person]')].map(el=>[el.dataset.rankPerson,el.getBoundingClientRect()]));}
function courtRankAnimate(before,moved){if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;document.querySelectorAll('[data-rank-person]').forEach(el=>{const old=before.get(el.dataset.rankPerson),now=el.getBoundingClientRect();if(old&&el.animate){const dx=old.left-now.left,dy=old.top-now.top;if(dx||dy)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});if(el.dataset.rankPerson===moved)el.animate([{backgroundColor:'#dcefe0'},{backgroundColor:'#ffffff'}],{duration:650});}});}
function courtMove(id,index,before=courtRankRects()){const i=courtUI.rank?.indexOf(id);if(i===undefined||i<0)return;courtUI.rank.splice(i,1);courtUI.rank.splice(Math.max(0,Math.min(index,courtUI.rank.length)),0,id);const y=window.scrollY;render();window.scrollTo(0,y);courtRankAnimate(before,id);}
window.addEventListener('change',ev=>{if(ev.target.matches('[data-court-date]')){courtUI.eventId=ev.target.value;render();}if(ev.target.matches('[data-court-rank]')&&edit('courtAssignments')&&!ctx.busy)courtMove(ev.target.dataset.courtRank,Number(ev.target.value));});
window.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-act^="court-"]');if(!b||b.disabled)return;actHandled(ev);const d=b.dataset;
 if(d.act==='court-mode'){courtUI.mode=d.value;render();return;}
 try{
  if(ctx.busy||!edit('courtAssignments'))throw Error('コート割の編集権限を確認してください');
  if(d.act==='court-rank-save'){const rank=[...courtUI.rank];await wfSave(()=>{state.courtAssignments||={ranking:[],sessions:{}};state.courtAssignments.ranking=rank;});courtUI.rank=null;go('courts');return;}
  if(d.act==='court-create'||d.act==='court-shuffle'){
   const e=event(courtUI.eventId),gym=e&&eventVenue(e),ranked=e?courtParticipants(e.id):[];
   if(!e||e.cancelled||!gym?.courts||!ranked.length||ranked.length!==participants(e.id).length)throw Error('日程・体育館・参加者のレベル順を確認してください');
   const data=CourtDomain.create(ranked,gym.courts),source=courtSnapshot(e.id);
   if(d.act==='court-shuffle'&&(!courtData().sessions[e.id]||courtStale(courtData().sessions[e.id],e.id)))throw Error('先に再作成してください');
   await wfSave(()=>{state.courtAssignments||={ranking:[],sessions:{}};const old=state.courtAssignments.sessions[e.id];state.courtAssignments.sessions[e.id]={source,level:d.act==='court-shuffle'?old.level:data.level,balanced:data.balanced,updatedAt:new Date().toISOString()};});go('court-result/'+e.id+'/'+courtUI.mode);render();toast('保存しました');
  }
 }catch(error){toast(error.message);}
},true);
const courtPreviousOperations=renderOperations;
renderOperations=function(){return courtPreviousOperations().replace(entry('体育館','venues','calendar'),entry('体育館','venues','calendar')+entry('コート割','courts','people'));};
// Enter through the existing route/auth guard; never render a group before login.
const courtPreviousRoute=wfRenderRoute;
wfRenderRoute=function(r,id,extra){const guarded=courtPreviousRoute(r,id,extra);if(guarded!==null)return guarded;if(r==='court-result')return renderCourtResult(id,extra);if(r==='courts')return renderCourts();if(r==='court-ranking')return renderCourtRanking();return null;};
window.addEventListener('hashchange',()=>{if(getRoute()[0]!=='court-ranking')courtUI.rank=null;});
if(ctx.ready)render();

window.addEventListener('toggle',ev=>{const month=ev.target.dataset?.courtMonth;if(month)courtUI.months[month]=ev.target.open;},true);
window.addEventListener('click',ev=>{if(ev.target.closest('[data-court-attendance]')){ui.attendanceMode='date';ui.attendanceEvent=courtUI.eventId;}},true);

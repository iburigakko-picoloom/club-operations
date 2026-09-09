'use strict';
const courtUI={eventId:'',mode:'level',groupId:'',rank:null};
function courtData(){return state.courtAssignments||{ranking:[],sessions:{}};}
function courtParticipants(eid){const ids=new Set(participants(eid).map(p=>p.id));return courtData().ranking.filter(id=>ids.has(id));}
function courtSnapshot(eid){return {participants:participants(eid).map(p=>p.id).sort(),ranking:courtParticipants(eid),courts:eventVenue(event(eid))?.courts||0,venueId:eventVenue(event(eid))?.id||''};}
function courtStale(saved,eid){return JSON.stringify(saved.source)!==JSON.stringify(courtSnapshot(eid));}
function renderCourts(){
 if(courtUI.groupId!==state.group.id){courtUI.groupId=state.group.id;courtUI.eventId='';courtUI.rank=null;}
 const days=clubEvents().filter(e=>!e.cancelled),upcoming=days.find(e=>(e.endDate||e.date)>=DEMO_TODAY);
 if(!days.some(e=>e.id===courtUI.eventId))courtUI.eventId=(upcoming||days[days.length-1])?.id||'';
 const e=event(courtUI.eventId),gym=e&&eventVenue(e),count=e?participants(e.id).length:0,ranked=e?courtParticipants(e.id):[],saved=courtData().sessions[e?.id],ready=e&&gym?.courts&&count&&ranked.length===count,ro=!edit('courtAssignments');
 let html=`<div class="court-toolbar"><a class="text-btn" href="#court-ranking">レベル順を設定</a></div>`;
 if(!e)return shell('コート割','operations',html+'<p class="empty">部活予定を登録してください</p>','operations');
 html+=`<label class="field"><span class="label">日程</span><select data-court-date>${days.map(d=>`<option value="${esc(d.id)}" ${d.id===e.id?'selected':''}>${jpDate(d.date,true)}　${esc(d.title)}</option>`).join('')}</select></label><div class="court-context"><span>${esc(gym?.name||'体育館の割当が必要です')}${gym?' · '+gym.courts+'面':''}</span><a class="text-btn" href="#attendance">参加 ${count}人</a></div>`;
 if(!gym)html+='<a class="row" href="#venues">体育館を割り当てる</a>';
 if(count&&ranked.length!==count)html+='<a class="row" href="#court-ranking">参加者のレベル順を確認してください</a>';
 if(saved&&courtStale(saved,e.id))html+='<p class="warning">出欠・体育館・レベル順が変わっています。再作成してください。</p>';
 html+=segments([['level','レベル順'],['balanced','均等']],courtUI.mode,'court-mode');
 if(saved){const groups=saved[courtUI.mode]||[];html+=`<div class="court-board">${groups.map((members,i)=>`<section class="court-column"><h3>コート${i+1}<small>${members.length}人</small></h3>${members.map(id=>`<div class="court-name">${esc(pName(id))}</div>`).join('')}</section>`).join('')}</div>`;}else html+='<p class="empty">日程を選んで作成</p>';
 if(!ro)html+=`<div class="form-actions">${action('court-create',saved?'再作成':'コート割を作成',ready?'':'disabled','primary full')}${saved&&courtUI.mode==='balanced'?action('court-shuffle','再抽選',ready&&!courtStale(saved,e.id)?'':'disabled','secondary'):''}</div>`;
 return shell('コート割','operations',html,'operations');
}
function renderCourtRanking(){
 if(courtUI.groupId!==state.group.id){courtUI.groupId=state.group.id;courtUI.rank=null;}
 const members=state.people.filter(p=>p.active!==false),ids=new Set(members.map(p=>p.id));
 if(!courtUI.rank)courtUI.rank=[...courtData().ranking.filter(id=>ids.has(id)),...members.filter(p=>!courtData().ranking.includes(p.id)).map(p=>p.id)];
 const ro=!edit('courtAssignments');
 return shell('レベル順','courts',`<p class="note">上ほどレベルが高い順。名前を長押しして移動。</p><div class="court-ranking">${courtUI.rank.map((id,i)=>`<div class="row court-rank-row" data-rank-person="${esc(id)}"><select data-court-rank="${esc(id)}" aria-label="${esc(pName(id))}の順位" ${ro?'disabled':''}>${courtUI.rank.map((_,j)=>`<option value="${j}" ${i===j?'selected':''}>${j+1}位</option>`).join('')}</select><span class="court-rank-no">${i+1}</span><span class="row-main">${esc(pName(id))}</span></div>`).join('')||'<p class="empty">部員を登録してください</p>'}</div>`,'courts',ro?'':action('court-rank-save','保存','','text-btn'));
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
   await wfSave(()=>{state.courtAssignments||={ranking:[],sessions:{}};const old=state.courtAssignments.sessions[e.id];state.courtAssignments.sessions[e.id]={source,level:d.act==='court-shuffle'?old.level:data.level,balanced:data.balanced,updatedAt:new Date().toISOString()};});toast('保存しました');
  }
 }catch(error){toast(error.message);}
},true);
const courtPreviousOperations=renderOperations;
renderOperations=function(){return courtPreviousOperations().replace(entry('体育館','venues','calendar'),entry('体育館','venues','calendar')+entry('コート割','courts','people'));};
// Enter through the existing route/auth guard; never render a group before login.
const courtPreviousRoute=wfRenderRoute;
wfRenderRoute=function(r,id,extra){const guarded=courtPreviousRoute(r,id,extra);if(guarded!==null)return guarded;if(r==='courts')return renderCourts();if(r==='court-ranking')return renderCourtRanking();return null;};
window.addEventListener('hashchange',()=>{if(getRoute()[0]!=='court-ranking')courtUI.rank=null;});
if(ctx.ready)render();

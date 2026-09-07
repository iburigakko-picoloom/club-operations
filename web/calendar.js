/* Calendar interaction adapted from Hitotsu Calendar; shared club records stay authoritative. */
'use strict';
function calVenueName(item){return item?.type==='event'&&item.kind==='club'?(eventVenue(event(item.id))?.name||''):'';}
function calItems(day){const items=D.calendarItems(state,day,ui.calendarSelf||ui.showExec);if(!ui.calendarSelf)return items;const mine=new Set(operationalTasks().filter(t=>!t.done&&!t.deleted&&ownTask(t)).map(t=>t.executiveId?'event:'+t.executiveId:'task:'+t.id));return items.filter(x=>mine.has(x.type+':'+x.id));}
const clubCalendar={selected:new Set(),selecting:false,group:null,suppressClick:0};
const CAL_COLORS=[['green','#9FCA8B','緑'],['blue','#78AEDD','青'],['yellow','#F6C744','黄'],['orange','#F2A15F','橙'],['red','#E98585','赤'],['pink','#EAA7C2','桃'],['purple','#B9A0D9','紫'],['teal','#75C6B5','青緑'],['gray','#BFC4C7','灰']];
function calColor(e){return CAL_COLORS.find(c=>c[0]===e?.colorId)?.[1]||(e?.kind==='executive'?'#B9A0D9':e?.kind==='task'?'#F6C744':'#9FCA8B');}
function calPalette(value='green'){return `<fieldset class="cal-colors"><legend>色</legend>${CAL_COLORS.map(([id,hex,label])=>`<label style="--swatch:${hex}"><input type="radio" name="colorId" value="${id}" ${value===id?'checked':''}><span title="${label}"><span class="sr-only">${label}</span></span></label>`).join('')}</fieldset>`;}
function calClear(){clubCalendar.selected.clear();clubCalendar.selecting=false;}
renderCalendar=function(){
 if(clubCalendar.group!==state.group.id){calClear();clubCalendar.group=state.group.id;}
 const y=ui.calendarYear,m=ui.calendarMonth,offset=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),count=Math.ceil((offset+days)/7)*7;
 const first=`${y}-${String(m+1).padStart(2,'0')}-01`;let cells='';
 for(let i=0;i<count;i++){
  const date=D.addDays(first,i-offset),items=calItems(date),selected=clubCalendar.selected.has(date),primary=items[0],hex=calColor(primary?.type==='event'?event(primary.id):primary);
  cells+=`<button type="button" class="cal-day ${date.slice(0,7)!==first.slice(0,7)?'outside':''} ${date===DEMO_TODAY?'today':''} ${selected?'selected':''} ${items.length?'has-event':''}" style="--event-bg:${hex}60" data-act="cal-day" data-date="${date}" aria-pressed="${selected}" aria-label="${date} ${esc(items.map(x=>x.title).join('、')||'予定なし')}"><span class="cal-number">${Number(date.slice(-2))}</span>${items.slice(0,1).map(item=>{const e=item.type==='event'?event(item.id):item,period=e.endDate>e.date;return `<span class="cal-event ${period?'period':''}" data-cal-id="${esc(item.id)}" data-cal-type="${item.type}" style="--event-color:${calColor(e)}">${esc(item.title)}</span>${calVenueName(item)?`<span class="cal-venue">${esc(calVenueName(item).replaceAll('体育館','').trim())}</span>`:''}`;}).join('')}${items.length>1?`<span class="cal-more">＋${items.length-1}件</span>`:''}</button>`;
 }
 const selection=clubCalendar.selecting?`<div class="cal-selection" role="region" aria-label="日付の選択"><div>${action('cal-clear','×','aria-label="選択を終了"','icon-btn')}<strong>${clubCalendar.selected.size}日を選択</strong></div><div>${action('cal-selected-add','＋ 予定',clubCalendar.selected.size?'':'disabled','primary')}${action('cal-color','色',clubCalendar.selected.size?'':'disabled','secondary')}${action('cal-cancel','中止',clubCalendar.selected.size?'':'disabled','secondary')}</div></div>`:'';
 return shell('予定','calendar',`<section class="cal-surface"><div class="cal-month">${action('month','‹','data-dir="-1" aria-label="前の月"','icon-btn')}${action('cal-month',`${y}年${m+1}月`,'','cal-month-label')}${action('month','›','data-dir="1" aria-label="次の月"','icon-btn')}${action('cal-today','今日','','text-btn')}</div>${segments([['club','部活のみ'],['all','幹部予定も'],['self','自分のやること']],ui.calendarSelf?'self':ui.showExec?'all':'club','calendar-filter')}<div class="cal-grid" style="--weeks:${count/7}" aria-label="月間カレンダー">${'日月火水木金土'.split('').map(x=>`<div class="cal-weekday">${x}</div>`).join('')}${cells}</div><div class="cal-footer">${!ui.calendarSelf&&edit('events')?action('cal-select','複数の日付を選択','','text-btn'):''}${!ui.calendarSelf?action('wf-calendar-image','予定表を画像にする','','text-btn'):''}</div>${selection}</section>`,'',(ui.calendarSelf?edit('tasks'):edit('events'))?action('cal-add',icon('plus'),'aria-label="予定を追加"','icon-btn'):'');
};
function calChoices(){modal('予定を入れる',`${ui.showExec&&edit('tasks')?'<a class="row" href="#task-edit" data-act="close-modal">やることの期限を追加</a>':''}<div class="cal-choices">${[['single','1日','日付を1つ指定'],['multiple','複数の日付','離れた日をまとめて選択'],['period','期間','連続する日を同じ色で表示'],['weekly','曜日指定','毎週の練習を一括登録']].map(([mode,title,sub])=>action('cal-mode',`<span><strong>${title}</strong><small>${sub}</small></span>${icon('chev')}`,`data-mode="${mode}"`,'row')).join('')}</div>`);}
function calEditor({id='',date=DEMO_TODAY,mode='single',dates=[]}={}){
 const old=event(id);if(old){date=old.date;mode=old.endDate>old.date?'period':'single';}
 const e=old||{title:'',date,start:'',end:'',kind:ui.showExec?'executive':'club',venueId:'',memo:'',assignees:[],colorId:'green'},series=old?.seriesId?state.events.filter(x=>x.seriesId===old.seriesId&&!x.cancelled):[];
 const datesField=mode==='multiple'?`<p class="cal-date-summary">${dates.map(x=>esc(jpDate(x))).join('・')}</p>${dates.map(x=>`<input type="hidden" name="selectedDate" value="${x}">`).join('')}`:field(mode==='single'?'日付':'開始日','date',date,'date','required');
 modal(old?'予定を編集':'予定を追加',`<form data-form="cal-event" data-id="${esc(id)}" data-mode="${mode}" class="cal-editor">${series.length>1?`<label class="field"><span class="label">編集する範囲</span><select name="scope"><option value="single">この日だけ</option><option value="series">まとめて（${series.length}件）</option></select></label>`:''}${datesField}${mode==='period'?field('終了日','endDate',old?.endDate||date,'date','required'):''}${mode==='weekly'?field('終了日','repeatUntil',D.addMonths(date,1),'date','required')+`<div class="week-checks">${'日月火水木金土'.split('').map((x,i)=>`<label><input type="checkbox" name="weekday" value="${i}"><span>${x}</span></label>`).join('')}</div>`:''}${field('予定名','title',e.title,'text','required maxlength="200" placeholder="練習・大会など"')}${calPalette(e.colorId||'green')}<input type="hidden" name="kind" value="${e.kind}">${e.kind==='executive'?`<div class="inline-fields">${field('開始（任意）','start',e.start,'time')}${field('終了（任意）','end',e.end,'time')}</div>${assigneeField(e.assignees||[])}${notifications(e.notifications||state.settings.reminders)}`:''}${memoField(e.memo||'')}<p class="cal-error" role="alert"></p><div class="cal-editor-actions">${old?action('cal-cancel-one','中止',`data-id="${esc(id)}"`,'text-btn danger-button'):''}${action('close-modal','キャンセル','','secondary')}<button type="submit" class="primary">保存</button></div>${old?`<a class="text-btn" href="#event/${esc(id)}" data-act="close-modal">${e.kind==='club'?'参加者を見る':'予定の詳細・完了'}</a>`:''}</form>`);
 document.querySelector('#modal-root .modal')?.classList.add('cal-sheet');
}
function calTargets(){return state.events.filter(e=>!e.cancelled&&(ui.showExec?e.kind==='executive':e.kind==='club')&&[...clubCalendar.selected].some(date=>e.date<=date&&(e.endDate||e.date)>=date));}
function calCommit(){D.seedAttendance(state);persist();closeModal();calClear();render();}
window.addEventListener('click',ev=>{
 const b=ev.target.closest('[data-act^="cal-"]');if(!b||b.disabled)return;actHandled(ev);if(ctx.busy){toast('保存中です');return;}
 const {act,date,id,mode}=b.dataset;
 if(ui.calendarSelf&&act==='cal-add'){go('task-edit');return;}
 if(ui.calendarSelf&&act==='cal-day'){if(Date.now()<clubCalendar.suppressClick)return;go('day/'+date);return;}
 if(!['cal-day','cal-today','cal-month','cal-clear'].includes(act)&&!edit('events')){toast('編集権限がありません');return;}
 switch(act){
 case'cal-day':{
  if(Date.now()<clubCalendar.suppressClick)return;
  if(clubCalendar.selecting){clubCalendar.selected.has(date)?clubCalendar.selected.delete(date):clubCalendar.selected.add(date);render();return;}
  const items=calItems(date);
  if(!edit('events')){go('day/'+date);return;}
  if(!items.length)calEditor({date});else if(!ui.showExec&&items.length===1&&items[0].type==='event')calEditor({id:items[0].id});else modal(jpDate(date,true),items.map(x=>x.type==='event'?action('cal-edit',`${x.kind!=='club'&&x.time?esc(x.time)+'　':''}${esc(x.title)}`,`data-id="${esc(x.id)}"`,'row'):`<a class="row" href="#task/${esc(x.id)}" data-act="close-modal">${esc(x.title)}</a>`).join('')+action('cal-new-day',ui.showExec?'＋ 幹部予定を追加':'＋ 予定を追加',`data-date="${date}"`,'secondary full'));break;
 }
 case'cal-add':calChoices();break;
 case'cal-mode':if(mode==='multiple'){closeModal();calClear();clubCalendar.selecting=true;render();}else calEditor({mode});break;
 case'cal-new-day':calEditor({date});break;
 case'cal-edit':calEditor({id});break;
 case'cal-select':clubCalendar.selecting=true;render();break;
 case'cal-clear':calClear();render();break;
 case'cal-selected-add':calEditor({mode:'multiple',dates:[...clubCalendar.selected].sort()});break;
 case'cal-today':ui.calendarYear=Number(DEMO_TODAY.slice(0,4));ui.calendarMonth=Number(DEMO_TODAY.slice(5,7))-1;render();break;
 case'cal-month':modal('年月を選ぶ',`<form data-form="cal-month">${field('年月','month',`${ui.calendarYear}-${String(ui.calendarMonth+1).padStart(2,'0')}`,'month','required')}<button class="primary full" type="submit">表示</button></form>`);break;
 case'cal-color':{const targets=calTargets();if(!targets.length){toast('選択した日に予定がありません');break;}modal('予定の色を変更',`<form data-form="cal-color"><p>${targets.length}件の予定を変更します。期間予定は期間全体の色が変わります。</p>${calPalette()}<button class="primary full" type="submit">変更</button></form>`);break;}
 case'cal-cancel':{const targets=calTargets();if(!targets.length){toast('選択した日に予定がありません');break;}if(confirm(`${targets.length}件の予定を中止しますか？期間予定は期間全体が対象です。`)){checkpoint();targets.forEach(e=>e.cancelled=true);calCommit();}break;}
 case'cal-cancel-one':{const e=event(id);if(e&&confirm('この予定を中止しますか？')){checkpoint();e.cancelled=true;calCommit();}break;}
 }
},true);
window.addEventListener('submit',ev=>{
 const f=ev.target,form=f.dataset.form;if(!form?.startsWith('cal-'))return;actHandled(ev);if(ctx.busy)return;
 const fd=new FormData(f),get=n=>String(fd.get(n)||'').trim();
 try{
  if(form==='cal-month'){const value=get('month');if(!D.validDate(value+'-01'))throw Error('年月を確認してください');ui.calendarYear=Number(value.slice(0,4));ui.calendarMonth=Number(value.slice(5))-1;closeModal();render();return;}
  if(!edit('events'))throw Error('編集権限がありません');
  if(form==='cal-color'){checkpoint();calTargets().forEach(e=>e.colorId=get('colorId'));calCommit();return;}
  const old=event(f.dataset.id),mode=f.dataset.mode,selected=fd.getAll('selectedDate'),date=mode==='multiple'?selected[0]:get('date'),endDate=mode==='period'?get('endDate'):date,start=get('start'),end=get('end');
  const dates=D.datesFor({date,endDate,mode:mode==='period'?'single':mode,repeatUntil:get('repeatUntil'),weekdays:fd.getAll('weekday').map(Number),selectedDates:selected});
  if(!get('title'))throw Error('予定名を入力してください');
  if((start&&!D.validTime(start))||(end&&!D.validTime(end))||(start&&end&&endDate===date&&end<start))throw Error('開始・終了時刻を確認してください');
  const kind=old?.kind||get('kind')||'club',values={title:get('title'),colorId:get('colorId'),kind,memo:get('memo')};
  if(kind==='executive')Object.assign(values,{start,end,assignees:fd.getAll('assignee'),notifications:fd.getAll('notify'),assignmentNeedsReview:false});
  else if(!old)Object.assign(values,{start:'',end:'',venueId:'',assignees:[],notifications:[]});
  if(old&&get('scope')==='series'&&date!==old.date)throw Error('日付の変更は「この日だけ」を選んでください');
  checkpoint();
  if(old){if(get('scope')==='series'&&old.seriesId)state.events.filter(e=>e.seriesId===old.seriesId&&!e.cancelled).forEach(e=>Object.assign(e,values));else Object.assign(old,values,{date,endDate,seriesId:null});}
  else{const seriesId=dates.length>1?UID():null;dates.forEach(dt=>state.events.push({...clone(values),id:UID(),date:dt,endDate:mode==='period'?endDate:dt,seriesId,cancelled:false}));}
  calCommit();
 }catch(error){const box=f.querySelector('.cal-error');if(box)box.textContent=error.message;else toast(error.message);}
},true);
// Date-only movement keeps the source record and all ID-based relationships.
async function calMoveRecord(type,id,from,to){
 if(!D.validDate(from)||!D.validDate(to))throw Error('日付を確認してください');if(from===to)return;
 const key=type==='task'?'tasks':'events';if(!edit(key))throw Error('編集権限がありません');
 const item=state[key].find(x=>x.id===id);if(!item||item.cancelled||item.deleted)throw Error('予定が見つかりません');
 if(from<item.date||from>(item.endDate||item.date))throw Error('予定が変更されています');
 const shift=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000),plans=key==='events'?(state.plans||[]).filter(p=>p.eventId===id):[];
 if(plans.some(p=>lockedPlan(p.id)))throw Error('精算確定済みの予定は移動できません');
 if(plans.length&&!edit('plans'))throw Error('配車がある予定の移動には配車の編集権限も必要です');
 await wfSave(()=>{const start=item.date,end=item.endDate||item.date;item.date=D.addDays(start,shift);if(key==='events'){item.endDate=D.addDays(end,shift);item.seriesId=null;}for(const p of plans){for(const leg of ['outbound','return'])if(p.legDates?.[leg]===start||p.legDates?.[leg]===end)p.legDates[leg]=D.addDays(p.legDates[leg],shift);p.status='draft';p.version=(p.version||0)+1;}D.seedAttendance(state);});
 toast('日程を変更しました');
}
let calPress=null,calPressTimer=null,calGhost=null;
function calDragClear(){clearTimeout(calPressTimer);calPressTimer=null;calPress=null;calGhost?.remove();calGhost=null;document.querySelectorAll('.cal-drop-over').forEach(e=>e.classList.remove('cal-drop-over'));}
window.addEventListener('pointerdown',ev=>{
 const b=ev.target.closest('[data-act="cal-day"]');if(!b||ctx.busy||ev.button!==0)return;
 const chip=ev.target.closest('[data-cal-id]'),items=calItems(b.dataset.date),item=chip?items.find(x=>x.id===chip.dataset.calId&&x.type===chip.dataset.calType):items.length===1?items[0]:null;
 if(ui.calendarSelf&&!item)return;
 if(!edit(item?.type==='task'?'tasks':'events'))return;
 calPress={x:ev.clientX,y:ev.clientY,date:b.dataset.date,id:ev.pointerId,item,active:false,group:state.group.id};
 calPressTimer=setTimeout(()=>{if(!calPress)return;calPressTimer=null;clubCalendar.suppressClick=Date.now()+700;
  if(item&&!clubCalendar.selecting){calPress.active=true;calGhost=document.createElement('div');calGhost.className='drag-ghost';calGhost.textContent=item.title;document.body.appendChild(calGhost);calGhost.style.transform=`translate(${calPress.x-35}px,${calPress.y-20}px)`;try{b.setPointerCapture(ev.pointerId);}catch{}}
  else{clubCalendar.selecting=true;clubCalendar.selected.add(calPress.date);render();}
 },450);
},true);
window.addEventListener('pointermove',ev=>{
 if(!calPress||ev.pointerId!==calPress.id)return;
 if(!calPress.active){if(Math.hypot(ev.clientX-calPress.x,ev.clientY-calPress.y)>10)calDragClear();return;}
 ev.preventDefault();calGhost.style.transform=`translate(${ev.clientX-35}px,${ev.clientY-20}px)`;document.querySelectorAll('.cal-drop-over').forEach(e=>e.classList.remove('cal-drop-over'));document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-act="cal-day"]')?.classList.add('cal-drop-over');
},{capture:true,passive:false});
window.addEventListener('touchmove',ev=>{if(calPress?.active)ev.preventDefault();},{capture:true,passive:false});
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,async ev=>{
 if(!calPress||ev.pointerId!==calPress.id)return;const p=calPress,to=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-act="cal-day"]')?.dataset.date;
 if(p.active){clubCalendar.suppressClick=Date.now()+700;ev.preventDefault();}calDragClear();
 if(type==='pointerup'&&p.active&&to&&p.group===state.group.id)try{await calMoveRecord(p.item.type,p.item.id,p.date,to);}catch(error){toast(error.message);}
},true);
window.addEventListener('blur',calDragClear);
window.addEventListener('hashchange',calDragClear);
window.addEventListener('contextmenu',ev=>{if(ev.target.closest('[data-act="cal-day"]')&&edit('events'))ev.preventDefault();});

window.addEventListener('click',ev=>{const b=ev.target.closest('[data-act="calendar-filter"]');if(!b||b.disabled)return;actHandled(ev);ui.calendarSelf=b.dataset.value==='self';ui.showExec=b.dataset.value==='all';calClear();render();},true);

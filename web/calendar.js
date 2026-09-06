/* Calendar interaction adapted from Hitotsu Calendar; shared club records stay authoritative. */
'use strict';
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
  const date=D.addDays(first,i-offset),items=D.calendarItems(state,date,ui.showExec),selected=clubCalendar.selected.has(date),primary=items[0],hex=calColor(primary?.type==='event'?event(primary.id):primary);
  cells+=`<button type="button" class="cal-day ${date.slice(0,7)!==first.slice(0,7)?'outside':''} ${date===DEMO_TODAY?'today':''} ${selected?'selected':''} ${items.length?'has-event':''}" style="--event-bg:${hex}60" data-act="cal-day" data-date="${date}" aria-pressed="${selected}" aria-label="${date} ${esc(items.map(x=>x.title).join('、')||'予定なし')}"><span class="cal-number">${Number(date.slice(-2))}</span>${items.slice(0,2).map(item=>{const e=item.type==='event'?event(item.id):item,period=e.endDate>e.date;return `<span class="cal-event ${period?'period':''}" style="--event-color:${calColor(e)}">${esc(item.title)}</span>`;}).join('')}${items.length>2?`<span class="cal-more">＋${items.length-2}件</span>`:''}</button>`;
 }
 const selection=clubCalendar.selecting?`<div class="cal-selection" role="region" aria-label="日付の選択"><div>${action('cal-clear','×','aria-label="選択を終了"','icon-btn')}<strong>${clubCalendar.selected.size}日を選択</strong></div><div>${action('cal-selected-add','＋ 予定',clubCalendar.selected.size?'':'disabled','primary')}${action('cal-color','色',clubCalendar.selected.size?'':'disabled','secondary')}${action('cal-cancel','中止',clubCalendar.selected.size?'':'disabled','secondary')}</div></div>`:'';
 return shell('予定','calendar',`<section class="cal-surface"><div class="cal-month">${action('month','‹','data-dir="-1" aria-label="前の月"','icon-btn')}${action('cal-month',`${y}年${m+1}月`,'','cal-month-label')}${action('month','›','data-dir="1" aria-label="次の月"','icon-btn')}${action('cal-today','今日','','text-btn')}</div>${segments([['club','部活のみ'],['all','幹部予定も表示']],ui.showExec?'all':'club','calendar-filter')}<div class="cal-grid" aria-label="月間カレンダー">${'日月火水木金土'.split('').map(x=>`<div class="cal-weekday">${x}</div>`).join('')}${cells}</div><p class="cal-hint">${edit('events')?'日付をタップして予定を入力。長押しで複数の日を選択できます。':'日付をタップすると予定を確認できます。'}</p><div class="cal-footer">${edit('events')?action('cal-select','複数の日付を選択','','text-btn'):''}${action('wf-calendar-image','予定表を画像にする','','text-btn')}</div>${selection}${edit('events')&&!clubCalendar.selecting?action('cal-add','＋','aria-label="予定を追加"','cal-fab'):''}</section>`,'',edit('events')?action('cal-add',icon('plus'),'aria-label="予定を追加"','icon-btn'):'');
};
function calChoices(){modal('予定を入れる',`<div class="cal-choices">${[['single','1日','日付を1つ指定'],['multiple','複数の日付','離れた日をまとめて選択'],['period','期間','連続する日を同じ色で表示'],['weekly','曜日指定','毎週の練習を一括登録']].map(([mode,title,sub])=>action('cal-mode',`<span><strong>${title}</strong><small>${sub}</small></span>${icon('chev')}`,`data-mode="${mode}"`,'row')).join('')}</div>`);}
function calEditor({id='',date=DEMO_TODAY,mode='single',dates=[]}={}){
 const old=event(id);if(old){date=old.date;mode=old.endDate>old.date?'period':'single';}
 const e=old||{title:'',date,start:'',end:'',kind:'club',venueId:'',memo:'',assignees:[],colorId:'green'},series=old?.seriesId?state.events.filter(x=>x.seriesId===old.seriesId&&!x.cancelled):[];
 const datesField=mode==='multiple'?`<p class="cal-date-summary">${dates.map(x=>esc(jpDate(x))).join('・')}</p>${dates.map(x=>`<input type="hidden" name="selectedDate" value="${x}">`).join('')}`:field(mode==='single'?'日付':'開始日','date',date,'date','required');
 modal(old?'予定を編集':'予定を追加',`<form data-form="cal-event" data-id="${esc(id)}" data-mode="${mode}" class="cal-editor">${series.length>1?`<label class="field"><span class="label">編集する範囲</span><select name="scope"><option value="single">この日だけ</option><option value="series">まとめて（${series.length}件）</option></select></label>`:''}${datesField}${mode==='period'?field('終了日','endDate',old?.endDate||date,'date','required'):''}${mode==='weekly'?field('終了日','repeatUntil',D.addMonths(date,1),'date','required')+`<div class="week-checks">${'日月火水木金土'.split('').map((x,i)=>`<label><input type="checkbox" name="weekday" value="${i}"><span>${x}</span></label>`).join('')}</div>`:''}${field('予定名','title',e.title,'text','required maxlength="200" placeholder="練習・大会など"')}${calPalette(e.colorId||'green')}<details class="advanced" ${old?'open':''}><summary>時間・体育館・詳細</summary><label class="field"><span class="label">予定の種類</span><select name="kind"><option value="club" ${e.kind==='club'?'selected':''}>部活予定</option><option value="executive" ${e.kind==='executive'?'selected':''}>幹部予定</option></select></label><div class="inline-fields">${field('開始','start',e.start,'time')}${field('終了','end',e.end,'time')}</div><label class="field"><span class="label">体育館</span><select name="venue"><option value="">未設定</option>${state.venues.map(v=>`<option value="${esc(v.id)}" ${e.venueId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></label>${field('使用コート数','courts',e.courts??'','number','min="1" max="30"')}<details><summary>幹部予定の担当者</summary>${assigneeField(e.assignees||[])}</details>${memoField(e.memo||'')}${notifications(e.notifications||state.settings.reminders)}</details><p class="cal-error" role="alert"></p><div class="cal-editor-actions">${old?action('cal-cancel-one','中止',`data-id="${esc(id)}"`,'text-btn danger-button'):''}${action('close-modal','キャンセル','','secondary')}<button type="submit" class="primary">保存</button></div>${old?`<a class="text-btn" href="#event/${esc(id)}" data-act="close-modal">参加者・予定の詳細を見る</a>`:''}</form>`);
 document.querySelector('#modal-root .modal')?.classList.add('cal-sheet');
}
function calTargets(){return state.events.filter(e=>!e.cancelled&&(e.kind==='club'||ui.showExec)&&[...clubCalendar.selected].some(date=>e.date<=date&&(e.endDate||e.date)>=date));}
function calCommit(){D.seedAttendance(state);persist();closeModal();calClear();render();}
window.addEventListener('click',ev=>{
 const b=ev.target.closest('[data-act^="cal-"]');if(!b||b.disabled)return;actHandled(ev);if(ctx.busy){toast('保存中です');return;}
 const {act,date,id,mode}=b.dataset;
 if(!['cal-day','cal-today','cal-month','cal-clear'].includes(act)&&!edit('events')){toast('編集権限がありません');return;}
 switch(act){
 case'cal-day':{
  if(Date.now()<clubCalendar.suppressClick)return;
  if(clubCalendar.selecting){clubCalendar.selected.has(date)?clubCalendar.selected.delete(date):clubCalendar.selected.add(date);render();return;}
  const items=D.calendarItems(state,date,ui.showExec);
  if(!edit('events')){go('day/'+date);return;}
  if(!items.length)calEditor({date});else if(items.length===1&&items[0].type==='event')calEditor({id:items[0].id});else modal(jpDate(date,true),items.map(x=>x.type==='event'?action('cal-edit',`${esc(x.time||'時刻なし')}　${esc(x.title)}`,`data-id="${esc(x.id)}"`,'row'):`<a class="row" href="#task/${esc(x.id)}" data-act="close-modal">${esc(x.title)}</a>`).join('')+action('cal-new-day','＋ 予定を追加',`data-date="${date}"`,'secondary full'));break;
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
  const kind=get('kind'),values={title:get('title'),colorId:get('colorId'),kind,start,end,venueId:kind==='club'?get('venue'):'',courts:get('courts')?Number(get('courts')):null,assignees:kind==='executive'?fd.getAll('assignee'):[],memo:get('memo'),notifications:fd.getAll('notify'),assignmentNeedsReview:false};
  if(old&&get('scope')==='series'&&date!==old.date)throw Error('日付の変更は「この日だけ」を選んでください');
  checkpoint();
  if(old){if(get('scope')==='series'&&old.seriesId)state.events.filter(e=>e.seriesId===old.seriesId&&!e.cancelled).forEach(e=>Object.assign(e,values));else Object.assign(old,values,{date,endDate,seriesId:null});}
  else{const seriesId=dates.length>1?UID():null;dates.forEach(dt=>state.events.push({...clone(values),id:UID(),date:dt,endDate:mode==='period'?endDate:dt,seriesId,cancelled:false}));}
  calCommit();
 }catch(error){const box=f.querySelector('.cal-error');if(box)box.textContent=error.message;else toast(error.message);}
},true);
let calPress=null,calPressTimer=null;
window.addEventListener('pointerdown',ev=>{const b=ev.target.closest('[data-act="cal-day"]');if(!b||!edit('events')||ctx.busy||ev.button!==0)return;calPress={x:ev.clientX,y:ev.clientY,date:b.dataset.date};calPressTimer=setTimeout(()=>{clubCalendar.selecting=true;clubCalendar.selected.add(calPress.date);clubCalendar.suppressClick=Date.now()+700;calPressTimer=null;render();},500);},true);
window.addEventListener('pointermove',ev=>{if(calPress&&Math.hypot(ev.clientX-calPress.x,ev.clientY-calPress.y)>10){clearTimeout(calPressTimer);calPressTimer=null;}},true);
for(const type of ['pointerup','pointercancel','blur'])window.addEventListener(type,()=>{clearTimeout(calPressTimer);calPressTimer=null;calPress=null;},true);
window.addEventListener('contextmenu',ev=>{if(ev.target.closest('[data-act="cal-day"]')&&edit('events'))ev.preventDefault();});

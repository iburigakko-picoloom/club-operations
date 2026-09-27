'use strict';

let accountingCache={groupId:'',data:null,loading:false,error:''};
const ACCOUNTING_DEMO_PREFIX='club-accounting-demo-v1:';
function accountingBase(){return '/groups/'+encodeURIComponent(state.group.id)+'/accounting';}
function accountingCanEdit(){return ctx.mode==='demo'||own()||(state.roles?.['会計']||[]).includes(state.currentUser);}
function accountingDemoLoad(){try{return JSON.parse(localStorage.getItem(ACCOUNTING_DEMO_PREFIX+state.group.id)||'null')||{collections:[],transactions:[],history:[],summary:{income:0,collectionIncome:0,otherIncome:0,expense:0,balance:0,outstanding:0,undeterminedCount:0}};}catch{return {collections:[],transactions:[],history:[],summary:{income:0,collectionIncome:0,otherIncome:0,expense:0,balance:0,outstanding:0,undeterminedCount:0}};}}
function accountingDemoSave(data){localStorage.setItem(ACCOUNTING_DEMO_PREFIX+state.group.id,JSON.stringify(data));}
function accountingRecount(data){
 const flat=data.collections.flatMap(c=>c.members||[]),received=flat.filter(m=>m.status==='paid').reduce((n,m)=>n+(m.amount||0),0),outstanding=flat.filter(m=>m.status==='unpaid').reduce((n,m)=>n+(m.amount||0),0),uncertain=flat.filter(m=>m.status==='undetermined').length;
 const otherIncome=data.transactions.filter(t=>t.kind==='income').reduce((n,t)=>n+t.amount,0),expense=data.transactions.filter(t=>t.kind==='expense').reduce((n,t)=>n+t.amount,0);
 data.summary={income:received+otherIncome,collectionIncome:received,otherIncome,expense,balance:received+otherIncome-expense,outstanding,undeterminedCount:uncertain};
 data.history=data.transactions.map(t=>({id:t.id,source:'transaction',kind:t.kind,date:t.date,title:t.title,category:t.category,amount:t.amount,eventId:t.eventId}));
 for(const c of data.collections)for(const m of c.members||[])if(m.status==='paid'&&m.paidAt)data.history.push({id:c.id+':'+m.memberId,source:'collection',kind:'income',date:m.paidAt.slice(0,10),title:c.title+' · '+(m.memberName||'部員'),category:'徴収',amount:m.amount||0,collectionId:c.id,eventId:c.eventId});
 data.history.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));return data;
}
async function accountingLoad(force=false){
 const gid=state?.group?.id;if(!gid)return null;
 if(accountingCache.groupId!==gid)accountingCache={groupId:gid,data:null,loading:false,error:''};
 if(accountingCache.loading)return null;
 if(accountingCache.data&&!force)return accountingCache.data;
 accountingCache.loading=true;accountingCache.error='';
 try{accountingCache.data=ctx.mode==='demo'?accountingDemoLoad():await api(accountingBase());accountingCache.groupId=gid;return accountingCache.data;}
 catch(e){accountingCache.error=e.message||'会計を読み込めませんでした';throw e;}
 finally{accountingCache.loading=false;}
}
function accountingEnsure(){
 if(accountingCache.groupId!==state.group.id){accountingCache={groupId:state.group.id,data:null,loading:false,error:''};}
 if(!accountingCache.data&&!accountingCache.loading){accountingLoad().then(()=>{if(getRoute()[0]==='accounting')render();}).catch(e=>{if(getRoute()[0]==='accounting')render();toast(e.message||'会計を読み込めませんでした');});}
 return accountingCache.data;
}
function accountingRoute(id='',extra=''){
 if(id==='collections')return 'collections';
 if(id==='collection-new')return 'collection-new';
 if(id==='collection')return 'collection:'+extra;
 if(id==='transaction-new')return 'transaction-new:'+extra;
 if(id==='transaction')return 'transaction:'+extra;
 if(id==='history')return 'history';
 return 'overview';
}
function accountingEventOptions(selected=''){
 return `<option value="">予定に連携しない</option>`+state.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<option value="${esc(e.id)}" ${e.id===selected?'selected':''}>${esc(jpDate(e.date))}　${esc(e.title)}</option>`).join('');
}
function accountingAmount(n){return n==null?'—':money(n);}
function accountingBadge(status){const labels={paid:'支払済',unpaid:'未払い',undetermined:'未確定',open:'受付中',closed:'終了'};return `<span class="accounting-badge ${esc(status)}">${labels[status]||esc(status)}</span>`;}
function accountingAttendanceLabel(status){return status==='present'?'参加':status==='absent'?'不参加':'';}
function accountingMemberLabel(member){return `${member.grade?member.grade+'年　':''}${member.memberName||'退部した部員'}`;}
function accountingPageShell(title,body,back='accounting',right=''){
 return shell(title,'operations',`${ctx.mode==='demo'?'<p class="accounting-demo-note">操作デモ · 会計データはこの端末だけに保存</p>':''}${body}`,back,right);
}
function accountingLoading(){return accountingPageShell('会計',accountingCache.error?`<p class="empty">${esc(accountingCache.error)}</p><button class="secondary full" data-accounting-act="accounting-reload">再読み込み</button>`:'<p class="empty">読み込み中…</p>','operations');}
function renderAccounting(id='',extra=''){
 const route=accountingRoute(id,extra),data=accountingEnsure();if(!data)return accountingLoading();
 if(route==='collection-new')return renderAccountingCollectionNew();
 if(route.startsWith('collection:'))return renderAccountingCollection(route.slice(11));
 if(route==='collections')return renderAccountingCollections(data);
 if(route.startsWith('transaction-new:'))return renderAccountingTransactionForm(route.split(':')[1]||'income');
 if(route.startsWith('transaction:'))return renderAccountingTransactionForm('',route.slice(12));
 if(route==='history')return renderAccountingHistory(data);
 return renderAccountingOverview(data);
}
function renderAccountingOverview(data){
 const summary=data.summary||{},recent=(data.history||[]).slice(0,6),can=accountingCanEdit();
 const stats=`<div class="accounting-summary-grid"><div class="accounting-stat accounting-balance"><span>現在残高</span><strong>${money(summary.balance||0)}</strong></div><div class="accounting-stat"><span>収入合計</span><strong>${money(summary.income||0)}</strong></div><div class="accounting-stat"><span>支出合計</span><strong>${money(summary.expense||0)}</strong></div><div class="accounting-stat"><span>未徴収</span><strong>${money(summary.outstanding||0)}</strong>${summary.undeterminedCount?`<small>未確定 ${summary.undeterminedCount}人</small>`:''}</div></div>`;
 const collectionRows=(data.collections||[]).slice(0,4).map(c=>`<a class="accounting-list-row" href="#accounting/collection/${esc(c.id)}"><span class="row-main"><strong>${esc(c.title)}</strong><small>${c.dueDate?`期限 ${esc(jpDate(c.dueDate))}`:c.eventTitle?esc(c.eventTitle):'期限なし'}　·　${c.members.filter(m=>m.status==='paid').length}/${c.members.length}人</small></span><span>${accountingBadge(c.status)}</span></a>`).join('')||'<p class="empty">徴収はまだありません</p>';
 const historyRows=recent.map(h=>`<a class="accounting-list-row" href="#accounting/${h.source==='collection'?'collection/'+encodeURIComponent(h.collectionId):'transaction/'+encodeURIComponent(h.id)}"><span class="row-main"><strong>${esc(h.title)}</strong><small>${esc(jpDate(h.date))}　${esc(h.category||'')}</small></span><strong class="${h.kind==='expense'?'accounting-expense':''}">${h.kind==='expense'?'−':'＋'}${money(h.amount)}</strong></a>`).join('')||'<p class="empty">履歴はありません</p>';
 const quick=can?`<div class="accounting-actions"><a class="secondary" href="#accounting/collection-new">徴収を作成</a><a class="secondary" href="#accounting/transaction-new/income">収入を記録</a><a class="secondary" href="#accounting/transaction-new/expense">支出を記録</a></div>`:'';
 return accountingPageShell('会計',stats+quick+`<section class="accounting-section"><div class="section-head"><h2>徴収</h2><a class="small muted" href="#accounting/collections">一覧 ›</a></div>${collectionRows}</section><section class="accounting-section"><div class="section-head"><h2>最近の履歴</h2><a class="small muted" href="#accounting/history">すべて ›</a></div>${historyRows}</section>`,'operations',`<button class="text-btn" data-accounting-act="accounting-reload">更新</button>`);
}
function renderAccountingCollections(data){
 const rows=(data.collections||[]).map(c=>`<a class="accounting-list-row" href="#accounting/collection/${esc(c.id)}"><span class="row-main"><strong>${esc(c.title)}</strong><small>${c.dueDate?`期限 ${esc(jpDate(c.dueDate))}`:c.eventTitle?esc(c.eventTitle):'期限なし'}　·　${c.members.filter(m=>m.status==='paid').length}/${c.members.length}人</small></span>${accountingBadge(c.status)}</a>`).join('')||'<p class="empty">徴収はまだありません</p>';
 return accountingPageShell('徴収',rows,'accounting',accountingCanEdit()?'<a class="icon-btn" href="#accounting/collection-new" aria-label="徴収を作成">＋</a>':'');
}
function renderAccountingHistory(data){
 const rows=(data.history||[]).map(h=>`<a class="accounting-list-row" href="#accounting/${h.source==='collection'?'collection/'+encodeURIComponent(h.collectionId):'transaction/'+encodeURIComponent(h.id)}"><span class="row-main"><strong>${esc(h.title)}</strong><small>${esc(jpDate(h.date))}　${esc(h.category||'')}</small></span><strong class="${h.kind==='expense'?'accounting-expense':''}">${h.kind==='expense'?'−':'＋'}${money(h.amount)}</strong></a>`).join('')||'<p class="empty">履歴はありません</p>';
 return accountingPageShell('取引履歴',rows,'accounting');
}
function renderAccountingCollectionNew(){
 if(!accountingCanEdit())return accountingPageShell('徴収を作成','<p class="empty">編集権限がありません。</p>');
 const events=state.events.filter(e=>!e.cancelled).slice().sort((a,b)=>a.date.localeCompare(b.date)),selected=ui.accountingEvent||'',eventValue=events.some(e=>e.id===selected)?selected:'';
 const people=state.people.filter(p=>p.active!==false);
 const rows=people.map(p=>accountingDraftMember(p,eventValue)).join('')||'<p class="empty">部員がいません</p>';
 return accountingPageShell('徴収を作成',`<form data-accounting-form="collection" class="accounting-form"><label class="field"><span class="label">名称</span><input name="title" required maxlength="120" placeholder="例：夏合宿費"></label><label class="field"><span class="label">関連予定</span><select name="eventId" data-accounting-event>${accountingEventOptions(eventValue)}</select></label><label class="field"><span class="label">支払期限</span><input name="dueDate" type="date"></label><label class="field"><span class="label">メモ</span><textarea name="note" maxlength="2000"></textarea></label><div class="accounting-amount-rules"><label class="field"><span class="label">参加の金額</span><input name="presentAmount" type="number" min="0" max="1000000000" step="1" value="0" inputmode="numeric"></label><label class="field"><span class="label">不参加の金額</span><input name="absentAmount" type="number" min="0" max="1000000000" step="1" value="0" inputmode="numeric"></label><label class="field" data-accounting-default-wrap><span class="label">一律の金額</span><input name="defaultAmount" type="number" min="0" max="1000000000" step="1" value="0" inputmode="numeric"></label></div><p class="note">出欠は作成時点で固定します。未確定にする人だけチェックしてください。</p><div class="accounting-section"><div class="section-head"><h2>対象者</h2><span class="small muted">${people.length}人</span></div><div class="accounting-draft-list" data-accounting-draft-list>${rows}</div></div><div class="form-actions"><a class="secondary full" href="#accounting/collections">戻る</a><button class="primary full">徴収を作成</button></div></form>`,'accounting');
}
function accountingDraftMember(p,eventId){
 const src=accountingAttendance(eventId,p)||'',amountName='accountingAmount_'+p.id;
 return `<div class="accounting-draft-member" data-member-id="${esc(p.id)}" data-attendance="${src}"><label class="accounting-draft-select"><input type="checkbox" name="memberIds" value="${esc(p.id)}" checked><span>${esc((p.grade||'')+'年　'+p.name)}</span></label><span class="accounting-attendance ${src}">${accountingAttendanceLabel(src)}</span><label class="accounting-unresolved"><input type="checkbox" name="unresolvedMemberIds" value="${esc(p.id)}" data-accounting-unresolved>未確定</label><input aria-label="${esc(p.name)}の金額" name="${amountName}" type="number" min="0" max="1000000000" step="1" value="0" inputmode="numeric" data-accounting-amount data-touched="false"></div>`;
}
function accountingAttendance(eventId,p){if(!eventId)return null;const value=state.attendance?.[eventId+'|'+p.id];const present=typeof value==='boolean'?value:(typeof p.defaultOverride==='boolean'?p.defaultOverride:p.seniority==='below');return present?'present':'absent';}
function accountingUpdateDraftRows(form,eventId){
 const list=form.querySelector('[data-accounting-draft-list]');if(!list)return;
 for(const row of list.querySelectorAll('.accounting-draft-member')){
  const p=state.people.find(x=>x.id===row.dataset.memberId);if(!p)continue;const status=accountingAttendance(eventId,p)||'';row.dataset.attendance=status;
  const badge=row.querySelector('.accounting-attendance');badge.className='accounting-attendance '+status;badge.textContent=accountingAttendanceLabel(status);badge.hidden=!status;
  const unresolved=row.querySelector('[data-accounting-unresolved]'),amount=row.querySelector('[data-accounting-amount]');
  if(unresolved.checked){amount.value='';amount.disabled=true;}else{amount.disabled=false;if(amount.dataset.touched!=='true'){const key=!eventId?'defaultAmount':status==='present'?'presentAmount':'absentAmount';amount.value=form.elements[key]?.value||form.elements.defaultAmount?.value||'0';}}
 }
 const wrap=form.querySelector('[data-accounting-default-wrap]');if(wrap)wrap.hidden=Boolean(eventId);
}
function renderAccountingCollection(cid){
 const data=accountingCache.data,c=data?.collections?.find(x=>x.id===cid);if(!c)return accountingPageShell('徴収','<p class="empty">徴収が見つかりません</p>','accounting');
 const can=accountingCanEdit(),paid=c.members.filter(m=>m.status==='paid').length,unpaid=c.members.filter(m=>m.status==='unpaid').length,uncertain=c.members.filter(m=>m.status==='undetermined').length;
 const meta=`<div class="accounting-collection-meta">${c.eventTitle?`<span>${esc(c.eventTitle)}</span>`:''}${c.dueDate?`<span>期限 ${esc(jpDate(c.dueDate))}</span>`:''}${accountingBadge(c.status)}<strong>${money(c.members.filter(m=>m.status!=='undetermined').reduce((n,m)=>n+(m.amount||0),0))}予定</strong><span>未収 ${money(c.members.filter(m=>m.status==='unpaid').reduce((n,m)=>n+(m.amount||0),0))}</span></div>`;
 const editForm=can?`<details class="accounting-edit-details"><summary>徴収の内容を編集</summary><form data-accounting-form="collection-edit" data-id="${esc(cid)}"><label class="field"><span class="label">名称</span><input name="title" required maxlength="120" value="${esc(c.title)}"></label><label class="field"><span class="label">関連予定</span><select name="eventId">${accountingEventOptions(c.eventId||'')}</select></label><label class="field"><span class="label">支払期限</span><input name="dueDate" type="date" value="${esc(c.dueDate||'')}"></label><label class="field"><span class="label">メモ</span><textarea name="note" maxlength="2000">${esc(c.note||'')}</textarea></label><button class="primary full">内容を保存</button></form><div class="accounting-inline-actions"><button class="secondary" data-accounting-act="toggle-collection" data-id="${esc(cid)}" data-status="${c.status==='open'?'closed':'open'}">${c.status==='open'?'徴収を終了':'受付を再開'}</button>${paid===0?`<button class="text-btn danger-button" data-accounting-act="delete-collection" data-id="${esc(cid)}">徴収を削除</button>`:''}</div></details>`:'';
 const bulk=can?`<div class="accounting-bulk" data-accounting-bulk="${esc(cid)}"><div class="accounting-bulk-head"><label><input type="checkbox" data-accounting-select-all> 全員選択</label><span>未払い ${unpaid}人${uncertain?` · 未確定 ${uncertain}人`:''}</span></div><div class="accounting-inline-actions"><button type="button" class="secondary" data-accounting-act="bulk-paid" data-id="${esc(cid)}">選択を支払済みに</button><button type="button" class="text-btn" data-accounting-act="bulk-unpaid" data-id="${esc(cid)}">未払いに戻す</button></div>`:'';
 const memberRows=c.members.slice().sort((a,b)=>(a.grade??99)-(b.grade??99)||a.memberName.localeCompare(b.memberName,'ja')).map(m=>accountingCollectionMemberRow(cid,m,can)).join('')||'<p class="empty">対象者はいません</p>';
 const addForm=can?`<form class="accounting-add-member" data-accounting-form="member-add" data-id="${esc(cid)}"><h3>対象者を追加</h3><div class="accounting-add-grid"><select name="memberId" required aria-label="部員を選択"><option value="">部員を選択</option>${state.people.filter(p=>!c.members.some(m=>m.memberId===p.id)).map(p=>`<option value="${esc(p.id)}">${esc((p.grade||'')+'年　'+p.name)}${p.active===false?'（退部）':''}</option>`).join('')}</select><input name="amount" type="number" min="0" max="1000000000" step="1" value="0" aria-label="金額" inputmode="numeric"><label class="accounting-unresolved"><input type="checkbox" name="unresolved">未確定</label><button class="secondary">追加</button></div></form>`:'';
 const right=can?`<a class="text-btn" href="#accounting/collections">一覧</a>`:'';
 return accountingPageShell(c.title,`<div class="accounting-detail-heading">${meta}${c.note?`<p>${esc(c.note)}</p>`:''}</div>${editForm}${bulk}<div class="accounting-member-list">${memberRows}</div>${can?'</div>':''}${addForm}`, 'accounting/collections',right);
}
function accountingCollectionMemberRow(cid,m,can){
 const label=accountingMemberLabel(m),badge=accountingBadge(m.status);
 if(!can)return `<div class="accounting-member-row"><span class="row-main"><strong>${esc(label)}</strong><small>${accountingAttendanceLabel(m.snapshotStatus)}</small></span><span>${accountingAmount(m.amount)}</span>${badge}</div>`;
 const select=`<label class="accounting-bulk-check"><input type="checkbox" name="memberIds" value="${esc(m.memberId)}" ${m.status==='undetermined'?'disabled':''} aria-label="${esc(label)}を選択"></label>`;
 if(m.status==='paid')return `<div class="accounting-member-row paid">${select}<span class="row-main"><strong>${esc(label)}</strong><small>${accountingAttendanceLabel(m.snapshotStatus)}${m.paidAt?' · '+esc(m.paidAt.slice(0,10)):''}</small></span><strong>${money(m.amount)}</strong>${badge}<button class="text-btn accounting-row-action" data-accounting-act="member-unpaid" data-id="${esc(cid)}" data-member="${esc(m.memberId)}">未払いに戻す</button></div>`;
 return `<div class="accounting-member-row">${select}<form data-accounting-form="member-edit" data-id="${esc(cid)}" data-member="${esc(m.memberId)}"><span class="row-main"><strong>${esc(label)}</strong><small>${accountingAttendanceLabel(m.snapshotStatus)}　${badge}</small><label class="accounting-member-note"><span class="sr-only">メモ</span><input name="note" maxlength="500" value="${esc(m.note||'')}" placeholder="メモ"></label></span><label class="accounting-yen-input"><input name="amount" type="number" min="0" max="1000000000" step="1" value="${m.amount??''}" ${m.status==='undetermined'?'':'required'} inputmode="numeric"><span>円</span></label><select name="status" aria-label="${esc(label)}の状態"><option value="unpaid" ${m.status==='unpaid'?'selected':''}>未払い</option><option value="undetermined" ${m.status==='undetermined'?'selected':''}>未確定</option></select><button class="text-btn accounting-row-action">保存</button></form><button class="icon-btn accounting-remove" data-accounting-act="remove-member" data-id="${esc(cid)}" data-member="${esc(m.memberId)}" aria-label="${esc(label)}を対象から外す">×</button></div>`;
}
function renderAccountingTransactionForm(kind='',id=''){
 if(!accountingCanEdit())return accountingPageShell('取引','<p class="empty">編集権限がありません。</p>');
 const t=id?accountingCache.data.transactions.find(x=>x.id===id):null;if(id&&!t)return accountingPageShell('取引','<p class="empty">取引が見つかりません。</p>');
 const txKind=t?.kind||(['income','expense'].includes(kind)?kind:'income'),editing=Boolean(t),title=editing?'取引を編集':txKind==='income'?'収入を記録':'支出を記録';
 return accountingPageShell(title,`<form class="accounting-form" data-accounting-form="transaction" data-id="${esc(id)}"><input type="hidden" name="kind" value="${txKind}"><label class="field"><span class="label">名称</span><input name="title" required maxlength="120" value="${esc(t?.title||'')}" placeholder="例：備品購入"></label><label class="field"><span class="label">金額</span><div class="accounting-yen-input"><input name="amount" type="number" min="1" max="1000000000" step="1" required value="${t?.amount??''}" inputmode="numeric"><span>円</span></div></label><label class="field"><span class="label">日付</span><input name="date" type="date" required value="${esc(t?.date||DEMO_TODAY)}"></label><label class="field"><span class="label">分類</span><input name="category" maxlength="80" value="${esc(t?.category||'')}" placeholder="例：備品・交通費・補助金"></label><label class="field"><span class="label">関連予定</span><select name="eventId">${accountingEventOptions(t?.eventId||'')}</select></label><label class="field"><span class="label">メモ</span><textarea name="memo" maxlength="2000">${esc(t?.memo||'')}</textarea></label><div class="form-actions"><a class="secondary full" href="#accounting">戻る</a><button class="primary full">${editing?'保存':'記録する'}</button></div></form>${editing?`<hr class="rule"><button class="text-btn danger-button" data-accounting-act="delete-transaction" data-id="${esc(t.id)}">取引を削除</button>`:''}`,'accounting');
}
function renderAccountingTransaction(id){return renderAccountingTransactionForm('',id);}

async function accountingMutate(path,method,data){
 if(ctx.mode==='demo'){
  const snapshot=accountingCache.data||accountingDemoLoad(),parts=path.replace(accountingBase(),'').split('/').filter(Boolean),at=new Date().toISOString();
  if(parts[0]==='collections'&&parts.length===1&&method==='POST'){
   const ids=data.memberIds||[],unresolved=data.unresolvedMemberIds||[],members=ids.map(mid=>{const p=state.people.find(x=>x.id===mid),status=unresolved.includes(mid)?'undetermined':'unpaid',attendance=accountingAttendance(data.eventId,p);return {memberId:mid,memberName:p?.name||'',grade:p?.grade,active:p?.active!==false,snapshotStatus:attendance,amount:status==='undetermined'?null:Number(data.amountOverrides[mid]??(attendance==='absent'?data.absentAmount:data.eventId?data.presentAmount:data.defaultAmount)),status,paidAt:null,note:''};});snapshot.collections.unshift({id:UID(),title:data.title,note:data.note||'',dueDate:data.dueDate||null,eventId:data.eventId||null,eventTitle:state.events.find(e=>e.id===data.eventId)?.title||'',status:'open',createdAt:at,updatedAt:at,members});
  }else if(parts[0]==='transactions'&&parts.length===1&&method==='POST')snapshot.transactions.unshift({id:UID(),...data,amount:Number(data.amount),eventId:data.eventId||null,eventTitle:state.events.find(e=>e.id===data.eventId)?.title||'',createdAt:at,updatedAt:at});
  else if(parts[0]==='transactions'&&method==='PATCH'){const t=snapshot.transactions.find(x=>x.id===parts[1]);if(t)Object.assign(t,data,{amount:Number(data.amount),updatedAt:at});}
  else if(parts[0]==='transactions'&&method==='DELETE')snapshot.transactions=snapshot.transactions.filter(x=>x.id!==parts[1]);
  else if(parts[0]==='collections'&&parts.length===2&&method==='PATCH'){const c=snapshot.collections.find(x=>x.id===parts[1]);if(c)Object.assign(c,data,{updatedAt:at});}
  else if(parts[0]==='collections'&&parts.length===2&&method==='DELETE')snapshot.collections=snapshot.collections.filter(x=>x.id!==parts[1]);
  else if(parts[0]==='collections'&&parts[2]==='members'&&parts.length===3&&method==='POST'){const c=snapshot.collections.find(x=>x.id===parts[1]),p=state.people.find(x=>x.id===data.memberId);if(c&&p)c.members.push({memberId:p.id,memberName:p.name,grade:p.grade,active:p.active!==false,snapshotStatus:accountingAttendance(c.eventId,p),amount:data.unresolved?null:Number(data.amount),status:data.unresolved?'undetermined':'unpaid',paidAt:null,note:data.note||''});}
  else if(parts[0]==='collections'&&parts[2]==='members'&&parts.length===3&&method==='PATCH'){const c=snapshot.collections.find(x=>x.id===parts[1]);for(const mid of data.memberIds||[]){const m=c?.members.find(x=>x.memberId===mid);if(m){m.status=data.status;m.paidAt=data.status==='paid'?at:null;}}}
  else if(parts[0]==='collections'&&parts[2]==='members'&&parts.length===4&&method==='PATCH'){const m=snapshot.collections.find(x=>x.id===parts[1])?.members.find(x=>x.memberId===parts[3]);if(m)Object.assign(m,data,{amount:data.amount===undefined?m.amount:data.amount===null?null:Number(data.amount),paidAt:data.status==='paid'?at:data.status==='unpaid'?null:m.paidAt});}
  else if(parts[0]==='collections'&&parts[2]==='members'&&parts.length===4&&method==='DELETE'){const c=snapshot.collections.find(x=>x.id===parts[1]);if(c)c.members=c.members.filter(x=>x.memberId!==parts[3]);}
  accountingCache.data=accountingRecount(snapshot);accountingDemoSave(accountingCache.data);return accountingCache.data;
 }
 accountingCache.data=await api(accountingBase()+path,method,data);accountingCache.groupId=state.group.id;return accountingCache.data;
}
function accountingFormPayload(form){const fd=new FormData(form),value=name=>String(fd.get(name)||'').trim();return {fd,value};}
async function accountingSubmit(form){
 const kind=form.dataset.accountingForm,can=accountingCanEdit();if(!can)throw Error('編集権限がありません');const {fd,value}=accountingFormPayload(form),cid=form.dataset.id,atId=form.dataset.member;
 if(kind==='collection'){
  const memberIds=fd.getAll('memberIds').map(String),unresolvedMemberIds=fd.getAll('unresolvedMemberIds').map(String),amountOverrides={};
  for(const mid of memberIds)if(!unresolvedMemberIds.includes(mid)){const raw=value('accountingAmount_'+mid);const n=Number(raw);if(!Number.isInteger(n)||n<0||n>1_000_000_000)throw Error('個別金額を確認してください');amountOverrides[mid]=n;}
  if(!value('title')||!memberIds.length)throw Error('名称と徴収対象を確認してください');
  await accountingMutate('/collections','POST',{title:value('title'),note:value('note'),dueDate:value('dueDate')||null,eventId:value('eventId')||null,presentAmount:Number(value('presentAmount')||0),absentAmount:Number(value('absentAmount')||0),defaultAmount:Number(value('defaultAmount')||0),memberIds,unresolvedMemberIds,amountOverrides});
  go('accounting/collections');toast('徴収を作成しました');return;
 }
 if(kind==='collection-edit'){
  await accountingMutate('/collections/'+encodeURIComponent(cid),'PATCH',{title:value('title'),note:value('note'),dueDate:value('dueDate')||null,eventId:value('eventId')||null});render();toast('徴収内容を保存しました');return;
 }
 if(kind==='member-edit'){
  const amountRaw=value('amount'),status=value('status'),data={status,note:value('note')};
  if(status==='undetermined')data.amount=null;else{const amount=Number(amountRaw);if(!Number.isInteger(amount)||amount<0||amount>1_000_000_000)throw Error('金額を確認してください');data.amount=amount;}
  await accountingMutate('/collections/'+encodeURIComponent(cid)+'/members/'+encodeURIComponent(atId),'PATCH',data);render();toast('対象者を保存しました');return;
 }
 if(kind==='member-add'){
  const unresolved=fd.has('unresolved'),amount=unresolved?null:Number(value('amount'));if(!value('memberId')||!unresolved&&(!Number.isInteger(amount)||amount<0))throw Error('部員と金額を確認してください');
  await accountingMutate('/collections/'+encodeURIComponent(cid)+'/members','POST',{memberId:value('memberId'),amount,unresolved,note:''});render();toast('対象者を追加しました');return;
 }
 if(kind==='transaction'){
  const amount=Number(value('amount'));if(!Number.isInteger(amount)||amount<1||amount>1_000_000_000)throw Error('金額を確認してください');const id=form.dataset.id,path='/transactions'+(id?'/'+encodeURIComponent(id):''),method=id?'PATCH':'POST';
  await accountingMutate(path,method,{kind:value('kind'),title:value('title'),amount,date:value('date'),category:value('category'),memo:value('memo'),eventId:value('eventId')||null});go('accounting');toast(id?'取引を保存しました':'記録しました');
 }
}
async function accountingClick(button){
 const act=button.dataset.accountingAct,id=button.dataset.id,member=button.dataset.member;
 if(act==='accounting-reload')return;
 if(act==='toggle-collection'){await accountingMutate('/collections/'+encodeURIComponent(id),'PATCH',{status:button.dataset.status});render();toast(button.dataset.status==='closed'?'徴収を終了しました':'受付を再開しました');return;}
 if(act==='delete-collection'){if(!confirm('この徴収を削除しますか？'))return;await accountingMutate('/collections/'+encodeURIComponent(id),'DELETE');go('accounting/collections');toast('徴収を削除しました');return;}
 if(act==='remove-member'){if(!confirm('この部員を徴収対象から外しますか？'))return;await accountingMutate('/collections/'+encodeURIComponent(id)+'/members/'+encodeURIComponent(member),'DELETE');render();toast('対象から外しました');return;}
 if(act==='member-unpaid'){await accountingMutate('/collections/'+encodeURIComponent(id)+'/members/'+encodeURIComponent(member),'PATCH',{status:'unpaid'});render();toast('未払いに戻しました');return;}
 if(act==='bulk-paid'||act==='bulk-unpaid'){
  const form=document.querySelector(`[data-accounting-bulk="${CSS.escape(id)}"]`),memberIds=[...form.querySelectorAll('input[name="memberIds"]:checked')].map(x=>x.value);if(!memberIds.length)throw Error('部員を選択してください');
  await accountingMutate('/collections/'+encodeURIComponent(id)+'/members','PATCH',{memberIds,status:act==='bulk-paid'?'paid':'unpaid'});render();toast(act==='bulk-paid'?'支払済みにしました':'未払いに戻しました');return;
 }
 if(act==='delete-transaction'){if(!confirm('この取引を削除しますか？'))return;await accountingMutate('/transactions/'+encodeURIComponent(id),'DELETE');go('accounting');toast('取引を削除しました');}
}
document.addEventListener('click',async ev=>{
 const button=ev.target.closest('[data-accounting-act]');if(!button)return;ev.preventDefault();ev.stopImmediatePropagation();
 try{if(button.dataset.accountingAct==='accounting-reload'){await accountingLoad(true);render();return;}await accountingClick(button);}catch(e){toast(e.message||'保存できませんでした');}
},{capture:true});
document.addEventListener('submit',async ev=>{
 const form=ev.target.closest('form[data-accounting-form]');if(!form)return;ev.preventDefault();ev.stopImmediatePropagation();
 const submit=form.querySelector('[type="submit"],button:not([type])');if(submit)submit.disabled=true;
 try{await accountingSubmit(form);}catch(e){toast(e.message||'保存できませんでした');if(submit)submit.disabled=false;}
},{capture:true});
document.addEventListener('change',ev=>{
 const target=ev.target,form=target.closest('form[data-accounting-form="collection"]');
 if(form&&target.matches('[data-accounting-event]')){ui.accountingEvent=target.value;accountingUpdateDraftRows(form,target.value);}
 if(form&&target.matches('[data-accounting-unresolved]')){const row=target.closest('.accounting-draft-member'),amount=row.querySelector('[data-accounting-amount]');amount.disabled=target.checked;if(target.checked)amount.value='';else accountingUpdateDraftRows(form,form.elements.eventId.value);}
 if(target.matches('[data-accounting-select-all]')){const box=target.closest('[data-accounting-bulk]');for(const input of box.querySelectorAll('input[name="memberIds"]'))if(!input.disabled)input.checked=target.checked;}
 if(target.matches('[data-accounting-unresolved]')&&target.closest('[data-accounting-form="member-add"]')){const amount=target.closest('form').elements.amount;amount.disabled=target.checked;if(target.checked)amount.value='';}
});
document.addEventListener('input',ev=>{
 if(ev.target.matches('[data-accounting-amount]'))ev.target.dataset.touched='true';
 const form=ev.target.closest('form[data-accounting-form="collection"]');if(form&&ev.target.matches('[name="presentAmount"],[name="absentAmount"],[name="defaultAmount"]'))accountingUpdateDraftRows(form,form.elements.eventId.value);
});

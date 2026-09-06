/* v0.9: account/group entry, explicit invitations, and carpool sharing workflows.
 * The club workspace, menu calculations, and executive calendar remain the same.
 * Demo identity is explicitly not LINE authentication. */
'use strict';
const wf = { invitations:[], inviteLink:'', inviteExpires:0, inviteLoadedFor:'',
  joinInfo:null, joinToken:'', joinError:'', image:null, pending:false, accountError:'', loginError:'', emailOpen:false,
  serverAvailable:false, demoGroups:{}, accountName:'', demoKey:'club-demo-groups-v1' };
const wfPriorRender=render, wfPriorSettings=renderSettings, wfPriorCar=renderCar,
  wfPriorCalendar=renderCalendar, wfPriorAttendance=renderAttendance, wfPriorPersist=persist;
const wfRoles=Object.values(MODULE_ROLES).filter((v,i,a)=>a.indexOf(v)===i);
function wfEntry(label, route, detail='') {
 return `<a class="wf-entry" href="#${route}"><span><strong>${esc(label)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</span>${icon('chev','chev')}</a>`;
}
function wfPage(title,content,back='',right='') {return header(title,back,right)+`<main class="content wf-content">${content}</main>`;}
function wfDemoNote(){return ctx.mode==='demo'?'<p class="wf-demo-note">操作デモ · この端末だけに保存</p>':'';}
function wfGroups(){
 if(ctx.mode!=='demo')return ctx.groups;
 wf.demoGroups[state.group.id]=clone(state);
 return Object.values(wf.demoGroups).map(s=>({id:s.group.id,name:s.group.name,ownerId:s.ownerId}));
}
function wfSaveDemoGroups(){return safeLocal(wf.demoKey,JSON.stringify(wf.demoGroups));}
persist=function(){const ok=wfPriorPersist();if(ctx.mode==='demo'&&ok){wf.demoGroups[state.group.id]=clone(state);wfSaveDemoGroups();}return ok;};
async function wfSave(mutator){
 if(ctx.busy||ctx.conflict)throw Error('未保存の変更を確認してください');
 const before=clone(state);checkpoint();mutator();
 if(!persist()){state=before;render();throw Error('保存できませんでした');}
 if(ctx.mode==='server'){await ctx.savePromise;if(ctx.conflict)throw Error(ctx.conflict.message);}
 render();return true;
}
function wfClearWorkspace(){practiceDraft=null;practiceEvent='';ui.selectedPerson=null;ui.attendanceEvent='';ui.attendanceMember='';undoState=null;wf.image=null;wf.inviteLink='';wf.inviteLoadedFor='';wf.invitations=[];closeModal();}
async function wfSwitchGroup(gid){
 if(ctx.busy||ctx.conflict)throw Error('未保存の変更を確認してから切り替えてください');
 if(ctx.mode==='demo'){
  const next=wf.demoGroups[gid];if(!next)throw Error('グループが見つかりません');
  wf.demoGroups[state.group.id]=clone(state);state=normalize(clone(next));persist();
 }else{state=normalize(await api('/groups/'+encodeURIComponent(gid)+'/state'));ctx.base=clone(state);safeLocal('club-active-group',gid);}
 wfClearWorkspace();go('home');render();
}
switchGroup=wfSwitchGroup;
function wfWelcome(){
 const enabled=ctx.mode==='server'&&ctx.pushConfig.lineLogin;
 return wfPage('部活運営',`<div class="wf-intro"><h2>ログイン</h2><p>ログインして、使うグループを選びます。</p></div>
 ${wf.loginError?`<div class="warning" role="alert">${esc(wf.loginError)}</div>`:''}
 <div class="wf-stack">${enabled?'<a class="primary full wf-line" href="#welcome" data-act="wf-line-login">LINEでログイン</a>':'<button class="primary full wf-line" disabled>LINEでログイン</button><p class="note">LINEログインは接続設定前です。</p>'}
 ${sessionStorage.getItem('club-invite')?'<p class="wf-callout">招待を受け取っています。ログイン後に参加先を確認します。</p>':''}
 ${(ctx.mode==='demo'||ctx.pushConfig.passwordLogin)?`<details class="wf-password" ${wf.emailOpen?'open':''}><summary>メールでログイン・既存アカウント</summary>${segments([['login','ログイン'],['register','新規登録']],ctx.authTab,'auth-tab')}<form data-form="wf-auth">${ctx.authTab==='register'?field('表示名','name','','text','required maxlength="80" autocomplete="name"'):''}${field('メール','email','','email','required autocomplete="email"')}${field('パスワード','password','','password',`required minlength="10" maxlength="256" autocomplete="${ctx.authTab==='register'?'new-password':'current-password'}"`)}<button class="secondary full" ${ctx.mode==='demo'?'disabled':''}>${ctx.authTab==='register'?'登録して進む':'ログイン'}</button>${ctx.mode==='demo'?'<p class="note">単一HTMLではアカウントを作成しません。</p>':''}</form></details>`:''}
 ${action('wf-demo','デモを試す','','secondary full')}<p class="note">デモはLINEログイン・実際の招待を行いません。</p></div>`);
}
authScreen=wfWelcome;
function wfGroupScreen(){
 const groups=wfGroups();
 return wfPage('グループを選ぶ',wfDemoNote()+`<p class="wf-lead">使うグループを選択してください。</p><div class="wf-group-list">${groups.map(g=>`<button class="wf-entry" data-act="wf-open-group" data-id="${esc(g.id)}"><span><strong>${esc(g.name)}</strong><small>${g.ownerId===(ctx.mode==='demo'?state.currentUser:ctx.user?.id)?'オーナー':'運営メンバー'}</small></span>${icon('chev','chev')}</button>`).join('')||'<p class="empty">まだグループに参加していません</p>'}</div><div class="wf-group-actions">${wfEntry('グループを作る','group-create')}${wfEntry('招待から参加する','join')}</div>`,'',`<a class="text-btn" href="#account">アカウント</a>`);
}
groupScreen=wfGroupScreen;
function wfAccount(){
 const name=ctx.mode==='demo'?(wf.accountName||oName(state.currentUser)):ctx.user?.name||'';
 const linked=ctx.mode==='server'&&ctx.user?.lineLinked;
 return wfPage('アカウント',wfDemoNote()+`<form data-form="wf-account">${field('表示名','name',name,'text','required maxlength="80" autocomplete="name"')}<button class="secondary full">表示名を保存</button></form><hr class="rule"><h2>ログイン方法</h2><div class="row"><span class="row-main">LINE</span><span class="small ${linked?'green':'muted'}">${linked?'連携済み':'未連携'}</span></div>${!linked?`${action('wf-line-link','このアカウントにLINEを連携',ctx.mode!=='server'||!ctx.pushConfig.lineLogin?'disabled':'','secondary full')}<p class="note wf-gap">${ctx.mode==='demo'?'デモではLINEの本人確認を行いません。':ctx.pushConfig.lineLogin?'現在のグループと履歴を保ったまま連携します。':'LINEログインは準備中です。メールでのログインをご利用ください。'}</p>`:''}${ctx.user?.email?`<div class="row"><span class="row-main">メール</span><span class="small">${esc(ctx.user.email)}</span></div>`:''}<hr class="rule">${wfEntry('グループを選び直す','groups')}${action('wf-logout',ctx.mode==='demo'?'デモを終了':'ログアウト','','row danger-button')}`,'groups');
}
function wfCreateGroup(){return wfPage('グループを作る',wfDemoNote()+`<p class="wf-lead">作成した人がオーナーになります。</p><form data-form="wf-create-group">${field('グループ名','name','','text','required maxlength="100" placeholder="例：バドミントン部"')}<button class="primary full">作成して開く</button></form>`,'groups');}
function wfGroupSettings(){return shell('グループ設定','settings',`<h2>${esc(state.group.name)}</h2><p class="row-sub wf-gap">オーナー ${esc(oName(state.ownerId))}</p>${wfEntry('運営メンバー・招待','operators')}${wfEntry('別のグループを選ぶ','groups')}${own()?`<hr class="rule"><form data-form="group2">${field('グループ名','name',state.group.name,'text','required maxlength="100"')}<button class="secondary full">名前を保存</button></form>`:`<hr class="rule">${action('wf-leave','このグループから退出','','row danger-button')}`}`,'settings');}
renderGroup=wfGroupSettings;
renderSettings=function(){return wfPriorSettings().replace(entry('グループ','group','people'),entry('アカウント','account','people')+entry('グループを選ぶ','groups','people')+entry('グループ設定','group','settings'));};
renderOperators=function(){return shell('運営メンバー','settings',`<p class="note wf-gap-bottom">ログインして、このグループを使う人です。部員名簿とは別に管理します。</p>${own()?`<div class="wf-gap-bottom">${wfEntry('運営メンバーを招待','invite','リンクを送って本人に参加してもらう')}</div>`:''}${state.operators.map(o=>`<a class="row" href="#operator/${esc(o.id)}"><span class="row-main"><strong>${esc(o.name)}</strong><span class="row-sub block">${o.id===state.ownerId?'オーナー':Object.entries(state.roles).filter(([,ids])=>ids.includes(o.id)).map(([r])=>r).join('・')||'閲覧のみ'}</span></span>${icon('chev','chev')}</a>`).join('')}`,'settings');};
function wfOperator(id){const op=state.operators.find(o=>o.id===id);if(!op)return shell('運営メンバー','settings','見つかりません','operators');return shell(op.name,'settings',id===state.ownerId?'<p class="wf-callout">オーナーはすべての機能を管理できます。</p>':`<h2>編集できる機能</h2><p class="note wf-gap">選択していない機能は閲覧のみです。</p><form data-form="wf-operator-roles" data-id="${esc(id)}"><div class="wf-checklist">${wfRoles.map(r=>`<label class="option"><input type="checkbox" name="role" value="${esc(r)}" ${state.roles[r]?.includes(id)?'checked':''} ${own()?'':'disabled'}>${esc(r)}</label>`).join('')}</div>${own()?'<button class="primary full">権限を保存</button>':''}</form>${own()?`<hr class="rule">${action('operator-transfer','オーナーを引き継ぐ',`data-id="${esc(id)}"`,'row')}${action('operator-remove','グループから外す',`data-id="${esc(id)}"`,'row danger-button')}`:''}`,'operators');}
async function wfLoadInvites(){
 if(ctx.mode!=='server'||!ctx.base||!own())return;
 const gid=state.group.id;const res=await api('/groups/'+gid+'/invites');
 if(state.group.id!==gid)return;wf.invitations=res.invites;wf.inviteLoadedFor=gid;if(getRoute()[0]==='invite')render();
}
function wfInvitePage(){
 if(!own())return shell('招待','settings','<p class="empty">オーナーだけが招待できます。</p>','operators');
 const tags={active:'有効',used:'参加済み',revoked:'無効にした招待',expired:'期限切れ'};
 return shell('運営メンバーを招待','settings',wfDemoNote()+`<div class="wf-invite-group"><span class="label">参加先</span><h2>${esc(state.group.name)}</h2><p class="note wf-gap">初期権限は閲覧のみ。参加後に担当を設定します。</p></div><div class="wf-invite-steps"><span>1 リンクを作る</span><span>2 本人に送る</span><span>3 参加を確認</span></div>
 ${wf.inviteLink?`<label class="field"><span class="label">招待リンク</span><textarea readonly id="wf-invite-link" rows="3">${esc(wf.inviteLink)}</textarea></label><p class="note">${new Date(wf.inviteExpires*1000).toLocaleString('ja-JP')}まで · 1人1回限り</p><div class="wf-two wf-gap">${action('wf-copy-link','リンクをコピー','','primary')}${action('wf-share-link','共有する',!navigator.share?'disabled':'','secondary')}</div>`:`${action('wf-make-invite',ctx.mode==='demo'?'招待リンクを作る（本番で有効）':'招待リンクを作る',ctx.mode==='demo'?'disabled':'','primary full')}`}
 <p class="note wf-gap">LINEなどで本人に送ってください。別の人を招待するときは新しいリンクを発行します。</p>${wf.inviteLink?action('wf-make-invite','別の人の招待リンクを作る','','row'):''}
 ${ctx.mode==='demo'?`<div class="wf-callout">デモでは実際の招待を発行しません。</div>${action('wf-invite-preview','受け取る側の画面を確認','','secondary full')}`:''}
 <hr class="rule"><div class="section-head"><h2>発行した招待</h2>${action('wf-invites-refresh','更新','','text-btn')}</div>${wf.invitations.map(i=>`<div class="row"><span class="row-main"><span>${tags[i.status]}</span><span class="row-sub block">${new Date(i.expiresAt*1000).toLocaleDateString('ja-JP')}まで</span></span>${i.status==='active'?action('wf-revoke-invite','無効にする',`data-id="${esc(i.id)}"`,'text-btn danger-button'):''}</div>`).join('')||'<p class="empty">招待はまだありません</p>'}`,'operators');
}
function wfExtractToken(value){let token=String(value).trim();if(/^https?:\/\//.test(token)){const url=new URL(token);token=url.searchParams.get('invite')||'';}if(!/^[A-Za-z0-9_-]{16,200}$/.test(token))throw Error('招待リンクを確認してください');return token;}
async function wfPreviewJoin(token){
 const clean=wfExtractToken(token);sessionStorage.setItem('club-invite',clean);wf.joinToken=clean;wf.joinError='';wf.joinInfo=null;
 try{wf.joinInfo=await api('/invites/'+encodeURIComponent(clean));}catch(err){wf.joinError=err.message;}
 go('join');render();
}
function wfJoinPage(){
 const auth=ctx.mode==='demo'||!!ctx.user,info=wf.joinInfo;
 return wfPage('招待から参加',wfDemoNote()+`${wf.joinError?`<div class="warning" role="alert">${esc(wf.joinError)}</div><p class="note wf-gap-bottom">期限切れ・無効な場合は、オーナーに新しいリンクを依頼してください。</p>`:''}${info?`<div class="wf-invite-group"><span class="label">参加先のグループ</span><h2>${esc(info.groupName)}</h2><p class="note wf-gap">運営メンバーとして参加します。初期権限は閲覧のみです。</p></div>${info.isMember?`<p class="wf-callout">すでに参加しています。招待は消費しません。</p>${action('wf-open-group','グループを開く',`data-id="${esc(info.groupId)}"`,'primary full')}`:auth?action('wf-join-confirm',ctx.mode==='demo'?'参加後の流れを試す（デモ）':'このグループに参加','','primary full'):ctx.pushConfig.lineLogin?'<a class="primary full wf-line" href="#welcome" data-act="wf-line-login">LINEでログインして進む</a>':'<p class="warning">LINEログインは接続設定前です。</p><a class="secondary full" href="#welcome">ログイン画面へ</a>'}<p class="note wf-gap">グループ名を確認してから参加してください。</p>`:`<p class="wf-lead">受け取った招待リンクを貼り付けます。</p><form data-form="wf-join-preview"><label class="field"><span class="label">招待リンク</span><textarea name="token" required rows="3" placeholder="招待リンクを貼り付け">${esc(sessionStorage.getItem('club-invite')||'')}</textarea></label><button class="primary full" ${ctx.mode==='demo'?'disabled':''}>参加先を確認</button></form>`}`,'groups');
}
function wfCarMutable(id){const p=plan(id);if(!p)throw Error('配車が見つかりません');if(!edit('plans'))throw Error('配車の編集権限がありません');if(lockedPlan(id))throw Error('月次精算が確定済みです');if(event(p.eventId)?.cancelled)throw Error('中止した予定の配車は変更できません');return p;}
renderCar=function(id){
 const p=plan(id);if(!p)return wfPriorCar(id);
 let html=wfPriorCar(id);const readonly=!edit('plans')||lockedPlan(id)||event(p.eventId)?.cancelled;
 const modes=`<div class="wf-car-controls"><div class="wf-mode-switch" aria-label="往復の編集方法">${[['same','往復同じ'],['separate','行き・帰り別']].map(([v,label])=>action('wf-car-mode',label,`data-id="${esc(id)}" data-value="${v}" aria-pressed="${p.linked===(v==='same')}" ${readonly?'disabled':''}`,p.linked===(v==='same')?'active':'')).join('')}</div>${p.linked?'<p class="wf-mode-note">行き・帰りに同じ配置を使います。</p>':`<div class="wf-leg-switch">${segments([['outbound','行き'],['return','帰り']],legOf(p),'car-leg')}</div>`}<div class="wf-car-actions">${action('wf-car-copy-open','過去の配車を使う',`data-id="${esc(id)}" ${readonly?'disabled':''}`,'secondary')}<a class="secondary" href="#car-table/${esc(id)}">配車表・画像</a></div><div class="wf-car-status"><span>${p.status==='registered'?'登録済み':ctx.conflict?'未保存の変更あり':'編集中・自動保存'}</span>${action('car-options','詳細設定',`data-id="${esc(id)}"`,'text-btn')}</div></div>`;
 html=html.replace(/<div class="car-toolbar">[\s\S]*?<div class="car-workspace">/,modes+'<div class="car-workspace wf-car-workspace">');
 if(readonly)html=html.replaceAll('data-act="register-car"','disabled data-act="register-car"');
 return html;
};
const wfOldCarOptions=carOptions;
carOptions=function(id){wfOldCarOptions(id);document.querySelector('.modal form>.row')?.remove();};
function wfMergeDialog(id){const p=wfCarMutable(id);modal('往復に使う配置を選ぶ',`<p class="note wf-gap-bottom">選んだ配置で、もう片方を置き換えます。切替前の状態は「元に戻す」で戻せます。</p>${['outbound','return'].map(leg=>action('wf-car-merge',`<span><strong>${leg==='outbound'?'行き':'帰り'}の配置を使う</strong><small>${p.legs[leg].length}台 · ${assigned(p,leg).size}人</small></span>${icon('chev','chev')}`,`data-id="${esc(id)}" data-leg="${leg}"`,'wf-entry')).join('')}`);}
function wfCopyCandidates(id){const target=plan(id);if(!target)return [];const date=event(target.eventId)?.date;return state.plans.filter(p=>p.id!==id&&!event(p.eventId)?.cancelled&&event(p.eventId)?.date<=date).sort((a,b)=>event(b.eventId).date.localeCompare(event(a.eventId).date));}
function wfCarCopyPage(id){const p=plan(id);if(!p)return shell('配車を引き継ぐ','operations','見つかりません','carpools');const e=event(p.eventId);return shell('過去の配車を使う','operations',`<p class="wf-lead">${jpDate(e.date)}の配車に使う表を選びます。</p>${wfCopyCandidates(id).map(s=>{const se=event(s.eventId);return wfEntry(`${jpDate(se.date)} ${venue(se.venueId)?.name||se.title}`,'car-copy-confirm/'+id+'/'+s.id,`${s.linked?'往復同じ':'行き・帰り別'} · 行き${s.legs.outbound.length}台 / 帰り${s.legs.return.length}台${s.status==='draft'?' · 下書き':''}`)}).join('')||'<p class="empty">この日以前の配車表がありません</p>'}`,'car/'+id);}
function wfCopySummary(src,dst){
 const removed=new Set(),included=new Set();
 for(const leg of ['outbound','return'])for(const c of src.legs[leg])for(const mid of carPeople(c)){
  (D.participating(state,dst.eventId,mid)?included:removed).add(mid);
 }
 const newly=participants(dst.eventId).filter(p=>!included.has(p.id));
 return {removed:[...removed].map(pName),newly:newly.map(p=>p.name)};
}
function wfCarCopyConfirm(target,source){const src=plan(source),dst=plan(target);if(!src||!dst)return shell('配車の引き継ぎ','operations','見つかりません','carpools');const info=wfCopySummary(src,dst);return shell('引き継ぐ内容を確認','operations',`<div class="wf-copy-direction"><div><span class="label">コピー元</span><strong>${jpDate(event(src.eventId).date)} ${esc(venue(event(src.eventId).venueId)?.name||'')}</strong></div><span class="wf-down">↓</span><div><span class="label">今回の配車</span><strong>${jpDate(event(dst.eventId).date)} ${esc(venue(event(dst.eventId).venueId)?.name||'')}</strong></div></div><p class="wf-callout">現在の配置を置き換えます。コピー元は変更しません。</p><div class="wf-summary-row"><strong>今回不参加のため外す人</strong><p>${esc(info.removed.join('、')||'なし')}</p></div><div class="wf-summary-row"><strong>新たに配置を確認する人</strong><p>${esc(info.newly.join('、')||'なし')}</p></div><p class="note wf-gap-bottom">往復の分け方と配置を引き継ぎます。料金・利用日・通知は今回の設定を保ちます。配車不要の指定と個別の精算調整はリセットし、下書きとして保存します。</p>${action('wf-car-copy-apply','この配置を引き継ぐ',`data-target="${esc(target)}" data-source="${esc(source)}"`,'primary full')}`,'car-copy/'+target);}
renderTable=function(id){const p=plan(id),e=event(p?.eventId);if(!p||!e)return shell('配車表','operations','見つかりません','carpools');const errors=invalid(p),cancelled=e.cancelled;return shell('配車表・画像','operations',`${errors.length||cancelled?`<div class="warning">${esc(cancelled?'中止した予定です':errors.join('／'))}<br>配置を確認してから画像にしてください。</div>`:''}<div id="share-table"><h2 class="ride-title">${jpDate(e.date)} ${esc(venue(e.venueId)?.name||e.title)}${p.linked?'（往復）':''}</h2>${tableParts(p).map(tableHtml).join('')||'<p class="empty">配置がありません</p>'}</div><div class="wf-bottom-action">${action('wf-car-image','配車表を画像にする',`data-id="${esc(id)}" ${errors.length||cancelled?'disabled':''}`,'primary full')}<p class="note wf-gap">プレビューを確認して、保存または共有できます。</p></div>`,'car/'+id);};
renderCalendar=function(){return wfPriorCalendar().replace('data-act="calendar-image"','data-act="wf-calendar-image"').replace('>画像</button>','>予定表を画像にする</button>');};
renderAttendance=function(){if(!clubEvents().length)return shell('出欠','operations','<p class="empty">出欠を設定する部活予定がありません。</p>'+wfEntry('部活予定を確認する','calendar'),'operations');return wfPriorAttendance();};
function wfCalendarExport(){modal('予定表を画像にする',`<h3>${ui.calendarYear}年${ui.calendarMonth+1}月</h3><div class="wf-choice-list"><label class="option"><input type="radio" name="wf-calendar-scope" value="club" checked><span><strong>部活予定だけ</strong><small>部員への共有用</small></span></label><label class="option"><input type="radio" name="wf-calendar-scope" value="all"><span><strong>幹部予定・締切も含める</strong><small>運営メンバー向け</small></span></label></div><p class="note wf-gap-bottom">幹部予定を含める場合は、共有する相手を確認してください。</p>${action('wf-calendar-preview','画像プレビューへ','','primary full')}`);}
function wfImagePreview(cv,name,title){
 const data=cv.toDataURL('image/png'),bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'image/png'});
 wf.image={cv,name,blob,file:new File([blob],name,{type:'image/png'})};
 let share=false;try{share=!!(navigator.share&&navigator.canShare?.({files:[wf.image.file]}));}catch{}
 modal(title,`<p class="note wf-gap-bottom">${esc(name)}</p><img class="image-preview" alt="${esc(title)}" src="${data}"><div class="wf-two wf-gap">${action('wf-image-save','画像を保存','','primary')}${action('wf-image-share','共有する',share?'':'disabled','secondary')}</div>${!share?'<p class="note wf-gap">この環境では画像共有に未対応です。保存した画像を送信してください。</p>':''}`);
}
function wfRenderRoute(r,id,extra){
 if(r==='welcome')return wfWelcome();
 if(r==='join')return wfJoinPage();
 if(ctx.mode==='server'&&!ctx.user)return wfWelcome();
 if(r==='groups')return wfGroupScreen();
 if(r==='account')return wfAccount();
 if(r==='group-create')return wfCreateGroup();
 if(ctx.mode==='server'&&!ctx.base)return wfGroupScreen();
 if(r==='invite')return wfInvitePage();
 if(r==='operator')return wfOperator(id);
 if(r==='car-copy')return wfCarCopyPage(id);
 if(r==='car-copy-confirm')return wfCarCopyConfirm(id,extra);
 return null;
}
render=function(){if(!ctx.ready)return;const [r,id,extra]=getRoute();const html=wfRenderRoute(r,id,extra);if(html!==null){document.body.classList.remove('wide');document.getElementById('app').innerHTML=html;return;}wfPriorRender();};
showPendingInvite=async function(){const token=sessionStorage.getItem('club-invite');if(ctx.mode==='server'&&token)await wfPreviewJoin(token);};
// Window capture runs before the legacy document handlers. Changed actions are handled once.
window.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-act]');if(!b||b.disabled)return;const d=b.dataset,act=d.act;
 const aliases=['reload-server','auth-tab','group-picker','switch-group','invite2','logout2','start-demo','calendar-image','calendar-export','export-car','copy-open','split-car','split-apply','merge-apply'];
 if(!act.startsWith('wf-')&&!aliases.includes(act))return;
 actHandled(ev);if(wf.pending||ctx.busy){toast('処理中です');return;}wf.pending=true;
 try{
 switch(act){
 case'reload-server':{const conflict=ctx.conflict;ctx.conflict=null;try{await wfSwitchGroup(state.group.id);}catch(e){ctx.conflict=conflict;render();throw e;}break;}
 case'auth-tab':ctx.authTab=d.value;wf.emailOpen=true;render();break;
 case'wf-demo':case'start-demo':
  if(ctx.mode!=='demo'){ctx.mode='demo';ctx.user=null;ctx.base=null;let saved;try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{}state=normalize(saved||demoSeed());}
  ctx.ready=true;wf.demoGroups[state.group.id]=clone(state);go('groups');render();break;
 case'group-picker':go('groups');render();break;
 case'wf-open-group':case'switch-group':await wfSwitchGroup(d.id);break;
 case'wf-logout':case'logout2':
  if(ctx.busy||ctx.conflict)throw Error('未保存の変更を確認してください');
  if(ctx.mode==='demo'&&wf.serverAvailable){ctx.mode='server';ctx.user=null;ctx.base=null;try{await refreshSession();}catch(e){if(e.status!==401)throw e;}wfClearWorkspace();go(ctx.user?'groups':'welcome');render();break;}
  if(ctx.mode==='server')await api('/logout','POST',{});
  ctx.user=null;ctx.csrf='';ctx.base=null;wfClearWorkspace();go('welcome');render();break;
 case'invite2':go('invite');await wfLoadInvites();break;
 case'wf-invites-refresh':await wfLoadInvites();break;
 case'wf-make-invite':{
  if(ctx.mode!=='server'||!own())throw Error('招待リンクはサーバー版のオーナーが発行します');
  const inv=await api('/groups/'+state.group.id+'/invite','POST',{});
  wf.inviteLink=(ctx.pushConfig.publicOrigin||location.origin)+'/?invite='+encodeURIComponent(inv.token);wf.inviteExpires=inv.expiresAt;await wfLoadInvites();render();break;}
 case'wf-copy-link':
  try{await navigator.clipboard.writeText(wf.inviteLink);toast('招待リンクをコピーしました');}
  catch{const input=document.getElementById('wf-invite-link');input?.focus();input?.select();toast('リンクを選択しました。コピーしてください');}break;
 case'wf-share-link':if(navigator.share&&wf.inviteLink)await navigator.share({title:state.group.name+'への招待',text:'運営メンバーとして参加してください。',url:wf.inviteLink});break;
 case'wf-revoke-invite':
  if(!own())throw Error('権限がありません');
  await api('/groups/'+state.group.id+'/invites/'+encodeURIComponent(d.id)+'/revoke','POST',{});
  // A raw active link must never be presented as usable after revocation.
  wf.inviteLink='';await wfLoadInvites();toast('招待を無効にしました');break;
 case'wf-invite-preview':wf.joinInfo={groupName:state.group.name+'（招待例）',isMember:false,demo:true};wf.joinError='';go('join');break;
 case'wf-join-confirm':{
  if(ctx.mode==='demo'){wf.joinInfo=null;go('operators');toast('参加後は運営メンバーに表示され、オーナーが担当を設定します');break;}
  if(!ctx.user||!wf.joinToken)throw Error('ログインと招待リンクを確認してください');
  const res=await api('/join','POST',{token:wf.joinToken});sessionStorage.removeItem('club-invite');wf.joinInfo=null;wf.joinToken='';await refreshSession();await wfSwitchGroup(res.groupId);toast(res.alreadyMember?'すでに参加しています':'グループに参加しました');break;}
 case'wf-line-login':await clubStartLine(false);break;
 case'wf-line-link':await clubStartLine(true);break;
 case'wf-leave':if(confirm('このグループから退出しますか？')){await api('/groups/'+state.group.id+'/membership','POST',{userId:ctx.user.id,action:'remove'});ctx.base=null;wfClearWorkspace();await refreshSession();go('groups');render();}break;
 case'wf-car-mode':case'split-car':case'split-apply':case'merge-apply':{
  const p=wfCarMutable(d.id),same=act==='merge-apply'||d.value==='same';if(p.linked===same)break;
  if(same){wfMergeDialog(d.id);break;}
  await wfSave(()=>{p.legs.return=clone(p.legs.outbound);p.need.return=clone(p.need.outbound);p.linked=false;p.version++;p.status='draft';ui.leg='outbound';ui.selectedPerson=null;});toast('行き・帰りを別々に編集できます',true);break;}
 case'wf-car-merge':{
  const p=wfCarMutable(d.id);if(!['outbound','return'].includes(d.leg))throw Error('配置を選択してください');
  await wfSave(()=>{p.legs.outbound=clone(p.legs[d.leg]);p.legs.return=clone(p.legs.outbound);p.need.outbound=clone(p.need[d.leg]);p.need.return=clone(p.need.outbound);p.enabled={outbound:true,return:true};p.linked=true;p.version++;p.status='draft';ui.leg='outbound';ui.selectedPerson=null;});closeModal();render();toast('往復同じ配置にしました',true);break;}
 case'wf-car-copy-open':case'copy-open':wfCarMutable(d.id);go('car-copy/'+d.id);break;
 case'wf-car-copy-apply':{
  wfCarMutable(d.target);if(!wfCopyCandidates(d.target).some(p=>p.id===d.source))throw Error('コピー元を選び直してください');
  const result=copyPlan(d.source,d.target);if(!result.ok)throw Error('引き継げませんでした');if(ctx.mode==='server'){await ctx.savePromise;if(ctx.conflict)throw Error(ctx.conflict.message);}ui.leg='outbound';ui.selectedPerson=null;go('car/'+d.target);render();toast('今回の配車に引き継ぎました',true);break;}
 case'wf-car-image':case'export-car':{
  const p=plan(d.id);if(!p||invalid(p).length||event(p.eventId)?.cancelled)throw Error('未配車や配置を確認してください');
  wfImagePreview(drawCarCanvas(d.id),'配車表_'+event(p.eventId).date+'.png','配車表の画像');break;}
 case'wf-calendar-image':case'calendar-image':case'calendar-export':wfCalendarExport();break;
 case'wf-calendar-preview':{const all=document.querySelector('[name="wf-calendar-scope"]:checked')?.value==='all';wfImagePreview(drawCalendar(all),'予定表_'+ui.calendarYear+'-'+String(ui.calendarMonth+1).padStart(2,'0')+(all?'_幹部込み':'_部活のみ')+'.png','予定表の画像');break;}
 case'wf-image-save':if(wf.image){downloadCanvas(wf.image.cv,wf.image.name);toast('画像の保存を開始しました');}break;
 case'wf-image-share':if(wf.image&&navigator.share)await navigator.share({files:[wf.image.file],title:wf.image.name});break;
 }
 }catch(err){if(err.name!=='AbortError')toast(err.message||'操作できませんでした');}
 finally{wf.pending=false;}
},true);
window.addEventListener('submit',async ev=>{
 const f=ev.target;if(!f.dataset.form?.startsWith('wf-'))return;actHandled(ev);if(wf.pending||ctx.busy)return;wf.pending=true;
 const fd=new FormData(f),value=k=>String(fd.get(k)||'').trim();
 try{
 switch(f.dataset.form){
 case'wf-auth':{
  const res=await api('/'+ctx.authTab,'POST',{email:value('email'),password:value('password'),name:value('name')});ctx.user=res.user;ctx.csrf=res.csrf;ctx.base=null;await refreshSession();go('groups');render();await showPendingInvite();break;}
 case'wf-account':{
  if(ctx.conflict)throw Error('未保存の変更を確認してから更新してください');
  const name=value('name');if(!name||name.length>80)throw Error('表示名を確認してください');
  if(ctx.mode==='demo'){wf.accountName=name;for(const s of Object.values(wf.demoGroups)){const u=s.operators.find(o=>o.id===state.currentUser);if(u)u.name=name;}const u=state.operators.find(o=>o.id===state.currentUser);if(u)u.name=name;persist();}
  else{await api('/account','PATCH',{name});await refreshSession();if(ctx.base){state=normalize(await api('/groups/'+state.group.id+'/state'));ctx.base=clone(state);}}
  render();toast('表示名を保存しました');break;}
 case'wf-create-group':{
  const name=value('name');if(!name||name.length>100)throw Error('グループ名を確認してください');
  if(ctx.mode==='demo'){
   const gid='demo-'+UID(),uid=state.currentUser,s={schema:2,group:{id:gid,name},ownerId:uid,currentUser:uid,operators:[{id:uid,name:wf.accountName||oName(uid)}],people:[],events:[],tasks:[],notices:[],plans:[],venues:[],equipment:[],settlements:[],attendance:{},training:{categories:[],menus:[],sheets:[],history:[]},settings:{unitYen:null,reminders:['P7D','P1D']},roles:Object.fromEntries(wfRoles.map(r=>[r,[]]))};wf.demoGroups[gid]=s;await wfSwitchGroup(gid);
  }else{const s=await api('/groups','POST',{name});await refreshSession();await wfSwitchGroup(s.group.id);}
  toast('グループを作成しました');break;}
 case'wf-join-preview':await wfPreviewJoin(value('token'));break;
 case'wf-operator-roles':{
  if(!own())throw Error('オーナーだけが変更できます');const id=f.dataset.id;
  if(!state.operators.some(o=>o.id===id)||id===state.ownerId)throw Error('対象を確認してください');const selected=fd.getAll('role');
  await wfSave(()=>{for(const role of wfRoles){state.roles[role]=(state.roles[role]||[]).filter(uid=>uid!==id);if(selected.includes(role))state.roles[role].push(id);}});toast('編集権限を保存しました');break;}
 }
 }catch(err){toast(err.message||'保存できませんでした');}
 finally{wf.pending=false;}
},true);
window.addEventListener('hashchange',()=>{if(getRoute()[0]==='invite'&&wf.inviteLoadedFor!==state.group.id)wfLoadInvites().catch(e=>toast(e.message));});
bootstrap=async function(){
 const url=new URL(location.href),token=url.searchParams.get('invite'),err=url.searchParams.get('login_error');
 if(token)sessionStorage.setItem('club-invite',token);
 const messages={not_configured:'LINEログインは設定前です。',invalid_state:'ログインの有効期限が切れたか、別のブラウザです。もう一度開始してください。',cancelled:'LINEログインをキャンセルしました。',verification_failed:'LINEでの本人確認ができませんでした。再試行してください。',already_linked:'このLINEは別のアカウントと連携済みです。',session_expired:'連携前のログインが切れています。もう一度ログインしてください。'};
 wf.loginError=err?(messages[err]||'ログインできませんでした。もう一度開始してください。'):'';
 if(token||err||url.searchParams.has('line_connected')){url.searchParams.delete('invite');url.searchParams.delete('login_error');url.searchParams.delete('line_connected');try{history.replaceState(null,'',url);}catch{}}
 if(location.protocol==='file:'||url.searchParams.has('demo')){
  ctx.mode='demo';let saved;try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');wf.demoGroups=JSON.parse(localStorage.getItem(wf.demoKey)||'{}');}catch{wf.demoGroups={};}
  state=normalize(saved?.schema===2?saved:demoSeed());wf.demoGroups[state.group.id]=clone(state);ctx.ready=true;
  if(!location.hash)go('welcome');render();return;
 }
 try{
  ctx.pushConfig=await api('/config');ctx.mode='server';wf.serverAvailable=true;wf.emailOpen=!ctx.pushConfig.lineLogin;
  try{const result=await clubFinishLine(url);if(result)go(result.linked?'account':'groups');}catch(e){wf.loginError=e.message;go('welcome');}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  try{await refreshSession();}catch(e){if(e.status!==401)throw e;}
  ctx.base=null;ctx.ready=true;if(!location.hash)go(ctx.user?'groups':'welcome');render();
  if(sessionStorage.getItem('club-invite'))await showPendingInvite();
 }catch(e){ctx.ready=true;ctx.mode='server';ctx.user=null;ctx.base=null;render();toast('共有サーバーに接続できません。デモは別の保存領域で試せます。');}
};
window.ClubApp.render=()=>render();
bootstrap();

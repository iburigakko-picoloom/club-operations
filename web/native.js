'use strict';
// The Android shell exposes this bridge only while showing our own origin.
if(window.ClubNative){
 let registered='',registering='',snapshot='';
 const currentTasks=()=>operationalTasks().filter(t=>!t.done&&!t.deleted&&ownTask(t)).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
 function syncWidget(){
  if(!ctx.ready)return;
  const data=ctx.mode==='server'&&ctx.user&&ctx.base?{userId:ctx.user.id,group:state.group.name,total:currentTasks().length,tasks:currentTasks().slice(0,3).map(t=>({title:t.title,date:t.date}))}:null;
  const next=JSON.stringify(data);
  if(next!==snapshot){snapshot=next;window.ClubNative.saveWidgetSnapshot(next);}
 }
 async function syncPush(){
  if(ctx.mode!=='server'||!ctx.user||!ctx.base||!ctx.pushConfig.nativePush||!window.ClubNative.isNotificationsAllowed())return;
  const token=window.ClubNative.getPushToken();
  if(!token)return;
  const key=ctx.user.id+':'+token;
  if(registered===key||registering===key)return;
  registering=key;
  try{await api('/push/native','POST',{token});registered=key;}
  catch(e){if(getRoute()[0]==='notification-settings')toast(e.message||'通知端末を登録できませんでした');}
  finally{registering='';}
 }
 function sync(){syncWidget();syncPush();}
 const priorRender=render;
 render=function(){priorRender();queueMicrotask(sync);};
 window.ClubApp.render=()=>render();
 const priorDownloadCanvas=downloadCanvas;
 downloadCanvas=function(cv,name){
  if(!cv)return;
  if(!window.ClubNative.savePng(name||'画像.png',cv.toDataURL('image/png')))priorDownloadCanvas(cv,name);
 };
 const priorShareCanvas=shareCanvas;
 shareCanvas=async function(cv,name){
  if(!cv)return;
  if(!window.ClubNative.sharePng(name||'画像.png',cv.toDataURL('image/png')))await priorShareCanvas(cv,name);
 };
 const priorDownloadJSON=downloadJSON;
 downloadJSON=function(value,name){
  if(!window.ClubNative.saveText(name,JSON.stringify(value,null,2)))priorDownloadJSON(value,name);
 };
 const priorEnable=enablePush;
 enablePush=async function(){
  if(!window.ClubNative)return priorEnable();
  window.ClubNative.requestNotifications();
  await syncPush();
  render();
 };
 const priorNotificationSettings=renderNotificationSettings;
 renderNotificationSettings=function(){
  if(!window.ClubNative)return priorNotificationSettings();
  const allowed=window.ClubNative.isNotificationsAllowed();
  const ready=!!window.ClubNative.getPushToken();
  const configured=!!ctx.pushConfig.nativePush;
  return formShell('通知','settings','notifications',`<div class="row"><span class="row-main">この端末の通知</span>${action('enable-push',configured&&allowed&&ready?'有効':'有効にする',configured?'':'disabled')}</div><p class="note" style="margin:12px 0 24px">${!configured?'Android通知の送信設定は準備中です。':allowed?(ready?'通知を受け取れます。':'端末の通知設定を確認中です。'):'通知を許可すると予定とやることをお知らせします。'}</p>${configured&&allowed&&ready?action('push-test','テスト通知を送る','','secondary full'):''}${notifications(state.settings.reminders)}<p class="note">時刻なし予定は9:00を基準にします。</p>`,'settings');
 };
 window.clubNativeTokenReady=()=>{syncPush();render();};
 window.clubNativePermissionChanged=()=>{syncPush();render();};
 window.addEventListener('focus',sync);
 queueMicrotask(sync);
}

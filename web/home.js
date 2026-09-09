// Personal shortcuts are scoped to this account and group on this device.
const homeFeatures=[['出欠','attendance','people'],['配車','carpools','car'],['体育館','venues','calendar'],['コート割','courts','people'],['練習メニュー','practice','paper'],['備品','equipment','box'],['配車精算','settlement','paper']];
function homeKey(){return 'club-home-features-v1:'+JSON.stringify([ctx.mode,state.currentUser,state.group.id]);}
function homeSelected(){try{const value=JSON.parse(localStorage.getItem(homeKey())||'[]');return Array.isArray(value)?value.filter(id=>homeFeatures.some(f=>f[1]===id)):[];}catch{return [];}}
const homeOriginal=renderHome;
renderHome=function(){const selected=homeSelected(),links=homeFeatures.filter(f=>selected.includes(f[1])).map(f=>entry(...f)).join('');return homeOriginal().replace('</main>',(links?`<section class="section"><div class="section-head"><h2>よく使う機能</h2><a class="small muted" href="#home-customize">編集</a></div>${links}</section>`:'')+'</main>');};
const homeOperations=renderOperations;
renderOperations=function(){return homeOperations().replace('</main>',entry('ホームをカスタマイズ','home-customize','settings')+'</main>');};
const homeRoute=wfRenderRoute;
wfRenderRoute=function(r,id,extra){const guarded=homeRoute(r,id,extra);if(guarded!==null)return guarded;if(r!=='home-customize')return null;const selected=homeSelected();return shell('ホームをカスタマイズ','operations',`<p class="note">ホームに表示する機能を選択</p><form data-form="home-customize">${homeFeatures.map(([name,id])=>`<label class="row"><input type="checkbox" name="feature" value="${id}" ${selected.includes(id)?'checked':''}><span class="row-main">${name}</span></label>`).join('')}<div class="form-actions"><button class="primary full">保存</button></div></form>`,'operations');};
window.addEventListener('submit',ev=>{if(!ev.target.matches('[data-form="home-customize"]'))return;ev.preventDefault();ev.stopImmediatePropagation();const selected=[...ev.target.querySelectorAll('input[name="feature"]:checked')].map(el=>el.value);try{localStorage.setItem(homeKey(),JSON.stringify(selected));go('home');render();toast('ホームを更新しました');}catch{toast('保存できませんでした。端末の保存設定を確認してください');}},true);
window.addEventListener('click',ev=>{if(ev.target.closest('[data-home-tasks]'))ui.taskTab='self';},true);
if(ctx.ready)render();

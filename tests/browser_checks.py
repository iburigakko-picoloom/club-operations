"""Browser DOM integration checks under managed Chromium.
Network/file navigations are blocked by policy. Scripts are injected unchanged except
bootstrap demo selection; a test-only Storage adapter is used. No policy changes.
Native persistent storage, Service Worker, notifications and OS sharing are NOT tested.
"""
from pathlib import Path
import json,base64,sys,tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
OUT=ROOT/'qa';OUT.mkdir(exist_ok=True)
results=[]
def check(name,ok,detail=''):
 results.append({'name':name,'pass':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,detail)
def html(demo=True,bridge=False,stored=None):
 shim="""<script>location.hash='home';window.__qaStorage=STORED;for(const name of ['localStorage','sessionStorage']){const data=name==='localStorage'?window.__qaStorage:{};Object.defineProperty(window,name,{value:{getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]}});}</script>""".replace('STORED',json.dumps(stored or {}))
 if bridge:shim+='''<script>window.fetch=async function(url,options={}){const r=await window.__qaRequest(String(url),options);return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});}</script>'''
 out='<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+(ROOT/'web/styles.css').read_text()+'</style><body><div class="app" id="app"></div><div id="modal-root"></div><div id="toast-root" aria-live="polite"></div>'+shim
 for script in ['domain.js','base.js','app.js','workflow.js']:
  source=(ROOT/'web'/script).read_text()
  if demo:source=source.replace("location.protocol==='file:'||url.searchParams.has('demo')","true")
  out+='<script>'+source+'</script>'
 return out+'</body></html>'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 page.set_default_timeout(5000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.set_content(html());page.wait_for_function("ctx.ready")
 def visit(r):page.evaluate('(r)=>location.hash=r',r);page.wait_for_timeout(50)
 routes=['home','calendar','tasks','operations','settings','notices','notice/n1','notice-edit','event/e1','event/ex1','event-edit/ex1','day/2026-09-12','task/t1','task-edit/t1','attendance','carpools','car-add','car/plan1','car-table/plan1','settlement','venues','venue-edit/v1','equipment','equipment-edit/i1','members','member-edit/m4','roles','operators','group','notification-settings','car-settings','practice','practice-saved','practice-categories','menu-list','menu-edit/menu_1']
 for r in routes:
  visit(r);check('route '+r,page.locator('header').count()==1 and page.locator('nav a').count()==5 and page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 visit('home');check('home only notices and own tasks',page.locator('main .section').count()==2 and '大会申込' not in page.locator('main .section').last.inner_text())
 visit('calendar');check('club calendar hides executive/tasks',page.locator('.event-chip.exec,.event-chip.task').count()==0)
 page.locator('[data-act="calendar-filter"][data-value="all"]').click();check('executive tasks projected',page.locator('.event-chip.task').count()>0)
 # Actual form to create repeated practice dates.
 visit('event-edit');page.locator('[name="title"]').fill('繰り返しテスト');page.locator('[name="date"]').fill('2026-10-01');page.locator('[name="start"]').fill('19:00');page.locator('[name="end"]').fill('21:00');page.locator('details.advanced').first.locator('summary').click();page.locator('[name="repeatMode"]').select_option('weekly');page.locator('[name="repeatUntil"]').fill('2026-10-15');page.locator('[name="weekday"][value="2"]').check();page.locator('[name="weekday"][value="4"]').check();page.locator('button[form="edit-form"]').click();page.wait_for_timeout(80)
 check('weekly UI saves5 dates',page.evaluate('state.events.filter(e=>e.title==="繰り返しテスト").length')==5)
 visit('event-edit');page.locator('[name="title"]').fill('複数日テスト');page.locator('[name="date"]').fill('2026-10-01');page.locator('details.advanced').first.locator('summary').click();page.locator('[name="repeatMode"]').select_option('multiple')
 for dt in ['2026-10-01','2026-10-05']:
  page.locator('#batch-date').fill(dt);page.locator('[data-act="batch-date-add"]').click()
 page.locator('button[form="edit-form"]').click();page.wait_for_timeout(50)
 check('multiple date UI adds not overwrites same day',page.evaluate('state.events.filter(e=>e.title==="複数日テスト").length')==2 and page.evaluate('state.events.filter(e=>e.date==="2026-10-01").length')==2)
 # Executive participants0=all, no time.
 visit('event-edit');page.locator('[name="kind"]').select_option('executive');page.locator('[name="title"]').fill('全員・時刻なし');page.locator('[name="date"]').fill('2026-10-05');page.locator('button[form="edit-form"]').click();page.wait_for_timeout(40)
 check('exec no-time all',page.evaluate('state.events.find(e=>e.title==="全員・時刻なし").assignees.length===0&&state.events.find(e=>e.title==="全員・時刻なし").start===""'))
 # Training home follows the current GitHub structure plus recent UI decisions.
 visit('practice');page.evaluate("document.getElementById('toast-root').innerHTML=''");page.screenshot(path=str(OUT/'practice_home.png'));home_text=page.locator('main').inner_text();check('practice home has four vertical entries',all(x in home_text for x in ['メニュー表作成','メニュー一覧','分類一覧','練習メニュー履歴']) and page.locator('.entry').count()==4)
 # Category management and within-category reorder remain available without adding more home buttons.
 visit('practice-categories');check('category list normal tap-to-edit',page.locator('[data-act="category-edit"]').count()>=1 and page.locator('[data-act="category-delete"]').count()==0)
 page.locator('[data-act="category-edit-toggle"]').click();check('category edit mode has drag and delete',page.locator('[data-act="category-edit-toggle"]').inner_text()=='完了' and page.locator('[data-category-drag]').count()>=1 and page.locator('[data-act="category-delete"]').count()>=1)
 visit('menu-list');page.screenshot(path=str(OUT/'practice_menu_list.png'));check('menu list uses independent tap-to-edit cards',page.locator('a.training-menu-card[href^="#menu-edit/"]').count()==page.evaluate('state.training.menus.length'))
 page.evaluate('state.training.menus.push({id:"menu_extra",name:"基礎追加",categoryId:"cat_basic",seconds:90,requiresSets:true,order:99});normalizeMenuOrders("cat_basic");persist();render()')
 page.locator('[data-act="menu-reorder-toggle"]').click();check('menu reorder mode available',page.locator('[data-act="menu-reorder-toggle"]').inner_text()=='完了' and page.locator('.menu-drag-handle').count()>=2)
 src=page.locator('[data-menu-id="menu_extra"] .menu-drag-handle');dst=page.locator('[data-menu-id="menu_1"]');a=src.bounding_box();b=dst.bounding_box();page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down();page.mouse.move(b['x']+b['width']/2,b['y']+5,steps=12);page.mouse.up();page.wait_for_timeout(60)
 check('menu drag reorders within category',page.evaluate('sortedTrainingMenus(state.training.menus.filter(m=>m.categoryId==="cat_basic")).map(m=>m.id).join(",")')=='menu_extra,menu_1')
 # Practice: use source's real menu definition, current event, ordered selection ->sets -> save.
 visit('practice-new');page.wait_for_timeout(40);page.locator('[data-act="practice-event-pick"]').click();page.locator('[data-act="practice-event-set"][data-id="e1"]').click();page.locator('[name="practiceTitle"]').fill('土曜の練習メニュー')
 for mid in ['menu_2','menu_5','menu_6']:page.locator(f'[data-act="practice-select-menu"][data-id="{mid}"]').click()
 check('selection order retained',page.evaluate('practiceDraft.rows.map(r=>r.menuId).join(",")')=='menu_2,menu_5,menu_6')
 page.locator('[data-act="practice-next"]').click();page.wait_for_timeout(50)
 check('native practice no iframe',page.locator('iframe').count()==0 and page.locator('.set-table tbody tr').count()==3)
 check('training flow shows three steps',page.locator('.practice-progress span').all_inner_texts()==['1 メニュー','2 セット','3 出力'])
 # 120sec x5 +600 +300 =1500. Increment5person to2 =>2100.
 page.locator('[data-act="practice-step"][data-pattern="5"][data-step="1"]').first.click()
 times=[''.join(x.split()) for x in page.locator('.total-time strong').all_inner_texts()];check('current per-person-pattern times in UI',times==['4人23分','5人35分'],str(times))
 page.locator('[data-act="practice-order"][data-index="2"][data-step="-1"]').click()
 check('reorder updates rows',page.evaluate('practiceDraft.rows[1].menuId')=='menu_6')
 page.screenshot(path=str(OUT/'practice_sets.png'))
 # Context must be explicit; attendance changes do not rewrite counts.
 before=page.evaluate('JSON.stringify(practiceDraft.rows)');page.evaluate('state.attendance["e1|m4"]=false;render()')
 check('context change warning without hidden recalculation',page.locator('[data-act="practice-refresh"]').count()==1 and page.evaluate('JSON.stringify(practiceDraft.rows)')==before)
 page.locator('[data-act="practice-refresh"]').click()
 page.locator('[data-act="practice-save"]').click();page.wait_for_timeout(50)
 sid=page.evaluate('state.training.sheets[0].id');check('saved snapshot persisted',page.evaluate('state.training.sheets.length')==1 and page.locator('h2').inner_text()=='土曜の練習メニュー')
 page.locator('[data-act="practice-image"]').click();check('practice image preview',page.locator('img.image-preview').count()==1)
 check('practice output save option follows latest flow',page.locator('[data-act="image-close"]').count()==1 and page.locator('[data-act="image-download"]').count()==1 and page.locator('#practice-history-on-save').is_checked() and page.locator('[data-act="practice-history-add"]').count()==0)
 png=page.evaluate('previewCanvas.cv.toDataURL().split(",")[1]');(OUT/'practice_export.png').write_bytes(base64.b64decode(png));page.locator('[data-act="image-download"]').click();page.wait_for_timeout(50);check('image save adds history once',page.evaluate('state.training.history.length')==1);page.locator('[data-act="image-close"]').click()
 visit('practice-saved');page.evaluate("document.getElementById('toast-root').innerHTML=''");page.screenshot(path=str(OUT/'practice_history.png'));check('practice history thumbnail list',page.evaluate('state.training.history.length')==1 and page.locator('.training-history-card').count()==1 and page.locator('.training-history-thumb img').count()==1);check('saved editable sheets remain reachable',page.locator('.saved-practice-details').count()==1 and page.locator('.saved-practice-list a[href^="#practice-sheet/"]').count()==1)
 page.locator('[data-act="practice-history-open"]').click();check('history preview omits duplicate add',page.locator('[data-act="image-close"]').count()==1 and page.locator('[data-act="image-download"]').count()==1 and page.locator('#practice-history-on-save').count()==0 and page.locator('[data-act="practice-history-add"]').count()==0);page.locator('[data-act="image-close"]').click()
 visit('menu-edit/menu_2');page.locator('[name="minutes"]').fill('5');page.locator('#edit-form button[type="submit"]').click();page.wait_for_timeout(50)
 check('master change does not alter saved sheet',page.evaluate('state.training.sheets[0].rows.find(r=>r.menuId==="menu_2").seconds')==120)
 visit('practice-sheet/'+sid);page.locator('[data-act="practice-copy"]').click();page.wait_for_timeout(50);check('duplicate has independent id',page.evaluate('practiceDraft.id!==state.training.sheets[0].id'))
 # Storage adapter recreation, explicitly not native persistence.
 stored=page.evaluate('window.__qaStorage');page2=browser.new_page(viewport={'width':390,'height':844});page2.set_content(html(stored=stored));page2.wait_for_function('ctx.ready');check('storage restore saved sheet',page2.evaluate('state.training.sheets[0].title')=='土曜の練習メニュー');page2.close()
 # Carpool and touch interaction.
 page.evaluate('ClubApp.reset()');visit('car/plan1')
 src=page.locator('[data-person="m9"]');dst=page.locator('[data-drop="passenger"][data-car-id="c2"]');a=src.bounding_box();b=dst.bounding_box();page.mouse.move(a['x']+15,a['y']+15);page.mouse.down();page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=15);page.mouse.up();page.wait_for_timeout(70)
 check('real mouse drag moves rider',page.evaluate('plan("plan1").legs.outbound.find(c=>c.id==="c2").riders.includes("m9")'))
 before=page.evaluate('JSON.stringify(state.plans[0])');res=page.evaluate('moveMember("plan1","m11",{kind:"passenger",carId:"c1"})');check('full car rejects atomically',not res['ok'] and page.evaluate('JSON.stringify(state.plans[0])')==before)
 page.evaluate('moveMember("plan1","m11",{kind:"passenger",carId:"c3"});moveMember("plan1","m12",{kind:"passenger",carId:"c3"});render()');check('linked roundtrip equality',page.evaluate('JSON.stringify(plan("plan1").legs.outbound)===JSON.stringify(plan("plan1").legs.return)'))
 page.locator('[data-act="register-car"]').click();page.wait_for_timeout(50);check('register to driver header table',page.locator('.ride-table th').all_text_contents()==['池田','中島','山口'] and '台目' not in page.locator('#share-table').inner_text())
 png=page.evaluate('drawCarCanvas("plan1").toDataURL().split(",")[1]');(OUT/'carpool_export.png').write_bytes(base64.b64decode(png))
 # Driver replacement and missing warning.
 visit('car/plan1');page.evaluate('state.attendance["e1|m14"]=true;moveMember("plan1","m14",{kind:"driver",carId:"c1"});render()');check('driver replacement riders preserved',page.evaluate('plan("plan1").legs.outbound[0].driver==="m14"&&plan("plan1").legs.outbound[0].riders.length===3'))
 page.evaluate('ClubApp.reset()');visit('car/plan1');page.locator('[data-act="person-select"][data-person="m11"]').click();page.locator('[data-drop="passenger"][data-car-id="c3"]').scroll_into_view_if_needed();page.locator('[data-drop="passenger"][data-car-id="c3"]').click();page.wait_for_timeout(50);check('tap fallback moves rider',page.evaluate('plan("plan1").legs.outbound.find(c=>c.id==="c3").riders.includes("m11")'))
 # Copy applies current attendance and no mutation source.
 page.evaluate('ClubApp.reset()');source=page.evaluate('JSON.stringify(plan("plan0"))');page.evaluate('state.attendance["e1|m4"]=false;copyPlan("plan0","plan1");render()');check('copy intersects target participants',page.evaluate('!plan("plan1").legs.outbound.flatMap(c=>[c.driver,...c.riders]).includes("m4")'));check('copy preserves source',page.evaluate('JSON.stringify(plan("plan0"))')==source)
 # Attendance both views.
 page.evaluate('ClubApp.reset()');visit('attendance');before=page.evaluate('state.attendance["e1|m4"]');page.locator('[data-act="attendance-toggle"][data-mid="m4"]').click();check('single attendance toggle',page.evaluate('state.attendance["e1|m4"]')!=before)
 page.locator('[data-act="attendance-mode"][data-value="member"]').click();check('member attendance view same state','不参加' in page.locator('[data-act="attendance-toggle"][data-eid="e1"]').inner_text())
 # Monthly statement locks and row-level overrides.
 page.evaluate('ClubApp.reset()');visit('settlement');check('monthly amounts based on real registered history',page.evaluate('settlementLines().reduce((v,l)=>v+l.amount,0)')==5400)
 page.locator('[data-act="statement-lock"]').click();page.wait_for_timeout(50);check('monthly lock created',page.evaluate('state.settlements[0].locked'))
 result=page.evaluate('moveMember("plan0","m4",{kind:"pool"},"outbound")');check('locked ride edit prevented',not result['ok'])
 page.locator('[data-act="statement-reopen"]').click();check('month reopen preserves old record',page.evaluate('state.settlements.length===1&&!state.settlements[0].locked'))
 # Notice submission author auto and notify fields.
 visit('notice-edit');page.locator('[name="title"]').fill('新しいお知らせ');page.locator('[name="body"]').fill('共有本文');page.locator('button[form="edit-form"]').click();page.wait_for_timeout(30);check('notice minimal form auto author',page.evaluate('state.notices[0].title==="新しいお知らせ"&&state.notices[0].author==="細川"'))
 # Task date/time changes and calendar projection without new events.
 n=page.evaluate('state.events.length');visit('task-edit/t1');page.locator('[name="date"]').fill('2026-10-10');page.locator('[name="time"]').fill('17:15');page.locator('button[form="edit-form"]').click();page.wait_for_timeout(50);check('task deadline no duplicate event',page.evaluate('state.events.length')==n and page.evaluate('state.tasks.find(t=>t.id==="t1").time')=='17:15')
 visit('equipment');page.locator('[data-act="stock"][data-delta="-1"]').first.click();check('inventory decrement',page.evaluate('state.equipment[0].quantity')==3)
 # All major screens at narrow and wide widths; actual images.
 page.evaluate('ClubApp.reset()')
 for width in [360,390,430,768,1280]:
  page.set_viewport_size({'width':width,'height':844})
  for route in ['home','calendar','car/plan1','practice','members']:
   visit(route);check(f'width {width} {route}',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 page.set_viewport_size({'width':390,'height':844})
 for route,name in [('home','home'),('calendar','calendar'),('car/plan1','carpool_editor'),('car-table/plan1','carpool_table'),('practice','practice_home'),('attendance','attendance'),('settings','settings')]:
  visit(route);page.screenshot(path=str(OUT/(name+'.png')))
 page.evaluate('ui.calendarMonth=8;ui.calendarYear=2026');png=page.evaluate('drawCalendar(false).toDataURL().split(",")[1]');(OUT/'calendar_export.png').write_bytes(base64.b64decode(png))
 check('no unhandled JS errors',not errors,' | '.join(errors))
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'results':results,'errors':errors,'limitations':['HTML direct injection','in-memory storage adapter','No native network/Service Worker/OS-share or push tested']},ensure_ascii=False,indent=2))
print(f'{sum(x["pass"] for x in results)}/{len(results)} pass')
if any(not x['pass'] for x in results):sys.exit(1)

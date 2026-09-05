"""Frontend -> actual FastAPI/SQLite integration via a test transport bridge.
The bridge is needed solely because sandbox Chromium policy blocks localhost.
This is NOT a browser cookie/network/HTTPS/SW or physical-device test.
"""
from pathlib import Path
import sys,json,tempfile
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from server import app as backend
# Load helper definitions without running the other suite.
helpers={"__file__":str(ROOT/'tests/browser_checks.py')};src=(ROOT/'tests/browser_checks.py').read_text();exec(src[:src.index('with sync_playwright()')],helpers);html=helpers['html']
results=[]
def record(name,ok):results.append({'name':name,'pass':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with tempfile.TemporaryDirectory() as tmp:
 backend.DB_PATH=Path(tmp)/'db.sqlite3';backend.AUTH_ATTEMPTS.clear()
 with TestClient(backend.app) as client,sync_playwright() as pw:
  def request(url,options):
   response=client.request(options.get('method','GET'),url,headers=options.get('headers',{}),content=options.get('body'));return {'body':response.text,'status':response.status_code}
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000)
  page.expose_function('__qaRequest',request);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.set_content(html(demo=False,bridge=True));page.wait_for_function('ctx.ready')
  def route(r):page.evaluate('(r)=>location.hash=r',r);page.wait_for_timeout(60)
  def idle():page.wait_for_function('!ctx.busy');page.wait_for_timeout(60)
  record('actual auth screen',page.locator('[data-form="wf-auth"]').count()==1)
  page.locator('.wf-password summary').click();page.locator('[data-act="auth-tab"][data-value="register"]').click();page.locator('[name="name"]').fill('運営テスト');page.locator('[name="email"]').fill('operator@example.org');page.locator('[name="password"]').fill('test-password-22221');page.locator('[data-form="wf-auth"] button').click();page.wait_for_selector('[href="#group-create"]');page.locator('[href="#group-create"]').click();page.wait_for_selector('[data-form="wf-create-group"]')
  record('registration establishes API session',client.get('/api/session').status_code==200)
  page.locator('[data-form="wf-create-group"] [name="name"]').fill('検証用バドミントン部');page.locator('[data-form="wf-create-group"] button').click();page.wait_for_function('ctx.base!==null');page.wait_for_timeout(80)
  gid=page.evaluate('state.group.id');record('group create blank authoritative state',client.get('/api/groups/'+gid+'/state').json()['group']['name']=='検証用バドミントン部' and page.evaluate('state.people.length')==0)
  route('venue-edit');page.locator('[name="name"]').fill('第一体育館');page.locator('[name="courts"]').fill('4');page.locator('button[form="edit-form"]').click();idle();record('gym stored on server',len(client.get('/api/groups/'+gid+'/state').json()['venues'])==1)
  for name,grade,seniority in [('運転者',4,'above'),('乗車者',2,'below')]:
   route('member-edit');page.locator('[name="name"]').fill(name);page.locator('[name="grade"]').select_option(str(grade));page.locator('[name="seniority"]').select_option(seniority);page.locator('button[form="edit-form"]').click();idle()
  record('roster stored separately from login accounts',len(client.get('/api/groups/'+gid+'/state').json()['people'])==2 and len(client.get('/api/groups/'+gid+'/state').json()['operators'])==1)
  route('event-edit');page.locator('[name="title"]').fill('統合テスト練習');page.locator('[name="start"]').fill('19:00');page.locator('[name="end"]').fill('21:00');venue=page.evaluate('state.venues[0].id');page.locator('[name="venue"]').select_option(venue);page.locator('button[form="edit-form"]').click();idle();s=client.get('/api/groups/'+gid+'/state').json();eid=s['events'][0]['id'];record('schedule and automatic defaults persisted',s['attendance'][eid+'|'+s['people'][0]['id']]==False and s['attendance'][eid+'|'+s['people'][1]['id']]==True)
  route('practice');page.locator('[data-act="practice-defaults"]').click();idle();route('practice-new');page.wait_for_timeout(60);page.locator('[data-act="practice-event-pick"]').click();page.locator('[data-act="practice-event-set"][data-id="'+eid+'"]').click();page.locator('[data-act="practice-select-menu"][data-id="menu_2"]').click();page.locator('[data-act="practice-select-menu"][data-id="menu_6"]').click();page.locator('[data-act="practice-next"]').click();page.wait_for_timeout(60);page.locator('[data-act="practice-save"]').click();idle();ss=client.get('/api/groups/'+gid+'/state').json();record('native practice saves to shared DB',len(ss['training']['sheets'])==1 and ss['training']['sheets'][0]['eventId']==eid)
  # Snapshot context updated only explicitly, with shared attendance workflow.
  route('attendance');driver=ss['people'][0]['id'];page.locator(f'[data-act="attendance-toggle"][data-mid="{driver}"]').click();idle();record('attendance server round trip',client.get('/api/groups/'+gid+'/state').json()['attendance'][eid+'|'+driver])
  route('car-add');page.locator('[data-act="car-create"]').first.click();idle();p=client.get('/api/groups/'+gid+'/state').json()['plans'][0];pid=p['id'];record('carpool starts from selected schedule',p['eventId']==eid and p['legs']['outbound']==[])
  route('car/'+pid);rider=ss['people'][1]['id'];page.evaluate('(m)=>performMove(m,{kind:"new",pickup:"university"})',driver);idle();car=client.get('/api/groups/'+gid+'/state').json()['plans'][0]['legs']['outbound'][0];page.evaluate('({m,c})=>performMove(m,{kind:"passenger",carId:c})',{'m':rider,'c':car['id']});idle();page.locator('[data-act="register-car"]').click();idle();p=client.get('/api/groups/'+gid+'/state').json()['plans'][0];record('carpool registration persisted and linked',p['status']=='registered' and p['legs']['outbound']==p['legs']['return'])
  # Notice and own-task writes.
  route('notice-edit');page.locator('[name="title"]').fill('更新');page.locator('[name="body"]').fill('共有された本文');page.locator('button[form="edit-form"]').click();idle();record('notice author server stamped',client.get('/api/groups/'+gid+'/state').json()['notices'][0]['author']=='運営テスト')
  route('task-edit');page.locator('[name="title"]').fill('提出');page.locator('button[form="edit-form"]').click();idle();tid=client.get('/api/groups/'+gid+'/state').json()['tasks'][0]['id'];route('task/'+tid);page.locator('[data-act="task-toggle"]').click();idle();record('shared task completion',client.get('/api/groups/'+gid+'/state').json()['tasks'][0]['done'])
  # Force a real competing API commit, then frontend edit must fail, recover snapshot.
  current=client.get('/api/groups/'+gid+'/state').json();csrf=page.evaluate('ctx.csrf');newsettings=current['settings'].copy();newsettings['unitYen']=400
  res=client.patch('/api/groups/'+gid+'/state',json={'version':current['version'],'changes':{'settings':newsettings}},headers={'X-CSRF-Token':csrf});assert res.status_code==200
  route('task-edit/'+tid);page.locator('[name="title"]').fill('競合する編集');page.locator('button[form="edit-form"]').click();idle();record('CAS conflict not silently overwritten',page.locator('.sync-error').count()==1 and client.get('/api/groups/'+gid+'/state').json()['tasks'][0]['title']=='提出')
  page.locator('[data-act="reload-server"]').click();page.wait_for_timeout(180);record('reload recovers latest committed state',page.evaluate('state.settings.unitYen')==400 and page.locator('.sync-error').count()==0)
  record('no frontend JS errors with backend',not errors)
  page.screenshot(path=str(ROOT/'qa/server_home.png'));browser.close()
(ROOT/'qa/browser-server-results.json').write_text(json.dumps({'results':results,'errors':errors,'transport':'Injected fetch -> FastAPI TestClient with real SQLite; not a native browser network test'},ensure_ascii=False,indent=2))
print(f'{sum(x["pass"] for x in results)}/{len(results)} pass')
if any(not x['pass'] for x in results):sys.exit(1)

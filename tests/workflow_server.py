"""v0.9 invitation/account UI -> actual FastAPI + temporary SQLite.
External identity transport is covered separately by mocked tests/test_identity.py.
This injected fetch bridge does NOT validate browser networking/cookies or real LINE.
"""
from pathlib import Path
import json, sys, tempfile
from urllib.parse import urlparse, parse_qs
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import app as backend
helpers = {'__file__': str(ROOT/'tests/browser_checks.py')}
source = (ROOT/'tests/browser_checks.py').read_text()
exec(source[:source.index('with sync_playwright()')], helpers)
results=[]
def check(name, okay):
    results.append({'name': name, 'pass': bool(okay)})
    print(('PASS ' if okay else 'FAIL ')+name, flush=True)
with tempfile.TemporaryDirectory() as tmp:
    backend.DB_PATH=Path(tmp)/'workflow.sqlite3';backend.AUTH_ATTEMPTS.clear()
    with TestClient(backend.app) as owner, TestClient(backend.app) as guest, sync_playwright() as pw:
        registration=owner.post('/api/register',json={'email':'owner-workflow@example.org','name':'運営代表','password':'WorkflowPassword2222'}).json()
        owner_csrf=registration['csrf'];owner_id=registration['user']['id']
        group=owner.post('/api/groups',json={'name':'バドミントン部'},headers={'X-CSRF-Token':owner_csrf}).json();gid=group['group']['id']
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        errors=[]
        def new_page(client):
            page=browser.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000)
            def request(url,options):
                res=client.request(options.get('method','GET'),url,headers=options.get('headers',{}),content=options.get('body'))
                return {'body':res.text,'status':res.status_code}
            page.expose_function('__qaRequest',request)
            page.on('pageerror',lambda err:errors.append(str(err)))
            page.on('dialog',lambda d:d.accept())
            page.set_content(helpers['html'](demo=False,bridge=True))
            page.wait_for_function('ctx.ready');page.wait_for_timeout(80)
            return page
        def route(page,r):page.evaluate('(r)=>location.hash=r',r);page.wait_for_timeout(90)
        def idle(page):page.wait_for_function('!wf.pending&&!ctx.busy');page.wait_for_timeout(100)
        p=new_page(owner)
        check('authenticated arrival still offers group selection',p.locator('[data-act="wf-open-group"]').count()==1 and p.locator('nav').count()==0)
        route(p,'account');p.locator('[name="name"]').fill('部活代表');p.locator('[data-form="wf-account"] button').click();idle(p)
        check('account display name updates verified account on API',owner.get('/api/session').json()['user']['name']=='部活代表')
        route(p,'groups');p.locator('[data-act="wf-open-group"]').click();idle(p)
        route(p,'operators');p.locator('[href="#invite"]').click();idle(p)
        p.locator('[data-act="wf-make-invite"]').click();idle(p)
        link=p.locator('#wf-invite-link').input_value();token=parse_qs(urlparse(link).query)['invite'][0]
        check('invite button produces one-use server token and expiry',link.startswith('http://testserver/?invite=') and p.evaluate('wf.inviteExpires>Date.now()/1000') and owner.get('/api/invites/'+token).status_code==200)
        p.evaluate("document.getElementById('toast-root').innerHTML=''");p.screenshot(path=str(ROOT/'qa/v09_invite_server.png'))
        q=new_page(guest);route(q,'join');q.locator('[name="token"]').fill(link);q.locator('[data-form="wf-join-preview"] button').click();idle(q)
        check('logged-out invite preview reveals group but no member list',q.locator('.wf-invite-group h2').inner_text()=='バドミントン部' and '部活代表' not in q.locator('#app').inner_text() and guest.get('/api/groups/'+gid+'/state').status_code==401)
        check('preview does not consume invitation',owner.get('/api/groups/'+gid+'/invites').json()['invites'][0]['status']=='active')
        q.locator('[href="#welcome"]').click();q.locator('.wf-password summary').click();q.locator('[data-act="auth-tab"][data-value="register"]').click()
        q.locator('[name="name"]').fill('新しい担当者');q.locator('[name="email"]').fill('new-operator@example.org');q.locator('[name="password"]').fill('WorkflowGuest2222');q.locator('[data-form="wf-auth"] button').click();idle(q)
        q.wait_for_selector('[data-act="wf-join-confirm"]')
        guest_user=guest.get('/api/session').json()['user'];guest_id=guest_user['id']
        check('login resumes invitation without auto-joining',q.locator('.wf-invite-group h2').inner_text()=='バドミントン部' and guest.get('/api/groups/'+gid+'/state').status_code==403)
        q.locator('[data-act="wf-join-confirm"]').click();idle(q)
        state=guest.get('/api/groups/'+gid+'/state').json()
        check('explicit join consumes invitation and creates membership only',len(state['operators'])==2 and len(state['people'])==0 and owner.get('/api/groups/'+gid+'/invites').json()['invites'][0]['status']=='used')
        check('new operator has no initial module edit grants',not any(guest_id in ids for ids in state['roles'].values()) and not q.evaluate('edit("plans")'))
        check('new operator cannot issue invitations',guest.post('/api/groups/'+gid+'/invite',json={},headers={'X-CSRF-Token':q.evaluate('ctx.csrf')}).status_code==403)
        p.evaluate('(gid)=>wfSwitchGroup(gid)',gid);idle(p);route(p,'operator/'+guest_id)
        p.locator('[name="role"][value="配車"]').check();p.locator('[data-form="wf-operator-roles"] button').click();idle(p)
        q.evaluate('(gid)=>wfSwitchGroup(gid)',gid);idle(q)
        check('owner grants only selected module through UI and database',q.evaluate('edit("plans")&&!edit("training")') and guest_id in guest.get('/api/groups/'+gid+'/state').json()['roles']['配車'])
        route(p,'invite');p.locator('[data-act="wf-make-invite"]').first.click();idle(p)
        second_link=p.locator('#wf-invite-link').input_value();second_token=parse_qs(urlparse(second_link).query)['invite'][0]
        route(q,'join');q.locator('[name="token"]').fill(second_link);q.locator('[data-form="wf-join-preview"] button').click();idle(q)
        check('existing-member invite offers open without consuming',q.locator('[data-act="wf-open-group"]').count()==1 and owner.get('/api/invites/'+second_token).json()['isMember'])
        p.locator('[data-act="wf-revoke-invite"]').click();idle(p)
        check('revoke clears displayed raw link and invalidates token',p.locator('#wf-invite-link').count()==0 and guest.get('/api/invites/'+second_token).status_code==400)
        route(q,'join');q.evaluate('(token)=>wfPreviewJoin(token)',second_token);idle(q)
        check('expired or revoked invitation explains recovery',q.locator('.warning').count()==1 and '新しいリンク' in q.locator('#app').inner_text())
        route(p,'welcome');p.locator('[data-act="wf-demo"]').click();idle(p)
        check('server demo uses separate local data',p.evaluate('ctx.mode==="demo"&&ctx.user===null'))
        route(p,'account');p.locator('[data-act="wf-logout"]').click();idle(p)
        check('ending server demo restores real account without fake login',p.evaluate('ctx.mode==="server"&&ctx.user.id')==owner_id and p.locator('[data-act="wf-open-group"]').count()==1)
        check('no uncaught invitation/account frontend errors',not errors)
        browser.close()
(ROOT/'qa/workflow-server-results.json').write_text(json.dumps({'results':results,'errors':errors,'transport':'Injected fetch -> TestClient/SQLite; no native browser network, cookie policy or real LINE test'},ensure_ascii=False,indent=2))
print(f'{sum(r["pass"] for r in results)}/{len(results)} pass')
if any(not r['pass'] for r in results):raise SystemExit(1)

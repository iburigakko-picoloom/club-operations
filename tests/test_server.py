"""Real API + SQLite integration tests. All accounts/database files are temporary."""
import sys,copy,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi.testclient import TestClient
from server import app as module

@pytest.fixture
def env(tmp_path,monkeypatch):
 monkeypatch.setattr(module,'DB_PATH',tmp_path/'test.sqlite3');module.AUTH_ATTEMPTS.clear()
 with TestClient(module.app) as client:yield client

def account(c,email='a@example.org',name='担当A'):
 r=c.post('/api/register',json={'email':email,'name':name,'password':'test-password-98241'});assert r.status_code==200,r.text
 return r.json()
def auth(r):return {'X-CSRF-Token':r['csrf']}
def create(c,r,name='検証用の部活'):
 v=c.post('/api/groups',json={'name':name},headers=auth(r));assert v.status_code==200,v.text;return v.json()
def patch(c,u,s,changes):return c.patch('/api/groups/'+s['group']['id']+'/state',json={'version':s['version'],'changes':changes},headers=auth(u))
def get(c,gid):return c.get('/api/groups/'+gid+'/state').json()
def populate(c,u,s):
 today=module.now().date().isoformat();people=[{'id':f'm{i}','name':f'部員{i}','grade':3 if i else 4,'seniority':'below' if i else 'above','pickup':'university','active':True,'defaultOverride':None} for i in range(4)]
 event={'id':'e','title':'練習','kind':'club','date':today,'start':'19:00','end':'21:00','venueId':'v','assignees':[]}
 changes={'people':people,'events':[event],'venues':[{'id':'v','name':'体育館','courts':4,'memo':''}]}
 res=patch(c,u,s,changes);assert res.status_code==200,res.text;return res.json()
def make_plan():
 cars=[{'id':'c','pickup':'university','driver':'m0','riders':['m1','m2','m3']}]
 return {'id':'p','eventId':'e','linked':True,'legs':{'outbound':cars,'return':copy.deepcopy(cars)},'enabled':{'outbound':True,'return':True},'need':{'outbound':{},'return':{}},'status':'draft','version':1,'unitYen':300}

def test_auth_cookie_csrf_origin(env):
 c=env;u=account(c);assert module.COOKIE in c.cookies
 assert c.post('/api/groups',json={'name':'x'}).status_code==403
 assert c.post('/api/groups',json={'name':'x'},headers={**auth(u),'Origin':'https://evil.example'}).status_code==403
 assert c.get('/api/session').json()['user']['name']=='担当A'
 assert c.get('/api/session').headers['cache-control']=='no-store'
 assert c.post('/api/logout',headers=auth(u)).status_code==200
 assert c.get('/api/session').status_code==401

def test_password_not_exposed(env):
 u=account(env);s=create(env,u);assert 'password' not in json.dumps(s);assert 'password' not in env.get('/api/session').text
 assert env.post('/api/login',json={'email':'a@example.org','password':'wrong-password'}).status_code==401

def test_storage_group_cas(env):
 u=account(env);s=create(env,u);s2=populate(env,u,s)
 assert s2['attendance']['e|m1'] is True and s2['attendance']['e|m0'] is False
 assert patch(env,u,s,{'equipment':[]}).status_code==409
 assert get(env,s['group']['id'])['people']==s2['people']

def test_attendance_manual_not_overwritten(env):
 u=account(env);s=populate(env,u,create(env,u));a=s['attendance'];a['e|m1']=False
 r=patch(env,u,s,{'attendance':a});assert r.status_code==200
 assert get(env,s['group']['id'])['attendance']['e|m1'] is False

def test_roster_default_three_month(env):
 u=account(env);s=populate(env,u,create(env,u));e=copy.deepcopy(s['events'][0]);e['id']='far';e['date']=module.add_months(module.now().date(),4).isoformat()
 r=patch(env,u,s,{'events':s['events']+[e]});assert r.status_code==200
 assert 'far|m1' not in r.json()['attendance']

def test_group_isolation_invite_single_use(env):
 a=account(env);s=create(env,a);gid=s['group']['id'];token=env.post('/api/groups/'+gid+'/invite',headers=auth(a)).json()['token']
 env.post('/api/logout',headers=auth(a));b=account(env,'b@example.org','担当B')
 assert env.get('/api/groups/'+gid+'/state').status_code==403
 assert env.post('/api/join',headers=auth(b),json={'token':token}).status_code==200
 assert env.post('/api/join',headers=auth(b),json={'token':token}).status_code==400
 sb=get(env,gid);assert patch(env,b,sb,{'settings':{'unitYen':0,'reminders':[]}}).status_code==403
 assert patch(env,b,sb,{'people':[]}).status_code==403

def test_unknown_keys_id_tampering(env):
 u=account(env);s=create(env,u)
 assert patch(env,u,s,{'ownerId':'evil'}).status_code==400
 assert patch(env,u,s,{'group':{'id':'foreign','name':'h'}}).status_code==403

def test_car_capacity_and_unique(env):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();p['legs']['outbound'][0]['riders'].append('m2');p['legs']['return']=copy.deepcopy(p['legs']['outbound'])
 assert patch(env,u,s,{'plans':[p]}).status_code==400
 p=make_plan();p['legs']['outbound'][0]['riders']=['m1','m1'];p['legs']['return']=copy.deepcopy(p['legs']['outbound'])
 assert patch(env,u,s,{'plans':[p]}).status_code==400

def test_car_registration_absent_missing(env):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();p['status']='registered'
 assert patch(env,u,s,{'plans':[p]}).status_code==400
 attendance=s['attendance'];attendance['e|m0']=True
 r=patch(env,u,s,{'attendance':attendance,'plans':[p]});assert r.status_code==200,r.text
 s=r.json();p=s['plans'][0];p['legs']['outbound'][0]['riders'].remove('m1');p['legs']['return']=copy.deepcopy(p['legs']['outbound'])
 assert patch(env,u,s,{'plans':[p]}).status_code==400

def test_leg_mirror(env):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();p['legs']['return'][0]['riders']=[]
 assert patch(env,u,s,{'plans':[p]}).status_code==400

def test_foreign_event_and_member_refs(env):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();p['eventId']='foreign'
 assert patch(env,u,s,{'plans':[p]}).status_code==400
 e=s['events'][0];e['venueId']='foreign'
 assert patch(env,u,s,{'events':[e]}).status_code==400

def test_event_multiple_same_day_and_date_validation(env):
 u=account(env);s=populate(env,u,create(env,u));e=copy.deepcopy(s['events'][0]);e.update(id='exec',kind='executive',start='',end='',venueId='',assignees=[])
 r=patch(env,u,s,{'events':s['events']+[e]});assert r.status_code==200
 s=r.json();assert len(s['events'])==2
 s['events'][0]['date']='2026-02-30';assert patch(env,u,s,{'events':s['events']}).status_code==400

def test_notice_author_and_no_resend(env):
 u=account(env);s=create(env,u);n={'id':'n','title':'共有','body':'本文','date':'1900-01-01','author':'偽名','assignees':[],'notify':True,'notifyVersion':1}
 r=patch(env,u,s,{'notices':[n]});assert r.status_code==200;s=r.json();assert s['notices'][0]['author']=='担当A';assert s['notices'][0]['date']==module.now().date().isoformat()
 with module.connect() as c:
  assert c.execute("select count(*) from jobs where status='pending'").fetchone()[0]==1
 r=patch(env,u,s,{'equipment':[{'id':'i','name':'シャトル','quantity':3,'unit':'筒','threshold':5,'memo':''}]});assert r.status_code==200
 with module.connect() as c:assert c.execute("select count(*) from jobs where status='pending'").fetchone()[0]==1

def test_reminder_offsets_cancel(env):
 u=account(env);s=create(env,u);future=(module.now().date()+module.timedelta(days=20)).isoformat()
 t={'id':'t','title':'提出','date':future,'time':'18:00','assignees':[],'done':False,'notifications':['P7D','P1D']}
 r=patch(env,u,s,{'tasks':[t]});assert r.status_code==200;s=r.json()
 with module.connect() as c:assert c.execute("select count(*) from jobs where status='pending'").fetchone()[0]==2
 t=s['tasks'][0];t['done']=True
 r=patch(env,u,s,{'tasks':[t]});assert r.status_code==200
 with module.connect() as c:assert c.execute("select count(*) from jobs where status='pending'").fetchone()[0]==0

def test_month_offset_clamped(env):
 d=module.datetime(2027,3,31,9,tzinfo=module.JST)
 assert module.offset_due(d,'P1M').date().isoformat()=='2027-02-28'

def test_inventory_nonnegative(env):
 u=account(env);s=create(env,u)
 assert patch(env,u,s,{'equipment':[{'id':'i','name':'シャトル','quantity':-1,'unit':'筒'}]}).status_code==400

def test_saved_training_snapshot(env):
 u=account(env);s=populate(env,u,create(env,u));tr={'categories':[{'id':'cat','name':'基礎'}],'menus':[{'id':'m','categoryId':'cat','name':'ノック','seconds':120,'requiresSets':True}],'sheets':[{'id':'sh','title':'練習','eventId':'e','patterns':[4,5],'rows':[{'name':'ノック','seconds':120,'requiresSets':True,'sets':{'4':1,'5':2}}]}]}
 r=patch(env,u,s,{'training':tr});assert r.status_code==200;s=r.json();tr['menus'][0]['seconds']=300
 r=patch(env,u,s,{'training':tr});assert r.status_code==200;assert r.json()['training']['sheets'][0]['rows'][0]['seconds']==120

def test_push_rejects_ssrf(env):
 u=account(env)
 for url in ['http://127.0.0.1/admin','https://example.com/secret','https://fcm.googleapis.com.evil.test/a','https://u@fcm.googleapis.com/a']:
  r=env.post('/api/push/subscription',headers=auth(u),json={'subscription':{'endpoint':url,'keys':{'p256dh':'x','auth':'y'}}});assert r.status_code==400

def test_invisible_notices_own_task_permission(env):
 a=account(env);s=create(env,a);gid=s['group']['id'];token=env.post('/api/groups/'+gid+'/invite',headers=auth(a)).json()['token'];cookie=env.cookies.get(module.COOKIE)
 b=account(env,'b@example.org','担当B');env.post('/api/join',headers=auth(b),json={'token':token});
 env.cookies.set(module.COOKIE,cookie,domain='testserver.local',path='/');s=get(env,gid)
 n={'id':'n','title':'限定','body':'本文','assignees':[a['user']['id']],'notify':False}
 t={'id':'t','title':'提出','date':module.now().date().isoformat(),'time':'18:00','assignees':[b['user']['id']],'done':False}
 r=patch(env,a,s,{'notices':[n],'tasks':[t]});assert r.status_code==200,r.text
 env.post('/api/login',json={'email':'b@example.org','password':'test-password-98241'});sb=get(env,gid);assert sb['notices']==[]
 b=env.get('/api/session').json();task=sb['tasks'][0];task['done']=True
 r=patch(env,b,sb,{'tasks':[task]});assert r.status_code==200,r.text
 sb=r.json();task=sb['tasks'][0];task['title']='不正変更'
 assert patch(env,b,sb,{'tasks':[task]}).status_code==403

def test_finalized_snapshots_immutable_and_lock(env):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();r=patch(env,u,s,{'plans':[p]});assert r.status_code==200;s=r.json()
 snap={'id':'snap','month':module.now().date().strftime('%Y-%m'),'locked':True,'planIds':['p'],'lines':[],'revision':1}
 r=patch(env,u,s,{'settlements':[snap]});assert r.status_code==200;s=r.json()
 assert patch(env,u,s,{'plans':[]}).status_code==409
 p=s['plans'][0];p['unitYen']=600
 assert patch(env,u,s,{'plans':[p]}).status_code==409
 edited=copy.deepcopy(snap);edited['revision']=99
 assert patch(env,u,s,{'settlements':[edited]}).status_code==400
 snap['locked']=False
 r=patch(env,u,s,{'settlements':[snap]});assert r.status_code==200;s=r.json()
 r=patch(env,u,s,{'plans':[p]});assert r.status_code==200


@pytest.mark.parametrize('key,value',[
 ('enabled',None),('enabled',{}),('enabled',{'outbound':1,'return':True}),
 ('legs',None),('legs',{'outbound':{},'return':[]}),
 ('need',None),('need',{'outbound':None,'return':{}}),
])
def test_invalid_plan_structure_not_persisted(env,key,value):
 u=account(env);s=populate(env,u,create(env,u));p=make_plan();p[key]=value
 assert patch(env,u,s,{'plans':[p]}).status_code==400
 assert get(env,s['group']['id'])['plans']==[]


def test_cancelled_plan_cancels_notifications(env):
 u=account(env);s=populate(env,u,create(env,u))
 e=copy.deepcopy(s['events'][0]);e['date']=(module.now().date()+module.timedelta(days=10)).isoformat()
 p=make_plan();p['notifications']=['P1D']
 r=patch(env,u,s,{'events':[e],'plans':[p]});assert r.status_code==200;s=r.json()
 gid=s['group']['id']
 with module.connect() as c:
  assert c.execute("SELECT count(*) FROM jobs WHERE group_id=? AND status='pending'",(gid,)).fetchone()[0]==1
 p['status']='cancelled'
 assert patch(env,u,s,{'plans':[p]}).status_code==200
 with module.connect() as c:
  assert c.execute("SELECT count(*) FROM jobs WHERE group_id=? AND status='pending'",(gid,)).fetchone()[0]==0

def test_calendar_role_cannot_change_rates(env):
 a=account(env);s=create(env,a);gid=s['group']['id'];token=env.post('/api/groups/'+gid+'/invite',headers=auth(a)).json()['token']
 b=account(env,'calendar@example.org','予定担当');env.post('/api/join',headers=auth(b),json={'token':token})
 env.post('/api/login',json={'email':'a@example.org','password':'test-password-98241'});a=env.get('/api/session').json();s=get(env,gid);roles=s['roles'];roles['予定']=[b['user']['id']]
 assert patch(env,a,s,{'roles':roles}).status_code==200
 env.post('/api/login',json={'email':'calendar@example.org','password':'test-password-98241'});b=env.get('/api/session').json();s=get(env,gid)
 e={'id':'event','title':'練習','kind':'club','date':module.now().date().isoformat(),'start':'','end':'','venueId':'','assignees':[]}
 r=patch(env,b,s,{'events':[e]});assert r.status_code==200;s=r.json()
 assert patch(env,b,s,{'settings':{'unitYen':1,'reminders':[]}}).status_code==403

def test_cancel_preserves_attendance_no_delete(env):
 u=account(env);s=populate(env,u,create(env,u));e=s['events'][0];e['cancelled']=True
 r=patch(env,u,s,{'events':[e]});assert r.status_code==200;s=r.json();assert 'e|m1' in s['attendance']
 assert patch(env,u,s,{'events':[]}).status_code==400

def test_orphan_assignment_does_not_become_all(env):
 s={'roles':{}}
 assert module.targeted(s,{'assignees':[],'assignmentNeedsReview':True},'anyone') is False
 assert module.targeted(s,{'assignees':[]},'anyone') is True

def test_gym_relation_preserves_legacy_event_and_training_roundtrip(env):
 u=account(env);s=populate(env,u,create(env,u));legacy=copy.deepcopy(s['events']);training=copy.deepcopy(s['training'])
 r=patch(env,u,s,{'venues':s['venues']+[{'id':'v2','name':'新体育館','courts':2,'memo':'鍵'}],'venueAssignments':{'e':{'venueId':'v2'}}})
 assert r.status_code==200,r.text
 got=get(env,s['group']['id']);assert got['events']==legacy;assert got['training']==training;assert got['venueAssignments']['e']['venueId']=='v2'
 assert patch(env,u,got,{'venueAssignments':{'foreign':{'venueId':'v2'}}}).status_code==400
 assert patch(env,u,got,{'venueAssignments':{'e':{'venueId':'missing'}}}).status_code==400
 assert patch(env,u,got,{'venueAssignments':[]}).status_code==400


def test_executive_single_records_overlap_completion_and_notification(env):
 u=account(env);s=populate(env,u,create(env,u));date=module.add_months(module.now().date(),2).isoformat()
 xs=[{'id':'ex'+str(i),'kind':'executive','title':'幹部予定'+str(i),'date':date,'start':'18:00','end':'19:00','assignees':[],'notifications':['P1M','P7D','P3D','P1D'],'done':False} for i in range(2)]
 r=patch(env,u,s,{'events':s['events']+xs});assert r.status_code==200,r.text
 got=get(env,s['group']['id']);assert len(got['events'])==3;assert got['tasks']==[];assert got['events'][1]['notifications']==xs[0]['notifications']
 with module.connect() as db:
  count=db.execute("SELECT count(*) AS n FROM jobs WHERE group_id=? AND status='pending'",(s['group']['id'],)).fetchone()['n']
 assert count==8
 events=copy.deepcopy(got['events']);events[1]['done']=True
 r=patch(env,u,got,{'events':events});assert r.status_code==200,r.text
 got=get(env,s['group']['id']);assert got['events'][1]['done'];assert got['events'][1]['completedBy']==u['user']['id'];assert got['tasks']==[]


def test_executive_and_gym_permissions(env):
 a=account(env);s=populate(env,a,create(env,a));gid=s['group']['id'];x={'id':'exec','kind':'executive','title':'全員担当','date':module.now().date().isoformat(),'start':'','end':'','assignees':[]}
 s=patch(env,a,s,{'events':s['events']+[x]}).json();token=env.post('/api/groups/'+gid+'/invite',headers=auth(a)).json()['token']
 env.post('/api/logout',headers=auth(a));b=account(env,'b@example.org');assert env.post('/api/join',headers=auth(b),json={'token':token}).status_code==200
 s=get(env,gid);events=copy.deepcopy(s['events']);events[1]['done']=True
 r=patch(env,b,s,{'events':events});assert r.status_code==200,r.text;s=r.json()
 events=copy.deepcopy(s['events']);events[1]['title']='権限外';assert patch(env,b,s,{'events':events}).status_code==403
 events=copy.deepcopy(s['events']);events[0]['done']=True;assert patch(env,b,s,{'events':events}).status_code==403
 assert patch(env,b,s,{'venueAssignments':{'e':{'venueId':'v'}}}).status_code==403

def test_court_assignment_roundtrip_and_validation(env):
 c=env;u=account(c);s=populate(c,u,create(c,u));ids=['m1','m2','m3']
 courts={'ranking':['m0']+ids,'sessions':{'e':{'source':{'participants':ids,'ranking':ids,'courts':4,'venueId':'v'},'level':[ids], 'balanced':[ids]}}}
 original=copy.deepcopy(s)
 response=patch(c,u,s,{'courtAssignments':courts});assert response.status_code==200,response.text
 s=response.json();loaded=get(c,s['group']['id']);assert loaded['courtAssignments']==courts
 assert loaded['training']==original['training'];assert loaded['events']==original['events'];assert loaded['attendance']==original['attendance']
 bad=copy.deepcopy(courts);bad['sessions']['e']['balanced']=[['m1','m1','m3']]
 assert patch(c,u,s,{'courtAssignments':bad}).status_code==400
 bad=copy.deepcopy(courts);bad['sessions']['e']['source']['courts']=2
 assert patch(c,u,s,{'courtAssignments':bad}).status_code==409
 bad=copy.deepcopy(courts);bad['ranking'].append('unknown')
 assert patch(c,u,s,{'courtAssignments':bad}).status_code==400
 # An attendance edit keeps the old snapshot; rebuilding must use the new attendance.
 attendance={**s['attendance'],'e|m1':False};response=patch(c,u,s,{'attendance':attendance});assert response.status_code==200,response.text
 assert response.json()['courtAssignments']==courts

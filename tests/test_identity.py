"""Offline LINE contract tests. Every LINE HTTP response is mocked; no real account is used."""
import sys,json,time,hashlib,base64,copy
from urllib.parse import urlparse,parse_qs
from pathlib import Path
import pytest,httpx
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import app as m
from server import identity as line

@pytest.fixture
def client(tmp_path,monkeypatch):
 monkeypatch.setattr(m,'DB_PATH',tmp_path/'identity.sqlite3');m.AUTH_ATTEMPTS.clear()
 for key in ['LINE_LOGIN_ENABLED','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_REDIRECT_URI','PUBLIC_ORIGIN','COOKIE_SECURE','PASSWORD_LOGIN_ENABLED']:monkeypatch.delenv(key,raising=False)
 with TestClient(m.app,base_url='https://club.test') as c:yield c

def configure(monkeypatch):
 for k,v in {'LINE_LOGIN_ENABLED':'1','LINE_CHANNEL_ID':'12345','LINE_CHANNEL_SECRET':'secret-for-offline-test','LINE_REDIRECT_URI':'https://club.test/api/auth/line/callback','PUBLIC_ORIGIN':'https://club.test','COOKIE_SECURE':'1'}.items():monkeypatch.setenv(k,v)

def account(c,email='a@example.org'):
 res=c.post('/api/register',json={'email':email,'name':'名前A','password':'password-long-test'});assert res.status_code==200;return res.json()
def hdr(u):return {'X-CSRF-Token':u['csrf']}
def group(c,u):return c.post('/api/groups',json={'name':'部活A'},headers=hdr(u)).json()['group']['id']
def begin(c):
 r=c.get('/api/auth/line/start',follow_redirects=False);assert r.status_code==303,r.text
 return {k:v[0] for k,v in parse_qs(urlparse(r.headers['location']).query).items()}
def callback(c,q):return c.get('/api/auth/line/callback',params={'state':q['state'],'code':'offline-code'},follow_redirects=False)

def mock_line(monkeypatch,q,override=None):
 claims={'iss':line.ISSUER,'aud':'12345','sub':'U-offline-person','name':'LINE表示名','nonce':q['nonce'],'exp':time.time()+300,'iat':time.time()}
 claims.update(override or {});calls=[]
 class Fake:
  def __init__(self,**kw):assert kw['follow_redirects'] is False
  async def __aenter__(self):return self
  async def __aexit__(self,*a):pass
  async def post(self,url,data):
   calls.append((url,dict(data)))
   if url.endswith('/token'):
    assert data['client_secret']=='secret-for-offline-test';verifier=data['code_verifier']
    assert base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')==q['code_challenge']
    result={'id_token':'offline-not-a-real-token'}
   else:
    assert url=='https://api.line.me/oauth2/v2.1/verify';assert data['nonce']==q['nonce'];result=claims
   return httpx.Response(200,json=result,request=httpx.Request('POST',url))
 monkeypatch.setattr(line.httpx,'AsyncClient',Fake)
 return calls

def test_line_disabled_without_settings(client):
 assert client.get('/api/config').json()['lineLogin'] is False
 assert client.get('/api/auth/line/start').status_code==503
 with m.connect() as c:assert c.execute('SELECT count(*) FROM login_flows').fetchone()[0]==0

def test_no_secrets_in_public_config(client,monkeypatch):
 configure(monkeypatch);r=client.get('/api/config');assert r.json()['lineLogin']
 assert 'secret-for-offline-test' not in r.text
 monkeypatch.setenv('COOKIE_SECURE','0');assert client.get('/api/config').json()['lineLogin'] is False
 monkeypatch.setenv('COOKIE_SECURE','1');monkeypatch.setenv('LINE_REDIRECT_URI','https://evil.test/callback');assert not line.line_config()['enabled']

def test_state_nonce_pkce_and_secure_cookie(client,monkeypatch):
 configure(monkeypatch);q=begin(client)
 assert q['scope']=='openid profile' and q['code_challenge_method']=='S256'
 assert len(q['state'])>=32 and q['state']!=q['nonce']
 cookie=client.cookies.get(line.FLOW_COOKIE);assert cookie
 with m.connect() as c:
  row=c.execute('SELECT * FROM login_flows').fetchone();assert row['state_hash']==line.digest(q['state']);assert row['cookie_hash']==line.digest(cookie)
  assert cookie not in json.dumps(dict(row));assert q['state'] not in json.dumps(dict(row))
 r=client.get('/api/auth/line/start',follow_redirects=False)
 assert 'HttpOnly' in r.headers['set-cookie'] and 'Secure' in r.headers['set-cookie'] and 'SameSite=lax' in r.headers['set-cookie']

def test_bad_state_and_cookie_cannot_login(client,monkeypatch):
 configure(monkeypatch);q=begin(client);mock_line(monkeypatch,q)
 r=client.get('/api/auth/line/callback?state=bad&code=bad',follow_redirects=False);assert 'invalid_state' in r.headers['location']
 q=begin(client);client.cookies.clear();r=callback(client,q);assert 'invalid_state' in r.headers['location'];assert client.get('/api/session').status_code==401

def test_expired_flow(client,monkeypatch):
 configure(monkeypatch);q=begin(client)
 with m.connect() as c:c.execute('UPDATE login_flows SET expires=0')
 assert 'invalid_state' in callback(client,q).headers['location']

def test_cancellation_consumes_state(client,monkeypatch):
 configure(monkeypatch);q=begin(client)
 r=client.get('/api/auth/line/callback',params={'state':q['state'],'error':'access_denied'},follow_redirects=False)
 assert 'cancelled' in r.headers['location']
 with m.connect() as c:assert c.execute('SELECT count(*) FROM login_flows').fetchone()[0]==0

def test_line_login_creates_session_not_provider_token(client,monkeypatch):
 configure(monkeypatch);q=begin(client);calls=mock_line(monkeypatch,q);r=callback(client,q)
 assert r.status_code==303 and r.headers['location']=='/#groups';assert len(calls)==2
 user=client.get('/api/session').json()['user'];assert user['name']=='LINE表示名' and user['lineLinked'] and user['email']==''
 with m.connect() as c:
  assert c.execute('SELECT count(*) FROM users').fetchone()[0]==1
  assert c.execute('SELECT count(*) FROM identities').fetchone()[0]==1
  assert c.execute('SELECT count(*) FROM login_flows').fetchone()[0]==0
  assert c.execute('SELECT password FROM users').fetchone()[0]=='!line-only'
  dump=json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table)] for table in ['users','identities','sessions','login_flows']});assert 'offline-not-a-real-token' not in dump and 'secret-for-offline-test' not in dump
 assert 'invalid_state' in callback(client,q).headers['location']

def test_same_line_user_is_not_duplicated(client,monkeypatch):
 configure(monkeypatch)
 for _ in range(2):q=begin(client);mock_line(monkeypatch,q);assert callback(client,q).status_code==303
 with m.connect() as c:assert c.execute('SELECT count(*) FROM users').fetchone()[0]==1

@pytest.mark.parametrize('override',[{'aud':'other'},{'nonce':'other'},{'iss':'https://evil.test'},{'exp':1},{'sub':''},{'iat':99999999999}])
def test_invalid_verified_claims_still_rejected(client,monkeypatch,override):
 configure(monkeypatch);q=begin(client);mock_line(monkeypatch,q,override)
 assert 'verification_failed' in callback(client,q).headers['location']
 assert client.get('/api/session').status_code==401
 with m.connect() as c:assert c.execute('SELECT count(*) FROM users').fetchone()[0]==0

def test_line_link_requires_csrf_and_preserves_existing_group(client,monkeypatch):
 configure(monkeypatch);u=account(client);gid=group(client,u)
 assert client.post('/api/auth/line/link').status_code==403
 r=client.post('/api/auth/line/link',headers=hdr(u));assert r.status_code==200
 q={k:v[0] for k,v in parse_qs(urlparse(r.json()['authorizeUrl']).query).items()};mock_line(monkeypatch,q)
 assert '#account' in callback(client,q).headers['location']
 session=client.get('/api/session').json();assert session['user']['id']==u['user']['id'];assert session['groups'][0]['id']==gid
 assert session['user']['lineLinked']

def test_line_link_cannot_take_over_another_identity(client,monkeypatch):
 configure(monkeypatch);q=begin(client);mock_line(monkeypatch,q);callback(client,q)
 first=client.get('/api/session').json()['user']['id']
 u=account(client);r=client.post('/api/auth/line/link',headers=hdr(u));q={k:v[0] for k,v in parse_qs(urlparse(r.json()['authorizeUrl']).query).items()};mock_line(monkeypatch,q)
 assert 'already_linked' in callback(client,q).headers['location']
 with m.connect() as c:assert c.execute('SELECT user_id FROM identities').fetchone()[0]==first

def test_account_name_only(client):
 u=account(client)
 assert client.patch('/api/account',json={'name':'新しい名前'}).status_code==403
 assert client.patch('/api/account',json={'name':'','id':'evil'},headers=hdr(u)).status_code==400
 assert client.patch('/api/account',json={'name':'新しい名前'},headers=hdr(u)).status_code==200
 assert client.get('/api/session').json()['user']['name']=='新しい名前'

def test_invite_preview_no_login_and_no_roster(client):
 u=account(client);gid=group(client,u);invite=client.post('/api/groups/'+gid+'/invite',headers=hdr(u)).json()
 client.cookies.clear();r=client.get('/api/invites/'+invite['token']);assert r.status_code==200
 assert r.json()['groupName']=='部活A';assert 'operators' not in r.text and 'people' not in r.text and r.json()['groupId'] is None
 assert r.headers['referrer-policy']=='no-referrer'

def test_owner_invite_listing_revocation(client):
 u=account(client);gid=group(client,u);inv=client.post('/api/groups/'+gid+'/invite',headers=hdr(u)).json();items=client.get('/api/groups/'+gid+'/invites').json()['invites'];assert items[0]['status']=='active' and inv['token'] not in json.dumps(items)
 iid=items[0]['id'];assert client.post('/api/groups/'+gid+'/invites/'+iid+'/revoke',headers=hdr(u)).status_code==200
 assert client.get('/api/invites/'+inv['token']).status_code==400
 assert client.get('/api/groups/'+gid+'/invites').json()['invites'][0]['status']=='revoked'

def test_existing_member_does_not_consume_invite(client):
 u=account(client);gid=group(client,u);inv=client.post('/api/groups/'+gid+'/invite',headers=hdr(u)).json()
 res=client.post('/api/join',json={'token':inv['token']},headers=hdr(u));assert res.json()['alreadyMember']
 assert client.get('/api/groups/'+gid+'/invites').json()['invites'][0]['status']=='active'
 v=account(client,'b@example.org');res=client.post('/api/join',json={'token':inv['token']},headers=hdr(v));assert res.status_code==200
 assert client.get('/api/groups/'+gid+'/invites').status_code==403
 assert client.post('/api/groups/'+gid+'/invite',headers=hdr(v)).status_code==403


@pytest.mark.parametrize('origin',[
 'https://user:password@club.test', 'https://club.test/path',
 'https://club.test?secret=hidden', 'https://club.test#fragment',
 'http://club.test', 'https://[broken', 'https://club.test:invalid',
])
def test_invalid_origin_is_disabled_without_exception(client,monkeypatch,origin):
 configure(monkeypatch)
 monkeypatch.setenv('PUBLIC_ORIGIN',origin)
 monkeypatch.setenv('LINE_REDIRECT_URI',origin+'/api/auth/line/callback')
 assert not line.line_config()['enabled']
 assert client.get('/api/config').status_code==200


def test_invalid_enabled_config_fails_startup_without_secret(tmp_path,monkeypatch):
 configure(monkeypatch)
 monkeypatch.setattr(m,'DB_PATH',tmp_path/'invalid.sqlite3')
 monkeypatch.setenv('LINE_REDIRECT_URI','https://wrong.test/callback')
 with pytest.raises(RuntimeError) as error:
  with TestClient(m.app):pass
 assert 'LINE_REDIRECT_URI' in str(error.value)
 assert 'secret-for-offline-test' not in str(error.value)
 assert not m.DB_PATH.exists()


def test_flow_rate_limit_survives_cookie_reset_and_ignores_untrusted_header(client,monkeypatch):
 configure(monkeypatch)
 for _ in range(line.FLOW_LIMIT):
  client.cookies.clear()
  assert client.get('/api/auth/line/start',follow_redirects=False).status_code==303
 r=client.get('/api/auth/line/start',headers={'X-Forwarded-For':'other-client'},follow_redirects=False)
 assert r.status_code==429
 with m.connect() as c:
  assert c.execute('SELECT count(*) FROM login_flows').fetchone()[0]==line.FLOW_LIMIT
  assert c.execute('SELECT attempts FROM login_limits').fetchone()[0]==line.FLOW_LIMIT
  c.execute('UPDATE login_limits SET window_start=?',(time.time()-line.FLOW_WINDOW-1,))
 assert client.get('/api/auth/line/start',follow_redirects=False).status_code==303


def test_config_checker_redacts_values(client,monkeypatch,capsys):
 from server.check_config import main
 configure(monkeypatch)
 assert main()==0
 monkeypatch.setenv('PUBLIC_ORIGIN','https://secret-user:secret-password@club.test')
 assert main()==1
 output=capsys.readouterr().out
 assert 'PUBLIC_ORIGIN' in output
 for value in ['secret-user','secret-password','secret-for-offline-test']:assert value not in output

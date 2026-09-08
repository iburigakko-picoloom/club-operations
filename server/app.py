"""Single-server club operations PWA. Run: python -m server.app
SQLite is the authority. Each group update uses optimistic CAS inside BEGIN IMMEDIATE.
No private keys, passwords, or membership permissions are accepted from the frontend state.
"""
from __future__ import annotations
import os, json, sqlite3, hashlib, secrets, hmac, time, calendar, asyncio, importlib.util
from pathlib import Path
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from contextlib import contextmanager, asynccontextmanager
from urllib.parse import urlparse
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

ROOT=Path(__file__).resolve().parents[1]
DB_PATH=Path(os.environ.get('CLUB_DB', str(ROOT/'data'/'club.sqlite3')))
JST=ZoneInfo('Asia/Tokyo')
COOKIE='club_session'
MODULES={'events':'予定','tasks':'やること','notices':'お知らせ','people':'部員','attendance':'出欠','plans':'配車','settlements':'配車','venues':'体育館','venueAssignments':'体育館','courtAssignments':'コート割','training':'練習メニュー','equipment':'備品','settings':'設定','roles':'権限','group':'グループ'}
ARRAYS=['people','events','tasks','notices','plans','venues','equipment','settlements']
AUTH_ATTEMPTS={}

def now(): return datetime.now(JST)
def stamp(): return now().isoformat()
def fail(detail,code=400): raise HTTPException(code,detail)
@contextmanager
def connect():
    if os.environ.get('DATABASE_URL'):
        from server.database import connect as postgres_connect
        with postgres_connect() as c:yield c
        return
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(DB_PATH,timeout=15,isolation_level=None)
    c.row_factory=sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL'); c.execute('PRAGMA foreign_keys=ON')
    try:
        yield c
    except BaseException:
        if c.in_transaction:c.rollback()
        raise
    finally:c.close()

def init_db():
    with connect() as c:
        if os.environ.get('DATABASE_URL'):
            from server.database import check_schema
            check_schema(c)
            return
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS memberships(group_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(group_id,user_id));
        CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,group_id TEXT NOT NULL,expires REAL NOT NULL,used INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,group_id TEXT,user_id TEXT,action TEXT,created_at TEXT,details TEXT);
        CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,group_id TEXT NOT NULL,recipient TEXT NOT NULL,due REAL NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0);
        ''')
        from server.identity import init_identity
        init_identity(c)

def pw_hash(password,salt=None):
    salt=salt or secrets.token_hex(16)
    return salt+':'+hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()

def authenticate(req):
    token=req.cookies.get(COOKIE,'')
    with connect() as c:
        r=c.execute('SELECT u.id,u.email,u.name,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
    if not r: fail('ログインしてください',401)
    return dict(r)

def mutation(req):
    u=authenticate(req)
    if not hmac.compare_digest(req.headers.get('x-csrf-token',''),u['csrf']): fail('画面を再読み込みしてください',403)
    return u

def member(c,gid,uid):
    if not c.execute('SELECT 1 FROM memberships WHERE group_id=? AND user_id=?',(gid,uid)).fetchone(): fail('このグループにはアクセスできません',403)
    g=c.execute('SELECT * FROM groups WHERE id=?',(gid,)).fetchone()
    if not g: fail('グループが見つかりません',404)
    return g

def can(s,uid,key,owner): return uid==owner or uid in s.get('roles',{}).get(MODULES.get(key,key),[])
def targeted(s,n,uid):
    if n.get('assignmentNeedsReview'):return False
    if n.get('targetMode')=='role': return any(uid in s.get('roles',{}).get(r,[]) for r in n.get('targetRoles',[]))
    return not n.get('assignees') or uid in n['assignees']

def view(c,g,u):
    s=json.loads(g['data']);uid=u['id']
    ops=[dict(r) for r in c.execute('SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY u.name',(g['id'],))]
    s['operators']=ops;s['currentUser']=uid;s['ownerId']=g['owner_id'];s['version']=g['version']
    if uid!=g['owner_id']: s['notices']=[n for n in s['notices'] if targeted(s,n,uid)]
    return s

def empty_state(gid,name):
    return {'schema':2,'group':{'id':gid,'name':name},'people':[],'events':[],'tasks':[],'notices':[],'plans':[],'venues':[],'equipment':[],'settlements':[], 'attendance':{},'training':{'categories':[],'menus':[],'sheets':[]},'settings':{'unitYen':None,'reminders':['P7D','P1D']},'roles':{v:[] for v in MODULES.values() if v not in ['設定','権限','グループ']}}

def add_months(d,n):
    y=d.year+(d.month-1+n)//12;m=(d.month-1+n)%12+1
    return d.replace(year=y,month=m,day=min(d.day,calendar.monthrange(y,m)[1]))

def seed_attendance(s):
    start=now().date();end=add_months(start,3)
    for e in s['events']:
        if e.get('kind')!='club' or e.get('cancelled') or not start.isoformat()<=e['date']<=end.isoformat(): continue
        for p in s['people']:
            if p.get('active',True) and p.get('joinedDate','0000')<=e['date']:
                key=e['id']+'|'+p['id']
                if key not in s['attendance']:
                    s['attendance'][key]=p['defaultOverride'] if p.get('defaultOverride') is not None else p['seniority']=='below'

def text(x,limit=2000,required=False):
    if not isinstance(x,str) or len(x)>limit or (required and not x.strip()): fail('文字の入力を確認してください')

def isdate(x):
    try: return date.fromisoformat(x).isoformat()==x
    except (ValueError,TypeError): return False

def number(x,low=0,high=10**8,nullable=False):
    if nullable and x is None:return
    if isinstance(x,bool) or not isinstance(x,int) or not low<=x<=high:fail('数値の入力を確認してください')

def validate(s,operators):
    for key in ARRAYS:
        arr=s.get(key)
        if not isinstance(arr,list) or len(arr)>10000:fail('データ件数を確認してください')
        ids=[]
        for x in arr:
            if not isinstance(x,dict):fail('データ形式が不正です')
            text(x.get('id'),100,True);ids.append(x['id'])
        if len(set(ids))!=len(ids):fail('同じデータが重複しています')
    ps={p['id']:p for p in s['people']};es={e['id']:e for e in s['events']};vs={v['id'] for v in s['venues']}
    for p in ps.values():
        text(p.get('name'),80,True);text(p.get('memo',''),2000);number(p.get('grade'),1,6)
        if p.get('seniority') not in ['above','below'] or p.get('pickup') not in ['university','station']:fail('部員の区分を確認してください')
        if p.get('defaultOverride') not in [None,True,False]:fail('参加設定を確認してください')
    for e in es.values():
        if 'done' in e and not isinstance(e['done'],bool):fail('完了状態を確認してください')
        text(e.get('title'),200,True)
        if e.get('kind') not in ['club','executive'] or not isdate(e.get('date')):fail('予定の日時を確認してください')
        ed=e.get('endDate') or e['date']
        if not isdate(ed) or ed<e['date']:fail('終了日を確認してください')
        for t in ['start','end']:
            if e.get(t):
                try: datetime.strptime(e[t],'%H:%M')
                except (ValueError,TypeError):fail('時刻を確認してください')
        if ed==e['date'] and e.get('start') and e.get('end') and e['end']<e['start']:fail('終了時刻を確認してください')
        if e.get('venueId') and e['venueId'] not in vs:fail('体育館が見つかりません')
        if any(x not in operators for x in e.get('assignees',[])):fail('担当者を確認してください')
        if e.get('courts') is not None:number(e['courts'],1,30)
    if not isinstance(s.get('venueAssignments',{}),dict):fail('体育館割当を確認してください')
    for eid,a in s.get('venueAssignments',{}).items():
        if es.get(eid,{}).get('kind')!='club' or not isinstance(a,dict) or a.get('venueId') not in vs:fail('体育館割当を確認してください')
    if 'courtAssignments' in s:
        data=s['courtAssignments']
        if not isinstance(data,dict) or not isinstance(data.get('sessions'),dict):fail('コート割を確認してください')
        def court_members(ids):
            if not isinstance(ids,list) or any(not isinstance(mid,str) or mid not in ps for mid in ids) or len(set(ids))!=len(ids):fail('コート割の部員を確認してください')
        court_members(data.get('ranking'))
        for eid,session in data['sessions'].items():
            if es.get(eid,{}).get('kind')!='club' or not isinstance(session,dict):fail('コート割の日程を確認してください')
            source=session.get('source')
            if not isinstance(source,dict):fail('コート割の元データを確認してください')
            court_members(source.get('participants'));court_members(source.get('ranking'));number(source.get('courts'),1,30);text(source.get('venueId'),100)
            if sorted(source['participants'])!=sorted(source['ranking']):fail('レベル順の対象を確認してください')
            for key in ['level','balanced']:
                groups=session.get(key)
                if not isinstance(groups,list) or not groups or len(groups)>source['courts'] or any(not isinstance(g,list) or not g for g in groups):fail('コート数を確認してください')
                ids=[mid for g in groups for mid in g];court_members(ids)
                if sorted(ids)!=sorted(source['participants']):fail('コート割の参加者が一致しません')
                if max(map(len,groups))-min(map(len,groups))>1:fail('コートの人数差を確認してください')
    for t in s['tasks']:
        text(t.get('title'),200,True)
        if not isdate(t.get('date')):fail('期限を確認してください')
        try: datetime.strptime(t.get('time',''),'%H:%M')
        except (ValueError,TypeError):fail('期限時刻を確認してください')
        if any(x not in operators for x in t.get('assignees',[])):fail('担当者を確認してください')
        if t.get('relatedEventId') and t['relatedEventId'] not in es:fail('関連予定を確認してください')
    for n in s['notices']:
        text(n.get('title'),200,True);text(n.get('body'),20000,True)
        if any(x not in operators for x in n.get('assignees',[])):fail('対象を確認してください')
    for k,v in s['attendance'].items():
        eid,sep,mid=k.partition('|')
        if eid not in es or mid not in ps or not isinstance(v,bool):fail('出欠の対象を確認してください')
    used_events=set()
    for p in s['plans']:
        e=es.get(p.get('eventId'))
        if not e or e['kind']!='club':fail('配車は部活予定に紐付けてください')
        if e['id'] in used_events:fail('この予定の配車はすでにあります')
        used_events.add(e['id']);number(p.get('unitYen'),0,1000000,True)
        if p.get('status') not in ['draft','registered','cancelled']:fail('配車状態を確認してください')
        if not isinstance(p.get('enabled'),dict) or any(type(p['enabled'].get(leg)) is not bool for leg in ['outbound','return']):fail('往復の対象設定を確認してください')
        if not isinstance(p.get('legs'),dict) or any(not isinstance(p['legs'].get(leg),list) for leg in ['outbound','return']):fail('配車の形式を確認してください')
        if not isinstance(p.get('need'),dict) or any(not isinstance(p['need'].get(leg),dict) for leg in ['outbound','return']):fail('配車対象の形式を確認してください')
        for leg in ['outbound','return']:
            cars=p.get('legs',{}).get(leg,[]);seen=set();cids=set()
            if p.get('legDates',{}).get(leg) and not isdate(p['legDates'][leg]):fail('利用日を確認してください')
            for c in cars:
                if not isinstance(c,dict) or not isinstance(c.get('riders'),list):fail('車の形式を確認してください')
                if c.get('id') in cids:fail('車が重複しています')
                cids.add(c.get('id'))
                if c.get('pickup') not in ['university','station']:fail('配車区分を確認してください')
                riders=c.get('riders',[]);people=([c['driver']] if c.get('driver') else [])+riders
                if len(riders)>3 or len(people)>4:fail('運転者を含め4人までです')
                for mid in people:
                    if mid not in ps or mid in seen:fail('部員が不明または重複しています')
                    seen.add(mid)
            for mid in p.get('need',{}).get(leg,{}):
                if mid not in ps:fail('配車対象が不明です')
        if p.get('linked') and (p['legs']['outbound']!=p['legs']['return'] or p.get('need',{}).get('outbound',{})!=p.get('need',{}).get('return',{})):fail('往復のデータが一致しません')
        for key,a in p.get('adjustments',{}).items():
            leg,sep,mid=key.partition('|')
            if leg not in ['outbound','return'] or mid not in ps:fail('精算調整の対象を確認してください')
            number(a.get('count'),0,999,True);number(a.get('unitYen'),0,1000000,True)
    for v in s['venues']:text(v.get('name'),120,True);number(v.get('courts'),1,30)
    for i in s['equipment']:
        text(i.get('name'),120,True);number(i.get('quantity'));text(i.get('unit'),20,True);number(i.get('threshold'),0,1000000,True)
    for role,ids in s['roles'].items():
        if not isinstance(ids,list) or any(x not in operators for x in ids):fail('担当者がグループ外です')
    number(s['settings'].get('unitYen'),0,1000000,True)
    tr=s.get('training',{});cats={x['id'] for x in tr.get('categories',[])}
    for m in tr.get('menus',[]):
        text(m.get('name'),150,True);number(m.get('seconds'),0,86400)
        if m.get('categoryId') not in cats:fail('種目の分類を確認してください')
    for sh in tr.get('sheets',[]):
        text(sh.get('title'),200,True)
        if sh.get('eventId') and sh['eventId'] not in es:fail('練習予定が見つかりません')
        pats=sh.get('patterns',[4,5])
        if len(pats)>2 or any(type(p) is not int or p not in range(1,6) for p in pats):fail('人数パターンを確認してください')
        for row in sh.get('rows',[]):
            text(row.get('name'),150,True);number(row.get('seconds'),0,86400)
            for v in row.get('sets',{}).values():number(v,0,999)
    text(s['group'].get('name'),100,True)

def validate_registered(s,p):
    if not any(p['enabled'].values()):fail('片道を1つ以上有効にしてください')
    ps={x['id']:x for x in s['people']}
    for leg in ['outbound','return']:
        if not p['enabled'][leg]:continue
        used=set()
        for c in p['legs'][leg]:
            if not c.get('driver'):fail('運転者を指定してください')
            for mid in [c['driver']]+c['riders']:
                m=ps[mid];part=s['attendance'].get(p['eventId']+'|'+mid,m.get('defaultOverride') if m.get('defaultOverride') is not None else m['seniority']=='below')
                if not m.get('active',True) or not part:fail('不参加の人が配車に含まれています')
                used.add(mid)
        for m in ps.values():
            part=s['attendance'].get(p['eventId']+'|'+m['id'],m.get('defaultOverride') if m.get('defaultOverride') is not None else m['seniority']=='below')
            needed=p.get('need',{}).get(leg,{}).get(m['id'],m['seniority']=='below')
            if m.get('active',True) and part and needed and m['id'] not in used:fail('未配車の部員がいます')

async def body(req):
    raw=await req.body()
    if len(raw)>4_000_000:fail('データが大きすぎます',413)
    try:
        v=json.loads(raw)
        if not isinstance(v,dict):raise ValueError()
        return v
    except (ValueError,TypeError):fail('JSONを確認してください')

def public_user(user):
    with connect() as c:
        linked=bool(c.execute("SELECT 1 FROM identities WHERE provider='line' AND user_id=?",(user['id'],)).fetchone())
    return {'id':user['id'],'name':user['name'],'email':'' if user['email'].endswith('@line.invalid') else user['email'],'lineLinked':linked}

def session_response(user):
    token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(24)
    with connect() as c:c.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],csrf,time.time()+86400*14))
    res=JSONResponse({'user':public_user(user),'csrf':csrf})
    res.set_cookie(COOKIE,token,httponly=True,secure=os.environ.get('COOKIE_SECURE')=='1',samesite='lax',max_age=86400*14,path='/')
    return res

def groups_for(c,uid):return [{'id':r['id'],'name':json.loads(r['data'])['group']['name'],'ownerId':r['owner_id']} for r in c.execute('SELECT g.* FROM groups g JOIN memberships m ON m.group_id=g.id WHERE m.user_id=?',(uid,))]

@asynccontextmanager
async def lifespan(app):
    if os.environ.get('RENDER')=='true' and not os.environ.get('DATABASE_URL'):
        raise RuntimeError('DATABASE_URL is required on Render. Local files are not persistent on the free plan.')
    if os.environ.get('LINE_LOGIN_ENABLED')=='1':
        from server.identity import line_config_errors
        errors=line_config_errors()
        if errors:raise RuntimeError('Invalid LINE configuration: '+'; '.join(errors))
    init_db();worker=asyncio.create_task(push_worker()) if os.environ.get('PUSH_WORKER_ENABLED','1')=='1' else None
    yield
    if worker:worker.cancel()

app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None)
@app.middleware('http')
async def security(req,call_next):
    origin=req.headers.get('origin')
    if req.url.path.startswith('/api/') and req.method not in ['GET','HEAD','OPTIONS']:
        allowed={str(req.base_url).rstrip('/'),os.environ.get('PUBLIC_ORIGIN','')}
        if origin and origin not in allowed:return JSONResponse({'detail':'送信元が一致しません'},status_code=403)
    res=await call_next(req)
    res.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    res.headers['X-Content-Type-Options']='nosniff';res.headers['Referrer-Policy']='no-referrer';res.headers['X-Frame-Options']='DENY'
    if req.url.path.startswith('/api/'):res.headers['Cache-Control']='no-store'
    return res

@app.get('/api/config')
def config(req:Request):return {'server':True,'publicOrigin':os.environ.get('PUBLIC_ORIGIN','').rstrip('/') or str(req.base_url).rstrip('/'),'push':os.environ.get('PUSH_WORKER_ENABLED','1')=='1' and bool(importlib.util.find_spec('pywebpush')) and all(os.environ.get(k) for k in ['VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY','VAPID_CONTACT']),'vapidPublic':os.environ.get('VAPID_PUBLIC_KEY',''),'lineLogin':line_config()['enabled'],'passwordLogin':os.environ.get('PASSWORD_LOGIN_ENABLED','1')=='1'}
@app.get('/api/session')
def session(req:Request):
    u=authenticate(req)
    with connect() as c:return {'user':public_user(u),'csrf':u['csrf'],'groups':groups_for(c,u['id'])}
async def login_action(req,register):
    if os.environ.get('PASSWORD_LOGIN_ENABLED','1')!='1':fail('メールでのログインは無効です',403)
    b=await body(req);email=str(b.get('email','')).strip().lower();password=b.get('password','');name=str(b.get('name','')).strip()
    key=(req.client.host if req.client else '')+'|'+email;tries=[t for t in AUTH_ATTEMPTS.get(key,[]) if time.time()-t<300]
    if len(tries)>=12:fail('少し待ってから再試行してください',429)
    AUTH_ATTEMPTS[key]=tries+[time.time()]
    if '@' not in email or len(email)>254 or not isinstance(password,str) or not 10<=len(password)<=256:fail('メールと10文字以上のパスワードを確認してください')
    with connect() as c:
        r=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
        if register:
            text(name,80,True)
            if r:fail('このメールは使用できません')
            u={'id':secrets.token_hex(16),'email':email,'name':name}
            c.execute('INSERT INTO users VALUES(?,?,?,?)',(u['id'],email,name,pw_hash(password)))
        else:
            if not r or r['password'].startswith('!') or not hmac.compare_digest(pw_hash(password,r['password'].split(':')[0]),r['password']):fail('メールまたはパスワードが違います',401)
            u=dict(r)
    AUTH_ATTEMPTS.pop(key,None);return session_response(u)
@app.post('/api/register')
async def register(req:Request):return await login_action(req,True)
@app.post('/api/login')
async def login(req:Request):return await login_action(req,False)
@app.post('/api/logout')
def logout(req:Request):
    mutation(req)
    with connect() as c:c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(req.cookies.get(COOKIE,'').encode()).hexdigest(),))
    r=JSONResponse({'ok':True});r.delete_cookie(COOKIE);return r
@app.post('/api/groups')
async def create_group(req:Request):
    u=mutation(req);b=await body(req);text(b.get('name'),100,True);gid=secrets.token_hex(16);s=empty_state(gid,b['name'].strip())
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute('INSERT INTO groups VALUES(?,?,?,1)',(gid,u['id'],json.dumps(s,ensure_ascii=False)));c.execute('INSERT INTO memberships VALUES(?,?)',(gid,u['id']));c.commit()
        return view(c,member(c,gid,u['id']),u)
@app.get('/api/groups/{gid}/state')
def get_state(gid:str,req:Request):
    u=authenticate(req)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE');g=member(c,gid,u['id']);s=json.loads(g['data']);old=json.dumps(s,sort_keys=True);seed_attendance(s)
        if json.dumps(s,sort_keys=True)!=old:
            c.execute('UPDATE groups SET data=?,version=version+1 WHERE id=?',(json.dumps(s,ensure_ascii=False),gid));g=member(c,gid,u['id'])
        result=view(c,g,u);c.commit();return result
@app.patch('/api/groups/{gid}/state')
async def update_state(gid:str,req:Request):
    u=mutation(req);b=await body(req);changes=b.get('changes',{})
    if not isinstance(changes,dict) or set(changes)-set(MODULES):fail('変更できない項目です')
    with connect() as c:
        c.execute('BEGIN IMMEDIATE');g=member(c,gid,u['id']);old=json.loads(g['data']);s=json.loads(g['data'])
        if b.get('version')!=g['version']:fail('別の担当者が更新しました。再読み込みしてください',409)
        for key,value in changes.items():
            if key in ['settings','roles','group']:
                if u['id']!=g['owner_id']:fail('オーナーだけが変更できます',403)
                if key=='group' and value.get('id')!=gid:fail('グループが一致しません',403)
            elif not can(old,u['id'],key,g['owner_id']):
                # A task assignee may change only completion metadata, not assignment/title.
                if key not in ['tasks','events']:fail('編集権限がありません',403)
                a={t['id']:t for t in old[key]};new={t['id']:t for t in value}
                if a.keys()!=new.keys():fail('やることの編集権限がありません',403)
                for tid,t in new.items():
                    if t==a[tid]:continue
                    if key=='events' and a[tid].get('kind')!='executive':fail('編集権限がありません',403)
                    allowed=['done','completedAt','completedBy']
                    if a[tid].get('assignmentNeedsReview'):fail('担当者の再設定が必要です',403)
                    if a[tid].get('assignees') and u['id'] not in a[tid]['assignees']:fail('担当者ではありません',403)
                    if {k:v for k,v in a[tid].items() if k not in allowed}!={k:v for k,v in t.items() if k not in allowed}:fail('完了操作だけ可能です',403)
            if key=='notices' and u['id']!=g['owner_id']:
                ids={n['id'] for n in value}
                hidden=[n for n in old['notices'] if not targeted(old,n,u['id'])]
                if any(n['id'] in ids for n in hidden):fail('非公開のお知らせは編集できません',403)
                value=value+hidden
            s[key]=value
        operators={r['user_id'] for r in c.execute('SELECT user_id FROM memberships WHERE group_id=?',(gid,))}
        seed_attendance(s);validate(s,operators)
        if 'courtAssignments' in changes:
            for eid,session in s['courtAssignments']['sessions'].items():
                if session==old.get('courtAssignments',{}).get('sessions',{}).get(eid):continue
                e=next(e for e in s['events'] if e['id']==eid)
                vid=s.get('venueAssignments',{}).get(eid,{}).get('venueId',e.get('venueId'))
                gym=next((v for v in s['venues'] if v['id']==vid),None)
                ids=sorted(p['id'] for p in s['people'] if p.get('active') and s['attendance'].get(eid+'|'+p['id'],p.get('defaultOverride') if p.get('defaultOverride') is not None else p['seniority']=='below'))
                source=session['source']
                if e.get('cancelled') or not gym or gym['id']!=source['venueId'] or gym['courts']!=source['courts'] or ids!=sorted(source['participants']) or [mid for mid in s['courtAssignments']['ranking'] if mid in ids]!=source['ranking']:fail('出欠・体育館・レベル順を再確認してください',409)
        # Membership / group identifiers and finalized statements never come from a client.
        if s['group']['id']!=gid:fail('グループが一致しません',403)
        # Finalized snapshots cannot be edited in place; only locked true -> false.
        snapshots={x['id']:x for x in old['settlements']}
        supplied={x['id']:x for x in s['settlements']}
        if snapshots.keys()-supplied.keys():fail('精算履歴は削除できません')
        for sid,prev in snapshots.items():
            cur=supplied[sid]
            if {k:v for k,v in prev.items() if k!='locked'}!={k:v for k,v in cur.items() if k!='locked'}:fail('精算履歴は直接変更できません')
            if not prev.get('locked') and cur.get('locked'):fail('再確定は新しい履歴として保存してください')
        old_event_ids={x['id'] for x in old['events']}
        if old_event_ids-{x['id'] for x in s['events']}:fail('予定は削除ではなく中止してください')
        old_people_ids={x['id'] for x in old['people']}
        if old_people_ids-{x['id'] for x in s['people']}:fail('部員は削除ではなく在籍状態を変更してください')
        prior_plans={x['id']:x for x in old['plans']}
        locked=set()
        for snap in old['settlements']:
            if snap.get('locked'):locked.update(snap.get('planIds',[]))
        if (locked & set(prior_plans))-{p['id'] for p in s['plans']}:fail('精算確定済みの配車は削除できません。先に月の確定を解除してください',409)
        for p in s['plans']:
            prior=prior_plans.get(p['id'])
            if p['id'] in locked and p!=prior:fail('精算確定済みです。先に月の確定を解除してください',409)
            if p!=prior and p['status']=='registered':validate_registered(s,p)
        old_events={x['id']:x for x in old['events']}
        for p in old['plans']:
            if p['id'] in locked:
                eid=p['eventId']
                if next((x for x in s['events'] if x['id']==eid),None)!=old_events.get(eid):fail('精算確定済みの予定は変更できません',409)
        for key in ['events','tasks','notices','equipment']:
            if key not in changes:continue
            prev={x['id']:x for x in old[key]}
            for x in s[key]:
                if x==prev.get(x['id']):continue
                x['updatedAt']=stamp();x['updatedBy']=u['id']
                if key=='notices':
                    original=prev.get(x['id']);x['author']=original.get('author') if original else u['name'];x['authorId']=original.get('authorId') if original else u['id'];x['date']=original.get('date') if original else now().date().isoformat()
                if key=='tasks' or (key=='events' and x.get('kind')=='executive'):x['completedBy']=u['id'] if x.get('done') else None;x['completedAt']=stamp() if x.get('done') else None
        c.execute('UPDATE groups SET data=?,version=version+1 WHERE id=?',(json.dumps(s,ensure_ascii=False),gid))
        c.execute('INSERT INTO audit(group_id,user_id,action,created_at,details) VALUES(?,?,?,?,?)',(gid,u['id'],'update',stamp(),json.dumps(list(changes))))
        schedule_jobs(c,gid,s,old,operators,g['owner_id']);result=view(c,member(c,gid,u['id']),u);c.commit();return result
@app.post('/api/groups/{gid}/invite')
async def invite(gid:str,req:Request):
    u=mutation(req);b=await body(req) if await req.body() else {};max_uses=b.get('maxUses',1)
    if type(max_uses) is not int or not 1<=max_uses<=100:fail('招待人数は1〜100人で指定してください')
    with connect() as c:
        g=member(c,gid,u['id'])
        if g['owner_id']!=u['id']:fail('オーナーだけが招待できます',403)
        token=secrets.token_urlsafe(24);expires=time.time()+86400*7;c.execute('INSERT INTO invites(token,group_id,expires,used,created_at,created_by,max_uses) VALUES(?,?,?,0,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),gid,expires,time.time(),u['id'],max_uses))
    return {'token':token,'expiresInDays':7,'expiresAt':expires,'maxUses':max_uses}
@app.get('/api/invites/{token}')
def invite_info(token:str,req:Request):
    digest=hashlib.sha256(token.encode()).hexdigest()
    with connect() as c:
        r=c.execute('SELECT g.data,g.id FROM invites i JOIN groups g ON g.id=i.group_id WHERE i.token=? AND i.used=0 AND i.expires>?',(digest,time.time())).fetchone()
        if not r:fail('招待が無効または期限切れです')
        try:u=authenticate(req)
        except HTTPException:u=None
        is_member=bool(u and c.execute('SELECT 1 FROM memberships WHERE group_id=? AND user_id=?',(r['id'],u['id'])).fetchone())
        return {'groupName':json.loads(r['data'])['group']['name'],'isMember':is_member,'groupId':r['id'] if is_member else None,'access':'運営メンバー（閲覧）'}
@app.post('/api/join')
async def join(req:Request):
    u=mutation(req);b=await body(req);token=hashlib.sha256(str(b.get('token','')).encode()).hexdigest()
    with connect() as c:
        c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT * FROM invites WHERE token=? AND used=0 AND expires>?',(token,time.time())).fetchone()
        if not r:fail('招待が無効または期限切れです')
        if c.execute('SELECT 1 FROM memberships WHERE group_id=? AND user_id=?',(r['group_id'],u['id'])).fetchone():
            c.commit();return {'groupId':r['group_id'],'alreadyMember':True}
        c.execute('INSERT OR IGNORE INTO memberships VALUES(?,?)',(r['group_id'],u['id']));c.execute('UPDATE invites SET use_count=use_count+1,used=CASE WHEN use_count+1>=max_uses THEN 1 ELSE 0 END WHERE token=?',(token,));c.execute('UPDATE groups SET version=version+1 WHERE id=?',(r['group_id'],));c.commit();return {'groupId':r['group_id']}
@app.post('/api/groups/{gid}/membership')
async def membership(gid:str,req:Request):
    u=mutation(req);b=await body(req);target=b.get('userId');act=b.get('action')
    with connect() as c:
        c.execute('BEGIN IMMEDIATE');g=member(c,gid,u['id']);member(c,gid,target)
        if act=='transfer':
            if g['owner_id']!=u['id']:fail('オーナーだけが移譲できます',403)
            c.execute('UPDATE groups SET owner_id=?,version=version+1 WHERE id=?',(target,gid))
        elif act=='remove':
            if u['id']!=g['owner_id'] and target!=u['id']:fail('権限がありません',403)
            if target==g['owner_id']:fail('オーナーを移譲してから退出してください')
            s=json.loads(g['data']);c.execute('DELETE FROM memberships WHERE group_id=? AND user_id=?',(gid,target))
            for ids in s['roles'].values():
                if target in ids:ids.remove(target)
            # Keep assigned names in history; orphan assignments are not silently "all".
            for kind in ['events','tasks','notices']:
                for item in s[kind]:
                    if target in item.get('assignees',[]):item['formerAssignees']=(item.get('formerAssignees',[])+[target]);item['assignees']=[i for i in item['assignees'] if i!=target];item['assignmentNeedsReview']=not item['assignees']
            c.execute('UPDATE groups SET data=?,version=version+1 WHERE id=?',(json.dumps(s,ensure_ascii=False),gid));c.execute("UPDATE jobs SET status='cancelled' WHERE group_id=? AND recipient=? AND status='pending'",(gid,target))
        else:fail('操作が不明です')
        c.commit()
    return {'ok':True}

# Reminder schedule is server-side, not a browser timer. Pending jobs are replaced on edit.
def offset_due(dt,offset):
    if offset=='P1M':return add_months(dt,-1)
    return dt-timedelta(days={'P7D':7,'P3D':3,'P1D':1}[offset])
def schedule_jobs(c,gid,s,old,operators,owner):
    visible_notices={n['id']:n for n in s['notices']}
    for job in c.execute("SELECT * FROM jobs WHERE group_id=? AND status='pending'",(gid,)).fetchall():
        payload=json.loads(job['payload'])
        n=visible_notices.get(payload.get('resourceId'))
        if payload.get('resourceType')!='notice' or not n or not targeted(s,n,job['recipient']):
            c.execute("UPDATE jobs SET status='cancelled' WHERE id=?",(job['id'],))
    def add(typ,obj,recipients,dt,route,offsets):
        if obj.get('assignmentNeedsReview'):return
        for offset in offsets:
            if offset not in ['P1M','P7D','P3D','P1D']:continue
            due=offset_due(dt,offset)
            if due.timestamp()<=time.time():continue
            for uid in set(recipients)&operators:
                identity=f'{gid}|{typ}|{obj["id"]}|{uid}|{offset}|{due.isoformat()}|{obj.get("title","")}'
                jid=hashlib.sha256(identity.encode()).hexdigest();payload={'title':obj.get('title','配車を確認'),'body':dt.strftime('%m/%d %H:%M'),'url':f'/#group-open/{gid}/{route}','groupId':gid,'resourceId':obj['id'],'resourceType':typ}
                # Previously delivered identical jobs stay delivered; cancelled future jobs can reactivate.
                c.execute("INSERT INTO jobs(id,group_id,recipient,due,payload,status,attempts) VALUES(?,?,?,?,?,'pending',0) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN jobs.status='cancelled' THEN 'pending' ELSE jobs.status END",(jid,gid,uid,due.timestamp(),json.dumps(payload,ensure_ascii=False)))
    for typ,items in [('event',s['events']),('task',s['tasks'])]:
        for x in items:
            if x.get('cancelled') or x.get('done') or x.get('deleted'):continue
            dt=datetime.fromisoformat(x['date']+'T'+(x.get('time') or x.get('start') or '09:00')).replace(tzinfo=JST)
            targets=x.get('assignees') or operators
            add(typ,x,targets,dt,f'{typ}/{x["id"]}',x.get('notifications',[]))
    es={x['id']:x for x in s['events']}
    for p in s['plans']:
        e=es[p['eventId']]
        if e.get('cancelled') or p.get('status')=='cancelled':continue
        dt=datetime.fromisoformat(e['date']+'T'+(e.get('start') or '09:00')).replace(tzinfo=JST)
        add('car',dict(p,title='配車を確認'),s['roles'].get('配車',[])+[owner],dt,'car/'+p['id'],p.get('notifications',s['settings'].get('reminders',[])))
    old_notices={x['id']:x for x in old.get('notices',[])}
    for n in s['notices']:
        # notifyVersion is explicit user action; unrelated data edits do not resend.
        prev=old_notices.get(n['id'])
        if not n.get('notify') or (prev and n.get('notifyVersion')==prev.get('notifyVersion')):continue
        for uid in operators:
            if not targeted(s,n,uid):continue
            jid=hashlib.sha256(f'{gid}|notice|{n["id"]}|{n.get("notifyVersion",1)}|{uid}'.encode()).hexdigest()
            payload={'title':n['title'],'body':s['group']['name'],'url':f'/#group-open/{gid}/notice/{n["id"]}','groupId':gid,'resourceId':n['id'],'resourceType':'notice'}
            c.execute("INSERT OR IGNORE INTO jobs(id,group_id,recipient,due,payload,status,attempts) VALUES(?,?,?,?,?,'pending',0)",(jid,gid,uid,time.time(),json.dumps(payload,ensure_ascii=False)))
@app.post('/api/push/subscription')
async def push_subscription(req:Request):
    u=mutation(req);b=await body(req);sub=b.get('subscription',{});url=urlparse(str(sub.get('endpoint','')))
    host=url.hostname or ''
    if url.scheme!='https' or url.username or url.port not in [None,443] or not (host=='fcm.googleapis.com' or host.endswith('.push.apple.com') or host.endswith('.notify.windows.com') or host.endswith('.push.services.mozilla.com')):fail('通知サービスのURLが不正です')
    text(sub.get('keys',{}).get('p256dh'),500,True);text(sub.get('keys',{}).get('auth'),200,True)
    sid=hashlib.sha256(sub['endpoint'].encode()).hexdigest()
    with connect() as c:c.execute('INSERT INTO subscriptions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,data=excluded.data',(sid,u['id'],json.dumps(sub)))
    return {'ok':True}
async def push_worker():
    while True:
        await asyncio.sleep(15)
        if not importlib.util.find_spec('pywebpush') or not all(os.environ.get(k) for k in ['VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY','VAPID_CONTACT']):continue
        try:await asyncio.to_thread(dispatch_push)
        except Exception as exc:print('push worker:',type(exc).__name__,flush=True)
def dispatch_push():
    from pywebpush import webpush,WebPushException
    with connect() as c:
        rows=c.execute("SELECT * FROM jobs WHERE status='pending' AND due<=? AND attempts<3 LIMIT 30",(time.time(),)).fetchall()
        for job in rows:
            if not c.execute('SELECT 1 FROM memberships WHERE group_id=? AND user_id=?',(job['group_id'],job['recipient'])).fetchone():
                c.execute("UPDATE jobs SET status='cancelled' WHERE id=?",(job['id'],));continue
            # Avoid replaying stale reminders after a long server outage.
            if job['due']<time.time()-86400:c.execute("UPDATE jobs SET status='expired' WHERE id=?",(job['id'],));continue
            subs=c.execute('SELECT * FROM subscriptions WHERE user_id=?',(job['recipient'],)).fetchall();sent=False;failed=False
            for sub in subs:
                try:
                    webpush(json.loads(sub['data']),data=job['payload'],vapid_private_key=os.environ['VAPID_PRIVATE_KEY'],vapid_claims={'sub':os.environ.get('VAPID_CONTACT','mailto:admin@example.invalid')},ttl=3600,timeout=10);sent=True
                except WebPushException as exc:
                    if exc.response is not None and exc.response.status_code in [404,410]:c.execute('DELETE FROM subscriptions WHERE id=?',(sub['id'],))
                    else:failed=True
            status='sent' if sent else 'no_subscription' if not subs else 'pending' if failed and job['attempts']<2 else 'failed' if failed else 'expired'
            if status=='pending':
                c.execute('UPDATE jobs SET status=?,attempts=attempts+1,due=? WHERE id=?',(status,time.time()+60*(2**job['attempts']),job['id']))
            else:c.execute('UPDATE jobs SET status=?,attempts=attempts+1 WHERE id=?',(status,job['id']))
@app.get('/')
def index():return FileResponse(ROOT/'web'/'index.html')
import sys
from server.identity import install, line_config
install(sys.modules[__name__])
app.mount('/',StaticFiles(directory=ROOT/'web'),name='web')
if __name__=='__main__':
    import uvicorn
    uvicorn.run('server.app:app',host=os.environ.get('HOST','127.0.0.1'),port=int(os.environ.get('PORT','8765')),access_log=False)

"""LINE Login foundation and account/invitation management.
Disabled without explicit deployment configuration. No provider tokens are persisted.
Network transport is isolated for offline contract tests; never trust client profile data.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, time
from urllib.parse import urlencode, urlparse
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse

FLOW_COOKIE = 'club_line_flow'
ISSUER = 'https://access.line.me'
FLOW_WINDOW = 600
FLOW_LIMIT = 30

def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

def init_identity(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS identities(
      provider TEXT NOT NULL, channel TEXT NOT NULL, subject TEXT NOT NULL,
      user_id TEXT NOT NULL, created_at REAL NOT NULL,
      PRIMARY KEY(provider,channel,subject), UNIQUE(provider,channel,user_id));
    CREATE TABLE IF NOT EXISTS login_flows(
      state_hash TEXT PRIMARY KEY, cookie_hash TEXT NOT NULL, nonce TEXT NOT NULL,
      verifier TEXT NOT NULL, link_user_id TEXT, expires REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(
      client_hash TEXT PRIMARY KEY, window_start REAL NOT NULL, attempts INTEGER NOT NULL);
    ''')
    fields={r['name'] for r in c.execute('PRAGMA table_info(invites)')}
    for name,definition in [('created_at','REAL NOT NULL DEFAULT 0'),('created_by','TEXT')]:
        if name not in fields:c.execute(f'ALTER TABLE invites ADD COLUMN {name} {definition}')

def line_config_errors():
    """Report field names only, never configured values or credentials."""
    origin=os.environ.get('PUBLIC_ORIGIN','').rstrip('/')
    errors=[]
    try:
        parsed=urlparse(origin)
        valid_origin=(parsed.scheme=='https' and bool(parsed.hostname)
                      and not parsed.username and not parsed.password
                      and parsed.path=='' and not parsed.query and not parsed.fragment
                      and parsed.port in (None,443))
    except ValueError:
        valid_origin=False
    if not valid_origin:errors.append('PUBLIC_ORIGIN must be an HTTPS origin (port 443) without credentials, path, query or fragment')
    for key in ('LINE_CHANNEL_ID','LINE_CHANNEL_SECRET'):
        if not os.environ.get(key,'').strip():errors.append(key+' is required')
    if os.environ.get('LINE_REDIRECT_URI','').strip()!=origin+'/api/auth/line/callback':
        errors.append('LINE_REDIRECT_URI must equal PUBLIC_ORIGIN + /api/auth/line/callback')
    if os.environ.get('COOKIE_SECURE')!='1':errors.append('COOKIE_SECURE must be 1')
    return errors


def line_config():
    channel=os.environ.get('LINE_CHANNEL_ID','').strip()
    secret=os.environ.get('LINE_CHANNEL_SECRET','').strip()
    callback=os.environ.get('LINE_REDIRECT_URI','').strip()
    valid=os.environ.get('LINE_LOGIN_ENABLED')=='1' and not line_config_errors()
    return {'enabled':bool(valid),'channel':channel,'secret':secret,'callback':callback}

async def exchange_line(code, verifier, nonce, cfg):
    """Only called after state/cookie binding. Fixed HTTPS endpoints; no client URLs."""
    async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
        token=await client.post('https://api.line.me/oauth2/v2.1/token',data={
          'grant_type':'authorization_code','code':code,'redirect_uri':cfg['callback'],
          'client_id':cfg['channel'],'client_secret':cfg['secret'],'code_verifier':verifier})
        token.raise_for_status()
        raw=token.json().get('id_token')
        if not isinstance(raw,str) or not raw:raise ValueError('Missing ID token')
        verification=await client.post('https://api.line.me/oauth2/v2.1/verify',data={
          'id_token':raw,'client_id':cfg['channel'],'nonce':nonce})
        verification.raise_for_status()
        claims=verification.json()
    # Never send an unverified client subject/name to account creation.
    if (claims.get('iss')!=ISSUER or str(claims.get('aud'))!=cfg['channel']
        or not hmac.compare_digest(str(claims.get('nonce','')),nonce)
        or not isinstance(claims.get('sub'),str) or not 1<=len(claims['sub'])<=255
        or not isinstance(claims.get('exp'),(int,float)) or claims['exp']<=time.time()
        or not isinstance(claims.get('iat'),(int,float)) or claims['iat']>time.time()+60):
        raise ValueError('Invalid ID token claims')
    return claims

def install(m):
    app=m.app

    def begin(req, link_user=None):
        cfg=line_config()
        if not cfg['enabled']:m.fail('LINEログインは設定前です。管理者による接続設定が必要です。',503)
        state=secrets.token_urlsafe(32);cookie=secrets.token_urlsafe(32)
        nonce=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
        with m.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            current=time.time()
            # req.client is set by the server/trusted proxy, not an arbitrary header.
            client_hash=digest(req.client.host if req.client else 'unknown')
            c.execute('DELETE FROM login_limits WHERE window_start<=?',(current-FLOW_WINDOW,))
            limit=c.execute('SELECT attempts FROM login_limits WHERE client_hash=?',(client_hash,)).fetchone()
            if limit and limit['attempts']>=FLOW_LIMIT:
                m.fail('LINEログインの開始回数が多すぎます。10分ほど待ってから再試行してください。',429)
            c.execute('INSERT INTO login_limits VALUES(?,?,1) ON CONFLICT(client_hash) DO UPDATE SET attempts=attempts+1',(client_hash,current))
            c.execute('DELETE FROM login_flows WHERE expires<?',(current,))
            # Supersede an earlier flow on this browser. This is not a global rate limit.
            old=req.cookies.get(FLOW_COOKIE)
            if old:c.execute('DELETE FROM login_flows WHERE cookie_hash=?',(digest(old),))
            c.execute('INSERT INTO login_flows VALUES(?,?,?,?,?,?)',
              (digest(state),digest(cookie),nonce,verifier,link_user,time.time()+600))
            c.commit()
        query=urlencode({'response_type':'code','client_id':cfg['channel'],
          'redirect_uri':cfg['callback'],'state':state,'scope':'openid profile','nonce':nonce,
          'code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='),
          'code_challenge_method':'S256'})
        url=ISSUER+'/oauth2/v2.1/authorize?'+query
        response=JSONResponse({'authorizeUrl':url}) if link_user else RedirectResponse(url,303)
        response.set_cookie(FLOW_COOKIE,cookie,httponly=True,secure=True,samesite='lax',max_age=600,path='/api/auth/line')
        return response

    @app.get('/api/auth/line/start')
    def line_start(req:Request):return begin(req)

    @app.post('/api/auth/line/link')
    def line_link(req:Request):
        u=m.mutation(req)
        with m.connect() as c:
            if c.execute("SELECT 1 FROM identities WHERE provider='line' AND user_id=?",(u['id'],)).fetchone():
                m.fail('すでにLINE連携済みです',409)
        return begin(req,u['id'])

    def callback_error(code):
        response=RedirectResponse('/?login_error='+code+'#welcome',303)
        response.delete_cookie(FLOW_COOKIE,path='/api/auth/line',secure=True,httponly=True,samesite='lax')
        response.headers['Referrer-Policy']='no-referrer'
        return response

    @app.get('/api/auth/line/callback')
    async def line_callback(req:Request):
        cfg=line_config()
        if not cfg['enabled']:return callback_error('not_configured')
        state=req.query_params.get('state','');cookie=req.cookies.get(FLOW_COOKIE,'')
        if not state or not cookie:return callback_error('invalid_state')
        with m.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT * FROM login_flows WHERE state_hash=?',(digest(state),)).fetchone()
            if not row or row['expires']<=time.time() or not hmac.compare_digest(row['cookie_hash'],digest(cookie)):
                c.rollback();return callback_error('invalid_state')
            flow=dict(row)
            c.execute('DELETE FROM login_flows WHERE state_hash=?',(digest(state),));c.commit()
        # State is single-use even on cancellation or transport error.
        if req.query_params.get('error'):return callback_error('cancelled')
        code=req.query_params.get('code','')
        if not code or len(code)>4096:return callback_error('invalid_code')
        if flow['link_user_id']:
            try:u=m.authenticate(req)
            except Exception:return callback_error('session_expired')
            if u['id']!=flow['link_user_id']:return callback_error('session_expired')
        try:claims=await exchange_line(code,flow['verifier'],flow['nonce'],cfg)
        except (httpx.HTTPError,ValueError,KeyError,TypeError):return callback_error('verification_failed')
        with m.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            existing=c.execute("SELECT user_id FROM identities WHERE provider='line' AND channel=? AND subject=?",(cfg['channel'],claims['sub'])).fetchone()
            uid=flow['link_user_id']
            if uid:
                if existing and existing['user_id']!=uid:c.rollback();return callback_error('already_linked')
                other=c.execute("SELECT subject FROM identities WHERE provider='line' AND channel=? AND user_id=?",(cfg['channel'],uid)).fetchone()
                if other and other['subject']!=claims['sub']:c.rollback();return callback_error('already_linked')
            elif existing:uid=existing['user_id']
            else:
                uid=secrets.token_hex(16)
                # Existing legacy schema requires unique non-null email/password. This is not a real email.
                email='line-'+digest(cfg['channel']+'|'+claims['sub'])+'@line.invalid'
                name=str(claims.get('name') or '運営メンバー').strip()[:80] or '運営メンバー'
                c.execute('INSERT INTO users VALUES(?,?,?,?)',(uid,email,name,'!line-only'))
            c.execute('INSERT OR IGNORE INTO identities VALUES(?,?,?,?,?)',('line',cfg['channel'],claims['sub'],uid,time.time()))
            user=dict(c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone());c.commit()
        # Issue our own session. LINE credentials are never browser storage/session identifiers.
        response=m.session_response(user)
        response.status_code=303
        response.headers['location']='/?line_connected=1#account' if flow['link_user_id'] else '/#groups'
        response.body=b'';response.headers['content-length']='0'
        response.delete_cookie(FLOW_COOKIE,path='/api/auth/line',secure=True,httponly=True,samesite='lax')
        response.headers['Referrer-Policy']='no-referrer'
        return response

    @app.patch('/api/account')
    async def update_account(req:Request):
        u=m.mutation(req);data=await m.body(req)
        if set(data)!={'name'}:m.fail('変更できない項目です')
        name=data.get('name');m.text(name,80,True)
        with m.connect() as c:c.execute('UPDATE users SET name=? WHERE id=?',(name.strip(),u['id']))
        return {'ok':True}

    @app.get('/api/groups/{gid}/invites')
    def invite_list(gid:str,req:Request):
        u=m.authenticate(req)
        with m.connect() as c:
            group=m.member(c,gid,u['id'])
            if group['owner_id']!=u['id']:m.fail('オーナーだけが確認できます',403)
            return {'invites':[{'id':r['token'],'createdAt':r['created_at'],'expiresAt':r['expires'],
             'status':'used' if r['used']==1 else 'revoked' if r['used']==2 else 'expired' if r['expires']<=time.time() else 'active'}
             for r in c.execute('SELECT * FROM invites WHERE group_id=? ORDER BY created_at DESC LIMIT 100',(gid,))]}

    @app.post('/api/groups/{gid}/invites/{iid}/revoke')
    def revoke_invite(gid:str,iid:str,req:Request):
        u=m.mutation(req)
        with m.connect() as c:
            c.execute('BEGIN IMMEDIATE');g=m.member(c,gid,u['id'])
            if g['owner_id']!=u['id']:m.fail('オーナーだけが無効にできます',403)
            row=c.execute('SELECT * FROM invites WHERE group_id=? AND token=?',(gid,iid)).fetchone()
            if not row:m.fail('招待が見つかりません',404)
            if row['used']==0:c.execute('UPDATE invites SET used=2 WHERE token=?',(iid,))
            c.commit()
        return {'ok':True}

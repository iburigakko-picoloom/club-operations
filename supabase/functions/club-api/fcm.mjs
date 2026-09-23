import {createSign} from 'node:crypto';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/firebase.messaging';
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

export function createFcmSender(serviceAccountJson,{fetcher=fetch,now=()=>Date.now()}={}){
 let account;try{account=JSON.parse(serviceAccountJson);}catch{throw Error('FCM service account JSON is invalid');}
 if(!/^[a-z][a-z0-9-]{4,40}$/.test(account.project_id||'')||
    !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(account.client_email||'')||
    !String(account.private_key||'').includes('BEGIN PRIVATE KEY'))throw Error('FCM service account is incomplete');
 let cached='',expires=0;
 async function accessToken(){
  if(cached&&now()<expires)return cached;
  const issued=Math.floor(now()/1000);
  const header=encoded({alg:'RS256',typ:'JWT'});
  const claims=encoded({iss:account.client_email,scope:SCOPE,aud:TOKEN_URL,iat:issued,exp:issued+3600});
  const message=header+'.'+claims;
  const signer=createSign('RSA-SHA256');signer.update(message);signer.end();
  const assertion=message+'.'+signer.sign(account.private_key).toString('base64url');
  const response=await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000)});
  const body=await response.json();
  if(!response.ok||typeof body.access_token!=='string'||!body.access_token)throw Error('FCM authorization failed');
  cached=body.access_token;expires=now()+Math.max(0,Number(body.expires_in||3600)-90)*1000;
  return cached;
 }
 return async(sub,payload)=>{
  const p=JSON.parse(payload);
  const response=await fetcher(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{
   method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},
   body:JSON.stringify({message:{token:sub.token,notification:{title:p.title||'部活運営',body:p.body||''},data:{url:p.url||'',resourceType:p.resourceType||'',resourceId:p.resourceId||''},android:{priority:'HIGH',notification:{channel_id:'club_reminders'}}}}),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){let body;try{body=await response.json();}catch{}const unregistered=body?.error?.details?.some(x=>x.errorCode==='UNREGISTERED')||body?.error?.status==='UNREGISTERED';throw Object.assign(new Error('FCM delivery failed'),{statusCode:unregistered?410:503});}
 };
}

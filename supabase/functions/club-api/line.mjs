import {safeEqual} from './api.mjs';
export async function exchangeLine(code,flow,cfg,callback,transport=fetch){
 const post=async(url,fields)=>{const response=await transport(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('LINE verification failed');return response.json();};
 const token=await post('https://api.line.me/oauth2/v2.1/token',{grant_type:'authorization_code',code,redirect_uri:callback,client_id:cfg.channel,client_secret:cfg.secret,code_verifier:flow.verifier});
 if(typeof token.id_token!=='string'||!token.id_token)throw Error('Missing token');
 const claims=await post('https://api.line.me/oauth2/v2.1/verify',{id_token:token.id_token,client_id:cfg.channel,nonce:flow.nonce});
 if(claims.iss!=='https://access.line.me'||String(claims.aud)!==cfg.channel||!safeEqual(claims.nonce,flow.nonce)||typeof claims.sub!=='string'||claims.sub.length<1||claims.sub.length>255||typeof claims.exp!=='number'||claims.exp<=Date.now()/1000||typeof claims.iat!=='number'||claims.iat>Date.now()/1000+60)throw Error('Invalid claims');
 return claims;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createFcmSender} from '../supabase/functions/club-api/fcm.mjs';

test('FCM sender signs an OAuth assertion and sends only to the configured project',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const calls=[];
 const send=createFcmSender(JSON.stringify({project_id:'club-project',client_email:'sender@club-project.iam.gserviceaccount.com',private_key:privateKey}),{now:()=>1_700_000_000_000,fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({access_token:'access',expires_in:3600})};}});
 await send({provider:'fcm',token:'device-token'},JSON.stringify({title:'確認',body:'明日',url:'https://app.example/#tasks',resourceType:'task',resourceId:'t1'}));
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');
 const assertion=calls[0].options.body.get('assertion'),parts=assertion.split('.');
 assert.equal(parts.length,3);
 assert.ok(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')));
 assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).scope,'https://www.googleapis.com/auth/firebase.messaging');
 assert.equal(calls[1].url,'https://fcm.googleapis.com/v1/projects/club-project/messages:send');
 assert.equal(calls[1].options.headers.Authorization,'Bearer access');
 assert.deepEqual(JSON.parse(calls[1].options.body).message.notification,{title:'確認',body:'明日'});
 await send({token:'second'},JSON.stringify({title:'次'}));
 assert.equal(calls.filter(c=>c.url==='https://oauth2.googleapis.com/token').length,1);
});

test('only an FCM UNREGISTERED response removes an expired token',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 let status='UNREGISTERED';
 const send=createFcmSender(JSON.stringify({project_id:'club-project',client_email:'sender@club-project.iam.gserviceaccount.com',private_key:privateKey}),{fetcher:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'access'})}:{ok:false,json:async()=>({error:{status}})}});
 await assert.rejects(send({token:'bad'},'{}'),e=>e.statusCode===410);
 status='NOT_FOUND';
 await assert.rejects(send({token:'bad'},'{}'),e=>e.statusCode===503);
});

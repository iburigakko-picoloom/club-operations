import webpush from 'web-push';
import {createECDH,randomBytes} from 'node:crypto';
const device=createECDH('prime256v1');device.generateKeys();
const vapid=webpush.generateVAPIDKeys();
const subscription={endpoint:'https://web.push.apple.com/test-only',keys:{p256dh:device.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
const payload=JSON.stringify({title:'通知の暗号化確認',body:'テスト',url:'https://example.com/'});
const request=webpush.generateRequestDetails(subscription,payload,{TTL:3600,vapidDetails:{subject:'https://example.com/',...vapid}});
if(request.headers['Content-Encoding']!=='aes128gcm'||!request.headers.Authorization.startsWith('vapid ')||!request.body.length||request.body.includes(Buffer.from(payload)))throw Error('Encrypted push request failed');
console.log('Deno VAPID signing and encrypted push payload verified; no network request sent.');

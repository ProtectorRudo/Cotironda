import test from 'node:test';
import assert from 'node:assert/strict';
import {sendAutomaticBuyerLinkD016} from
 '../../supabase/functions/cotironda-piloto-document-recovery/buyer-auto-link-d016.ts';

const requestId='665759f0-251b-4a2b-afb4-d763612366f7';
const recipient='5492215551234@s.whatsapp.net';
const config={
 enabled:true,channel:'pilot_1234',
 identityHmacHex:'a'.repeat(64),
 aesHex:'b'.repeat(64),linkHmacHex:'c'.repeat(64),
 portalOrigin:'https://cotironda-portal-dev-git-feat-c9bde9-protector-rudo-s-projects.vercel.app',
 portalSha:'f98527c9516478783bd7cf95433c58f5ca445937',
 approvedSha:'f98527c9516478783bd7cf95433c58f5ca445937',
 whapiToken:'token_not_real_or_used_0123456789'
};
const hex=(array)=>Array.from(new Uint8Array(array)).map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=(s)=>Uint8Array.from(s.match(/.{2}/g),x=>parseInt(x,16));
async function authenticatedPacket(){
 const key=await crypto.subtle.importKey('raw',bytes(config.identityHmacHex),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const chatHmac=hex(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode('cotironda|pilot|chat|'+config.channel+'|'+recipient)));
 const contactSha=hex(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(recipient)));
 const aes=await crypto.subtle.importKey('raw',bytes(config.aesHex),
  'AES-GCM',false,['encrypt']);
 const iv=new Uint8Array(12);
 const ciphertext=await crypto.subtle.encrypt({
  name:'AES-GCM',iv,tagLength:128,
  additionalData:new TextEncoder().encode(chatHmac+'|cotironda-contact-v1')
 },aes,new TextEncoder().encode(recipient));
 return {
  state:'ready',request_id:requestId,
  event_hmac:'d'.repeat(64),
  chat_hmac:chatHmac,contact_sha256:contactSha,
  nonce_b64:Buffer.from(iv).toString('base64'),
  ciphertext_b64:Buffer.from(ciphertext).toString('base64'),
  source:'authenticated_whapi'
 };
}
test('automatic buyer D016 OFF does no SQL or HTTP',async()=>{
 const r=await sendAutomaticBuyerLinkD016({...config,enabled:false},{
  rpc:async()=>{throw Error('unexpected SQL')},
  post:async()=>{throw Error('unexpected HTTP')}
 });
 assert.deepEqual(r,{state:'off',attempts:0});
});
test('no eligible prepared round means no buyer WhatsApp',async()=>{
 let calls=0;
 const r=await sendAutomaticBuyerLinkD016(config,{
  rpc:async()=>{calls++;return {data:{state:'empty'},error:null}},
  post:async()=>{throw Error('unexpected HTTP')}
 });
 assert.deepEqual(r,{state:'empty',attempts:0});
 assert.equal(calls,1);
});
test('HMAC, AES, portal SHA/origin are fail-closed before querying',async()=>{
 for(const invalid of [
  {...config,linkHmacHex:''},
  {...config,identityHmacHex:''},
  {...config,portalSha:'0'.repeat(40)},
  {...config,portalOrigin:'https://evil.example.com'}
 ]){
  await assert.rejects(sendAutomaticBuyerLinkD016(invalid,{
   rpc:async()=>{throw Error('should not query')},
   post:async()=>{throw Error('should not send')}
  }),/secure_configuration_unavailable/);
 }
});
test('buyer packet must be authentic; no buyer number from external input',async()=>{
 const packet=await authenticatedPacket();
 await assert.rejects(sendAutomaticBuyerLinkD016(config,{
  rpc:async()=>({data:{...packet,contact_sha256:'f'.repeat(64)},error:null}),
  post:async()=>{throw Error('no HTTP on mismatch')}
 }),/contact_integrity_failed/);
 await assert.rejects(sendAutomaticBuyerLinkD016(config,{
  rpc:async()=>({data:{...packet,event_hmac:'bad'},error:null}),
  post:async()=>{throw Error('no HTTP on mismatch')}
 }),/contact_envelope_invalid/);
});
test('auto sends D016 private one-time URL after authenticated dispatch exactly once',async()=>{
 const packet=await authenticatedPacket();
 let posts=0,prepared=0,finished=0,deliveredBody='';
 const rpc=async(name,params)=>{
  if(name==='cotironda_piloto_v2_d016_auto_buyer_packet_private')
   return {data:finished?{state:'empty'}:packet,error:null};
  if(name==='cotironda_piloto_v2_d016_prepare_whapi_link_private'){
   prepared++;
   assert.equal(params.p_mode,'auto');
   assert.equal(params.p_event_hmac,packet.event_hmac);
   assert.equal(params.p_chat_hmac,packet.chat_hmac);
   assert.equal(params.p_request_id,requestId);
   assert.match(params.p_ticket_hmac,/^[0-9a-f]{64}$/);
   return {data:{state:'issued',request_id:requestId},error:null};
  }
  if(name==='cotironda_piloto_v2_d016_finish_whapi_link_private'){
   finished++;
   assert.equal(params.p_state,'api_accepted');
   assert.equal(params.p_whapi_message_id,'wamid.SYNTHETIC12345');
   return {data:true,error:null};
  }
  throw Error('unexpected SQL '+name);
 };
 const io={rpc,post:async(url,init)=>{
  posts++;
  assert.equal(url,'https://gate.whapi.cloud/messages/text');
  const payload=JSON.parse(init.body);
  assert.equal(payload.to,recipient);
  deliveredBody=payload.body;
  assert.match(deliveredBody,/\/piloto\/v2\/acceso#d016=/);
  assert.match(deliveredBody,/ronda=665759f0-251b-4a2b-afb4-d763612366f7/);
  assert.doesNotMatch(deliveredBody,/https:\/\/.*\/originales/);
  return {ok:true,json:async()=>({
   sent:true,message_id:'wamid.SYNTHETIC12345'
  })};
 }};
 const first=await sendAutomaticBuyerLinkD016(config,io);
 assert.deepEqual(first,{state:'api_accepted',attempts:1});
 assert.equal(posts,1);
 assert.equal(prepared,1);
 assert.equal(finished,1);
 const again=await sendAutomaticBuyerLinkD016(config,io);
 assert.deepEqual(again,{state:'empty',attempts:0});
 assert.equal(posts,1);
});

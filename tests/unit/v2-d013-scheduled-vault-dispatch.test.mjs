import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchPendingVerifiedV2SupplierPdfs} from
 '../../supabase/functions/cotironda-piloto-document-recovery/whapi-dispatch.ts';

const NO_SEND=()=>{
 throw Error('unexpected_external_network_call');
};
const base={
 enabled:true,dynamicRecipientsEnabled:true,
 hmacHex:'a'.repeat(64),aesHex:'b'.repeat(64),
 channel:'pilot_1234',token:'p'.repeat(32),
 includeReference:true
};
const H=(buf)=>Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=(hex)=>Uint8Array.from(hex.match(/.{2}/g),x=>parseInt(x,16));

test('V2 worker stays inert unless its own opt-in gate is true',async()=>{
 let queries=0;
 const result=await dispatchPendingVerifiedV2SupplierPdfs(
  {...base,enabled:false},{rpc:async()=>{queries++;throw Error('called');},post:NO_SEND});
 assert.equal(result.state,'off');
 assert.equal(queries,0);
});
test('V2 worker never falls back to legacy static recipient numbers',async()=>{
 const result=await dispatchPendingVerifiedV2SupplierPdfs(
  {...base,dynamicRecipientsEnabled:false},{rpc:async()=>{throw Error('called');},
   post:NO_SEND});
 assert.equal(result.state,'disabled');
});
test('V2 disabled/empty SQL policy cannot send any WhatsApp',async()=>{
 for(const state of ['disabled','empty']){
  let calls=0;
  const result=await dispatchPendingVerifiedV2SupplierPdfs(
   base,{rpc:async()=>{calls++;return {data:{state},error:null};},post:NO_SEND});
  assert.equal(result.state,state);
  assert.equal(calls,1);
 }
});
test('V2 selector may never choose an unverified UUID',async()=>{
 await assert.rejects(
  dispatchPendingVerifiedV2SupplierPdfs(base,{
   rpc:async()=>({data:{state:'ready',request_id:'invalid'},error:null}),
   post:NO_SEND
  }),
  /v2_scheduled_selector_invalid/
 );
});

test('V2 scheduled delivery reuses verified lease + SHA + AES-GCM recipient and finishes once',async()=>{
 const requestId='665759f0-251b-4a2b-afb4-d763612366f7';
 const supplier='corralon_ailin';
 const lease='77777777-7777-4777-8777-777777777777';
 const recipient='5492215551234';
 const wireRecipient=recipient+'@s.whatsapp.net';
 const hmacKey=await crypto.subtle.importKey('raw',bytes(base.hmacHex),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aesKey=await crypto.subtle.importKey('raw',bytes(base.aesHex),
  'AES-GCM',false,['encrypt']);
 const chatHmac=H(await crypto.subtle.sign('HMAC',hmacKey,
  new TextEncoder().encode(
   'cotironda|pilot|chat|'+base.channel+'|'+wireRecipient)));
 const contactSha=H(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(wireRecipient)));
 const iv=new Uint8Array(12);
 const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,tagLength:128,
  additionalData:new TextEncoder().encode(chatHmac+'|cotironda-contact-v1')},
  aesKey,new TextEncoder().encode(wireRecipient));
 const b64=(buf)=>Buffer.from(buf).toString('base64');
 const envelope={
  state:'ready',request_id:requestId,supplier_key:supplier,
  chat_hmac:chatHmac,contact_sha256:contactSha,
  nonce_b64:b64(iv),ciphertext_b64:b64(sealed),
  channel_id:base.channel,source:'authenticated_whapi'
 };
 const calls=[];
 let claims=0,posts=0,finishes=0;
 const rpc=async(name,params)=>{
  calls.push(name);
  if(name==='cotironda_piloto_v2_d013_scheduled_dispatch_due_private')
   return {data:{state:'ready',request_id:requestId},error:null};
  if(name==='cotironda_piloto_ia_claim_mvp222'){
   claims++;
   return {data:claims===1?{
    state:'leased',request_id:requestId,supplier_key:supplier,
    chat_hmac:chatHmac,lease_token:lease
   }:{state:'empty'},error:null};
  }
  if(name==='cotironda_piloto_ia_recipient_packet_mvp313')
   return {data:envelope,error:null};
  if(name==='cotironda_piloto_ia_pdf_snapshot_mvp222')
   return {data:{
    requestId,city:'La Plata',deadlineIso:'2026-11-17T21:00:00Z',
    deliveryNote:null,items:[
     {description:'Cemento CPC 50 kg',quantity:'10',unit:'bag'},
     {description:'Bolsón arena fina 1 m3',quantity:'1',unit:'bag'},
     {description:'Bolsón piedra partida 1 m3',quantity:'1',unit:'bag'}
    ]},error:null};
  if(name==='cotironda_piloto_ia_finish_mvp222'){
   finishes++;
   assert.equal(params.p_request,requestId);
   assert.equal(params.p_supplier,supplier);
   assert.equal(params.p_state,'api_accepted');
   assert.equal(params.p_message_id,'wamid.SYNTHETIC12345');
   return {data:true,error:null};
  }
  throw Error('unexpected RPC '+name);
 };
 const result=await dispatchPendingVerifiedV2SupplierPdfs(base,{
  rpc,
  post:async(url,init)=>{
   posts++;
   assert.equal(url,'https://gate.whapi.cloud/messages/document');
   const body=JSON.parse(init.body);
   assert.equal(body.to,recipient);
   assert.match(body.media,/^data:application\/pdf;name=Solicitud-Cotironda\.pdf;base64,/);
   assert.match(body.caption,/Cotironda pedido:/);
   return {ok:true,json:async()=>({sent:true,message_id:'wamid.SYNTHETIC12345'})};
  }
 });
 assert.deepEqual(result,{state:'processed',claimed:1,accepted:1,uncertain:0});
 assert.equal(posts,1);
 assert.equal(finishes,1);
 assert.equal(claims,2);
 assert.equal(calls.filter(x=>x==='cotironda_piloto_ia_recipient_packet_mvp313').length,2);
});

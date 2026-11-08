import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {avisarCompradorTrasLoteMvp315} from
 '../../supabase/functions/cotironda-piloto-whapi/buyer-tracking-after-batch-mvp315.ts';
const crypto=webcrypto;
const request='469cb459-5f00-49c2-b0b9-bc8b11e5c915';
const event='b'.repeat(64);
const channel='pilotchan_315';
const jid='5492215000001@s.whatsapp.net';
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function fixture(overrides={}){
 const rawAes=new Uint8Array(32).fill(13);
 const rawHmac=new Uint8Array(32).fill(27);
 const aesKey=await crypto.subtle.importKey('raw',rawAes,'AES-GCM',false,['encrypt','decrypt']);
 const hmacKey=await crypto.subtle.importKey('raw',rawHmac,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const chat=hex(await crypto.subtle.sign('HMAC',hmacKey,
  new TextEncoder().encode('cotironda|pilot|chat|'+channel+'|'+jid)));
 const sha=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jid)));
 const iv=new Uint8Array(12).fill(4);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({
  name:'AES-GCM',iv,additionalData:new TextEncoder().encode(chat+'|cotironda-contact-v1'),
  tagLength:128},aesKey,new TextEncoder().encode(jid)));
 const b64=bytes=>Buffer.from(bytes).toString('base64');
 const envelope={state:'ready',request_id:request,chat_hmac:chat,event_hmac:event,
  channel_id:channel,contact_sha256:sha,nonce_b64:b64(iv),
  ciphertext_b64:b64(encrypted),source:'authenticated_whapi'};
 const state={calls:[],sends:[],...overrides};
 const rpc=async(name,params)=>{
  state.calls.push({name,params});
  if(name==='cotironda_piloto_ia_next_buyer_notice_mvp315')
   return {data:state.nextState??envelope,error:null};
  if(name==='cotironda_piloto_ia_issue_buyer_notice_mvp315')
   return {data:{state:state.issueState??'issued',request_id:request},error:null};
  if(name==='cotironda_piloto_ia_buyer_packet_mvp315')
   return {data:state.packetAfter??envelope,error:null};
  if(name==='cotironda_piloto_ia_authorize_buyer_notice_mvp315')
   return {data:state.authorized??true,error:null};
  if(name==='cotironda_piloto_finish_tracking_mvp091' ||
     name==='cotironda_piloto_record_tracking_id_mvp119')
   return {data:true,error:null};
  throw Error('unexpected rpc '+name);
 };
 const send=async(to,body)=>{
  state.sends.push({to,body});
  return state.sendResult??{accepted:true,messageId:'wamid.Msg315BuyerTest'};
 };
 return {state,envelope,args:{enabled:true,keys:{hmacKey,aesKey,channel},rpc,send}};
}
test('MVP315 apagado: sin SQL, sin número en respuestas',async()=>{
 const f=await fixture();
 assert.deepEqual(await avisarCompradorTrasLoteMvp315({...f.args,enabled:false}),
  {estado:'apagado',intentos:0});
 assert.equal(f.state.calls.length,0);
});
test('MVP315 ronda completa: una sola emisión, token privado, origen y revalidación',async()=>{
 const f=await fixture();
 const out=await avisarCompradorTrasLoteMvp315(f.args);
 assert.deepEqual(out,{estado:'api_aceptada',intentos:1});
 assert.equal(f.state.sends.length,1);
 assert.equal(f.state.sends[0].to,jid);
 assert.match(f.state.sends[0].body,/\/seguimiento#[a-f0-9]{64}/u);
 assert.doesNotMatch(JSON.stringify(out),/5492215000001/u);
 assert.deepEqual(f.state.calls.map(x=>x.name),[
  'cotironda_piloto_ia_next_buyer_notice_mvp315',
  'cotironda_piloto_ia_issue_buyer_notice_mvp315',
  'cotironda_piloto_ia_buyer_packet_mvp315',
  'cotironda_piloto_ia_authorize_buyer_notice_mvp315',
  'cotironda_piloto_finish_tracking_mvp091',
  'cotironda_piloto_record_tracking_id_mvp119'
 ]);
 assert.equal(f.state.calls[1].params.p_channel,channel);
});
test('MVP315 sin presupuesto / sin trabajo no envía',async()=>{
 for(const state of ['disabled','empty','budget_exhausted']){
  const f=await fixture({nextState:{state}});
  const res=await avisarCompradorTrasLoteMvp315(f.args);
  assert.equal(res.intentos,0);assert.equal(f.state.sends.length,0);
 }
});
test('MVP315 nunca acepta un sobre AES alterado',async()=>{
 const f=await fixture();
 f.state.nextState={...f.envelope,contact_sha256:'0'.repeat(64)};
 const result=await avisarCompradorTrasLoteMvp315(f.args);
 assert.equal(result.estado,'conciliacion_requerida');
 assert.equal(f.state.sends.length,0);
 assert.equal(f.state.calls.length,1);
});
test('MVP315 pérdida de autorización después del token: sin HTTP, sin reintento',async()=>{
 const f=await fixture({packetAfter:{state:'not_ready'}});
 const res=await avisarCompradorTrasLoteMvp315(f.args);
 assert.deepEqual(res,{estado:'entrega_incierta',intentos:1});
 assert.equal(f.state.sends.length,0);
 assert.equal(f.state.calls.filter(x=>x.name==='cotironda_piloto_finish_tracking_mvp091').length,1);
});
test('MVP315 Whapi responde sin ID: terminal incierto, 0 reenvíos',async()=>{
 const f=await fixture({sendResult:{accepted:true,messageId:null}});
 const res=await avisarCompradorTrasLoteMvp315(f.args);
 assert.equal(res.estado,'entrega_incierta');assert.equal(res.intentos,1);
 assert.equal(f.state.sends.length,1);
});
test('MVP315 token ya emitido por otro worker: no envía',async()=>{
 const f=await fixture({issueState:'already_issued'});
 const res=await avisarCompradorTrasLoteMvp315(f.args);
 assert.deepEqual(res,{estado:'sin_trabajos',intentos:0});
 assert.equal(f.state.sends.length,0);
});
test('MVP315 revocación de autorización de contacto durante envío: no envía',async()=>{
 const f=await fixture({authorized:false});
 const res=await avisarCompradorTrasLoteMvp315(f.args);
 assert.equal(res.estado,'entrega_incierta');
 assert.equal(f.state.sends.length,0);
});

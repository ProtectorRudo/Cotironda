import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolverDestinatarioMvp313} from '../../supabase/functions/cotironda-piloto-whapi/dynamic-recipient-mvp313.ts';
import {despacharSolicitudCentralMvp223} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
const subtle=webcrypto.subtle;
const enc=new TextEncoder();
const hex=x=>Buffer.from(x).toString('hex');
const uuid='123e4567-e89b-42d3-a456-426614174000';
const lease='123e4567-e89b-42d3-a456-426614174099';
const id='supplier_new_313';
const channel='pilotchan_313';
async function setup(){
 const hmacKey=await subtle.importKey('raw',randomBytes(32),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aesKey=await subtle.importKey('raw',randomBytes(32),{name:'AES-GCM'},false,['encrypt','decrypt']);
 const recipient='5492219876543@s.whatsapp.net';
 const chatHmac=hex(await subtle.sign('HMAC',hmacKey,enc.encode('cotironda|pilot|chat|'+channel+'|'+recipient)));
 const sha=hex(await subtle.digest('SHA-256',enc.encode(recipient)));
 const iv=randomBytes(12);
 const encrypted=await subtle.encrypt({name:'AES-GCM',iv,
  additionalData:enc.encode(chatHmac+'|cotironda-contact-v1'),tagLength:128},
  aesKey,enc.encode(recipient));
 const envelope={state:'ready',request_id:uuid,supplier_key:id,chat_hmac:chatHmac,
  contact_sha256:sha,nonce_b64:iv.toString('base64'),
  ciphertext_b64:Buffer.from(encrypted).toString('base64'),channel_id:channel,
  source:'owner_statement'};
 return {keys:{hmacKey,aesKey,channel},lease:{requestId:uuid,supplierKey:id,leaseToken:lease,chatHmac},
  envelope,recipient};
}
test('MVP313: dynamic recipient requires correct lease-scoped encrypted packet, without number allowlist',async()=>{
 const s=await setup();let calls=0;
 const result=await resolverDestinatarioMvp313(s.lease,s.keys,async(name,args)=>{
  calls++;assert.equal(name,'cotironda_piloto_ia_recipient_packet_mvp313');
  assert.deepEqual(args,{p_request:uuid,p_supplier:id,p_lease:lease,p_chat_hmac:s.lease.chatHmac,p_channel:channel});
  return {data:s.envelope,error:null};
 });
 assert.equal(result,'5492219876543');assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(s.envelope),/5492219876543/u);
});
test('MVP313: altered identity, channel, source, lease or AES ciphertext fails closed',async()=>{
 const s=await setup();
 for(const bad of [
  {...s.envelope,request_id:'22222222-2222-4222-8222-222222222222'},
  {...s.envelope,supplier_key:'supplier_other_313'},
  {...s.envelope,chat_hmac:'a'.repeat(64)},
  {...s.envelope,contact_sha256:'b'.repeat(64)},
  {...s.envelope,channel_id:'foreign_channel'},
  {...s.envelope,source:'untrusted'},
  {...s.envelope,unexpected:'x'},
  {...s.envelope,state:'not_authorized'}
 ]){
  await assert.rejects(resolverDestinatarioMvp313(s.lease,s.keys,
   async()=>({data:bad,error:null})),/mvp313_recipient_unavailable/u);
 }
 const corrupt=Buffer.from(s.envelope.ciphertext_b64,'base64');corrupt[0]^=8;
 await assert.rejects(resolverDestinatarioMvp313(s.lease,s.keys,
  async()=>({data:{...s.envelope,ciphertext_b64:corrupt.toString('base64')},error:null})),/mvp313_recipient_unavailable/u);
 await assert.rejects(resolverDestinatarioMvp313({...s.lease,leaseToken:'invalid'},s.keys,
  async()=>({data:s.envelope,error:null})),/mvp313_recipient_unavailable/u);
 await assert.rejects(resolverDestinatarioMvp313(s.lease,s.keys,
  async()=>({data:{state:'not_authorized'},error:null})),/mvp313_recipient_unavailable/u);
});
test('MVP313: a changed number between PDF generation and HTTP is never sent',async()=>{
 const s=await setup();let claimCount=0,resolved=0,send=0,state='';
 const response=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:uuid,recipients:{[id]:'000000000'},
  resolveRecipient:async({supplierKey,leaseToken})=>{
   assert.equal(supplierKey,id);assert.equal(leaseToken,lease);
   resolved++;return resolved===1?'5492219876543':'5492219876544';
  },
  authorizeChatHmac:async()=>true,
  rpc:async(name)=>{
   if(name==='cotironda_piloto_ia_claim_mvp222'){claimCount++;return {data:claimCount===1
    ?{state:'leased',request_id:uuid,supplier_key:id,lease_token:lease,chat_hmac:s.lease.chatHmac}
    :{state:'empty'},error:null};}
   if(name==='cotironda_piloto_ia_pdf_snapshot_mvp222')return {data:{requestId:uuid,city:'La Plata',
    deadlineIso:'2026-11-09T18:00:00Z',deliveryNote:null,
    items:[{description:'Cemento',quantity:'20',unit:'bag'}]},error:null};
   if(name==='cotironda_piloto_ia_finish_mvp222'){state='uncertain';return {data:true,error:null};}
   throw Error('unexpected RPC '+name);
  },
  createPdf:()=>new Uint8Array(70),
  sendWhapi:async()=>{send++;return {accepted:true,messageId:'abcdefgh1234'};}
 });
 assert.equal(response.inciertos,1);assert.equal(send,0);assert.equal(resolved,2);assert.equal(state,'uncertain');
});
test('MVP313: successful central send keeps one lease and rechecks before HTTP',async()=>{
 const s=await setup();let resolved=0,sent=0,finished='';
 const x=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:uuid,recipients:{},
  resolveRecipient:async()=>{resolved++;return '5492219876543';},
  authorizeChatHmac:async recipient=>recipient==='5492219876543',
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_ia_claim_mvp222')return {data:{state:'leased',
    request_id:uuid,supplier_key:id,lease_token:lease,chat_hmac:s.lease.chatHmac},error:null};
   if(name==='cotironda_piloto_ia_pdf_snapshot_mvp222')return {data:{requestId:uuid,city:'La Plata',
    deadlineIso:'2026-11-09T18:00:00Z',deliveryNote:null,
    items:[{description:'Cemento',quantity:'20',unit:'bag'}]},error:null};
   if(name==='cotironda_piloto_ia_finish_mvp222'){finished=String(params.p_state);return {data:true,error:null};}
   throw Error('unexpected '+name);
  },
  createPdf:()=>new Uint8Array(60),
  sendWhapi:async()=>{sent++;return {accepted:true,messageId:'abcdefgh1234'};},
  maxJobs:1
 });
 assert.equal(resolved,2);assert.equal(sent,1);assert.equal(finished,'api_accepted');
 assert.equal(x.apiAceptados,1);
});
test('MVP313: SQL broker enforces role, live lease, dispatch snapshot and supplier consent',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp313_destinatarios_dinamicos_cifrados.sql',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(sql,/j.state='leased'/u);
 assert.match(sql,/j.lease_token=p_lease/u);
 assert.match(sql,/p.chat_hmac=p_chat_hmac/u);
 assert.match(sql,/p.participant_role='supplier'/u);
 assert.match(sql,/cotironda_piloto_ia_pdf_snapshot_mvp222/u);
 assert.match(sql,/proveedor_contactable_mvp307/u);
 assert.match(sql,/admin_authorization_revocations_mvp309/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_recipient_packet_mvp313/u);
 assert.match(sql,/TO service_role;/u);
 assert.match(edge,/COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED/u);
 assert.match(edge,/resolverDestinatarioMvp313/u);
 assert.match(edge,/if\(!sec.outbound\|\|sec.dynamicRecipients\)return;/u);
 assert.match(edge,/cotironda_piloto_is_supplier_mvp313/u);
});

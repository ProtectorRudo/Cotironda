import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sendDeferredSupplierAckMvp181,DEFERRED_SUPPLIER_THANKS}
 from '../../supabase/functions/cotironda-piloto-whapi/supplier-deferred-ack.ts';
import {recoverOneStoredDocument}
 from '../../supabase/functions/cotironda-piloto-whapi/private-document-recovery.ts';

const h='a'.repeat(64),chat='b'.repeat(64),recipient='5491123456789@s.whatsapp.net';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp181_deferred_supplier_ack.sql',import.meta.url),'utf8');
const hook=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');

function ackHarness({eligible=true,deliver=true,throwSend=false,
 failFinish=false}={}){
 const rpcs=[],sent=[];
 return {
  rpcs,sent,
  io:{
   rpc:async(name,params)=>{
    rpcs.push({name,params});
    if(name.endsWith('_mvp181'))return {data:eligible,error:null};
    if(name==='cotironda_piloto_finish_supplier_ack_mvp104')
     return {data:!failFinish,error:failFinish?'fail':null};
    return {data:true,error:null};
   },
   sendText:async(to,text)=>{
    sent.push({to,text});
    if(throwSend)throw Error('timeout');
    return {sent:deliver,id:deliver?'whapimsg_12345678':null};
   }
  }
 };
}
const input=(io,extra={})=>({
 enabled:true,messageHmac:h,triggerChatHmac:chat,recipientChatId:recipient,
 io,...extra
});

test('MVP181: default OFF suppresses RPC and network for future quotes',async()=>{
 const a=ackHarness();
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io,{enabled:false})),'disabled');
 assert.equal(a.rpcs.length,0);assert.equal(a.sent.length,0);
});
test('MVP181: invalid message, chat or recipient never sends',async()=>{
 for(const e of [{messageHmac:'invalid'},{triggerChatHmac:'wrong'},
  {recipientChatId:'5491123456789@g.us'},{recipientChatId:'http://bad'}]){
  const a=ackHarness();
  assert.equal(await sendDeferredSupplierAckMvp181(input(a.io,e)),'invalid');
  assert.equal(a.rpcs.length,0);assert.equal(a.sent.length,0);
 }
});
test('MVP181: DB deny / duplicate / prior message cannot result in WhatsApp',async()=>{
 const a=ackHarness({eligible:false});
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io)),'not_eligible');
 assert.equal(a.sent.length,0);
 assert.deepEqual(a.rpcs.map(x=>x.name),
  ['cotironda_piloto_reserve_deferred_supplier_ack_mvp181']);
});
test('MVP181: success sends only polite receipt, stores terminal state and ID',async()=>{
 const a=ackHarness();
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io)),'api_accepted');
 assert.deepEqual(a.sent,[{to:recipient,text:DEFERRED_SUPPLIER_THANKS}]);
 assert.match(DEFERRED_SUPPLIER_THANKS,/Recibimos tu presupuesto/);
 assert.doesNotMatch(DEFERRED_SUPPLIER_THANKS,/rebaja|aument|mejorar precio|podés corregir|ranking/iu);
 assert.deepEqual(a.rpcs.map(x=>x.name),[
 'cotironda_piloto_reserve_deferred_supplier_ack_mvp181',
 'cotironda_piloto_finish_supplier_ack_mvp104',
 'cotironda_piloto_record_supplier_ack_id_mvp119'
 ]);
 assert.equal(a.rpcs[1].params.p_state,'api_accepted');
 assert.equal(a.rpcs[0].params.p_message_hmac,h);
 assert.equal(a.rpcs[0].params.p_trigger_chat_hmac,chat);
});
test('MVP181: API return failure is terminal UNCERTAIN; no retry',async()=>{
 const a=ackHarness({deliver:false});
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io)),'uncertain');
 assert.equal(a.sent.length,1);
 assert.equal(a.rpcs[1].params.p_state,'uncertain');
 assert.equal(a.rpcs.length,2);
});
test('MVP181: transport timeout is terminal UNCERTAIN; no retry',async()=>{
 const a=ackHarness({throwSend:true});
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io)),'uncertain');
 assert.equal(a.sent.length,1);assert.equal(a.rpcs[1].params.p_state,'uncertain');
 assert.equal(a.rpcs.length,2);
});
test('MVP181: reconciliation failure cannot provoke second send',async()=>{
 const a=ackHarness({failFinish:true});
 assert.equal(await sendDeferredSupplierAckMvp181(input(a.io)),
  'reconciliation_required');
 assert.equal(a.sent.length,1);
 assert.equal(a.rpcs.length,2);
});
test('MVP181: SQL isolation, future-only activation and idempotency are explicit',()=>{
 assert.match(sql,/enabled boolean not null default false/u);
 assert.match(sql,/new\.activated_at:=clock_timestamp\(\)/u);
 assert.match(sql,/r\.created_at>=pol\.activated_at/u);
 assert.match(sql,/m\.received_at>=pol\.activated_at/u);
 assert.match(sql,/q\.received_at>=pol\.activated_at/u);
 assert.match(sql,/m\.chat_hmac=p_trigger_chat_hmac/u);
 assert.match(sql,/a\.content_sha256=q\.source_sha256/u);
 assert.match(sql,/a\.proposal->>'kind'='supplier_quote'/u);
 assert.match(sql,/supplier\.opted_out_at is null/u);
 assert.match(sql,/buyer\.opted_out_at is null/u);
 assert.match(sql,/on conflict \(message_hmac\) do nothing/u);
 assert.match(sql,/grant execute on function\s+public\.cotironda_piloto_reserve_deferred_supplier_ack_mvp181\(text,text\)\s+to service_role/u);
});
test('MVP181: webhook requires both opt-ins before deferred sends',()=>{
 assert.match(hook,/sec\.outbound\|\|!recoveryTriggerChatId/u);
 assert.match(hook,/COTIRONDA_PILOT_DEFERRED_SUPPLIER_ACK_ENABLED/u);
 assert.match(hook,/triggerChatHmac,\s+recipientChatId:recoveryTriggerChatId/u);
 assert.match(hook,/body:JSON\.stringify\(\{to,body\}\)/u);
});

const docHash='c'.repeat(64);
function recoveryHarness(mode='stored_unverified',mime='application/pdf'){
 const bytes=new TextEncoder().encode('private_test_payload');
 const sha=createHash('sha256').update(bytes).digest('hex');
 const records=[],callback=[];
 const response=(name)=>{
  switch(name){
   case 'cotironda_piloto_next_document_retry_mvp128':
    return {state:'candidate',message_hmac:docHash};
   case 'cotironda_piloto_reserve_document_retry_mvp127':
    return {state:'reserved',mime,source_sha256:sha,size_bytes:bytes.length};
   case 'cotironda_piloto_note_media_proposal_mvp095':
   case 'cotironda_piloto_note_document_draft_mvp127':
    return true;
   case 'cotironda_piloto_record_supplier_media_mvp098':
    return {state:mode};
   case 'cotironda_piloto_compare_supplier_readings_mvp102':
    return {state:'needs_review'};
   default:throw Error('unexpected RPC '+name);
  }
 };
 return {records,callback,io:{
  rpc:async(name,args)=>{records.push(name);return {data:response(name),error:null};},
  download:async(path)=>{
   assert.equal(path,'media/'+docHash);
   return {data:new Blob([bytes],{type:mime}),error:null};
  }
 },read:async()=>({kind:'supplier_quote',lines:[]}),onSupplierReceipt:async(h)=>{callback.push(h)}};
}
test('MVP181: recovery calls deferred thanks ONCE for a new source, not duplicate',async()=>{
 for(const mime of ['application/pdf','image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']){
  const a=recoveryHarness('stored_unverified',mime);
  assert.equal(await recoverOneStoredDocument({
   ...a,enabled:true,apiKey:'mock',triggerChatHmac:chat
  }),'recovered_private');
  assert.deepEqual(a.callback,[docHash]);
  assert.equal(a.records.filter(x=>x==='cotironda_piloto_record_supplier_media_mvp098').length,1);
 }
 const b=recoveryHarness('duplicate');
 await recoverOneStoredDocument({...b,enabled:true,apiKey:'mock',
  triggerChatHmac:chat});
 assert.deepEqual(b.callback,[]);
});
test('MVP181: failure of thank-you does NOT corrupt supplier document recovery',async()=>{
 const a=recoveryHarness();
 a.onSupplierReceipt=async()=>{throw Error('outbound offline');};
 const r=await recoverOneStoredDocument({...a,enabled:true,apiKey:'mock',
  triggerChatHmac:chat});
 assert.equal(r,'recovered_private');
 assert.equal(a.records.includes('cotironda_piloto_compare_supplier_readings_mvp102'),true);
});

test('MVP181: source verification proceeds while Whapi ACK is unresolved',async()=>{
 const a=recoveryHarness();
 let release=()=>{};
 const delayed=new Promise(resolve=>{release=resolve;});
 let signalStarted=()=>{};
 const started=new Promise(resolve=>{signalStarted=resolve;});
 a.onSupplierReceipt=async()=>{signalStarted();await delayed;};
 const job=recoverOneStoredDocument({
  ...a,enabled:true,apiKey:'mock',triggerChatHmac:chat
 });
 // Crypto/AI-source mock preprocessing is asynchronous: wait for the
 // ACK task to start, not an arbitrary event-loop tick.
 await started;
 assert.equal(a.records.includes(
  'cotironda_piloto_compare_supplier_readings_mvp102'),true,
  'source comparison is not blocked by a delayed WhatsApp network call');
 release();
 assert.equal(await job,'recovered_private');
});

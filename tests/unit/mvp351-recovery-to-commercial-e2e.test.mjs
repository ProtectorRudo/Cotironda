import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarPendienteAutomaticoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
import {correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';
import {reprocesarOriginalHistoricoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts';

const source='a'.repeat(64),chat='b'.repeat(64);
const current='11111111-1111-4111-8111-111111111111';
const expired='22222222-2222-4222-8222-222222222222';
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<</Type /Page>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const first={
 kind:'supplier_quote',status:'review_required',delivery_city:null,
 requested_delivery_note:'Entrega en La Plata',
 lines:[
  {original_description:'Cemento Avellaneda',quantity:'15',unit:null,
   unit_price:'$100',line_total:'$1500',evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Arena',quantity:'2',unit:null,
   unit_price:'$200',line_total:'$400',evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Piedra',quantity:'1',unit:null,
   unit_price:'$300',line_total:'$300',evidence_location:'p1',ambiguity:null}
 ],total_declared:'$2200',unanswered:[]
};
const quote=first.lines.map((x,i)=>({
 line_no:i+1,description:x.original_description,quantity:x.quantity,unit:x.unit
}));
const candidates=[
 {request_id:current,bind_allowed:true,lines:[
  {line_no:1,description:'Cemento CPC de 50 kg',quantity:'15',unit:'bag'},
  {line_no:2,description:'Arena',quantity:'2',unit:'bag'},
  {line_no:3,description:'Piedra',quantity:'1',unit:'bag'}
 ]},
 {request_id:expired,bind_allowed:false,lines:[
  {line_no:1,description:'Cemento CPC de 50 kg',quantity:'20',unit:'bag'},
  {line_no:2,description:'Arena fina',quantity:'3',unit:'m3'},
  {line_no:3,description:'Piedra',quantity:'3',unit:'bag'}
 ]}
];
const suggestion=(target)=>({matches:[1,2,3].map(i=>({
 candidate:target,source_line:i,request_line:i,relation:'equivalent'
}))});

async function run(privateSourceCovered,which='r1'){
 const calls=[],results={reads:0,comparisons:0,links:0,publications:0,replays:0,verifiers:0};
 const rpc=async(name,args={})=>{
  calls.push(name);
  if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
   return {data:{state:'empty'},error:null};
  if(name==='cotironda_piloto_claim_reviewed_auto_recovery_mvp336')
   return {data:{state:'claimed',retry_reviewed:true,source_hmac:source,
    chat_hmac:chat,source_sha256:sha,kind:'document',
    mime:'application/pdf',size_bytes:bytes.length,draft:first},error:null};
  if(name==='cotironda_piloto_auto_correlation_retry_prepare_mvp336')
   return {data:{state:'reserved',source_sha256:sha,quote,
    candidates:which==='r2'?[
     candidates[0],{...candidates[1],lines:candidates[1].lines.map((x,i)=>({
      ...x,quantity:quote[i].quantity
     }))}
    ]:candidates,note:null},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
   assert.equal(args.p_source_hmac,source);
   assert.equal(args.p_chat_hmac,chat);
   assert.equal(args.p_source_sha256,sha);
   assert.equal(args.p_request,current,'never bind the closed historical round');
   results.links++;
   return {data:{state:'linked_private'},error:null};
  }
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291'){
   assert.equal(args.p_state,'review');
   assert.equal(args.p_reason,'historical_round_best_fit');
   return {data:{state:'recorded'},error:null};
  }
  if(name==='cotironda_piloto_reserve_archive_replay_mvp292'){
   assert.equal(args.p_source_hmac,source);
   return {data:{state:'reserved',sha256:sha,mime:'application/pdf',
    size_bytes:bytes.length,draft:first},error:null};
  }
  if(name==='cotironda_piloto_record_supplier_media_mvp098')
   return {data:{state:'stored_unverified'},error:null};
  if(name==='cotironda_piloto_compare_supplier_readings_mvp102')
   return {data:{state:'model_readings_match'},error:null};
  if(name==='cotironda_piloto_audit_supplier_amounts_mvp103')
   return {data:{state:'balanced'},error:null};
  if(name==='cotironda_piloto_record_supplier_source_check_mvp106')
   return {data:{state:args.p_state,reason:args.p_reason},error:null};
  if(name==='cotironda_piloto_publish_source_text_mvp107'){
   results.publications++;
   return {data:{state:'published_anonymous'},error:null};
  }
  if(name==='cotironda_piloto_finish_archive_replay_mvp292'){
   assert.equal(args.p_state,privateSourceCovered?'published':'review');
   return {data:{state:'recorded'},error:null};
  }
  if(name==='cotironda_piloto_finish_auto_recovery_mvp292'){
   assert.equal(args.p_state,which==='r2'?'review':'linked');
   return {data:{state:'recorded'},error:null};
  }
  throw Error('Unexpected simulated RPC: '+name);
 };
 const result=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'fake-synthetic-access-key-only',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  rpc,shaText:async()=>{throw Error('should not hash text')},
  decrypt:async()=>{throw Error('no supplier text')},
  download:async(path)=>{
   assert.equal(path,'media/'+source);
   return {data:new Blob([bytes]),error:null};
  },
  readDocument:async()=>{results.reads++;return structuredClone(first)},
  correlate:args=>correlacionAutomaticaMvp291({
   ...args,
   compare:async()=>{
    results.comparisons++;
    return suggestion(which);
   }
  }),
  replay:async args=>{
   results.replays++;
   assert.equal(args.corroborationSha256,sha);
   assert.deepEqual(args.corroboration,first);
   return reprocesarOriginalHistoricoMvp292({
    ...args,
    sourceCheck:async (file,orig,corroborated)=>{
     results.verifiers++;
     assert.equal(file.sha256,sha);
     assert.deepEqual(orig,first);
     assert.deepEqual(corroborated,first);
     return {state:privateSourceCovered?'source_text_covered':'source_review_required',
      reason:privateSourceCovered?'covered':'original_has_unmapped_commercial_rows',
      sourceSha256:sha,lines:3};
    }
   });
  }
 });
 return {result,calls,results};
}
test('MVP351 circuit: two historical rounds, unique private bind, source-covered balanced PDF, anonymous publication',async()=>{
 const {result,calls,results}=await run(true);
 assert.equal(result.state,'linked_private');
 assert.equal(result.reason,'archive_quote_published_anonymous');
 assert.equal(result.outboundMessages,0);
 assert.equal(results.reads,1);
 assert.equal(results.comparisons,2);
 assert.equal(results.links,1);
 assert.equal(results.replays,1);
 assert.equal(results.verifiers,1);
 assert.equal(results.publications,1);
 assert.ok(calls.includes('cotironda_piloto_publish_source_text_mvp107'));
 assert.equal(first.lines[0].unit,null,'the supplier original must not be reinterpreted');
});
test('MVP351 circuit: covered materials DO NOT imply covered prices or commercial terms',async()=>{
 const {result,calls,results}=await run(false);
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'archive_quote_economic_or_source_review_required');
 assert.equal(result.outboundMessages,0);
 assert.equal(results.links,1);
 assert.equal(results.comparisons,2);
 assert.equal(results.verifiers,1);
 assert.equal(results.publications,0);
 assert.ok(!calls.includes('cotironda_piloto_publish_source_text_mvp107'));
});
test('MVP351 circuit: better historical closed fit never binds or calls economic replay',async()=>{
 const {result,calls,results}=await run(false,'r2');
 assert.equal(result.state,'review_required');
 assert.equal(result.outboundMessages,0);
 assert.equal(results.links,0);
 assert.equal(results.replays,0);
 assert.equal(results.publications,0);
 assert.equal(results.comparisons,2);
 assert.ok(!calls.includes('cotironda_piloto_auto_correlation_bind_mvp291'));
 assert.ok(!calls.includes('cotironda_piloto_reserve_archive_replay_mvp292'));
});

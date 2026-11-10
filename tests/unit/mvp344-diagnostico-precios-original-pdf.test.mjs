import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reprocesarOriginalHistoricoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts';

const H='a'.repeat(64),C='b'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const draft={
 kind:'supplier_quote',status:'review_required',
 delivery_city:null,
 requested_delivery_note:'Contado. Flete a convenir.',
 lines:[
  {original_description:'Cemento CPC',quantity:'15,00',unit:null,
   unit_price:'$ 100,00',line_total:'$ 1700,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Arena',quantity:'2,00',unit:null,
   unit_price:'$ 300,00',line_total:'$ 500,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Piedra',quantity:'1,00',unit:null,
   unit_price:'$ 450,00',line_total:'$ 300,00',
   evidence_location:'p1',ambiguity:null}
 ],
 total_declared:'$ 2500,00',unanswered:[]
};
function trial(amountState,amountReason,sourceState='source_text_covered'){
 const calls=[],original=JSON.parse(JSON.stringify(draft));
 const args={
  enabled:true,trustedInternalWorker:true,
  sourceHmac:H,chatHmac:C,apiKey:'synthetic-not-real-123456789',
  model:'gpt-6-luna',documentSemanticEnabled:false,
  corroboration:draft,corroborationSha256:sha,
  download:async path=>{
   assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null};
  },
  sourceCheck:async(file,first,second)=>{
   calls.push('independent_source_reader');
   assert.equal(file.sha256,sha);
   assert.deepEqual(first,draft);assert.deepEqual(second,draft);
   return {state:sourceState,reason:sourceState==='source_text_covered'?
    'covered':'uncovered_money',lines:3,sourceSha256:sha,
    sourceVerified:false,publicationAllowed:false,rankingAllowed:false};
  },
  rpc:async(name,params)=>{
   calls.push(name);
   let data;
   if(name==='cotironda_piloto_reserve_archive_replay_mvp292')
    data={state:'reserved',sha256:sha,mime:'application/pdf',
     size_bytes:bytes.length,draft};
   else if(name==='cotironda_piloto_record_supplier_media_mvp098')
    data={state:'stored_unverified'};
   else if(name==='cotironda_piloto_compare_supplier_readings_mvp102')
    data={state:'model_readings_match'};
   else if(name==='cotironda_piloto_audit_supplier_amounts_mvp103')
    data={state:amountState,reason:amountReason};
   else if(name==='cotironda_piloto_record_supplier_source_check_mvp106')
    data={state:sourceState};
   else if(name==='cotironda_piloto_publish_source_text_mvp107')
    data={state:'published_anonymous',ranking_allowed:false};
   else if(name==='cotironda_piloto_finish_archive_replay_mvp292'){
    if(amountState==='difference'){
     assert.equal(params.p_state,'review');
     assert.equal(params.p_reason,'unit_price_source_recheck_required');
    }else if(sourceState!=='source_text_covered'){
     assert.equal(params.p_state,'review');
     assert.equal(params.p_reason,'source_or_amounts_unverified');
    }else assert.equal(params.p_state,'published');
    data={state:'recorded'};
   }else throw Error('unexpected_RPC_'+name);
   return {data,error:null};
  }
 };
 return {args,calls,original};
}
test('MVP344: 3 contradicciones unitario/importe no se publican ni se corrigen por cálculo inverso',async()=>{
 const t=trial('difference','line_multiplication_mismatch');
 const r=await reprocesarOriginalHistoricoMvp292(t.args);
 assert.equal(r.state,'review_required');
 assert.equal(r.reason,'unit_price_source_recheck_required');
 assert.equal(r.outboundMessages,0);
 assert.equal(t.calls.includes('cotironda_piloto_publish_source_text_mvp107'),false);
 assert.equal(t.calls.includes('independent_source_reader'),true);
 assert.equal(t.calls.at(-1),'cotironda_piloto_finish_archive_replay_mvp292');
 assert.deepEqual(draft,t.original);
});
test('MVP344: fuente con importes no corroborados nunca publica, aunque suma coincida',async()=>{
 const t=trial('balanced','balanced','needs_source_review');
 const r=await reprocesarOriginalHistoricoMvp292(t.args);
 assert.equal(r.state,'review_required');
 assert.equal(r.outboundMessages,0);
 assert.equal(t.calls.includes('cotironda_piloto_publish_source_text_mvp107'),false);
});
test('MVP344: prueba positiva no cambia puertas de publicación existentes',async()=>{
 const t=trial('balanced','balanced');
 const r=await reprocesarOriginalHistoricoMvp292(t.args);
 assert.equal(r.state,'published_private');
 assert.equal(r.outboundMessages,0);
 assert.ok(t.calls.indexOf('cotironda_piloto_publish_source_text_mvp107')>
  t.calls.indexOf('cotironda_piloto_record_supplier_source_check_mvp106'));
});

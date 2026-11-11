import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {diagnosticarPdfHistoricoB5h} from
 '../../src/domain/presupuestos-v2/worker-diagnostico-total-b5h.ts';
const source='e'.repeat(64);
const original=new TextEncoder().encode('%PDF-1.7\n'+'x'.repeat(220)+'\n%%EOF\n');
const sha=createHash('sha256').update(original).digest('hex');
const quote={
 document_kind:'supplier_quote',
 lines:[{ordinal:1,kind:'material',
   original_line_raw:'40,00 Cemento CPC $9.798,58 22.4% $304.148,00',
   original_description_raw:'Cemento CPC',
   quantity_raw:'40,00',unit_raw:null,
   unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
   line_total_raw:'$304.148,00',source_location_raw:'página 1'}],
 total_declared_raw:'$304.148,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]
};
const claim={state:'claimed',source_hmac:source,source_sha256:sha,
 size_bytes:original.length,processor_version:'v2_b5h_20261111',
 historic_candidate:quote};
const rows=[
 {page:1,text:'Cantidad Descripción Unitario Dscto. Total',
  y:740,parts:[{x:20,text:'Cantidad'},{x:80,text:'Descripción'},
   {x:340,text:'Unitario'},{x:430,text:'Dscto.'},{x:540,text:'Total'}]},
 {page:1,text:'40,00 Cemento CPC $9.798,58 22.4% $304.148,00',
  y:720,parts:[{x:20,text:'40,00'},{x:80,text:'Cemento CPC'},
   {x:340,text:'$9.798,58'},{x:430,text:'22.4%'},
   {x:540,text:'$304.148,00'}]},
 {page:1,text:'TOTAL GENERAL 304.148,00',y:650}
];
async function run({claimResponse=claim,bytes=original,sourceRows=rows,
 failReader=false,finish={state:'recorded'}}={}){
 const calls=[];let recorded;
 const result=await diagnosticarPdfHistoricoB5h({
  enabled:true,trustedInternalWorker:true,
  rpc:async(name,args={})=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_v2_total_b5h')
    return {data:claimResponse,error:null};
   if(name==='cotironda_piloto_finish_v2_total_b5h'){
    recorded=args;return {data:finish,error:null};
   }
   throw Error('Unexpected RPC '+name);
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'cotironda-piloto-originals');
   return {download:async path=>{
    assert.equal(path,'media/'+source);
    calls.push('download');
    return {data:new Blob([bytes]),error:null};
   }};
  }},
  readPdfEvidence:async b=>{
   calls.push('pdf');assert.deepEqual(b,original);
   if(failReader)throw Error('private customer info');
   return {pages:1,rows:sourceRows,scanned:false};
  }
 });
 return {result,calls,recorded};
}
test('B5h: new version checks same SHA, reads PDF once and writes diagnostic only',async()=>{
 const {result,calls,recorded}=await run();
 assert.equal(result.state,'private_diagnosed');
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_v2_total_b5h','download','pdf',
  'cotironda_piloto_finish_v2_total_b5h']);
 assert.equal(recorded.p_state,'private_diagnosed');
 assert.equal(recorded.p_diagnostics.code,'same_row_corresponds_private');
 assert.equal(recorded.p_diagnostics.matched_lines,1);
 assert.equal(recorded.p_diagnostics.expected_lines,1);
 assert.equal(recorded.p_diagnostics.source_verified,false);
 assert.equal(recorded.p_diagnostics.can_publish,false);
 assert.equal(recorded.p_diagnostics.can_rank,false);
 assert.equal(result.publishedOffers,0);
 assert.equal(result.outboundMessages,0);
 assert.ok(!JSON.stringify(recorded.p_diagnostics).includes('Cemento'));
});
test('B5h: total missing yields precise code and never false financial approval',async()=>{
 const {result,recorded}=await run({sourceRows:rows.slice(0,2)});
 assert.equal(result.state,'private_diagnosed');
 assert.equal(recorded.p_diagnostics.code,'unlabeled_amount_found');
 assert.equal(recorded.p_diagnostics.proof_reason,'source_total_unverified');
 assert.equal(result.sourceVerified,false);
});
test('B5h: a PDF whose line does not match fails closed',async()=>{
 const {result,recorded}=await run({sourceRows:[rows[0],rows[2]]});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_diagnostics,null);
 assert.equal(recorded.p_reason_code,'b5h_original_not_verified');
});
test('B5h: source SHA mismatch never reaches PDF parser',async()=>{
 const corrupted=Uint8Array.from(original);corrupted[100]^=1;
 const {result,calls,recorded}=await run({bytes:corrupted});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_reason_code,'b5h_sha_mismatch');
 assert.ok(!calls.includes('pdf'));
});
test('B5h: replay without a claim cannot download originals',async()=>{
 const {result,calls}=await run({claimResponse:{state:'empty'}});
 assert.equal(result.state,'empty');
 assert.deepEqual(calls,['cotironda_piloto_claim_v2_total_b5h']);
});
test('B5h: flag off has no RPC, storage or economic effects',async()=>{
 let called=0;
 const result=await diagnosticarPdfHistoricoB5h({
  enabled:false,trustedInternalWorker:true,
  rpc:async()=>{called++;throw Error('not called')},
  storage:{from:()=>{called++;throw Error('not called')}}
 });
 assert.equal(result.state,'disabled');assert.equal(called,0);
});
test('B5h: untrusted source identifier cannot influence Storage path',async()=>{
 let downloads=0;
 const result=await diagnosticarPdfHistoricoB5h({
  enabled:true,trustedInternalWorker:true,
  rpc:async()=>({data:{...claim,source_hmac:'../../danger'},error:null}),
  storage:{from:()=>{downloads++;throw Error('not called')}}
 });
 assert.equal(result.reason,'claim_invalid');assert.equal(downloads,0);
});
test('B5h: PDF parser errors never leak sensitive text to caller',async()=>{
 const {result,recorded}=await run({failReader:true});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(recorded.p_reason_code,'b5h_read_uncertain');
 assert.equal(recorded.p_diagnostics,null);
 assert.ok(!JSON.stringify(result).includes('customer'));
});
test('B5h: DB finish not confirmed must not pretend success',async()=>{
 const {result}=await run({finish:{state:'not_leased'}});
 assert.equal(result.state,'reconciliation_required');
});

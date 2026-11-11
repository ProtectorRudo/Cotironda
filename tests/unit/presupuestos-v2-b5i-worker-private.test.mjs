import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {diagnosticarGeometriaHistoricaB5i} from
 '../../src/domain/presupuestos-v2/worker-geometria-total-b5i.ts';
const source='a'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.7\n'+'x'.repeat(210)+'\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const lines=[
 {ordinal:1,kind:'material',original_line_raw:'40,00 Cemento CPC $100,00 $4.000,00',
  original_description_raw:'Cemento CPC',quantity_raw:'40,00',
  unit_raw:null,unit_price_raw:'$100,00',unit_price_role:'list_explicit',
  line_total_raw:'$4.000,00',source_location_raw:'página 1'},
 {ordinal:2,kind:'material',original_line_raw:'3,00 Arena Big Bag $200,00 $600,00',
  original_description_raw:'Arena Big Bag',quantity_raw:'3,00',
  unit_raw:null,unit_price_raw:'$200,00',unit_price_role:'list_explicit',
  line_total_raw:'$600,00',source_location_raw:'página 1'}
];
const quote={document_kind:'supplier_quote',lines,
 total_declared_raw:'$4.600,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]};
const claim={state:'claimed',source_hmac:source,source_sha256:sha,
 size_bytes:bytes.length,processor_version:'v2_b5i_20261111',
 historic_candidate:quote};
const row=(y,parts)=>({page:1,y,parts,text:parts.map(x=>x.text).join(' ')});
const cell=(text,x)=>({text,x});
const rows=[
 row(740,[cell('Cant.',20),cell('Descripción',120),
   cell('Unit.',330),cell('Total',520)]),
 row(710,[cell('40,00',20),cell('Cemento CPC',120),
   cell('$100,00',330),cell('$4.000,00',520)]),
 row(680,[cell('3,00',20),cell('Arena Big Bag',120),
   cell('$200,00',330),cell('$600,00',520)]),
 row(630,[cell('4.600,00',520)])
];
async function exercise({claimed=claim,original=bytes,sourceRows=rows,
  onFinish={state:'recorded'},badReader=false}={}){
 const calls=[];let recorded;
 const result=await diagnosticarGeometriaHistoricaB5i({
  enabled:true,trustedInternalWorker:true,
  rpc:async(name,params={})=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_v2_geometry_b5i')
    return {data:claimed,error:null};
   if(name==='cotironda_piloto_finish_v2_geometry_b5i'){
    recorded=params;return {data:onFinish,error:null};
   }
   throw Error('bad_rpc');
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'cotironda-piloto-originals');
   return {download:async path=>{
    assert.equal(path,'media/'+source);
    calls.push('download');
    return {data:new Blob([original]),error:null};
   }}
  }},
  readPdfEvidence:async data=>{
   calls.push('pdf');
   if(badReader)throw Error('private customer phone number');
   assert.deepEqual(data,bytes);
   return {scanned:false,pages:1,rows:sourceRows};
  }
 });
 return {result,calls,recorded};
}
test('B5i: historical PDF SHA checks and stores only versioned categorical geometry',async()=>{
 const {result,calls,recorded}=await exercise();
 assert.equal(result.state,'private_diagnosed');
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_v2_geometry_b5i','download','pdf',
  'cotironda_piloto_finish_v2_geometry_b5i']);
 assert.equal(recorded.p_state,'private_diagnosed');
 assert.equal(recorded.p_diagnostics.code,'amount_after_material_table');
 assert.equal(recorded.p_diagnostics.column,'aligned_material_total');
 assert.equal(recorded.p_diagnostics.expected_lines,2);
 assert.equal(recorded.p_diagnostics.matched_lines,2);
 assert.equal(recorded.p_diagnostics.source_verified,false);
 assert.equal(recorded.p_diagnostics.can_publish,false);
 assert.equal(recorded.p_diagnostics.can_rank,false);
 assert.equal(result.publishedOffers,0);
 assert.equal(result.outboundMessages,0);
 assert.ok(!JSON.stringify(recorded.p_diagnostics).includes('4.600'));
});
test('B5i: missing final amount is a review hint, never fabricated',async()=>{
 const {result,recorded}=await exercise({sourceRows:rows.slice(0,-1)});
 assert.equal(result.state,'private_diagnosed');
 assert.equal(recorded.p_diagnostics.code,'amount_absent');
 assert.equal(recorded.p_diagnostics.proof_reason,'source_total_unverified');
});
test('B5i: ambiguous unmatched material line refuses diagnostic claim',async()=>{
 const {result,recorded}=await exercise({sourceRows:[rows[0],rows[1],rows[3]]});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_diagnostics,null);
 assert.equal(recorded.p_reason_code,'b5i_line_proof_unconfirmed');
});
test('B5i: modified original SHA cannot call PDF parser',async()=>{
 const modified=Uint8Array.from(bytes);modified[120]^=1;
 const {result,calls,recorded}=await exercise({original:modified});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_reason_code,'b5i_sha_mismatch');
 assert.ok(!calls.includes('pdf'));
});
test('B5i: exhausted version cannot open Storage or re-run other workers',async()=>{
 const {result,calls}=await exercise({claimed:{state:'empty'}});
 assert.equal(result.state,'empty');
 assert.deepEqual(calls,['cotironda_piloto_claim_v2_geometry_b5i']);
});
test('B5i: flag OFF prevents RPC and Storage access',async()=>{
 let called=0;
 const r=await diagnosticarGeometriaHistoricaB5i({
  enabled:false,trustedInternalWorker:true,
  rpc:async()=>{called++;throw Error('unexpected')},
  storage:{from:()=>{called++;throw Error('unexpected')}}
 });
 assert.equal(r.state,'disabled');assert.equal(called,0);
});
test('B5i: forged path does not cause Storage traversal',async()=>{
 let called=0;
 const r=await diagnosticarGeometriaHistoricaB5i({
  enabled:true,trustedInternalWorker:true,
  rpc:async()=>({data:{...claim,source_hmac:'../../sensitive'},error:null}),
  storage:{from:()=>{called++;throw Error('unexpected')}}
 });
 assert.equal(r.reason,'claim_invalid');assert.equal(called,0);
});
test('B5i: failures never leak PII to Edge',async()=>{
 const {result,recorded}=await exercise({badReader:true});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(recorded.p_reason_code,'b5i_read_uncertain');
 assert.equal(recorded.p_diagnostics,null);
 assert.ok(!JSON.stringify(result).includes('phone'));
});
test('B5i: an unconfirmed DB finish cannot pretend success',async()=>{
 const {result}=await exercise({onFinish:{state:'not_leased'}});
 assert.equal(result.state,'reconciliation_required');
});

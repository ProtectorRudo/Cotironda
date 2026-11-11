import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reauditarPdfHistoricoB5g} from
 '../../src/domain/presupuestos-v2/worker-reauditoria-pdf-b5g.ts';

const source='a'.repeat(64);
const original=new TextEncoder().encode('%PDF-1.7\n'+'x'.repeat(205)+'\n%%EOF\n');
const sha=createHash('sha256').update(original).digest('hex');
const line={
 ordinal:1,kind:'material',
 original_line_raw:'40,00 Cemento CPC $9.798,58 22.4% $304.148,00',
 original_description_raw:'Cemento CPC',quantity_raw:'40,00',unit_raw:null,
 unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
 line_total_raw:'$304.148,00',source_location_raw:'página 1'
};
const candidate={document_kind:'supplier_quote',lines:[line],
 total_declared_raw:'$304.148,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]};
const claim={state:'claimed',source_hmac:source,source_sha256:sha,
 size_bytes:original.length,processor_version:'v2_b5g_20261111',
 historic_candidate:candidate};
const rows=[
 {page:1,text:'Cantidad  Descripción  Unitario  Dscto.  Total',
  y:730,parts:[{x:20,text:'Cantidad'},{x:80,text:'Descripción'},
   {x:340,text:'Unitario'},{x:430,text:'Dscto.'},
   {x:540,text:'Total'}]},
 {page:1,text:'40,00 Cemento CPC $9.798,58 22.4% $304.148,00',
  y:700,parts:[{x:20,text:'40,00'},{x:80,text:'Cemento CPC'},
   {x:340,text:'$9.798,58'},{x:430,text:'22.4%'},
   {x:540,text:'$304.148,00'}]},
 {page:1,text:'TOTAL GENERAL 304.148,00',y:650}
];
async function exec({v=claim,bytes=original,sourceRows=rows,
 onFinish={state:'recorded'},readError=false}={}){
 const calls=[];let recorded=null;
 const result=await reauditarPdfHistoricoB5g({
  enabled:true,trustedInternalWorker:true,
  rpc:async(name,params={})=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_v2_pdf_b5g')
    return {data:v,error:null};
   if(name==='cotironda_piloto_finish_v2_pdf_b5g'){
    recorded=params;return {data:onFinish,error:null};
   }
   throw Error('Wrong RPC');
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
   calls.push('pdf');
   if(readError)throw Error('private customer 1122334455');
   assert.deepEqual(b,original);
   return {rows:sourceRows,pages:1,scanned:false};
  }
 });
 return {result,calls,recorded};
}
test('B5g: read EXACT historical source once, no OpenAI or WhatsApp',async()=>{
 const {result,calls,recorded}=await exec();
 assert.equal(result.state,'private_source_observed');
 assert.equal(result.outboundMessages,0);
 assert.equal(result.publishedOffers,0);
 assert.equal(result.sourceVerified,false);
 assert.equal(result.canRank,false);
 assert.equal(result.canRevealContacts,false);
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_v2_pdf_b5g','download','pdf',
  'cotironda_piloto_finish_v2_pdf_b5g']);
 assert.equal(recorded.p_state,'private_source_observed');
 assert.equal(recorded.p_diagnostics[0].source_total_b5,'unique_source_total');
 assert.equal(recorded.p_diagnostics[0].source_discount_b5,'aligned_header');
 assert.equal(recorded.p_diagnostics[0].arithmetic_b5,'matched_arithmetic_unverified');
 assert.equal(recorded.p_diagnostics[0].source_verified,false);
 assert.equal(recorded.p_diagnostics[0].can_publish,false);
});
test('B5g: no total in source remains REVIEW, does not silently certify',async()=>{
 const {result,recorded}=await exec({sourceRows:rows.slice(0,2)});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_diagnostics[0].source_reason_b5,'source_total_unverified');
 assert.equal(recorded.p_diagnostics[0].source_discount_b5,'aligned_header');
 assert.equal(result.canRank,false);
});
test('B5g: changed PDF sha does not read PDF or write an audited result',async()=>{
 const bad=Uint8Array.from(original);bad[bad.length-3]^=1;
 const {result,calls,recorded}=await exec({bytes:bad});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_state,'review');
 assert.equal(recorded.p_reason_code,'b5g_sha_mismatch');
 assert.equal(recorded.p_diagnostics,null);
 assert.ok(!calls.includes('pdf'));
});
test('B5g: no historical work returns EMPTY without opening archive',async()=>{
 const {result,calls}=await exec({v:{state:'empty'}});
 assert.equal(result.state,'empty');
 assert.deepEqual(calls,['cotironda_piloto_claim_v2_pdf_b5g']);
});
test('B5g: V2 flag off prevents all RPC/storage side effects',async()=>{
 let invoked=0;
 const r=await reauditarPdfHistoricoB5g({
  enabled:false,trustedInternalWorker:true,
  rpc:async()=>{invoked++;throw Error('must not call')},
  storage:{from:()=>{invoked++;throw Error('must not call')}}
 });
 assert.equal(r.state,'disabled');assert.equal(invoked,0);
});
test('B5g: forged archive source path rejected before any download',async()=>{
 let storageUsed=0;
 const r=await reauditarPdfHistoricoB5g({
  enabled:true,trustedInternalWorker:true,
  rpc:async()=>({data:{...claim,source_hmac:'../../customer'},error:null}),
  storage:{from:()=>{storageUsed++;throw Error('never')}}
 });
 assert.equal(r.reason,'claim_invalid');
 assert.equal(storageUsed,0);
});
test('B5g: private PDF parser errors cannot expose personal text',async()=>{
 const {result,recorded}=await exec({readError:true});
 assert.equal(result.state,'review_required');
 assert.equal(recorded.p_reason_code,'b5g_source_review_required');
 assert.equal(recorded.p_diagnostics[0].source_reason_b5,'reader_unavailable');
 assert.ok(!JSON.stringify(recorded).includes('1122334455'));
});
test('B5g: failed database finish cannot be reported as success',async()=>{
 const {result}=await exec({onFinish:{state:'not_leased'}});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.reason,'finish_unconfirmed');
});

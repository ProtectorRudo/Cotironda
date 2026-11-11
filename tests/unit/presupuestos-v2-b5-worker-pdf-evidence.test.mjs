import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarSombraArchivadaV2} from
 '../../src/domain/presupuestos-v2/worker-archivo-sombra.ts';

const H='a'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.7\n'+'0'.repeat(220)+'\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const line={
 ordinal:1,kind:'material',
 original_line_raw:'2 bolsas Cemento CPC 50 kg $2.000,00 $4.000,00',
 original_description_raw:'Cemento CPC 50 kg',
 quantity_raw:'2',unit_raw:'bolsas',unit_price_raw:'$2.000,00',
 unit_price_role:'effective_explicit',
 line_total_raw:'$4.000,00',source_location_raw:'página 1'
};
const document={
 document_kind:'supplier_quote',lines:[line],
 total_declared_raw:'$4.000,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]
};
const row={page:1,text:line.original_line_raw};
const total={page:1,text:'TOTAL GENERAL $4.000,00'};
const diag=[{ordinal:1,state:'extracted_pending_source_check',
 reason:'field_present_not_source_verified'}];
async function processPdf({rows=[row,total],throwReader=false,attach=true}={}){
 const events=[];
 const rpc=async(name,args)=>{
  events.push({name,args});
  if(name==='cotironda_piloto_claim_v2_shadow_b2')
   return {data:{state:'claimed',source_hmac:H,source_sha256:sha,
    mime:'application/pdf',size_bytes:bytes.length,
    processor_version:'v2_b2_20261110'},error:null};
  if(name==='cotironda_piloto_finish_v2_shadow_b2')
   return {data:{state:'recorded'},error:null};
  throw Error('unexpected RPC');
 };
 const storage={from:bucket=>{
  assert.equal(bucket,'cotironda-piloto-originals');
  return {download:async path=>{
   assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null};
  }};
 }};
 const result=await procesarSombraArchivadaV2({
  enabled:true,trustedInternalWorker:true,rpc,storage,
  apiKey:'sk-'+'x'.repeat(32),model:'gpt-6.1-sol',
  read:async args=>{
   events.push({name:'model'});
   assert.equal(args.sha256,sha);
   return {state:'private_extraction_unverified',code:'candidate_only',
    mode:'pdf_visual',document,line_diagnostics:diag,
    source_sha256:sha,completeness:'model_reported_complete',
    always_private:true,can_publish:false,can_rank:false,
    outbound_messages:0};
  },
  ...(attach?{readPdfEvidence:async original=>{
   events.push({name:'source_pdf'});
   assert.deepEqual(original,bytes);
   if(throwReader)throw Error('private PDF unreadable');
   return {rows,pages:1,scanned:false};
  }}:{})
 });
 const persisted=events.find(e=>e.name==='cotironda_piloto_finish_v2_shadow_b2')?.args;
 return {result,events,persisted};
}

test('B5 wiring: PDF original and arithmetic checked in worker, still private',async()=>{
 const {result,persisted,events}=await processPdf();
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'shadow_pdf_rows_correspond_private');
 assert.equal(result.publishedOffers,0);
 assert.equal(result.outboundMessages,0);
 assert.deepEqual(events.map(e=>e.name),[
  'cotironda_piloto_claim_v2_shadow_b2','model','source_pdf',
  'cotironda_piloto_finish_v2_shadow_b2'
 ]);
 assert.deepEqual(persisted.p_candidate,document);
 assert.equal(persisted.p_line_diagnostics.length,1);
 assert.equal(persisted.p_line_diagnostics[0].source_b5,'source_line_corresponds');
 assert.equal(persisted.p_line_diagnostics[0].source_reason_b5,
  'rows_correspond_but_full_coverage_unchecked');
 assert.equal(persisted.p_line_diagnostics[0].arithmetic_b5,
  'matched_arithmetic_unverified');
 assert.equal(persisted.p_state,'candidate_private');
});

test('B5 wiring: omitted-priced row in PDF is NOT considered covered',async()=>{
 const {result,persisted}=await processPdf({rows:[
  row,{page:1,text:'1 pallet adicional $15.000,00'},total
 ]});
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'shadow_pdf_source_review_required');
 assert.equal(persisted.p_line_diagnostics[0].source_reason_b5,
  'unmapped_source_content');
 assert.equal(result.publishedOffers,0);
});

test('B5 wiring: unseen explicit IVA note blocks source correspondence',async()=>{
 const {result,persisted}=await processPdf({rows:[
  row,{page:1,text:'IVA según factura'},total
 ]});
 assert.equal(result.reason,'shadow_pdf_source_review_required');
 assert.equal(persisted.p_line_diagnostics[0].source_reason_b5,
  'unmapped_source_content');
});

test('B5 wiring: PDF evidence reader errors remain private, no original leaks',async()=>{
 const {result,persisted}=await processPdf({throwReader:true});
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'shadow_pdf_source_review_required');
 assert.equal(persisted.p_line_diagnostics[0].source_reason_b5,
  'reader_unavailable');
 assert.ok(!JSON.stringify(result).includes('private PDF'));
});

test('B5 wiring: absent Edge PDF adapter never silently claims verified source',async()=>{
 const {result,persisted,events}=await processPdf({attach:false});
 assert.equal(result.reason,'shadow_pdf_audit_not_connected');
 assert.ok(!events.some(e=>e.name==='source_pdf'));
 assert.equal(persisted.p_line_diagnostics[0].source_b5,'source_not_checked');
 assert.equal(result.publishedOffers,0);
});

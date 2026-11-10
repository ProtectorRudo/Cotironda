import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarSombraArchivadaV2} from
 '../../src/domain/presupuestos-v2/worker-archivo-sombra.ts';

const H='a'.repeat(64),SHA='f'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const candidate={
 document_kind:'supplier_quote',
 lines:[{ordinal:1,kind:'material',
  original_line_raw:'2 bolsas cemento CPC 50kg $4.000',
  original_description_raw:'Cemento CPC 50kg',
  quantity_raw:'2',unit_raw:'bolsas',unit_price_raw:'$ 2.000',
  unit_price_role:'effective_explicit',
  line_total_raw:'$ 4.000',source_location_raw:'p1:r1'}],
 total_declared_raw:'$ 4.000',currency_declared_raw:null,
 commercial_conditions_raw:[]
};
const diag=[{ordinal:1,state:'extracted_pending_source_check',
 reason:'field_present_not_source_verified'}];
const claim={state:'claimed',source_hmac:H,source_sha256:sha,
 mime:'application/pdf',size_bytes:bytes.length,
 processor_version:'v2_b2_20261110'};
const modelResponse={state:'private_extraction_unverified',code:'candidate_only',
 mode:'pdf_visual',document:candidate,line_diagnostics:diag,
 source_sha256:sha,completeness:'model_reported_complete',
 always_private:true,can_publish:false,can_rank:false,outbound_messages:0};
const base=()=>({
 enabled:true,trustedInternalWorker:true,apiKey:'sk-'+'x'.repeat(32),
 model:'gpt-6.1-sol',
});
const testWorker=async({
 returnedClaim=claim,modelOutput=modelResponse,
 actualBytes=bytes,downloadError=null,recorded={state:'recorded'},
 preventDownload=false,reader
}={})=>{
 const calls=[];
 const rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='cotironda_piloto_claim_v2_shadow_b2')
   return {data:returnedClaim,error:null};
  if(name==='cotironda_piloto_finish_v2_shadow_b2')
   return {data:recorded,error:null};
  throw Error('UNEXPECTED_RPC');
 };
 const storage={from:bucket=>{
  assert.equal(bucket,'cotironda-piloto-originals');
  return {download:async path=>{
   assert.equal(path,'media/'+H);
   if(preventDownload)throw Error('download not allowed');
   return {data:downloadError?null:new Blob([actualBytes]),error:downloadError};
  }};
 }};
 const read=reader??(async args=>{
  calls.push({name:'reader',args:{mime:args.mime,sha:args.sha256}});
  assert.equal(args.sha256,sha);
  assert.equal(args.bytes.length,bytes.length);
  return modelOutput;
 });
 const result=await procesarSombraArchivadaV2({
  ...base(),rpc,storage,read
 });
 return {result,calls};
};

test('V2 B2: reads SHA-verified private PDF once and stores only private candidate',async()=>{
 const {result,calls}=await testWorker();
 assert.deepEqual(result,{
  state:'candidate_private',reason:'shadow_candidate_unverified',
  processed:1,outboundMessages:0,publishedOffers:0
 });
 assert.deepEqual(calls.map(x=>x.name),[
  'cotironda_piloto_claim_v2_shadow_b2','reader',
  'cotironda_piloto_finish_v2_shadow_b2'
 ]);
 const payload=calls[2].args;
 assert.equal(payload.p_source_hmac,H);
 assert.equal(payload.p_source_sha256,sha);
 assert.equal(payload.p_state,'candidate_private');
 assert.equal(payload.p_reason_code,'shadow_candidate_unverified');
 assert.deepEqual(payload.p_candidate,candidate);
 assert.deepEqual(payload.p_line_diagnostics,diag);
 assert.equal(payload.p_completeness,'model_reported_complete');
});
test('V2 B2: duplicate/empty source causes no download or model calls',async()=>{
 const {result,calls}=await testWorker({
  returnedClaim:{state:'empty'},preventDownload:true
 });
 assert.equal(result.state,'empty');
 assert.equal(result.processed,0);
 assert.deepEqual(calls.map(x=>x.name),['cotironda_piloto_claim_v2_shadow_b2']);
});
test('V2 B2: shadow flag disabled means ZERO calls',async()=>{
 let called=0;
 const rpc=async()=>{called++;throw Error('no RPC')};
 const storage={from:()=>{called++;throw Error('no Storage')}};
 const result=await procesarSombraArchivadaV2({
  ...base(),enabled:false,rpc,storage
 });
 assert.equal(result.state,'disabled');
 assert.equal(called,0);
});
test('V2 B2: no trusted worker cannot touch private RPC',async()=>{
 let called=0;
 const out=await procesarSombraArchivadaV2({
  ...base(),trustedInternalWorker:false,
  rpc:async()=>{called++;throw Error('no RPC')},
  storage:{from:()=>{called++;throw Error('no Storage')}}
 });
 assert.equal(out.state,'disabled');assert.equal(called,0);
});
test('V2 B2: altered PDF byte same size fails SHA before any model',async()=>{
 const modified=Uint8Array.from(bytes);
 modified[modified.length-1]^=1;
 const {result,calls}=await testWorker({
  actualBytes:modified,
  reader:async()=>{throw Error('must not read')}
 });
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'shadow_sha_mismatch');
 const names=calls.map(x=>x.name);
 assert.deepEqual(names,[
  'cotironda_piloto_claim_v2_shadow_b2',
  'cotironda_piloto_finish_v2_shadow_b2']);
 assert.equal(calls[1].args.p_candidate,null);
 assert.equal(calls[1].args.p_state,'review');
});
test('V2 B2: file absent or wrong length remains uncertain and never publishes',async()=>{
 for(const val of [
  {downloadError:'storage_fail'},
  {actualBytes:new Uint8Array([1,2,3,4,5,6,7,8])}
 ]){
  const {result,calls}=await testWorker({
   ...val,reader:async()=>{throw Error('no model')}
  });
  assert.equal(result.state,'reconciliation_required');
  assert.equal(result.reason,'shadow_read_uncertain');
  assert.equal(calls.at(-1).args.p_state,'uncertain');
 }
});
test('V2 B2: model returns incomplete 2 lines; preserve private candidate',async()=>{
 const privateDocument={...candidate,lines:[
  candidate.lines[0],{...candidate.lines[0],ordinal:2,
   original_line_raw:'piedra precio ilegible',line_total_raw:null,
   unit_price_raw:null,unit_price_role:'absent'}
 ]};
 const d=[...diag,{ordinal:2,state:'needs_field_review',
  reason:'commercial_amount_missing'}];
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,code:'incomplete_source',
   completeness:'model_reported_incomplete',
   document:privateDocument,line_diagnostics:d}
 });
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'shadow_source_incomplete');
 assert.deepEqual(calls.at(-1).args.p_candidate.lines,privateDocument.lines);
 assert.deepEqual(calls.at(-1).args.p_line_diagnostics,d);
});
test('V2 B2: Excel augmentation NEVER becomes verified even if model says so',async()=>{
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,code:'spreadsheet_requires_cell_audit',
   mode:'spreadsheet_augmented',completeness:'not_checked'}
 });
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'shadow_spreadsheet_requires_audit');
 assert.equal(calls.at(-1).args.p_completeness,'not_checked');
});
test('V2 B2: model attempts can_publish=true -> uncertain, no candidate persisted',async()=>{
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,can_publish:true}
 });
 assert.equal(result.state,'reconciliation_required');
 assert.equal(calls.at(-1).args.p_candidate,null);
 assert.equal(calls.at(-1).args.p_state,'uncertain');
});
test('V2 B2: forged reader candidate is rejected despite claiming privacy',async()=>{
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,
   document:{...candidate,lines:[{...candidate.lines[0],price_invented:'$999'}]}}
 });
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.reason,'shadow_read_uncertain');
 assert.equal(calls.at(-1).args.p_candidate,null);
});
test('V2 B2: worker rebuilds safe line diagnostics instead of trusting injection',async()=>{
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,line_diagnostics:[{
   ordinal:1,state:'extracted_pending_source_check',
   reason:'untrusted_payload'
  }]}
 });
 assert.equal(result.state,'candidate_private');
 assert.deepEqual(calls.at(-1).args.p_line_diagnostics,diag);
});
test('V2 B2: reader review -> persistent private review, no buyer data',async()=>{
 const {result,calls}=await testWorker({
  modelOutput:{...modelResponse,state:'review_required',code:'model_output_invalid',
   document:null,line_diagnostics:[]}
 });
 assert.equal(result.state,'review_required');
 assert.equal(calls.at(-1).args.p_reason_code,'shadow_reader_review_required');
 assert.equal(calls.at(-1).args.p_candidate,null);
});
test('V2 B2: invalid claim or source SHA never uses arbitrary Storage paths',async()=>{
 for(const bad of [
  {...claim,source_hmac:'../../other'},
  {...claim,source_sha256:'not-hex'},
  {...claim,mime:'application/octet-stream'},
  {...claim,size_bytes:-1},
  {...claim,processor_version:'v2_b3_future'}
 ]){
  const {result,calls}=await testWorker({
   returnedClaim:bad,preventDownload:true
  });
  assert.equal(result.state,'reconciliation_required');
  assert.equal(result.reason,'claim_metadata_invalid');
  assert.deepEqual(calls.map(x=>x.name),['cotironda_piloto_claim_v2_shadow_b2']);
 }
});
test('V2 B2: finish uncertainty reported instead of declaring candidate stored',async()=>{
 const {result}=await testWorker({recorded:{state:'not_leased'}});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.reason,'shadow_finish_unconfirmed');
});
test('V2 B2: unexpected exceptions from storage do not leak private text',async()=>{
 const rpc=async(name)=>{
  if(name==='cotironda_piloto_claim_v2_shadow_b2')
   return {data:claim,error:null};
  return {data:{state:'recorded'},error:null};
 };
 const r=await procesarSombraArchivadaV2({
  ...base(),rpc,
  storage:{from:()=>{throw Error('private customer phone 123456789')}}
 });
 assert.equal(r.state,'reconciliation_required');
 assert.ok(!JSON.stringify(r).includes('private customer'));
 assert.equal(r.outboundMessages,0);assert.equal(r.publishedOffers,0);
});
test('V2 B2: RPC error before claim produces no Storage or AI call',async()=>{
 const out=await procesarSombraArchivadaV2({
  ...base(),
  rpc:async()=>({data:null,error:'blocked'}),
  storage:{from:()=>{throw Error('no')}}});
 assert.equal(out.state,'reconciliation_required');
 assert.equal(out.processed,0);
});
test('V2 B2: rate cap from SQL prevents extra reads',async()=>{
 const {result,calls}=await testWorker({
  returnedClaim:{state:'quota'},preventDownload:true
 });
 assert.equal(result.state,'disabled');
 assert.equal(result.reason,'shadow_quota');
 assert.deepEqual(calls.map(x=>x.name),['cotironda_piloto_claim_v2_shadow_b2']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {revisarArchivosVersionadosB5d}
 from '../../src/domain/presupuestos-v2/worker-revision-archivos-b5d.ts';

const H='a'.repeat(64);
const original=new TextEncoder().encode('%PDF-1.7\n'+'0'.repeat(190)+'\n%%EOF\n');
const sha=createHash('sha256').update(original).digest('hex');
const line={
 ordinal:1,kind:'material',
 original_line_raw:'2 bolsas cemento CPC 50 kg $2.000,00 $4.000,00',
 original_description_raw:'cemento CPC 50 kg',
 quantity_raw:'2',unit_raw:'bolsas',
 unit_price_raw:'$2.000,00',unit_price_role:'effective_explicit',
 line_total_raw:'$4.000,00',source_location_raw:'página 1'
};
const doc={
 document_kind:'supplier_quote',lines:[line],
 total_declared_raw:'$4.000,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]
};
const readerRows=[
 {page:1,text:line.original_line_raw},
 {page:1,text:'TOTAL GENERAL $4.000,00'}
];
const fakeModel={state:'private_extraction_unverified',code:'candidate_only',
 mode:'pdf_visual',document:doc,line_diagnostics:[],
 source_sha256:sha,completeness:'model_reported_complete',
 always_private:true,can_publish:false,can_rank:false,outbound_messages:0};
const claim={state:'claimed',source_hmac:H,source_sha256:sha,
 size_bytes:original.length,mime:'application/pdf',
 source_mode:'historical_pdf',processor_version:'v2_b5d_20261110',
 historic_candidate:doc};
async function scenario({
 selected=claim,raw=original,model=fakeModel,includePdf=true,
 rows=readerRows,finish={state:'recorded'},readError=false
}={}){
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_claim_v2_review_b5d')
   return {data:selected,error:null};
  if(name==='cotironda_piloto_finish_v2_review_b5d')
   return {data:finish,error:null};
  throw Error('unexpected rpc');
 };
 const storage={from:b=>{
  assert.equal(b,'cotironda-piloto-originals');
  return {download:async p=>{
   calls.push({name:'download'});
   assert.equal(p,'media/'+H);
   return {data:new Blob([raw]),error:null};
  }};
 }};
 const result=await revisarArchivosVersionadosB5d({
  enabled:true,trustedInternalWorker:true,apiKey:'sk-'+'x'.repeat(30),
  model:'gpt-6.1-sol',rpc,storage,
  read:async a=>{
   calls.push({name:'model'});
   assert.equal(a.sha256,sha);
   if(readError)throw Error('user private text 123456789');
   return model;
  },
  ...(includePdf?{readPdfEvidence:async b=>{
   calls.push({name:'pdf_evidence'});
   assert.deepEqual(b,original);
   return {rows,pages:1,scanned:false};
  }}:{})
 });
 return {result,calls,final:calls.find(c=>c.name==='cotironda_piloto_finish_v2_review_b5d')?.p};
}
test('B5d: audit old private PDF without another model call or message',async()=>{
 const {result,calls,final}=await scenario();
 assert.equal(result.state,'candidate_private');
 assert.equal(result.reason,'b5d_rows_match_not_complete');
 assert.equal(result.publishedOffers,0);
 assert.equal(result.outboundMessages,0);
 assert.equal(result.sourceVerified,false);
 assert.ok(!calls.some(c=>c.name==='model'));
 assert.deepEqual(calls.map(c=>c.name),[
  'cotironda_piloto_claim_v2_review_b5d','download','pdf_evidence',
  'cotironda_piloto_finish_v2_review_b5d']);
 assert.deepEqual(final.p_candidate,doc);
 assert.equal(final.p_diagnostics[0].source_b5,'source_line_corresponds');
 assert.equal(final.p_diagnostics[0].source_verified,false);
 assert.equal(final.p_diagnostics[0].can_publish,false);
});
test('B5d: linked PDF is read, not associated from model text',async()=>{
 const {result,final,calls}=await scenario({selected:{
  ...claim,source_mode:'linked_quote',historic_candidate:null
 }});
 assert.equal(result.state,'candidate_private');
 assert.equal(final.p_state,'candidate_private');
 assert.ok(calls.some(c=>c.name==='model'));
 assert.equal(result.publishedOffers,0);
});
test('B5d: unclaimed pallet in original remains private review',async()=>{
 const {result,final}=await scenario({rows:[
  readerRows[0],{page:1,text:'Pallet $15.000,00'},readerRows[1]
 ]});
 assert.equal(result.reason,'b5d_pdf_review_pending');
 assert.equal(final.p_diagnostics[0].source_reason_b5,'unmapped_source_content');
 assert.equal(final.p_diagnostics[0].can_publish,false);
});
test('B5d: spreadsheet linked source requires cell audit even if AI is confident',async()=>{
 const xl=new TextEncoder().encode('PK'+'.'.repeat(300));
 const xlSha=createHash('sha256').update(xl).digest('hex');
 const modified={...claim,source_mode:'linked_quote',
  historic_candidate:null,mime:
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size_bytes:xl.length,source_sha256:xlSha};
 const rpc=async(name,p)=>name==='cotironda_piloto_claim_v2_review_b5d'
  ?{data:modified,error:null}:
   {data:{state:'recorded'},error:null};
 let saved;
 const out=await revisarArchivosVersionadosB5d({
  enabled:true,trustedInternalWorker:true,rpc:async(n,p)=>{
   if(n==='cotironda_piloto_finish_v2_review_b5d')saved=p;
   return rpc(n,p);
  },
  storage:{from:()=>({download:async()=>({
   data:new Blob([xl]),error:null})})},
  read:async()=>({...fakeModel,source_sha256:xlSha,
   code:'spreadsheet_requires_cell_audit',mode:'spreadsheet_augmented'}),
  apiKey:'sk-'+'x'.repeat(30),model:'gpt-6.1-sol'
 });
 assert.equal(out.reason,'b5d_cell_audit_pending');
 assert.equal(saved.p_diagnostics[0].source_b5,'source_not_checked');
 assert.equal(saved.p_diagnostics[0].source_verified,false);
 assert.equal(out.publishedOffers,0);
});
test('B5d: SHA mismatch never calls IA or PDF reader',async()=>{
 const changed=Uint8Array.from(original);changed[changed.length-1]^=1;
 const {result,calls,final}=await scenario({raw:changed});
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'b5d_sha_mismatch');
 assert.equal(final.p_candidate,null);
 assert.ok(!calls.some(c=>c.name==='model'||c.name==='pdf_evidence'));
});
test('B5d: source with invalid claim never reads Storage',async()=>{
 const result=await revisarArchivosVersionadosB5d({
  enabled:true,trustedInternalWorker:true,
  apiKey:'sk-'+'x'.repeat(30),model:'gpt-6.1-sol',
  rpc:async()=>({data:{...claim,source_hmac:'../../x'},error:null}),
  storage:{from:()=>{throw Error('Storage must not be opened')}}
 });
 assert.equal(result.reason,'claim_metadata_invalid');
 assert.equal(result.processed,1);
});
test('B5d: flag off calls no RPC or Storage',async()=>{
 let count=0;
 const result=await revisarArchivosVersionadosB5d({
  enabled:false,trustedInternalWorker:true,
  apiKey:'sk-'+'x'.repeat(30),model:'gpt-6.1-sol',
  rpc:async()=>{count++;throw Error('unreachable')},
  storage:{from:()=>{count++;throw Error('unreachable')}}
 });
 assert.equal(result.state,'disabled');
 assert.equal(count,0);
});
test('B5d: no source leaves DB history untouched',async()=>{
 let used=0;
 const result=await revisarArchivosVersionadosB5d({
  enabled:true,trustedInternalWorker:true,
  apiKey:'sk-'+'x'.repeat(30),model:'gpt-6.1-sol',
  rpc:async()=>{used++;return {data:{state:'empty'},error:null}},
  storage:{from:()=>{throw Error('no download')}}
 });
 assert.equal(result.state,'empty');assert.equal(used,1);
});
test('B5d: old candidate must be shaped exactly, never blind trusted',async()=>{
 const {result,final}=await scenario({selected:{...claim,
  historic_candidate:{...doc,buyer_phone:'123'}}});
 assert.equal(result.state,'review_required');
 assert.equal(final.p_candidate,null);
});
test('B5d: fake model with publication permission cannot become private candidate',async()=>{
 const {result,final}=await scenario({selected:{...claim,
  source_mode:'linked_quote',historic_candidate:null},
  model:{...fakeModel,can_publish:true}});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(final.p_candidate,null);
});
test('B5d: uncertain DB finish is not declared recorded',async()=>{
 const {result}=await scenario({finish:{state:'not_leased'}});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.reason,'finish_unconfirmed');
});
test('B5d: model error must not leak private message',async()=>{
 const {result,final}=await scenario({selected:{...claim,
  source_mode:'linked_quote',historic_candidate:null},readError:true});
 assert.equal(result.state,'reconciliation_required');
 assert.ok(!JSON.stringify(result).includes('123456789'));
 assert.equal(final.p_state,'uncertain');
 assert.equal(final.p_diagnostics,null);
});

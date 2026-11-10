import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 leerPresupuestoSombraV2,SHADOW_READER_SCHEMA_V2
} from '../../src/domain/presupuestos-v2/lector-sombra.ts';

const key='sk-'+ 'x'.repeat(38);
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const xlsx=new Uint8Array([0x50,0x4b,3,4,1,2,3,4,5,6,7,8,9]);
const docx=Uint8Array.from(xlsx);
const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4,5,6]);
const jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7]);
const txt=new TextEncoder().encode('2 bolsas cemento CPC 50 kg $ 4.000\nFlete a convenir');
const hash=b=>createHash('sha256').update(b).digest('hex');
const line=(ordinal,patch={})=>({
 ordinal,kind:'material',original_line_raw:'2 bolsas de Cemento CPC 50 kg',
 original_description_raw:'Cemento CPC 50 kg',quantity_raw:'2',
 unit_raw:'bolsas',unit_price_raw:'$ 2.000',unit_price_role:'effective_explicit',
 line_total_raw:'$ 4.000',source_location_raw:'Página 1, fila 2',...patch
});
const quote=(lines=[line(1),line(2,{kind:'commercial_note',
 original_line_raw:'Flete a convenir',original_description_raw:'Flete a convenir',
 unit_price_raw:null,unit_price_role:'absent',quantity_raw:null,unit_raw:null,
 line_total_raw:null})])=>({
 document_kind:'supplier_quote',lines,
 total_declared_raw:'$ 4.000',currency_declared_raw:null,
 commercial_conditions_raw:['IVA no informado','Flete a convenir']
});
const completion=(q=quote(),more=false,reason='none')=>({
 status:'completed',output:[{type:'message',role:'assistant',
  content:[{type:'output_text',text:JSON.stringify({
   quote:q,more_content_unread:more,unread_reason:reason
  })}]}]
});
const response=data=>new Response(JSON.stringify(data),{
 status:200,headers:{'Content-Type':'application/json'}});
const opts=(bytes=pdf,mime='application/pdf',extra={})=>({
 enabled:true,trustedInternalWorker:true,
 bytes,mime,sha256:hash(bytes),apiKey:key,model:'gpt-6.1-sol',...extra
});
const observe=(capture={},modelOutput=completion())=>async(url,request)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');
 assert.equal(request.method,'POST');
 assert.equal(request.headers.Authorization,'Bearer '+key);
 const body=JSON.parse(request.body);
 Object.assign(capture,{body});
 return response(modelOutput);
};
test('V2 B1: PDF real-path sends SHA-verified page-aware high-detail file',async()=>{
 const capture={};
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  fetchImpl:observe(capture)
 }));
 assert.equal(r.state,'private_extraction_unverified');
 assert.equal(r.code,'candidate_only');
 assert.equal(r.mode,'pdf_visual');
 assert.equal(r.source_sha256,hash(pdf));
 assert.equal(r.completeness,'model_reported_complete');
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
 assert.equal(r.always_private,true);
 assert.equal(r.outbound_messages,0);
 assert.equal(r.document.lines.length,2);
 assert.equal(r.document.lines[0].original_line_raw,
  '2 bolsas de Cemento CPC 50 kg');
 const b=capture.body;
 assert.equal(b.model,'gpt-6.1-sol');
 assert.equal(b.store,false);
 assert.deepEqual(b.tools,[]);
 assert.equal(b.text.format.type,'json_schema');
 assert.equal(b.text.format.strict,true);
 assert.equal(b.input[1].content[0].type,'input_file');
 assert.equal(b.input[1].content[0].detail,'high');
 assert.equal(b.input[1].content[0].filename,'cotironda-source.pdf');
 assert.equal(b.input[1].content[0].file_data,
  'data:application/pdf;base64,'+Buffer.from(pdf).toString('base64'));
});
test('V2 B1: image route uses vision, not disguised as PDF',async()=>{
 const capture={};
 const r=await leerPresupuestoSombraV2(opts(png,'image/png',{
  fetchImpl:observe(capture)
 }));
 assert.equal(r.state,'private_extraction_unverified');
 assert.equal(r.mode,'image_visual');
 const part=capture.body.input[1].content[0];
 assert.equal(part.type,'input_image');
 assert.equal(part.detail,'high');
 assert.ok(part.image_url.startsWith('data:image/png;base64,'));
 assert.equal(part.filename,undefined);
});
test('V2 B1: JPG visual format is accepted only with matching signature',async()=>{
 const r=await leerPresupuestoSombraV2(opts(jpg,'image/jpeg',{
  fetchImpl:observe()
 }));
 assert.equal(r.mode,'image_visual');
 assert.equal(r.code,'candidate_only');
});
test('V2 B1: XLSX uses correct filename and marks augmentation limitations',async()=>{
 const capture={};
 const r=await leerPresupuestoSombraV2(opts(xlsx,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{
   fetchImpl:observe(capture)
  }));
 assert.equal(r.state,'private_extraction_unverified');
 assert.equal(r.mode,'spreadsheet_augmented');
 assert.equal(r.code,'spreadsheet_requires_cell_audit');
 assert.equal(r.completeness,'not_checked');
 assert.equal(r.can_publish,false);
 assert.equal(capture.body.input[1].content[0].filename,
  'cotironda-source.xlsx');
 assert.equal(capture.body.input[1].content[0].detail,undefined);
});
test('V2 B1: DOCX uses original file data rather than fictional PDF conversion',async()=>{
 const capture={};
 const r=await leerPresupuestoSombraV2(opts(docx,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',{
   fetchImpl:observe(capture)
  }));
 assert.equal(r.mode,'office_text');
 assert.equal(capture.body.input[1].content[0].filename,
  'cotironda-source.docx');
});
test('V2 B1: literal text/CSV not truncated or Excel-augmented',async()=>{
 for(const mime of ['text/plain','text/csv']){
  const capture={};
  const r=await leerPresupuestoSombraV2(opts(txt,mime,{
   fetchImpl:observe(capture)
  }));
  assert.equal(r.mode,'literal_text');
  const part=capture.body.input[1].content[0];
  assert.equal(part.type,'input_text');
  assert.ok(part.text.endsWith(new TextDecoder().decode(txt)));
  assert.ok(!capture.body.input[1].content.some(x=>x.type==='input_file'));
 }
});
test('V2 B1: model reports unread page; candidate stays private and partial',async()=>{
 const q=quote([line(1),line(2,{unit_price_raw:null,
  unit_price_role:'unknown',line_total_raw:null})]);
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  fetchImpl:observe({},completion(q,true,'unreadable_pages'))
 }));
 assert.equal(r.state,'private_extraction_unverified');
 assert.equal(r.code,'incomplete_source');
 assert.equal(r.completeness,'model_reported_incomplete');
 assert.equal(r.document.lines.length,2);
 assert.equal(r.line_diagnostics[1].reason,'commercial_amount_missing');
 assert.equal(r.can_publish,false);
});
test('V2 B1: source-required fields remain null and prices are not inferred',async()=>{
 const q=quote([line(1,{unit_raw:null,unit_price_raw:'$ 48.000',
  unit_price_role:'list_explicit',line_total_raw:'$ 72.000'})]);
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  fetchImpl:observe({},completion(q))
 }));
 assert.equal(r.document.lines[0].unit_raw,null);
 assert.equal(r.document.lines[0].unit_price_role,'list_explicit');
 assert.equal(r.document.lines[0].line_total_raw,'$ 72.000');
 assert.equal(r.can_rank,false);
});
test('V2 B1: disabled, non-internal worker and wrong API key never reach network',async()=>{
 let called=0;
 const fetchImpl=async()=>{called++;throw Error('should not happen')};
 for(const extra of [
  {enabled:false},
  {trustedInternalWorker:false},
  {apiKey:'sk-too-short'},
  {model:'some-outdated-model'}
 ]){
  const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
   ...extra,fetchImpl
  }));
  assert.equal(r.document,null);
  assert.equal(r.can_publish,false);
 }
 assert.equal(called,0);
});
test('V2 B1: invalid SHA and tampering never call AI or touch supplier',async()=>{
 let called=0;
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  sha256:'0'.repeat(64),
  fetchImpl:async()=>{called++;throw Error('should not happen')}
 }));
 assert.equal(r.state,'review_required');
 assert.equal(r.code,'sha_mismatch');
 assert.equal(called,0);
});
test('V2 B1: forged MIME, unsupported file and malformed input fail closed',async()=>{
 let called=0;
 const fetchImpl=async()=>{called++;throw Error('no calls')};
 for(const [bytes,mime,expected] of [
  [pdf,'image/png','invalid_file'],
  [pdf,'application/octet-stream','unsupported_mime'],
  [pdf,'toString','unsupported_mime'],
  [txt,'application/pdf','invalid_file'],
  [new Uint8Array([1,2,3]),'application/pdf','invalid_file']
 ]){
  const r=await leerPresupuestoSombraV2(opts(bytes,mime,{fetchImpl}));
  assert.equal(r.state,'review_required');
  assert.equal(r.code,expected);
 }
 assert.equal(called,0);
});
test('V2 B1: malformed UTF-8 rejects without remote request',async()=>{
 const data=new Uint8Array([0xc3,0x28,0xff,0x01,0x02,0x03,0x04,0x05]);
 let called=0;
 const r=await leerPresupuestoSombraV2(opts(data,'text/plain',{
  fetchImpl:async()=>{called++;return response(completion())}
 }));
 assert.equal(r.code,'invalid_utf8');
 assert.equal(called,0);
});
test('V2 B1: model invented fields and missing row keys are not publishable',async()=>{
 let calls=0;
 for(const q of [
  {...quote(),buyer_phone:'any'},
  quote([line(1,{unit_price_role:'discounted_inferred'})]),
  quote([line(1,{original_description_raw:99})])
 ]){
  const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
   fetchImpl:async()=>{calls++;return response(completion(q))}
  }));
  assert.equal(r.state,'review_required');
  assert.equal(r.code,'model_output_invalid');
  assert.equal(r.document,null);
 }
 assert.equal(calls,3);
});
test('V2 B1: incomplete/invalid/refusal upstream never masquerade as verified',async()=>{
 for(const output of [
  {status:'incomplete',output:[]},
  {status:'completed',output:[]},
  {status:'completed',output:[{type:'message',role:'assistant',
   content:[{type:'refusal',refusal:'no'}]}]},
  {status:'completed',output:[{type:'message',role:'assistant',
   content:[{type:'output_text',text:'not JSON'}]}]}
 ]){
  const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
   fetchImpl:async()=>response(output)
  }));
  assert.equal(r.state,'review_required');
  assert.equal(r.document,null);
 }
});
test('V2 B1: inconsistent completeness flag is treated as invalid output',async()=>{
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  fetchImpl:observe({},completion(quote(),true,'none'))
 }));
 assert.equal(r.code,'upstream_response_invalid');
});
test('V2 B1: HTTP 429, network timeout and bad responses never leak secrets',async()=>{
 for(const fetchImpl of [
  async()=>new Response('',{status:429}),
  async()=>{throw Error('secret_pdf_and_supplier_details')},
  async()=>{const e=new Error('timeout has data');e.name='TimeoutError';throw e},
  async()=>new Response('x'.repeat(800001),{status:200})
 ]){
  const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
   fetchImpl
  }));
  assert.equal(r.state,'review_required');
  assert.equal(r.document,null);
  assert.ok(!JSON.stringify(r).includes('secret_pdf'));
  assert.equal(r.outbound_messages,0);
 }
});
test('V2 B1: 0 line model candidate never shown as a valid offer',async()=>{
 const r=await leerPresupuestoSombraV2(opts(pdf,'application/pdf',{
  fetchImpl:observe({},completion(quote([])))
 }));
 assert.equal(r.state,'review_required');
 assert.equal(r.code,'no_material_lines');
 assert.equal(r.can_publish,false);
});
test('V2 B1: source JSON strict, noncommercial and no hidden identity fields',()=>{
 const schema=SHADOW_READER_SCHEMA_V2;
 assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.required,['quote','more_content_unread','unread_reason']);
 assert.equal(schema.properties.quote.additionalProperties,false);
 assert.equal(schema.properties.quote.properties.lines.items.additionalProperties,false);
 for(const forbidden of ['phone','supplier_contact','buyer_identity','ranking']){
  assert.equal(JSON.stringify(schema).includes(forbidden),false);
 }
});

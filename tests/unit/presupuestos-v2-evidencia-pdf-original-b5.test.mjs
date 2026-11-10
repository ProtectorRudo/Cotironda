import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {comprobarRenglonesPdfOriginalB5} from
 '../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';

const bytes=new TextEncoder().encode('%PDF-1.7\n'+
 '0'.repeat(220)+'\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const m=(ordinal,patch={})=>({
 ordinal,kind:'material',
 original_line_raw:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00',
 original_description_raw:'cemento avellaneda x 25 kg',
 quantity_raw:'40,00',unit_raw:null,
 unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
 line_total_raw:'$304.148,00',source_location_raw:'página 1',...patch
});
const quote=(lines=[m(1)],patch={})=>({
 document_kind:'supplier_quote',lines,
 total_declared_raw:'$304.148,00',currency_declared_raw:'$',
 commercial_conditions_raw:[],...patch
});
const pageRows=[
 {page:1,text:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00'},
 {page:1,text:'TOTAL GENERAL $304.148,00'}
];
const reader=(rows=pageRows,other={})=>async()=>({
 rows,pages:1,scanned:false,...other
});
const check=(patch={})=>comprobarRenglonesPdfOriginalB5({
 originalBytes:bytes,sourceSha256:sha,candidate:quote(),
 readPdf:reader(),...patch
});
test('B5 source: SHA+PDF.js synthetic line matches actual numeric material row',async()=>{
 const r=await check();
 assert.equal(r.state,'source_rows_correspond_private');
 assert.equal(r.sha_verified,true);
 assert.equal(r.source_rows_extracted,2);
 assert.equal(r.lines.length,1);
 assert.equal(r.lines[0].state,'source_line_corresponds');
 assert.equal(r.lines[0].page,1);
 assert.equal(r.full_document_covered,false);
 assert.equal(r.discount_column_verified,false);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
});
test('B5 source: damaged same-size original rejects before PDF reader call',async()=>{
 const bad=Uint8Array.from(bytes);bad[bad.length-1]^=1;
 let called=0;
 const r=await check({originalBytes:bad,
  readPdf:async()=>{called++;throw Error('must not read')}});
 assert.equal(r.reason,'sha_mismatch');
 assert.equal(r.sha_verified,false);
 assert.equal(called,0);
});
test('B5 source: fake MIME PDF header rejects',async()=>{
 const bad=Uint8Array.from(bytes);bad[0]=42;
 const r=await check({originalBytes:bad});
 assert.equal(r.reason,'invalid_file');
 assert.equal(r.can_publish,false);
});
test('B5 source: invented unit price never credited from PDF',async()=>{
 const q=quote([m(1,{unit_price_raw:'$99.999,99'})]);
 const r=await check({candidate:q});
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'line_discrepancy');
 assert.equal(r.lines[0].state,'source_value_missing');
});
test('B5 source: a declared quantity equal to product kg is NOT evidence',async()=>{
 const q=quote([m(1,{
  original_line_raw:'Cemento 25 kg $9.798,58 $304.148,00',
  original_description_raw:'cemento avellaneda x 25 kg',
  quantity_raw:'25'
 })]);
 const r=await check({candidate:q,readPdf:reader([
  {page:1,text:'cemento avellaneda x 25 kg $9.798,58 $304.148,00'}
 ])});
 assert.equal(r.lines[0].state,'source_value_missing');
});
test('B5 source: PDF page mismatch does not certify a source location',async()=>{
 const q=quote([m(1,{source_location_raw:'página 2'})]);
 const r=await check({candidate:q});
 assert.equal(r.lines[0].state,'source_location_conflict');
});
test('B5 source: duplicate identical rows are ambiguous without more location',async()=>{
 const r=await check({readPdf:reader([pageRows[0],pageRows[0]])});
 assert.equal(r.lines[0].state,'source_ambiguous');
 assert.equal(r.can_rank,false);
});
test('B5 source: an extra IVA or freight row cannot be declared fully covered',async()=>{
 const r=await check({readPdf:reader([...pageRows,
  {page:1,text:'IVA según factura'},
  {page:1,text:'Flete a convenir'},
  {page:1,text:'Unlisted pallets $17.000'}
 ])});
 assert.equal(r.lines[0].state,'source_line_corresponds');
 assert.equal(r.full_document_covered,false);
 assert.equal(r.can_publish,false);
});
test('B5 source: every note must be source located when in the candidate',async()=>{
 const q=quote([
  m(1),m(2,{
   kind:'commercial_note',
   original_line_raw:'flete a convenir',original_description_raw:'flete a convenir',
   quantity_raw:null,unit_raw:null,unit_price_raw:null,
   unit_price_role:'absent',line_total_raw:null
  })
 ]);
 const r=await check({candidate:q,readPdf:reader([...pageRows,
  {page:1,text:'flete a convenir'}])});
 assert.equal(r.state,'source_rows_correspond_private');
 assert.equal(r.lines.length,2);
 assert.equal(r.lines[1].kind,'commercial_note');
 assert.equal(r.lines[1].state,'source_line_corresponds');
 assert.equal(r.can_publish,false);
});
test('B5 source: missing quoted commercial note is a source discrepancy',async()=>{
 const q=quote([m(1),m(2,{
  kind:'commercial_note',original_line_raw:'IVA incluido',
  original_description_raw:'IVA incluido',
  quantity_raw:null,unit_raw:null,unit_price_raw:null,
  unit_price_role:'absent',line_total_raw:null
 })]);
 const r=await check({candidate:q});
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.lines[1].state,'source_line_not_located');
 assert.equal(r.can_publish,false);
});
test('B5 source: scanned PDF produces review not a fake verification',async()=>{
 const r=await check({readPdf:reader([],{scanned:true})});
 assert.equal(r.reason,'pdf_unreadable');
 assert.equal(r.can_publish,false);
});
test('B5 source: reader failure/timeout never leaks PDF or contacts',async()=>{
 const r=await check({readPdf:async()=>{throw Error('phone 123456 private')}});
 assert.equal(r.reason,'reader_unavailable');
 assert.ok(!JSON.stringify(r).includes('phone 123456'));
});
test('B5 source: invalid schema and hallucinated metadata blocked before reader',async()=>{
 let called=0;
 const r=await check({candidate:{...quote(),buyer_phone:'any'},
  readPdf:async()=>{called++;return reader()()}});
 assert.equal(r.reason,'bad_candidate');
 assert.equal(called,0);
});
test('B5 source: repeated amounts cannot authenticate two columns from one token',async()=>{
 const q=quote([m(1,{
  unit_price_raw:'$304.148,00',
  line_total_raw:'$304.148,00',
  unit_price_role:'effective_explicit'})]);
 const r=await check({candidate:q,readPdf:reader([
  {page:1,text:'40,00 cemento avellaneda x 25 kg $304.148,00'}])});
 assert.equal(r.lines[0].state,'source_value_missing');
});
test('B5 source: missing quantity or source location stays private even if row matches',async()=>{
 const q=quote([m(1,{
  quantity_raw:null,source_location_raw:null
 })]);
 const r=await check({candidate:q});
 assert.equal(r.lines[0].state,'source_line_corresponds');
 assert.equal(r.full_document_covered,false);
 assert.equal(r.discount_column_verified,false);
});

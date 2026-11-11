import test from 'node:test';
import assert from 'node:assert/strict';
import {auditarCoberturaPdfOriginalB5l} from
 '../../src/domain/presupuestos-v2/auditoria-cobertura-original-b5l.ts';
import {diagnosticarGeometriaTotalB5i} from
 '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
const line=(ordinal,kind,desc,q,unit,total)=>({
 ordinal,kind,original_line_raw:[q,desc,unit,total].filter(Boolean).join(' '),
 original_description_raw:desc,quantity_raw:q,
 unit_raw:null,unit_price_raw:unit,
 unit_price_role:kind==='material'?'effective_explicit':'absent',
 line_total_raw:total,source_location_raw:'página 1'
});
const lines=[
 line(1,'material','Cemento CPC','40,00','$100,00','$4.000,00'),
 line(2,'material','Arena Big Bag','3,00','$200,00','$600,00')
];
const doc=(items=lines,terms=['Transferencia'])=>({
 document_kind:'supplier_quote',lines:items,
 total_declared_raw:'$4.600,00',currency_declared_raw:'$',
 commercial_conditions_raw:terms
});
const part=(text,x=510)=>({text,x});
const row=(y,parts,page=1)=>({page,y,parts,text:parts.map(p=>p.text).join(' ')});
const sourceRows=[
 row(740,[part('Cantidad',20),part('Descripción',120),
  part('Unitario',350),part('Total',510)]),
 row(700,[part('40,00',20),part('Cemento CPC',120),
  part('$100,00',350),part('$4.000,00',510)]),
 row(670,[part('3,00',20),part('Arena Big Bag',120),
  part('$200,00',350),part('$600,00',510)]),
 row(610,[part('$4.600,00',510)]),
 row(560,[part('Transferencia',100)])
];
function calc({candidate=doc(),rows=sourceRows,scanned=false,pages=1,
 sourceReason='source_total_unverified',states=[]}={}){
 const source={
  state:'needs_source_review',reason:sourceReason,
  source_sha256:'a'.repeat(64),sha_verified:true,
  lines:candidate.lines.map((l,i)=>({
   ordinal:l.ordinal,kind:l.kind,state:states[i]??'source_line_corresponds'
  })),
  full_document_covered:false,discount_column_verified:false,
  can_publish:false,can_rank:false,can_reveal_contacts:false,
  source_rows_extracted:rows.length
 };
 const geom=diagnosticarGeometriaTotalB5i({
  rows,declaredTotal:candidate.total_declared_raw,lines:candidate.lines
 });
 return auditarCoberturaPdfOriginalB5l({
  candidate,rows,source,geometry:geom,pages,scanned
 });
}
function sealed(r){
 assert.equal(r.source_verified,false);
 assert.equal(r.full_document_covered,false);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
 assert.equal(r.can_reveal_contacts,false);
 const output=JSON.stringify(r);
 for(const secret of ['Cemento','Arena Big Bag','4.600','221555',
  'Transferencia','$100','x:510','CUIT'])
  assert.equal(output.includes(secret),false,secret);
 assert.equal(r.source_rows,
  r.attributed_rows+r.unattributed_rows);
}
test('B5l: every visible row accounted is PRIVATE, never full-document proof',()=>{
 const v=calc();
 assert.equal(v.code,'visible_rows_accounted_private');
 assert.equal(v.source_rows,5);
 assert.equal(v.attributed_rows,5);
 assert.equal(v.unattributed_rows,0);
 assert.equal(v.attributed_lines,2);
 assert.equal(v.corroborated_conditions,1);
 sealed(v);
});
test('B5l: source price omitted by AI is never ignored',()=>{
 const v=calc({rows:[...sourceRows,row(540,[part('Flete',130),part('$500,00')])]});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: another material on a later page is still unaccounted',()=>{
 const rows=[...sourceRows,row(550,[part('3,00',20),
  part('Hierro 10mm',120),part('$550,00',510)],2)];
 const v=calc({rows,pages:2});
 // Geometry only evaluates the original footer page; even if geography
 // prevents proceeding, the document cannot become "accounted".
 assert.notEqual(v.code,'visible_rows_accounted_private');sealed(v);
});
test('B5l: monetary source row with no symbol still requires review',()=>{
 const v=calc({rows:[...sourceRows,row(540,[part('500,00',510)])]});
 assert.equal(v.code,'unmapped_monetary_or_percentage');sealed(v);
});
test('B5l: global discount percentage in heading is blocked as commercial risk',()=>{
 const rows=sourceRows.map((r,i)=>i===0?row(740,[part('Cantidad',20),
  part('Descripción',120),part('Descuento general 10%',350),
  part('Total',510)]):r);
 const v=calc({rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: IVA in a header is an unexplained fiscal term',()=>{
 const rows=sourceRows.map((r,i)=>i===0?row(740,[part('Cantidad',20),
  part('Precio',350),part('IVA',410),part('Total',510)]):r);
 const v=calc({rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: a plain non-priced source clause still requires explanation',()=>{
 const v=calc({rows:[...sourceRows,row(540,
  [part('Disponibilidad sujeta a stock',140)])]});
 assert.equal(v.code,'unmapped_text');sealed(v);
});
test('B5l: short condition does not conceal same-row IVA',()=>{
 const rows=sourceRows.map((r,i)=>i===4?row(560,
  [part('Transferencia IVA 21%',140)]):r);
 const v=calc({rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: unexpected freight on already matched material blocks',()=>{
 const rows=sourceRows.map((r,i)=>i===1?row(700,[
  part('40,00',20),part('Cemento CPC',120),part('$100,00',350),
  part('$4.000,00',510),part('Flete',580)]):r);
 const v=calc({rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: unclaimed line in another format with no money remains unknown',()=>{
 const v=calc({rows:[...sourceRows,row(540,
  [part('Consulta por horarios de entrega',120)])]});
 assert.equal(v.code,'unmapped_text');sealed(v);
});
test('B5l: duplicated material text is safely blocked by earlier geometry',()=>{
 const v=calc({rows:[...sourceRows,row(540,
  [part('Cemento CPC',120)])]});
 assert.equal(v.code,'source_geometry_unconfirmed');sealed(v);
});
test('B5l: source row not corroborated by B5 cannot be attributed',()=>{
 const v=calc({states:['source_line_not_located']});
 assert.equal(v.code,'source_lines_unconfirmed');sealed(v);
});
test('B5l: PDF.js scanned document is not assumed complete',()=>{
 const v=calc({scanned:true});
 assert.equal(v.code,'reader_unconfirmed');sealed(v);
});
test('B5l: unextracted text parts invalidate the visible-row census',()=>{
 const rows=sourceRows.map((r,i)=>i===2?{...r,parts:undefined}:r);
 const v=calc({rows});assert.equal(v.code,'reader_unconfirmed');sealed(v);
});
test('B5l: a plain delivery note explicitly extracted is accounted for',()=>{
 const note=line(3,'commercial_note','Entrega a convenir',null,null,null);
 const candidate=doc([...lines,note]);
 const rows=[...sourceRows,row(540,[part('Entrega a convenir',120)])];
 const v=calc({candidate,rows});
 assert.equal(v.code,'visible_rows_accounted_private');sealed(v);
});
test('B5l: unpriced freight note remains a commercial risk',()=>{
 const note=line(3,'commercial_note','Flete a cotizar',null,null,null);
 const candidate=doc([...lines,note]);
 const rows=[...sourceRows,row(540,[part('Flete a cotizar',120)])];
 const v=calc({candidate,rows});
 assert.equal(v.code,'unpriced_commercial_risk');sealed(v);
});
test('B5l: a condition stated verbatim is explainable but not priced for ranking',()=>{
 const candidate=doc(lines,['Transferencia','IVA incluido']);
 const rows=[...sourceRows,row(530,[part('IVA incluido',100)])];
 const v=calc({candidate,rows});
 assert.equal(v.code,'visible_rows_accounted_private');
 assert.equal(v.corroborated_conditions,2);sealed(v);
});
test('B5l: source metadata (phone / tax code) cannot be dropped silently',()=>{
 const v=calc({rows:[...sourceRows,row(530,
  [part('CUIT 20-00000000-1',100)])]});
 assert.equal(v.code,'unmapped_text');sealed(v);
});

test('B5l: an extra dollar amount in the material row cannot hide in source claim',()=>{
 const rows=sourceRows.map((r,i)=>i===1?row(700,[
  part('40,00',20),part('Cemento CPC',120),
  part('$100,00',350),part('$4.000,00',510),part('$150,00',580)]):r);
 const v=calc({rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});
test('B5l: a material line that mentions an unpriced IVA remains in review',()=>{
 const material={...lines[0],
  original_line_raw:lines[0].original_line_raw+' IVA incluido'};
 const candidate=doc([material,lines[1]]);
 const rows=sourceRows.map((r,i)=>i===1?row(700,[
  part('40,00',20),part('Cemento CPC',120),
  part('$100,00',350),part('$4.000,00',510),part('IVA incluido',580)]):r);
 const v=calc({candidate,rows});
 assert.equal(v.code,'unmapped_fiscal_or_logistics');sealed(v);
});

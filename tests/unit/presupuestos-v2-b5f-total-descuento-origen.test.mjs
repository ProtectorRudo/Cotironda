import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {comprobarRenglonesPdfOriginalB5} from
 '../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';

const bytes=new TextEncoder().encode('%PDF-1.7\n'+'0'.repeat(220)+'\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const row={
 ordinal:1,kind:'material',
 original_line_raw:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00',
 original_description_raw:'cemento avellaneda x 25 kg',
 quantity_raw:'40,00',unit_raw:null,
 unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
 line_total_raw:'$304.148,00',source_location_raw:'página 1'
};
const doc={document_kind:'supplier_quote',lines:[row],
 total_declared_raw:'$304.148,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]};
const product=(patch={})=>({
 page:1,y:700,
 text:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00',
 parts:[
  {x:10,text:'1'}, {x:28,text:'40,00'},
  {x:72,text:'cemento avellaneda x 25 kg'},
  {x:330,text:'$9.798,58'},
  {x:435,text:'22.4%'},
  {x:510,text:'$304.148,00'}
 ],...patch
});
const header=(patch={})=>({page:1,y:725,
 text:'Cantidad Descripción Unitario Dscto. Total',
 parts:[{x:10,text:'Cantidad'},{x:72,text:'Descripción'},
  {x:330,text:'Unitario'},{x:435,text:'Dscto.'},
  {x:510,text:'Total'}],...patch
});
const total=(text='TOTAL GENERAL 304.148,00')=>({page:1,y:670,text});
const check=(rows,candidate=doc)=>comprobarRenglonesPdfOriginalB5({
 originalBytes:bytes,sourceSha256:sha,candidate,
 readPdf:async()=>({rows,pages:1,scanned:false})
});
test('B5f: total no requiere símbolo $ cuando etiqueta y centavos son únicos',async()=>{
 const r=await check([product(),total()]);
 assert.equal(r.state,'source_rows_correspond_private');
 assert.equal(r.total_state,'unique_source_total');
 assert.equal(r.full_document_covered,false);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
});
test('B5f: total de dos filas adyacentes dentro de la misma página',async()=>{
 const r=await check([
  product(),{page:1,text:'TOTAL GENERAL',y:680},
  {page:1,text:'304.148,00',y:660}
 ]);
 assert.equal(r.state,'source_rows_correspond_private');
 assert.equal(r.total_state,'unique_source_total');
});
test('B5f: total solo se reconoce por etiqueta y NO desde suma de productos',async()=>{
 for(const tail of [
  [{page:1,text:'304.148,00'}],
  [{page:1,text:'RESUMEN',y:680},{page:1,text:'304.148,00'}],
  [{page:1,text:'TOTAL GENERAL',y:680},{page:1,text:'SIN IMPORTE'}]
 ]){
  const r=await check([product(),...tail]);
  assert.equal(r.reason,'source_total_unverified');
  assert.equal(r.can_publish,false);
 }
});
test('B5f: cantidad o IVA al lado del total bloquea una coincidencia aparente',async()=>{
 for(const extra of [
  'TOTAL GENERAL 304.148,00 IVA 21%',
  'TOTAL GENERAL 304.148,00 $18.000,00',
  'TOTAL GENERAL 304.148,00 FLETE A PAGAR',
  'TOTAL GENERAL 304.148,00 descuento 22.4%'
 ]){
  const r=await check([product(),total(extra)]);
  assert.equal(r.reason,'source_total_unverified',extra);
 }
});
test('B5f: totales repetidos o contradictorios son revisión privada',async()=>{
 for(const rows of [
  [product(),total(),total()],
  [product(),total(),total('TOTAL 100.000,00')]
 ]){
  const r=await check(rows);
  assert.equal(r.reason,'source_total_unverified');
  assert.equal(r.can_publish,false);
 }
});
test('B5f: total separado de la etiqueta NO cruza página o fila intermedia',async()=>{
 const rows=[
  product(),{page:1,text:'TOTAL GENERAL'},
  {page:1,text:'IVA según factura'},
  {page:1,text:'304.148,00'}
 ];
 const r=await check(rows);
 assert.equal(r.reason,'source_total_unverified');
});
test('B5f: descuento explícito en el propio renglón es solo prueba privada',async()=>{
 const r=await check([product({
  text:'1 40,00 cemento avellaneda x 25 kg $9.798,58 Dscto. 22.4% $304.148,00'
 }),total()]);
 assert.equal(r.state,'source_rows_correspond_private');
 assert.deepEqual(r.lines[0].discount_evidence,{
  basis_points:'2240',literal:'22.4%',origin:'inline_explicit'
 });
 assert.equal(r.discount_column_verified,false);
 assert.equal(r.can_publish,false);
});
test('B5f: descuento 22,4% alineado en x con encabezado Dscto.',async()=>{
 const r=await check([header(),product(),total()]);
 assert.equal(r.state,'source_rows_correspond_private');
 assert.deepEqual(r.lines[0].discount_evidence,{
  basis_points:'2240',literal:'22.4%',origin:'aligned_header'
 });
 assert.equal(r.discount_column_verified,false);
 assert.equal(r.can_rank,false);
});
test('B5f: sin coordenadas del PDF una cabecera no acredita descuento',async()=>{
 const r=await check([
  {page:1,text:'Cantidad Descripción Dscto. Total'},
  {page:1,text:product().text},
  total()
 ]);
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'unmapped_source_content');
 assert.equal(r.lines[0].discount_evidence,undefined);
});
test('B5f: encabezado lejano, x equivocado o en página distinta NO certifica',async()=>{
 for(const h of [
  header({y:1500}),
  header({parts:[{x:100,text:'Dscto.'}]}),
  header({page:2}),
  header({parts:[{x:435,text:'IVA 21%'}]})
 ]){
  const r=await check([h,product(),total()]);
  if(h.page===2){
   assert.equal(r.reason,'pdf_unreadable');continue;
  }
  assert.equal(r.lines[0].discount_evidence,undefined);
 }
});
test('B5f: dos porcentajes, IVA, o porcentaje fuera de rango no son descuentos',async()=>{
 for(const source of [
  '1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% 10% $304.148,00',
  '1 40,00 cemento avellaneda x 25 kg $9.798,58 IVA 21% $304.148,00',
  '1 40,00 cemento avellaneda x 25 kg $9.798,58 Dscto 140% $304.148,00'
 ]){
  const r=await check([product({text:source,parts:undefined}),total()]);
  assert.equal(r.lines[0].discount_evidence,undefined,source);
  assert.equal(r.can_publish,false);
 }
});
test('B5f: monto o columna con coordenadas inválidas queda en revisión',async()=>{
 const r=await check([header(),product({
  parts:[{x:NaN,text:'22.4%'}]}),total()]);
 assert.equal(r.reason,'pdf_unreadable');
});
test('B5f: sin total declarado no se inventa uno ni se publica',async()=>{
 const q={...doc,total_declared_raw:null};
 const r=await check([product()],q);
 assert.equal(r.state,'source_rows_correspond_private');
 assert.equal(r.total_state,'not_declared');
 assert.equal(r.can_publish,false);
});

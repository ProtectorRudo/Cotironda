import test from 'node:test';
import assert from 'node:assert/strict';
import {auditarComercialPrivadoB5} from
 '../../src/domain/presupuestos-v2/auditoria-comercial-b5.ts';
const row={
 ordinal:1,kind:'material',
 original_line_raw:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00',
 original_description_raw:'cemento avellaneda x 25 kg',
 quantity_raw:'40,00',unit_raw:null,
 unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
 line_total_raw:'$304.148,00',source_location_raw:'página 1'
};
const doc=(line=row)=>({
 document_kind:'supplier_quote',lines:[line],
 total_declared_raw:'$304.148,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]
});
const proof={ordinal:1,basis_points:'2240',
 literal:'22.4%',origin:'aligned_header'};
test('B5f: sin origen independiente NO se deduce descuento de un porcentaje suelto',()=>{
 const r=auditarComercialPrivadoB5(doc());
 assert.equal(r.lines[0].result,'list_vs_effective_ambiguous');
 assert.equal(r.lines[0].discount_origin,undefined);
 assert.equal(r.can_publish,false);
});
test('B5f: tasa confirmada en columna del PDF permite aritmética PRIVATE',()=>{
 const r=auditarComercialPrivadoB5(doc(),[],[proof]);
 assert.equal(r.lines[0].discount_origin,'pdf_positioned_private');
 assert.equal(r.lines[0].discount_literal,'22.4%');
 assert.equal(r.lines[0].computed_effective_unit_cents,'760370');
 assert.equal(r.lines[0].computed_line_total_cents,'30414800');
 assert.equal(r.lines[0].comparison_difference_cents,'0');
 assert.equal(r.lines[0].result,'matched_arithmetic_unverified');
 assert.equal(r.source_verified,false);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
});
test('B5f: 22.4% en fuente contra 19% afirmado por IA es conflicto',()=>{
 const line={...row,original_line_raw:row.original_line_raw+
  ' Descuento 19%'};
 const r=auditarComercialPrivadoB5(doc(line),[],[proof]);
 assert.equal(r.lines[0].result,'conflicting_explicit_discount');
 assert.equal(r.lines[0].computed_line_total_cents,undefined);
});
test('B5f: porcentaje no coincide con evidencia suministrada, rechazo',()=>{
 for(const evidence of [
  {...proof,basis_points:'2250'},
  {...proof,basis_points:'10001'},
  {...proof,literal:'IVA 21%'},
  {...proof,basis_points:'-20'}
 ]){
  const r=auditarComercialPrivadoB5(doc(),[],[evidence]);
  assert.equal(r.lines[0].result,'conflicting_explicit_discount');
  assert.equal(r.can_publish,false);
 }
});
test('B5f: no aplicar descuento dos veces a un precio ya efectivo',()=>{
 const r=auditarComercialPrivadoB5(doc({
  ...row,unit_price_role:'effective_explicit'
 }),[],[proof]);
 assert.equal(r.lines[0].result,'explicit_discount_unverified');
 assert.equal(r.lines[0].computed_line_total_cents,undefined);
});
test('B5f: evidencia duplicada o de otra línea no se acepta silenciosamente',()=>{
 for(const evidences of [
  [proof,proof],
  [{...proof,ordinal:2}]
 ]){
  const r=auditarComercialPrivadoB5(doc(),[],evidences);
  if(evidences.length>1)assert.equal(r.state,'invalid_candidate');
  else assert.equal(r.lines[0].result,'list_vs_effective_ambiguous');
  assert.equal(r.can_publish,false);
 }
});
test('B5f: porcentaje fuente nunca agrega IVA/flete que no existieron',()=>{
 const r=auditarComercialPrivadoB5(doc(),[],[proof]);
 assert.deepEqual(r.mentions,{});
 assert.equal(r.can_reveal_contacts,false);
});

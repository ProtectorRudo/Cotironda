import test from 'node:test';
import assert from 'node:assert/strict';
import {
 auditarComercialPrivadoB5,parseArgentineMoneyCentsB5,
 parseQuantityThousandthsB5
} from '../../src/domain/presupuestos-v2/auditoria-comercial-b5.ts';

const material=(ordinal,overrides={})=>({
 ordinal,kind:'material',
 original_line_raw:'1 40,00 cemento avellaneda x 25 kg $9.798,58 22.4% $304.148,00',
 original_description_raw:'cemento avellaneda x 25 kg',
 quantity_raw:'40,00',unit_raw:null,
 unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
 line_total_raw:'$304.148,00',source_location_raw:'página 1',
 ...overrides
});
const quote=(lines=[material(1)],changes={})=>({
 document_kind:'supplier_quote',lines,
 total_declared_raw:lines.length===1?'$304.148,00':null,
 currency_declared_raw:'$',commercial_conditions_raw:[],...changes
});
const materialResults=r=>r.lines.filter(x=>x.kind==='material');
test('B5: current Ailín PDF1 — 22.4% labeled in archived reading; 2 materials, total exact',()=>{
 const q=quote([
  material(1),
  material(2,{
   original_line_raw:'2 3,00 BIG BAG de Arena $70.830,98 22.4% $164.894,52',
   original_description_raw:'BIG BAG de Arena',
   quantity_raw:'3,00',unit_price_raw:'$70.830,98',
   line_total_raw:'$164.894,52'
  })
 ],{total_declared_raw:'$469.042,52',commercial_conditions_raw:[
   'Mantenimiento de la oferta : 0','Condición de pago : 1. Contado Efectivo',
   'Plazo de entrega : 0 DIAS'
  ]});
 const r=auditarComercialPrivadoB5(q,[
  'cemento avellaneda x 25 kg; Dscto. 22.4%',
  'BIG BAG de Arena; Dscto. 22.4%'
 ]);
 assert.equal(r.state,'private_arithmetic_only');
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
 assert.equal(r.source_verified,false);
 assert.equal(r.material_count,2);assert.equal(r.notes_count,0);
 assert.deepEqual(r.mentions,{});
 assert.equal(r.total_declared_cents,'46904252');
 assert.equal(r.total_material_lines_cents,'46904252');
 assert.equal(r.totals_agree,true);
 const [first,second]=materialResults(r);
 assert.equal(first.result,'matched_arithmetic_unverified');
 assert.equal(second.result,'matched_arithmetic_unverified');
 assert.equal(first.discount_origin,'historical_unverified');
 assert.equal(first.discount_literal,'Dscto. 22.4%');
 assert.equal(first.computed_effective_unit_cents,'760370');
 assert.equal(first.computed_line_total_cents,'30414800');
 assert.equal(second.computed_line_total_cents,'16489452');
 assert.equal(first.comparison_difference_cents,'0');
});
test('B5: current Ailín PDF2 — 3 materials + 2 notes, exact 22.4% cent rounding',()=>{
 const rows=[
  material(1,{
   original_line_raw:'1 15,00 Cemento Avellaneda $17.024,70 22.4% $198.167,55',
   original_description_raw:'Cemento Avellaneda',quantity_raw:'15,00',
   unit_price_raw:'$17.024,70',line_total_raw:'$198.167,55'}),
  material(2,{
   original_line_raw:'2 2,00 BIG BAG de Arena $70.830,98 22.4% $109.929,68',
   original_description_raw:'BIG BAG de Arena',quantity_raw:'2,00',
   unit_price_raw:'$70.830,98',line_total_raw:'$109.929,68'}),
  material(3,{
   original_line_raw:'3 1,00 BIG BAG de Piedra $109.218,23 22.4% $84.753,35',
   original_description_raw:'BIG BAG de Piedra',quantity_raw:'1,00',
   unit_price_raw:'$109.218,23',line_total_raw:'$84.753,35'}),
  material(4,{
   kind:'commercial_note',original_line_raw:'precios en efectivo',
   original_description_raw:'precios en efectivo',
   quantity_raw:null,unit_raw:null,unit_price_raw:null,
   unit_price_role:'absent',line_total_raw:null}),
  material(5,{
   kind:'commercial_note',original_line_raw:'flete a convenir',
   original_description_raw:'flete a convenir',
   quantity_raw:null,unit_raw:null,unit_price_raw:null,
   unit_price_role:'absent',line_total_raw:null}),
 ];
 const q=quote(rows,{total_declared_raw:'$392.850,58',
  commercial_conditions_raw:['precios en efectivo','flete a convenir']});
 const r=auditarComercialPrivadoB5(q,[
  'Cemento Avellaneda; Dscto. 22.4%',
  'BIG BAG de Arena; Dscto. 22.4%',
  'BIG BAG de Piedra; Dscto. 22.4%'
 ]);
 assert.equal(r.material_count,3);assert.equal(r.notes_count,2);
 assert.equal(r.total_declared_cents,'39285058');
 assert.equal(r.total_material_lines_cents,'39285058');
 assert.equal(r.totals_agree,true);
 assert.deepEqual(materialResults(r).map(x=>x.result),
  Array(3).fill('matched_arithmetic_unverified'));
 assert.deepEqual(materialResults(r).map(x=>x.computed_line_total_cents),
  ['19816755','10992968','8475335']);
 assert.deepEqual(r.mentions,{
  flete:{state:'mentioned_unpriced',literal:'flete a convenir'}
 });
 assert.ok(!('iva' in r.mentions));
 assert.ok(!('amount_raw' in r.mentions.flete));
});
test('B5: absent IVA/flete means NO keys, never "IVA included" or free shipping',()=>{
 for(const conditions of [
  [],['Pago contado'],['Envío: sin informar','IVA no informado'],
  ['sin datos sobre flete','IVA no especificado'],
  ['Condición de pago: A convenir','Retiro en depósito']
 ]){
  const r=auditarComercialPrivadoB5(quote([material(1)],{
   commercial_conditions_raw:conditions
  }));
  assert.deepEqual(r.mentions,{});
  assert.equal(r.can_publish,false);
 }
});
test('B5: tax mention alone never means included or rate 21%',()=>{
 for(const item of ['IVA según factura','IVA','IVA a confirmar']){
  const r=auditarComercialPrivadoB5(quote([material(1)],{
   commercial_conditions_raw:[item]
  }));
  assert.equal(r.mentions.iva.state,'mentioned_unpriced');
  assert.ok(!('flete' in r.mentions));
 }
});
test('B5: explicit included/excluded tax is never guessed from a subtotal',()=>{
 const cases=[
  ['IVA incluido','included_explicit'],
  ['Incluye IVA','included_explicit'],
  ['Precio con IVA','included_explicit'],
  ['Sin IVA','excluded_explicit'],
  ['No incluye IVA','excluded_explicit'],
  ['IVA no incluido','excluded_explicit'],
  ['IVA 21%','rate_mentioned'],
  ['IVA del 10,5%','rate_mentioned']
 ];
 for(const [literal,state] of cases){
  const r=auditarComercialPrivadoB5(quote([material(1)],{
   commercial_conditions_raw:[literal]
  }));
  assert.equal(r.mentions.iva?.state,state,literal);
  assert.equal(r.mentions.iva?.literal,literal);
 }
});
test('B5: explicitly contradictory VAT remains flagged, not included',()=>{
 const q=quote([material(1)],{
  commercial_conditions_raw:['IVA incluido','Sin IVA']
 });
 assert.equal(auditarComercialPrivadoB5(q).mentions.iva.state,
  'conflicting_mentions');
});
test('B5: flete is only preserved if expressly written',()=>{
 const cases=[
  ['Flete a convenir','mentioned_unpriced'],
  ['Flete incluido','included_explicit'],
  ['Flete sin cargo','free_explicit'],
  ['Envío gratis','free_explicit'],
  ['Flete $ 15.000,00','quoted_price_explicit'],
  ['Transporte $ 20.000','quoted_price_explicit']
 ];
 for(const [literal,state] of cases){
  const r=auditarComercialPrivadoB5(quote([material(1)],{
   commercial_conditions_raw:[literal]
  }));
  assert.equal(r.mentions.flete?.state,state,literal);
  if(state!=='quoted_price_explicit')
   assert.equal(r.mentions.flete.amount_raw,undefined);
 }
});
test('B5: neither absent freight nor "a convenir" is added to total',()=>{
 const q=quote([material(1)],{
  total_declared_raw:'$304.148,00',
  commercial_conditions_raw:['Flete a convenir']
 });
 const r=auditarComercialPrivadoB5(q);
 assert.equal(r.total_declared_cents,'30414800');
 assert.equal(r.total_material_lines_cents,'30414800');
 assert.equal(r.totals_agree,true);
 assert.equal(r.mentions.flete.amount_raw,undefined);
});
test('B5: discount never inferred from two numbers with matching ratio',()=>{
 const r=auditarComercialPrivadoB5(quote([material(1)]));
 const l=r.lines[0];
 assert.equal(l.discount_literal,undefined);
 assert.equal(l.discount_origin,undefined);
 assert.equal(l.result,'list_vs_effective_ambiguous');
 assert.equal(l.original_source_verified,false);
 assert.equal(r.can_publish,false);
});
test('B5: explicit candidate-labeled discount works without archived readings',()=>{
 const l=material(1,{
  original_line_raw:'Cemento 40 unidades 9.798,58 Dscto. 22,4% $304.148,00'
 });
 const r=auditarComercialPrivadoB5(quote([l]));
 assert.equal(r.lines[0].result,'matched_arithmetic_unverified');
 assert.equal(r.lines[0].discount_origin,'candidate_literal');
});
test('B5: changing reported totals rejects arithmetic even with discount',()=>{
 const q=quote([material(1,{line_total_raw:'$304.149,00'})],{
  total_declared_raw:'$304.149,00'
 });
 const r=auditarComercialPrivadoB5(q,[
  'Cemento Avellaneda; Dscto. 22.4%'
 ]);
 assert.equal(r.lines[0].result,'differs_from_declared_total');
 assert.equal(r.lines[0].comparison_difference_cents,'100');
 assert.equal(r.can_rank,false);
});
test('B5: cannot stack list discount on effective_explicit unit again',()=>{
 const q=quote([material(1,{
  unit_price_role:'effective_explicit',
  original_line_raw:'Cemento 40 unidades $9.798,58 Descuento 22,4% Total $304.148'
 })]);
 const r=auditarComercialPrivadoB5(q);
 assert.equal(r.lines[0].result,'explicit_discount_unverified');
 assert.equal(r.lines[0].computed_line_total_cents,undefined);
});
test('B5: disagreeing discount transcriptions must remain uncertain',()=>{
 const q=quote([material(1,{
  original_line_raw:'Cemento 40 unidades Descuento 19% $304.148'
 })]);
 const r=auditarComercialPrivadoB5(q,[
  'Cemento Avellaneda; Dscto. 22.4%'
 ]);
 assert.equal(r.lines[0].result,'conflicting_explicit_discount');
 assert.equal(r.lines[0].computed_line_total_cents,undefined);
});
test('B5: terms IVA 21% and flete 10% cannot be misread as discount',()=>{
 const q=quote([material(1,{
  original_line_raw:'40 Cemento $9.798,58 IVA 21% $304.148'
 })],{commercial_conditions_raw:['Flete a confirmar']});
 const r=auditarComercialPrivadoB5(q);
 assert.equal(r.lines[0].discount_literal,undefined);
 assert.equal(r.lines[0].result,'list_vs_effective_ambiguous');
 assert.equal(r.mentions.flete.state,'mentioned_unpriced');
});
test('B5: parse comma decimals, thousand separators, invalid and negative',()=>{
 const ok=[
  ['$9.798,58','979858'],['ARS 12.345,00','1234500'],
  ['$469.042,52','46904252'],['0,01','1'],
  ['-$ 1.200,00','-120000'],['$0','0']
 ];
 for(const [text,value] of ok)
  assert.equal(parseArgentineMoneyCentsB5(text)?.toString(),value,text);
 for(const raw of [
  '$1,999','1.2.3','9,798.58','-','Infinity','NaN',
  '123456789012345678901',null
 ]){
  assert.equal(parseArgentineMoneyCentsB5(raw),null,raw);
 }
 assert.equal(parseQuantityThousandthsB5('40,00'),40000n);
 assert.equal(parseQuantityThousandthsB5('1,250'),1250n);
 assert.equal(parseQuantityThousandthsB5('1.200,5'),1200500n);
 assert.equal(parseQuantityThousandthsB5('1,2500'),null);
});
test('B5: any absent source fields leaves computation pending, no zero invented',()=>{
 const cases=[
  {quantity_raw:null},
  {unit_price_raw:null,unit_price_role:'absent'},
  {line_total_raw:null},
  {quantity_raw:'abc'},
  {unit_price_raw:'21 dollars'},
  {quantity_raw:'0'}
 ];
 for(const patch of cases){
  const r=auditarComercialPrivadoB5(quote([material(1,patch)]));
  assert.equal(r.lines[0].result,'insufficient_numeric_data');
  assert.equal(r.can_publish,false);
 }
});
test('B5: exact money with no known currency remains unverified and unconverted',()=>{
 const r=auditarComercialPrivadoB5(quote([material(1)],{
  currency_declared_raw:null
 }),['Descuento 22.4%']);
 assert.equal(r.lines[0].result,'matched_arithmetic_unverified');
 assert.equal(r.source_verified,false);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
});
test('B5: malformed or invented supplier quote rejected before arithmetic',()=>{
 const broken=[
  null,{},[],{...quote(),buyer_phone:'1234'},
  {...quote(),lines:[{...material(1),invented_discount:'22.4%'}]},
  {...quote(),lines:[{...material(1),unit_price_role:'absent'}]}
 ];
 for(const input of broken){
  const r=auditarComercialPrivadoB5(input);
  assert.equal(r.state,'invalid_candidate');
  assert.equal(r.issue,'invalid_structure');
  assert.deepEqual(r.mentions,{});
  assert.equal(r.can_publish,false);
  assert.equal(r.lines.length,0);
 }
});
test('B5: strong privacy invariant with commercial notes and extra items',()=>{
 const q=quote([
  material(1),material(2,{
   kind:'additional_charge',original_line_raw:'Pallet $5.000',
   original_description_raw:'Pallet',
   quantity_raw:'1',unit_raw:null,unit_price_raw:'$5.000',
   unit_price_role:'effective_explicit',line_total_raw:'$5.000'
  }),
  material(3,{
   kind:'commercial_note',original_line_raw:'IVA no informado en fuente',
   original_description_raw:'IVA no informado en fuente',
   unit_price_raw:null,unit_price_role:'absent',line_total_raw:null,
   quantity_raw:null,unit_raw:null
  })
 ],{total_declared_raw:'$309.148,00'});
 const r=auditarComercialPrivadoB5(q,['Descuento 22.4%']);
 assert.equal(r.material_count,1);
 assert.equal(r.notes_count,1);
 assert.deepEqual(r.mentions,{});
 assert.equal(r.totals_agree,false); // extra pallet must NOT disappear
 assert.equal(r.can_reveal_contacts,false);
});

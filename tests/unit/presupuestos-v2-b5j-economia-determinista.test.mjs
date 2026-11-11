import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciliarEconomiaTotalB5j} from '../../src/domain/presupuestos-v2/reconciliacion-economica-b5j.ts';
import {diagnosticarGeometriaTotalB5i} from '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
const raw=(ordinal,kind,description,q,unit,total,role='effective_explicit')=>({
 ordinal,kind,original_line_raw:[q,description,unit,total].filter(Boolean).join(' '),
 original_description_raw:description,quantity_raw:q,
 unit_raw:null,unit_price_raw:unit,unit_price_role:role,
 line_total_raw:total,source_location_raw:'página 1'
});
const standard=[
 raw(1,'material','Cemento CPC','40,00','$100,00','$4.000,00'),
 raw(2,'material','Arena Big Bag','3,00','$200,00','$600,00')
];
const quote=(lines=standard,total='$4.600,00',terms=[],currency='$')=>({
 document_kind:'supplier_quote',lines,
 total_declared_raw:total,currency_declared_raw:currency,
 commercial_conditions_raw:terms
});
const cell=(text,x=500)=>({x,text});
const row=(y,parts,page=1)=>({page,y,parts,text:parts.map(x=>x.text).join(' ')});
const rows=[
 row(750,[cell('Cant.',25),cell('Descripción',130),cell('Unit.',350),cell('Total',500)]),
 row(720,[cell('40,00',25),cell('Cemento CPC',130),
  cell('$100,00',350),cell('$4.000,00')]),
 row(685,[cell('3,00',25),cell('Arena Big Bag',130),
  cell('$200,00',350),cell('$600,00')]),
 row(610,[cell('$4.600,00')])
];
function calc({doc=quote(),pdfRows=rows,reason='source_total_unverified',
 states=[],evidence=[],sourceState='source_rows_correspond_private'}={}){
 const source={
  state:sourceState,reason,sha_verified:true,
  source_sha256:'a'.repeat(64),
  lines:doc.lines.map((line,i)=>({
   ordinal:line.ordinal,kind:line.kind,
   state:states[i]??'source_line_corresponds',
   ...(evidence[i]?{discount_evidence:evidence[i]}:{})
  })),
  full_document_covered:false,discount_column_verified:false,
  can_publish:false,can_rank:false,can_reveal_contacts:false,
  source_rows_extracted:pdfRows.length
 };
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:pdfRows,declaredTotal:doc.total_declared_raw,lines:doc.lines
 });
 return reconciliarEconomiaTotalB5j({candidate:doc,source,geometry,rows:pdfRows});
}
function sealed(v){
 for(const field of ['source_verified','full_document_covered','can_publish',
  'can_rank','can_reveal_contacts'])assert.equal(v[field],false);
 const s=JSON.stringify(v);
 for(const word of ['Cemento','Big Bag','4.600','100,00','221555'])
  assert.equal(s.includes(word),false);
}
test('B5j: exact bigint line sum matches footer, still PRIVATE/not authorized',()=>{
 const v=calc();assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.material_count,2);
 assert.equal(v.material_arithmetic_matches,2);
 assert.equal(v.material_total_matches_declared,true);
 assert.equal(v.iva,'not_mentioned');
 assert.equal(v.freight,'not_mentioned');sealed(v);
});
test('B5j: declared amount differs by one cent: refuse, no tolerance',()=>{
 const v=calc({doc:quote(standard,'$4.600,01'),
  pdfRows:[...rows.slice(0,-1),row(610,[cell('$4.600,01')])]});
 assert.equal(v.code,'grand_total_differs');sealed(v);
});
test('B5j: quantity/unit mismatch is not rescued by matching footer',()=>{
 const changed=standard.map((x,i)=>i===0?{...x,quantity_raw:'39,00'}:x);
 assert.equal(calc({doc:quote(changed)}).code,'line_arithmetic_unconfirmed');
});
test('B5j: unknown unit-price role blocks economic proof',()=>{
 const changed=standard.map((x,i)=>i===0?{...x,unit_price_role:'unknown'}:x);
 assert.equal(calc({doc:quote(changed)}).code,'line_arithmetic_unconfirmed');
});
test('B5j: uncorroborated terms cannot be trusted as source',()=>{
 const v=calc({doc:quote(standard,'$4.600,00',['Contado'])});
 assert.equal(v.code,'source_conditions_unconfirmed');
 assert.equal(v.source_condition_count,1);
 assert.equal(v.conditions_corroborated,0);sealed(v);
});
test('B5j: source-corroborated transfer term is not mistaken for VAT',()=>{
 const doc=quote(standard,'$4.600,00',['Transferencia']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('Transferencia',140)])]});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.conditions_corroborated,1);
 assert.equal(v.iva,'not_mentioned');sealed(v);
});
test('B5j: explicit IVA incluido is recorded without adding a 21% guess',()=>{
 const doc=quote(standard,'$4.600,00',['IVA incluido']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('IVA incluido',140)])]});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.iva,'included_explicit');sealed(v);
});
test('B5j: IVA 21% alone is ambiguous, never automatically charged',()=>{
 const doc=quote(standard,'$4.600,00',['IVA 21%']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('IVA 21%',140)])]});
 assert.equal(v.code,'fiscal_or_freight_ambiguous');
 assert.equal(v.iva,'rate_mentioned');sealed(v);
});
test('B5j: SIN IVA explicit is identified but never inferred from silence',()=>{
 const doc=quote(standard,'$4.600,00',['Sin IVA']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('Sin IVA',140)])]});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.iva,'excluded_explicit');sealed(v);
});
test('B5j: free freight explicitly declared can coexist with balanced total',()=>{
 const doc=quote(standard,'$4.600,00',['Flete gratis']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('Flete gratis',140)])]});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.freight,'free_explicit');sealed(v);
});
test('B5j: quoted freight in prose but no charge line remains ambiguous',()=>{
 const doc=quote(standard,'$4.600,00',['Flete $500,00']);
 const v=calc({doc,pdfRows:[...rows,row(555,[cell('Flete $500,00',140)])]});
 assert.equal(v.code,'fiscal_or_freight_ambiguous');sealed(v);
});
test('B5j: separately priced freight can be counted once if labeled in source',()=>{
 const charge=raw(3,'additional_charge','Flete $500,00',null,null,'$500,00','absent');
 const doc=quote([...standard,charge],'$5.100,00');
 const r=[...rows.slice(0,-1),row(645,[cell('Flete',120),cell('$500,00')]),
  row(590,[cell('$5.100,00')])];
 const v=calc({doc,pdfRows:r});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.additional_charge_count,1);sealed(v);
});
test('B5j: charge without source labeling cannot be counted',()=>{
 const charge=raw(3,'additional_charge','Concepto 3',null,null,'$500,00','absent');
 const doc=quote([...standard,charge],'$5.100,00');
 const r=[...rows.slice(0,-1),row(645,[cell('Concepto 3',120),cell('$500,00')]),
  row(590,[cell('$5.100,00')])];
 assert.equal(calc({doc,pdfRows:r}).code,'invalid_charge_or_discount');
});
test('B5j: a commercial note without price stays a note, not zero priced item',()=>{
 const note=raw(3,'commercial_note','Entrega a convenir',null,null,null,'absent');
 const doc=quote([...standard,note]);
 const v=calc({doc,pdfRows:[...rows,row(540,[cell('Entrega a convenir',100)])]});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.note_count,1);sealed(v);
});

test('B5j: unpriced freight hidden in an otherwise unpriced note cannot be silently zero',()=>{
 const note=raw(3,'commercial_note','Flete $500,00 a cotizar',
  null,null,null,'absent');
 const doc=quote([...standard,note]);
 const v=calc({doc,pdfRows:[...rows,row(530,[cell('Flete $500,00 a cotizar',100)])]});
 assert.equal(v.code,'fiscal_or_freight_ambiguous');
 assert.equal(v.can_publish,false);sealed(v);
});

test('B5j: standalone and per-material discounts require scope proof',()=>{
 const discounted={...raw(1,'material','Cemento CPC','10,00','$100,00','$900,00','list_explicit'),
  original_line_raw:'10,00 Cemento CPC $100,00 10% $900,00'};
 const second=raw(2,'material','Arena Big Bag','2,00','$100,00','$200,00');
 const adjustment=raw(3,'discount','Descuento $150,00',null,null,'$150,00','absent');
 const doc=quote([discounted,second,adjustment],'$950,00');
 const r=[row(750,[cell('Total',500)]),
  row(720,[cell('10,00',25),cell('Cemento CPC',130),cell('$100,00',350),
   cell('10%',430),cell('$900,00')]),
  row(690,[cell('2,00',25),cell('Arena Big Bag',130),cell('$100,00',350),
   cell('$200,00')]),
  row(650,[cell('Descuento',100),cell('$150,00')]),
  row(600,[cell('$950,00')])];
 const v=calc({doc,pdfRows:r,evidence:[
  {basis_points:'1000',literal:'10%',origin:'inline_explicit'}]});
 assert.equal(v.code,'discount_scope_ambiguous');sealed(v);
});
test('B5j: amount in material row cannot serve as final footer',()=>{
 const r=[...rows.slice(0,-1),row(610,[cell('$4.000,00')])];
 const v=calc({doc:quote(standard,'$4.000,00'),pdfRows:r});
 assert.equal(v.code,'geometry_unconfirmed');sealed(v);
});
test('B5j: lost source row blocks before arithmetic',()=>{
 const v=calc({states:['source_line_not_located']});
 assert.equal(v.code,'source_rows_unconfirmed');sealed(v);
});
test('B5j: symbolless source amount cannot be assumed ARS',()=>{
 const bare=rows.map(r=>({...r,text:r.text.replaceAll('$',''),
  parts:r.parts.map(p=>({...p,text:p.text.replaceAll('$','')}))}));
 const v=calc({doc:quote(standard,'4.600,00'),pdfRows:bare});
 assert.equal(v.code,'currency_ambiguous');sealed(v);
});
test('B5j: unrecognized declared currency fails closed',()=>{
 const v=calc({doc:quote(standard,'$4.600,00',[],'EUROS')});
 assert.equal(v.code,'currency_ambiguous');sealed(v);
});

test('B5j: a B5 needs_source_review total is still only a PRIVATE arithmetic candidate',()=>{
 const v=calc({sourceState:'needs_source_review'});
 assert.equal(v.code,'grand_total_balances_private');
 assert.equal(v.source_verified,false);
 assert.equal(v.full_document_covered,false);
 assert.equal(v.can_publish,false);
});

test('B5j: an omitted third monetary PDF row blocks an apparently balancing basket',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Cargo extra',140),cell('$90,00')])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: an omitted IVA percentage elsewhere in original cannot be overlooked',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('IVA 21%',140)])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: a hidden flete a cotizar is not assumed free',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Flete a cotizar',140)])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: discount mentioned in source but omitted by AI blocks private balance',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Descuento adicional 10%',140)])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: a standard table heading with Descuento is not a hidden charge',()=>{
 const r=rows.map((v,i)=>i===0?row(750,[
  cell('Cantidad',25),cell('Descripción',130),
  cell('Unitario',350),cell('Descuento',430),cell('Total',500)
 ]):v);
 const v=calc({pdfRows:r});
 assert.equal(v.code,'grand_total_balances_private');sealed(v);
});
test('B5j: a transfer condition must not absorb omitted IVA on same PDF row',()=>{
 const doc=quote(standard,'$4.600,00',['Transferencia']);
 const v=calc({doc,pdfRows:[...rows,row(550,[cell('Transferencia IVA 21%',120)])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: a copied material description cannot hide omitted freight in its row',()=>{
 const altered=rows.map((r,i)=>i===1?row(720,[
  cell('40,00',25),cell('Cemento CPC',130),
  cell('$100,00',350),cell('$4.000,00'),
  cell('Flete adicional $100,00',580)
 ]):r);
 const v=calc({pdfRows:altered});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: duplicated descriptions fail at geometry before economic audit',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Cemento CPC',130)])]});
 assert.equal(v.code,'geometry_unconfirmed');sealed(v);
});
test('B5j: an unclaimed amount printed on a later page is still scanned',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Otros importes',130),cell('150,00')],2)]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});

test('B5j: an unmodeled IVA column header forces source review',()=>{
 const r=rows.map((v,i)=>i===0?row(750,[
  cell('Cantidad',25),cell('Descripción',130),
  cell('Precio',350),cell('IVA 21%',430),cell('Total',500)
 ]):v);
 const v=calc({pdfRows:r});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: an unpriced freight column header cannot be treated as included',()=>{
 const r=rows.map((v,i)=>i===0?row(750,[
  cell('Cantidad',25),cell('Descripción',130),
  cell('Precio',350),cell('Flete',430),cell('Total',500)
 ]):v);
 const v=calc({pdfRows:r});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});

test('B5j: a global discount rate hidden in a table heading is not harmless',()=>{
 const changed=rows.map((r,i)=>i===0?row(750,[
  cell('Cantidad',25),cell('Descripción',130),
  cell('Descuento general 10%',375),cell('Total',500)
 ]):r);
 const v=calc({pdfRows:changed});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});
test('B5j: an unclaimed percentage outside articles requires manual context',()=>{
 const v=calc({pdfRows:[...rows,row(540,[cell('Bonificación adicional 5%',140)])]});
 assert.equal(v.code,'source_unmapped_content');sealed(v);
});

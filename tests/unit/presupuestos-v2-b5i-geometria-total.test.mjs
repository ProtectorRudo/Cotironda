import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticarGeometriaTotalB5i} from
 '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
const material=[
 {kind:'material',original_description_raw:'Cemento CPC',
  line_total_raw:'$200.000,00'},
 {kind:'material',original_description_raw:'Arena Big Bag',
  line_total_raw:'$104.148,00'}
];
const row=(y,parts,page=1)=>({page,y,parts,
 text:parts.map(p=>p.text).join(' ')});
const x=(text,at=530)=>({x:at,text});
const base=[
 row(735,[x('Cantidad',30),x('Descripción',130),
  x('Total',530)]),
 row(700,[x('40,00',30),x('Cemento CPC',130),
  x('$200.000,00')]),
 row(675,[x('3,00',30),x('Arena Big Bag',130),
  x('$104.148,00')])
];
const testAudit=(rows=base,total='$304.148,00',lines=material)=>
 diagnosticarGeometriaTotalB5i({rows,declaredTotal:total,lines});
function safe(v){
 assert.equal(v.source_verified,false);
 assert.equal(v.can_publish,false);
 assert.equal(v.can_rank,false);
 assert.equal(v.can_reveal_contacts,false);
 assert.deepEqual(Object.keys(v).sort(),[
  'code','context','column','candidate_rows','exact_cells',
  'material_rows','pages','source_verified','can_publish',
  'can_rank','can_reveal_contacts'].sort());
 assert.ok(!JSON.stringify(v).includes('304.148'));
}
test('B5i: footer amount under same material-total column is a private hint, never source proof',()=>{
 const d=testAudit([...base,row(620,[x('304.148,00')])]);
 assert.equal(d.code,'amount_after_material_table');
 assert.equal(d.column,'aligned_material_total');
 assert.equal(d.context,'no_recognizable_label');safe(d);
});
test('B5i: numeric value inside a material item cannot be called final total',()=>{
 const d=testAudit([...base], '$200.000,00');
 assert.equal(d.code,'amount_in_material_row');safe(d);
});
test('B5i: freight or VAT close to amount prevents independent labeling',()=>{
 const d=testAudit([...base,row(620,[x('IVA',300),x('$304.148,00')])]);
 assert.equal(d.code,'amount_in_fiscal_row');
 assert.equal(d.context,'fiscal_logistics_context');safe(d);
});
test('B5i: alternative commercial label is recorded only as categorical context',()=>{
 const d=testAudit([...base,row(620,[x('Saldo',400),x('$304.148,00')])]);
 assert.equal(d.context,'alternative_commercial_label');
 assert.equal(d.code,'amount_after_material_table');safe(d);
});
test('B5i: duplicated matching values on different rows fail closed',()=>{
 const d=testAudit([...base,row(620,[x('$304.148,00')]),
  row(600,[x('$304.148,00')])]);
 assert.equal(d.code,'multiple_matching_rows');safe(d);
});
test('B5i: repeated amount in two PDF.js cells fails closed',()=>{
 const d=testAudit([...base,row(620,[x('$304.148,00'),
  x('$304.148,00',560)])]);
 assert.equal(d.code,'multiple_matching_cells');safe(d);
});
test('B5i: PDF.js content merged into one text cell is flagged, never parsed as a standalone total',()=>{
 const d=testAudit([...base,row(620,[x('PRESUPUESTO 304.148,00')])]);
 assert.equal(d.code,'amount_embedded_in_text_item');safe(d);
});
test('B5i: no x/y coordinate is not a geometric proof',()=>{
 const d=testAudit([...base,{page:1,text:'304.148,00',
  parts:[x('304.148,00')]}]);
 assert.equal(d.code,'amount_with_missing_coordinates');safe(d);
});
test('B5i: no matching amount is not inferred from material subtotals',()=>{
 const d=testAudit(base);
 assert.equal(d.code,'amount_absent');safe(d);
});
test('B5i: malformed candidate total cannot become a source match',()=>{
 const d=testAudit([...base,row(620,[x('$304.148,00')])],
 'no informado');
 assert.equal(d.code,'declared_total_invalid');safe(d);
});
test('B5i: wrong x coordinate does not receive material-total alignment',()=>{
 const d=testAudit([...base,row(620,[x('$304.148,00',120)])]);
 assert.equal(d.column,'not_aligned');safe(d);
});
test('B5i: multiple inconsistent material-total columns are inconclusive',()=>{
 const changed=base.map(r=>r.y===675?row(675,[x('3,00',30),
  x('Arena Big Bag',130),x('$104.148,00',440)]):r);
 const d=testAudit([...changed,row(620,[x('$304.148,00')])]);
 assert.equal(d.column,'conflicting_columns');safe(d);
});
test('B5i: internal amount before the product band is not a final source proof',()=>{
 const d=testAudit([...base,row(780,[x('$304.148,00')])]);
 assert.equal(d.code,'amount_before_material_table');safe(d);
});
test('B5i: multiple pages preserve document page count but do not publish',()=>{
 const d=testAudit([...base,row(700,[x('$304.148,00')],2)]);
 assert.equal(d.pages,2);
 assert.equal(d.code,'material_band_unavailable');safe(d);
});
test('B5i: sensitive labels and phones are never persisted in result',()=>{
 const d=testAudit([...base,row(620,[x('Cliente 2215556666',200),
  x('$304.148,00')])]);
 assert.ok(!JSON.stringify(d).includes('2215556666'));safe(d);
});
test('B5i: NaN coordinates fail closed',()=>{
 const d=testAudit([...base,row(620,[x('$304.148,00',NaN)])]);
 assert.equal(d.code,'invalid_geometry');safe(d);
});

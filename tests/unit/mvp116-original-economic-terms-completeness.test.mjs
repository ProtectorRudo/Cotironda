import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSupplierTextSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-text.ts';

const rows=[
 '20 bolsas · Cemento CPC 50 kg · $ 9.500,00 x 20 = $ 190.000,00',
 'Flete a obra · $ 12.000,00',
 'Total: $ 202.000,00'
];
const line=(description,quantity,unit,unitPrice,total)=>({
 original_description:description,quantity,unit,
 unit_price:unitPrice,line_total:total,evidence_location:'Fila original',
 ambiguity:null
});
const proposal={status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,unanswered:[],
 lines:[
  line('Cemento CPC 50 kg','20','bolsas','$ 9.500,00','$ 190.000,00'),
  line('Flete a obra',null,null,null,'$ 12.000,00')],
 total_declared:'$ 202.000,00'};
function source(lines=rows,mime='text/plain'){
 return {mime,sha256:'c'.repeat(64),
  bytes:new TextEncoder().encode(lines.join('\n'))};
}
test('MVP116: faithfully transcribed material, freight and total still pass',()=>{
 const verified=checkSupplierTextSource(source(),proposal);
 assert.equal(verified.state,'source_text_covered');
 assert.equal(verified.reason,'covered');
 assert.equal(verified.publicationAllowed,false);
 assert.equal(verified.rankingAllowed,false);
});
test('MVP116: second occurrence of SAME $ fee cannot vanish from draft',()=>{
 const r=checkSupplierTextSource(source([
  rows[0],rows[1]+' + $ 12.000,00',rows[2]]),proposal);
 assert.equal(r.reason,'uncovered_money');
 assert.equal(r.state,'needs_source_review');
});
test('MVP116: unit price repeated once is not evidence of TWO monetary fields',()=>{
 const q={...proposal,lines:[
  line('Bolsones vacíos','1','unidad','$ 1.000,00','$ 1.000,00'),
  proposal.lines[1]],total_declared:'$ 13.000,00'};
 const r=checkSupplierTextSource(source([
  '1 unidad · Bolsones vacíos · $ 1.000,00',
  rows[1],
  'Total: $ 13.000,00']),q);
 assert.equal(r.reason,'uncovered_money');
});
test('MVP116: omitted IVA, payment, stock and delivery clauses on item lines block verification',()=>{
 for(const extra of ['IVA incluido','pago contado','entrega inmediata',
  'stock sujeto a confirmación','pago por transferencia',
  'sin flete','descuento especial','disponibilidad confirmada']){
  const r=checkSupplierTextSource(source([
    rows[0]+' · '+extra,rows[1],rows[2]]),proposal);
  assert.equal(r.reason,'uncovered_terms',extra);
 }
});
test('MVP116: TOTAL with hidden conditions is not a clean source match',()=>{
 for(const extra of ['IVA incluido','pago contado','entrega 30 días',
  'flete sin cargo','con descuento','USD']){
  const r=checkSupplierTextSource(source([
    rows[0],rows[1],rows[2]+' · '+extra]),proposal);
  assert.equal(r.reason,'uncovered_terms',extra);
 }
});
test('MVP116: no commercial claims are invented from a source with unspecified conditions',()=>{
 const r=checkSupplierTextSource(source(),proposal);
 assert.equal(r.state,'source_text_covered');
 assert.equal(r.rankingAllowed,false);
 assert.equal(r.publicationAllowed,false);
});
test('MVP116: source originally containing full IVA condition as literal ITEM is accounted for',()=>{
 const s=[
  rows[0],rows[1],'IVA incluido',
  rows[2]
 ];
 const q={...proposal,lines:[...proposal.lines,
  line('IVA incluido',null,null,null,null)]};
 const r=checkSupplierTextSource(source(s),q);
 assert.equal(r.state,'source_text_covered');
 // The independent decimal auditor must separately refuse a note without
 // an amount when quote publishing requires balanced numeric line totals.
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.rankingAllowed,false);
});
test('MVP116: source verification remains strict for CSV and does not leak original',()=>{
 const r=checkSupplierTextSource(source(rows,'text/csv'),proposal);
 assert.equal(r.state,'source_text_covered');
 assert.ok(!JSON.stringify(r).includes('Cemento'));
});

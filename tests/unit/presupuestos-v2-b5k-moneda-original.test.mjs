import test from 'node:test';
import assert from 'node:assert/strict';
import {cotejarMonedaOriginalB5k} from
 '../../src/domain/presupuestos-v2/cotejo-moneda-original-b5k.ts';
import {reconciliarEconomiaTotalB5j} from
 '../../src/domain/presupuestos-v2/reconciliacion-economica-b5j.ts';
import {diagnosticarGeometriaTotalB5i} from
 '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
const material=(ordinal,desc,qty,unit,total)=>({
 ordinal,kind:'material',original_line_raw:
  qty+' '+desc+' '+unit+' '+total,original_description_raw:desc,
 quantity_raw:qty,unit_raw:null,unit_price_raw:unit,
 unit_price_role:'effective_explicit',
 line_total_raw:total,source_location_raw:'página 1'
});
const lines=[
 material(1,'Cemento CPC','40,00','$100,00','$4.000,00'),
 material(2,'Arena Big Bag','3,00','$200,00','$600,00'),
 material(3,'Piedra Big Bag','2,00','$250,00','$500,00')
];
const candidate={document_kind:'supplier_quote',lines,
 total_declared_raw:'$5.100,00',currency_declared_raw:null,
 commercial_conditions_raw:[]};
const c=(text,x)=>({text,x});
const row=(y,parts,page=1)=>({page,y,parts,
 text:parts.map(x=>x.text).join(' ')});
const sourceRows=[
 row(745,[c('Cantidad',20),c('Descripción',120),c('Unitario',340),
  c('Total',510)]),
 row(712,[c('40,00',20),c('Cemento CPC',120),
  c('$100,00',340),c('$4.000,00',510)]),
 row(680,[c('3,00',20),c('Arena Big Bag',120),
  c('$200,00',340),c('$600,00',510)]),
 row(650,[c('2,00',20),c('Piedra Big Bag',120),
  c('$250,00',340),c('$500,00',510)]),
 row(600,[c('$5.100,00',510)])
];
const proof=(doc,reason='source_total_unverified')=>({
 state:'needs_source_review',reason,sha_verified:true,
 source_sha256:'a'.repeat(64),
 lines:doc.lines.map((line)=>({
  ordinal:line.ordinal,kind:line.kind,state:'source_line_corresponds'
 })),
 full_document_covered:false,discount_column_verified:false,
 can_publish:false,can_rank:false,can_reveal_contacts:false,
 source_rows_extracted:sourceRows.length
});
const analyze=(doc=candidate,rows=sourceRows,p=proof(doc))=>{
 const geometry=diagnosticarGeometriaTotalB5i({
  rows,declaredTotal:doc.total_declared_raw,lines:doc.lines
 });
 const evidence=cotejarMonedaOriginalB5k({
  candidate:doc,rows,source:p,geometry
 });
 const economicBefore=reconciliarEconomiaTotalB5j({
  candidate:doc,rows,source:p,geometry
 });
 const economicAfter=reconciliarEconomiaTotalB5j({
  candidate:doc,rows,source:p,geometry,currencyEvidence:evidence
 });
 return {evidence,economicBefore,economicAfter,geometry};
};
const sealed=x=>{
 for(const flag of ['source_verified','can_publish','can_rank',
 'can_reveal_contacts','full_document_covered'])assert.equal(x[flag],false);
 const v=JSON.stringify(x);
 for(const token of ['5.100','Cemento','Piedra','221555','x:'])
  assert.ok(!v.includes(token));
};
test('B5k: original source supports consistent $ despite null AI header, not ISO ARS',()=>{
 const {evidence,economicBefore,economicAfter}=analyze();
 assert.equal(evidence.code,'uniform_dollar_symbol_iso_unstated');
 assert.equal(evidence.material_count,3);
 assert.equal(evidence.material_lines_with_symbol,3);
 assert.equal(evidence.unit_prices_with_symbol,3);
 assert.equal(evidence.footer_with_symbol,true);
 assert.equal(evidence.currency_iso_verified,false);
 assert.equal(economicBefore.code,'currency_ambiguous');
 assert.equal(economicAfter.code,'grand_total_balances_private');
 assert.equal(economicAfter.material_arithmetic_matches,3);
 sealed(evidence);sealed(economicAfter);
});
test('B5k: source invoice in ARS explicit may identify ISO ARS privately',()=>{
 const rows=[...sourceRows,row(540,[c('Moneda: ARS',110)])];
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'explicit_ars_source');
 assert.equal(evidence.currency_iso_verified,true);
 assert.equal(economicAfter.code,'grand_total_balances_private');
 sealed(evidence);
});
test('B5k: USD anywhere in a footer note rejects the whole source',()=>{
 const rows=[...sourceRows,row(550,[c('Precios expresados en USD',120)])];
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'foreign_currency_detected');
 assert.equal(economicAfter.code,'currency_ambiguous');sealed(evidence);
});
test('B5k: U$S and euros are never treated as Argentine pesos',()=>{
 for(const label of ['U$S 150,00','US$ 150,00','EUR 120,00','€ 120,00',
  'dólares','USD']){
  const rows=[...sourceRows,row(540,[c(label,120)])];
  const {evidence}=analyze(candidate,rows);
  assert.equal(evidence.code,'foreign_currency_detected',label);sealed(evidence);
 }
});
test('B5k: an unprefixed source total in one material fails closed',()=>{
 const rows=sourceRows.map((r,i)=>i===2?
  row(680,[c('3,00',20),c('Arena Big Bag',120),
   c('$200,00',340),c('600,00',510)]):r);
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'material_currency_unconfirmed');
 assert.equal(economicAfter.code,'currency_ambiguous');sealed(evidence);
});
test('B5k: no symbol in the only footer is not source proof',()=>{
 const rows=sourceRows.map((r,i)=>i===4?
  row(600,[c('5.100,00',510)]):r);
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'footer_currency_unconfirmed');
 assert.equal(economicAfter.code,'currency_ambiguous');sealed(evidence);
});
test('B5k: repeated total candidate is safely rejected earlier by geometry',()=>{
 const rows=[...sourceRows,row(530,[c('$5.100,00',510)])];
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'geometry_unconfirmed');
 assert.equal(economicAfter.code,'geometry_unconfirmed');
 sealed(evidence);
});
test('B5k: declared foreign currency conflicts with dollar-source markers',()=>{
 const doc={...candidate,currency_declared_raw:'USD'};
 const {evidence}=analyze(doc);
 assert.equal(evidence.code,'candidate_currency_conflict');sealed(evidence);
});
test('B5k: missing original SHA evidence is not replaced by AI text',()=>{
 const p={...proof(candidate),sha_verified:false};
 const {evidence}=analyze(candidate,sourceRows,p);
 assert.equal(evidence.code,'source_rows_unconfirmed');sealed(evidence);
});
test('B5k: an original line that B5 did not match blocks B5k',()=>{
 const p=proof(candidate);
 const altered={...p,lines:p.lines.map((line,i)=>
  i===1?{...line,state:'source_line_not_located'}:line)};
 const {evidence}=analyze(candidate,sourceRows,altered);
 assert.equal(evidence.code,'source_rows_unconfirmed');sealed(evidence);
});
test('B5k: duplicate descriptions cannot be used as extra monetary proof',()=>{
 const rows=[...sourceRows,row(530,[c('Arena Big Bag',120)])];
 const {evidence}=analyze(candidate,rows);
 assert.ok(['geometry_unconfirmed','material_currency_unconfirmed'].includes(evidence.code));
 sealed(evidence);
});
test('B5k: no inferred foreign exchange, even when PDF has ARS and USD',()=>{
 const rows=[...sourceRows,row(530,[c('ARS / USD',110)])];
 const {evidence,economicAfter}=analyze(candidate,rows);
 assert.equal(evidence.code,'foreign_currency_detected');
 assert.equal(economicAfter.code,'currency_ambiguous');sealed(evidence);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
 checkGeneralPdfSource
} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';

const pdf={mime:'application/pdf',sha256:'a'.repeat(64),
 bytes:new Uint8Array([37,80,68,70,45])};
const detail=(original_description,quantity,unit,unit_price,line_total)=>({
 original_description,quantity,unit,unit_price,line_total,
 ambiguity:null,evidence_location:'página 1, fila'
});
const draft={
 kind:'supplier_quote',
 lines:[
 detail('cemento CPC 50 kg','20','bolsas','$8.900','$178.000'),
 detail('Flete hasta la obra',null,null,null,'$15.000'),
 detail('Pallet retornable sin cargo',null,null,null,null)
 ],
 total_declared:'$193.000',requested_delivery_note:null,unanswered:[]
};
const source=[
 '20 bolsas cemento CPC 50 kg $8.900 $178.000',
 'Flete hasta la obra $15.000',
 'Pallet retornable sin cargo',
 'TOTAL GENERAL $193.000'
];
const run=async(proposal=draft,rows=source,scanned=false)=>{
 const result=await checkGeneralPdfSource(pdf,proposal,async()=>({
  pages:1,scanned,rows:rows.map(text=>({page:1,text}))
 }));
 return result;
};
test('MVP249: PDF acredita mercadería y flete sin precio unitario ni cantidad inventada',async()=>{
 const r=await run();
 assert.equal(r.state,'source_text_covered',r.reason);
 assert.equal(r.reason,'covered');
 assert.equal(r.lines,3);
 assert.equal(r.publicationAllowed,false,'la publicación exige SQL adicional');
 assert.equal(r.rankingAllowed,false);
});
test('MVP249: líneas sin cargo se conservan sin exigir importe artificial',async()=>{
 const r=await run({...draft,lines:[draft.lines[0],draft.lines[2]],
  total_declared:'$178.000'},[source[0],source[2],'TOTAL GENERAL $178.000']);
 assert.equal(r.state,'source_text_covered',r.reason);
});
test('MVP249: jamás inventar cantidad para precio unitario declarado',async()=>{
 for(const line of [
  detail('Flete hasta la obra',null,null,'$15.000','$15.000'),
  detail('Flete hasta la obra',null,'km','$15.000','$15.000')
 ]){
  const r=await run({...draft,lines:[draft.lines[0],line,draft.lines[2]]});
  assert.equal(r.state,'needs_source_review');
  assert.equal(r.reason,'unresolved');
 }
});
test('MVP249: una cifra sin acreditar en un cargo obliga revisión',async()=>{
 const r=await run(draft,[
  source[0],'Flete hasta la obra 30 km $15.000',source[2],source[3]
 ]);
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'uncovered_number');
});
test('MVP249: no omitir flete ni inventar precio doble',async()=>{
 const noFreight={...draft,lines:[draft.lines[0],draft.lines[2]]};
 const a=await run(noFreight);
 assert.equal(a.state,'needs_source_review');
 assert.equal(a.reason,'uncovered_money');
 const other={...draft,lines:[
  draft.lines[0],{...draft.lines[1],line_total:'$12.000'},draft.lines[2]
 ]};
 const b=await run(other);
 assert.equal(b.state,'needs_source_review');
 assert.ok(['line_not_found','uncovered_money'].includes(b.reason),b.reason);
});
test('MVP249: un importe suelto o IVA adicional no queda fuera del total',async()=>{
 for(const extra of [
  'Cargo no informado $4.000',
  'IVA adicional $10.000'
 ]){
  const r=await run(draft,[...source.slice(0,3),extra,source[3]]);
  assert.equal(r.state,'needs_source_review');
  assert.equal(r.reason,'uncovered_money');
 }
});
test('MVP249: PDF escaneado no se acredita con solo dos interpretaciones de IA',async()=>{
 const r=await run(draft,source,true);
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'unsupported_layout');
});
test('MVP249: cláusulas y datos de contacto imprevistos bloquean publicación',async()=>{
 const unsafe={...draft,lines:[
  draft.lines[0],detail('Flete hasta la obra WhatsApp',null,null,null,'$15.000'),
  draft.lines[2]
 ]};
 const r=await run(unsafe);
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'unsafe_contact');
});

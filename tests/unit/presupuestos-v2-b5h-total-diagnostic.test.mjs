import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticarTotalPdfB5h} from
 '../../src/domain/presupuestos-v2/diagnostico-total-pdf-b5h.ts';

const head='Cantidad Descripción Unitario Dscto. Total';
const item='40,00 Cemento CPC $9.798,58 22.4% $304.148,00';
const row=(text,page=1)=>({page,text});
const examine=(texts,total='$304.148,00')=>
 diagnosticarTotalPdfB5h(texts.map(t=>typeof t==='string'?row(t):t),total);
const sealed=proof=>{
 assert.equal(proof.source_verified,false);
 assert.equal(proof.can_publish,false);
 assert.equal(proof.can_rank,false);
 assert.equal(proof.can_reveal_contacts,false);
 assert.deepEqual(Object.keys(proof).sort(),[
  'can_publish','can_rank','can_reveal_contacts','code',
  'detected_amount_cells','document_pages','header_rows',
  'label_rows','matching_amount_cells','source_verified'
 ].sort());
};
test('B5h: a unique labeled total on the same row is only a PRIVATE clue',()=>{
 const d=examine([head,item,'TOTAL GENERAL 304.148,00']);
 assert.equal(d.code,'same_row_corresponds_private');
 assert.equal(d.header_rows,1);
 assert.equal(d.label_rows,1);
 assert.equal(d.matching_amount_cells,1);
 sealed(d);
});
test('B5h: the expected amount on a following amount-only PDF row is not a public proof',()=>{
 const d=examine([head,item,'TOTAL GENERAL','304.148,00']);
 assert.equal(d.code,'next_row_corresponds_private');sealed(d);
});
test('B5h: a column heading does not count as a final total',()=>{
 const d=examine([head,item]);
 assert.equal(d.code,'unlabeled_amount_found');sealed(d);
 const d2=examine([head,'Cemento sin importe']);
 assert.equal(d2.code,'column_header_only');
});
test('B5h: repeated total labels cannot be resolved by price guessing',()=>{
 const d=examine([head,'TOTAL 304.148,00','TOTAL GENERAL 304.148,00']);
 assert.equal(d.code,'multiple_total_labels');sealed(d);
});
test('B5h: other taxes / freight mixed into total are excluded',()=>{
 const d=examine(['TOTAL IVA 21% $304.148,00']);
 assert.equal(d.code,'mixed_fiscal_logistics');sealed(d);
});
test('B5h: contradictory total amount remains diagnostic, not economic output',()=>{
 const d=examine(['TOTAL $304.149,00']);
 assert.equal(d.code,'total_amount_differs');sealed(d);
});
test('B5h: more than one monetary amount on a labeled total is ambiguous',()=>{
 const d=examine(['TOTAL $304.148,00 $4.200,00']);
 assert.equal(d.code,'multiple_amount_cells');sealed(d);
});
test('B5h: a next line with another field is not amount-only',()=>{
 const d=examine(['TOTAL','304.148,00 vencimiento mañana']);
 assert.equal(d.code,'next_row_has_other_content');sealed(d);
});
test('B5h: no label and no amount must not be inferred from line subtotals',()=>{
 const d=examine(['Factura A','Entrega a convenir']);
 assert.equal(d.code,'total_label_missing');sealed(d);
});
test('B5h: cannot compare unknown or malformed declared totals',()=>{
 const d=examine(['TOTAL 304.148,00'],'');
 assert.equal(d.code,'declared_total_invalid');sealed(d);
});
test('B5h: subtotal is not counted as grand total',()=>{
 const d=examine(['Sub total 304.148,00','TOTAL GENERAL 304.148,00']);
 assert.equal(d.code,'same_row_corresponds_private');
 sealed(d);
});
test('B5h: disclosure-safe diagnostics contain no source text, amounts, or contacts',()=>{
 const d=examine(['Telefono 2215555555','TOTAL 304.148,00']);
 const serialized=JSON.stringify(d);
 assert.ok(!serialized.includes('2215555555'));
 assert.ok(!serialized.includes('304.148'));
 assert.ok(!serialized.includes('TOTAL'));
 sealed(d);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {crearXlsxFixture} from '../helpers/xlsx-fixture.mjs';
import {readOfficeVisibleRows} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';
import {comprobarFilasXlsxPrivadasB5e} from
 '../../src/domain/presupuestos-v2/evidencia-xlsx-original-b5e.ts';

const row={
 ordinal:1,kind:'material',
 original_line_raw:'2 bolsas cemento CPC 50 kg $2.000,00 $4.000,00',
 original_description_raw:'cemento CPC 50 kg',
 quantity_raw:'2',unit_raw:'bolsas',
 unit_price_raw:'$2.000,00',unit_price_role:'effective_explicit',
 line_total_raw:'$4.000,00',source_location_raw:'Hoja1 fila 2'
};
const doc={document_kind:'supplier_quote',lines:[row],
 total_declared_raw:'$4.000,00',currency_declared_raw:'$',
 commercial_conditions_raw:[]};
const sheetRows=[
 ['Producto','Cantidad','Unidad','Unitario','Subtotal'],
 ['cemento CPC 50 kg','2','bolsas','$2.000,00','$4.000,00']
];
function fixture(rows=sheetRows,extra={}){
 const b=crearXlsxFixture({hojas:[rows],...extra});
 return {originalBytes:Uint8Array.from(b),
  sourceSha256:createHash('sha256').update(b).digest('hex'),
  candidate:doc,
  readRows:async(bytes,sha256)=>readOfficeVisibleRows({
   mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   bytes,sha256
  })};
}
test('B5e: source XLSX genuine ZIP/XML rows corroborate but NEVER publish',async()=>{
 const r=await comprobarFilasXlsxPrivadasB5e(fixture());
 assert.equal(r.state,'rows_correspond_private');
 assert.equal(r.reason,'rows_match_but_xlsx_not_certified');
 assert.deepEqual(r.lines,[{ordinal:1,state:'row_corresponds'}]);
 assert.equal(r.sha_verified,true);
 assert.equal(r.can_publish,false);
 assert.equal(r.can_rank,false);
 assert.equal(r.full_document_covered,false);
 assert.equal(r.formulae_verified,false);
});
test('B5e: Excel extra priced pallet row is detected, never dropped',async()=>{
 const r=await comprobarFilasXlsxPrivadasB5e(fixture([
  ...sheetRows,['pallet','1','unidad','$15.000,00','$15.000,00']
 ]));
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'unmapped_source_content');
});
test('B5e: different source unit price cannot be accepted on model claim',async()=>{
 const r=await comprobarFilasXlsxPrivadasB5e(fixture([
  sheetRows[0],['cemento CPC 50 kg','2','bolsas','$99.999,99','$4.000,00']
 ]));
 assert.equal(r.reason,'row_discrepancy');
 assert.equal(r.lines[0].state,'field_mismatch');
});
test('B5e: source with independent IVA note cannot be ignored',async()=>{
 const r=await comprobarFilasXlsxPrivadasB5e(fixture([
  ...sheetRows,['IVA según factura']
 ]));
 assert.equal(r.reason,'unmapped_source_content');
});
test('B5e: original ZIP altered after hash invalidates proof',async()=>{
 const args=fixture();
 args.originalBytes[args.originalBytes.length-5]^=1;
 const r=await comprobarFilasXlsxPrivadasB5e(args);
 assert.equal(r.reason,'sha_mismatch');assert.equal(r.sha_verified,false);
});
test('B5e: ZIP parse error is private and never exposed in HTTP',async()=>{
 const args=fixture();
 const r=await comprobarFilasXlsxPrivadasB5e({
  ...args,readRows:async()=>{throw Error('private customer phone 112233')},
 });
 assert.equal(r.reason,'reader_unavailable');
 assert.ok(!JSON.stringify(r).includes('112233'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarCotizacionSimpleD063}
 from '../../src/server/whapi-quote-simple-interpreter-d063.ts';
import {prepararCotizacionDocumentalD060}
 from '../../src/server/whapi-quote-source-builder-d060.ts';
const items=[{itemId:'cemento_001',line_no:1,unit:'bag'},
 {itemId:'pintura_002',line_no:2,unit:'l'}];
test('MVP-013: cotización $121 sin IVA produce precio original visible y neto desconocido',async()=>{
 const t='10 bolsas cemento CPC $121.00\nFlete a convenir';
 const r=await interpretarCotizacionSimpleD063(t,items);
 assert.equal(r.textoFuente,t);
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].precioInformado,'121.00');
 assert.equal(r.items[0].cantidadDisponible,'10');
 assert.deepEqual(r.items[0].evidenciaPrecio,
  {linea:1,cita:'10 bolsas cemento CPC $121.00'});
 const out=prepararCotizacionDocumentalD060(r,[{itemId:'cemento_001',line_no:1}]);
 assert.equal(out.quote.lines_snapshot[0].net_unit_price,null);
 assert.equal(out.prices[0].quoted_unit_price,'121.00');
 assert.equal(out.prices[0].vat_basis,'no_informado');
});
test('MVP-013: cotización de dos rubros se reparte por línea con IVA explicitado',async()=>{
 const t='10 bolsas cemento $121,00\n5 litros pintura látex $2.500,00\nIVA incluido 21%\nFlete sin cargo';
 const r=await interpretarCotizacionSimpleD063(t,items);
 assert.equal(r.items.length,2);
 assert.equal(r.items[1].precioInformado,'2500.00');
 const out=prepararCotizacionDocumentalD060(r,[
  {itemId:'cemento_001',line_no:1},{itemId:'pintura_002',line_no:2}
 ]);
 assert.equal(out.prices[0].vat_basis,'incluido');
 assert.equal(out.quote.lines_snapshot[0].net_unit_price,'100.00');
 assert.equal(out.prices[1].quoted_unit_price,'2500.00');
 assert.equal(out.quote.freight_gross,'0.00');
});
test('MVP-013: IVA más 21% no supone costo final ni tasa cuando no aclara alícuota',async()=>{
 const r=await interpretarCotizacionSimpleD063(
  '10 bolsas cemento: $121.00\nPrecios más IVA',items);
 const out=prepararCotizacionDocumentalD060(r,[{itemId:'cemento_001',line_no:1}]);
 assert.equal(out.prices[0].vat_basis,'no_incluido');
 assert.equal(out.quote.lines_snapshot[0].net_unit_price,'121.00');
 assert.equal(out.quote.lines_snapshot[0].vat_rate,null);
});
test('MVP-013: no atribuir importes a material ajeno, unidades equivocadas o cantidad omitida',async()=>{
 for(const t of [
  '10 bolsas arena $121.00',
  '10 cajas cemento $121.00',
  'cemento $121.00',
  'cemento 10 bolsas $121.00',
  '10 bolsas cemento $121.00 y $122.00',
  '10 bolsas cemento 121.00',
  '10 bolsas cemento $12.100',
  '10 bolsas cemento USD 121.00',
  '0 bolsas cemento $121.00'
 ]){
  assert.equal(await interpretarCotizacionSimpleD063(t,items),null,t);
 }
});
test('MVP-013: dos precios del mismo producto son ambiguos, no escoger el barato',async()=>{
 const t='10 bolsas cemento $121.00\n10 bolsas cemento $99.00';
 assert.equal(await interpretarCotizacionSimpleD063(t,items),null);
});
test('MVP-013: misma palabra genérica en productos distintos exige detalle distintivo',async()=>{
 const two=[{itemId:'cemento_loma_001',line_no:1,unit:'bag'},
  {itemId:'cemento_holcim_002',line_no:2,unit:'bag'}];
 assert.equal(await interpretarCotizacionSimpleD063(
  '10 bolsas cemento $121.00',two),null);
 const ok=await interpretarCotizacionSimpleD063(
  '10 bolsas cemento loma $121.00',two);
 assert.equal(ok.items[0].itemId,'cemento_loma_001');
});
test('MVP-013: no inventar disponibilidad, moneda, flete ni pago',async()=>{
 const r=await interpretarCotizacionSimpleD063('2 bolsas cemento $80',items);
 assert.equal(r.items[0].cantidadDisponible,'2');
 assert.equal(r.items[0].precioInformado,'80.00');
 assert.equal(r.formaPago,null);
 assert.equal(r.plazoEntregaDias,null);
 assert.equal(r.fleteInformado,null);
 assert.equal(r.minimoCompraFinal,null);
});

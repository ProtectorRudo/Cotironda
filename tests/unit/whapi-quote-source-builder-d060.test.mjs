import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepararCotizacionDocumentalD060}
 from '../../src/server/whapi-quote-source-builder-d060.ts';
import {crearPuertoRecepcionDirectaD059}
 from '../../src/server/whapi-quote-direct-postgres-d059.ts';
const text='Cemento CPC 50 kg: $121.00\nAclaraciones: flete a convenir';
const source={textoFuente:text,moneda:'ARS',formaPago:null,
 plazoEntregaDias:null,minimoCompraFinal:null,fleteInformado:null,
 evidenciaFlete:null,condicionIvaComprador:'no_especificado',
 items:[{itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
  precioInformado:'121.00',
  evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $121.00'}}]};
const mapping=[{itemId:'cemento_001',line_no:1}];
test('D060 integración: precio original $121 no se pierde sin IVA y flete',()=>{
 const r=prepararCotizacionDocumentalD060(source,mapping);
 assert.equal(r.quote.currency,'ARS');
 assert.equal(r.quote.lines_snapshot[0].net_unit_price,null);
 assert.equal(r.quote.lines_snapshot[0].vat_rate,null);
 assert.equal(r.quote.freight_gross,null);
 assert.deepEqual(r.prices,[{
  line_no:1,quoted_unit_price:'121.00',vat_basis:'no_informado',
  source_line_no:1,source_sha256:createHash('sha256')
   .update('Cemento CPC 50 kg: $121.00').digest('hex')
 }]);
 assert.ok(Object.isFrozen(r));
});
test('D060 integración: receptor guarda literal citado con la versión y sin Confirmo',async()=>{
 const prepared=prepararCotizacionDocumentalD060(source,mapping);
 const port=crearPuertoRecepcionDirectaD059({
  query:async(sql,values)=>{
   assert.match(sql,/whapi_receive_with_prices_d060/);
   assert.equal(JSON.parse(values[3]).lines_snapshot[0].net_unit_price,null);
   assert.equal(JSON.parse(values[4])[0].quoted_unit_price,'121.00');
   return{rows:[{payload:{state:'offer_received',revision:1,version:1,
     repeated:false,prices_preserved:true}}]};
  }});
 const result=await port.registrarConPrecios({
  channel:'whapi_ci',messageKey:'a'.repeat(64),expectedRevision:0,
  ...prepared
 });
 assert.equal(result.estado,'cotizacion_recibida_sin_confirmacion_extra');
});
test('D060 integración: bruto 121 IVA incluido 21% conserva bruto y neto 100',()=>{
 const full={...source,textoFuente:
  'Cemento CPC 50 kg: $121.00\nAclaraciones: IVA incluido 21%\nFlete sin cargo'};
 const x=prepararCotizacionDocumentalD060(full,mapping);
 assert.equal(x.prices[0].quoted_unit_price,'121.00');
 assert.equal(x.prices[0].vat_basis,'incluido');
 assert.equal(x.quote.lines_snapshot[0].net_unit_price,'100.00');
 assert.equal(x.quote.lines_snapshot[0].vat_rate,'21');
 assert.equal(x.quote.freight_gross,'0.00');
});
test('D060 integración: comprador pide IVA, proveedor cotiza más IVA: mostrar precio igual',()=>{
 const input={...source,
  textoFuente:'Cemento CPC 50 kg: $121.00\nPrecios más IVA 21%',
  condicionIvaComprador:'con_iva'};
 const x=prepararCotizacionDocumentalD060(input,mapping);
 assert.equal(x.prices[0].quoted_unit_price,'121.00');
 assert.equal(x.prices[0].vat_basis,'no_incluido');
 assert.equal(x.quote.lines_snapshot[0].net_unit_price,null);
 assert.ok(x.avisos.includes('condicion_iva_comprador_sin_cumplir_o_ambigua'));
});
test('D060 integración: cita falsa no crea precio ni hash, y nunca inventa valor',()=>{
 const input={...source,items:[{...source.items[0],
  evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $191.00'}}]};
 const x=prepararCotizacionDocumentalD060(input,mapping);
 assert.equal(x.prices[0].quoted_unit_price,null);
 assert.equal(x.prices[0].source_sha256,null);
 assert.equal(x.quote.lines_snapshot[0].net_unit_price,null);
});
test('D060 integración: mapeos de artículo que no pertenecen al pedido no se aceptan',()=>{
 for(const lines of [
  [],[{itemId:'otro_001',line_no:1}],
  [{itemId:'cemento_001',line_no:9}],
  [{itemId:'cemento_001',line_no:1},{itemId:'cemento_001',line_no:2}]
 ]){
  assert.throws(()=>prepararCotizacionDocumentalD060(source,lines),
   /d060_fuente_economica_invalida/);
 }
});

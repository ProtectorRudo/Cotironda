import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {crearRecepcionDirectaDeInboxD061}
 from '../../src/server/whapi-quote-inbox-processor-d061.ts';
const channel='whapi_ci',messageKey='b'.repeat(64),chatKey='a'.repeat(64);
const source='Cemento CPC 50 kg: $121.00\nFlete a convenir';
const identity={roundId:'dddddddd-0000-4000-8000-000000000204',
 supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000202'};
const items=[{itemId:'cemento_001',line_no:1,unit:'bag'}];
const time=1793455000,cryptoKeyId='aes_2026_ci';
const keys={identidadHmac:Buffer.alloc(32,1),
 huellaHmac:Buffer.alloc(32,2),contenidoAes:Buffer.alloc(32,3)};
function encrypted(text=source,nonce=Buffer.alloc(12,5)){
 const ad=Buffer.from(JSON.stringify(['cotironda','d029',1,
  channel,chatKey,messageKey,'text',time,'key-id',cryptoKeyId]));
 const cipher=createCipheriv('aes-256-gcm',keys.contenidoAes,nonce);
 cipher.setAAD(ad);
 const data=Buffer.concat([cipher.update(JSON.stringify({
  tipo:'text',texto:text,marcaTiempoUnix:time
 })),cipher.final()]);
 return {
  channel,messageKey,chatKey,...identity,kind:'text',sourceUnix:time,
  cryptoKeyId,fingerprint:'c'.repeat(64),
  cipherHex:data.toString('hex'),nonceHex:nonce.toString('hex'),
  tagHex:cipher.getAuthTag().toString('hex'),
  expectedRevision:0,roundItems:items
 };
}
function interpreter(text){
 return {textoFuente:text,moneda:'ARS',formaPago:null,
  plazoEntregaDias:null,minimoCompraFinal:null,fleteInformado:null,
  evidenciaFlete:null,condicionIvaComprador:'no_especificado',
  items:[{itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
   precioInformado:'121.00',
   evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $121.00'}}]};
}
function make(custom={}){
 const {verificarContenido}=construirBrokerWhapiPrivado({
  channel,secretoWebhook:'x'.repeat(40),habilitado:false,
  claves:keys,contenidoKeyId:cryptoKeyId,
  almacen:{resolverVinculo:async()=>null,registrarEntrada:async()=>({
    estado:'entrada_persistida',repetido:false
  }),registrarBaja:async()=>({estado:'baja_registrada',repetido:false})},
  ahoraUnix:()=>time
 });
 const calls=[];
 const sqlDb={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('quote_read_d061'))return{rows:[{payload:custom.read??encrypted()}]};
  return {rows:[{payload:custom.receipt??{
   state:'offer_received',version:1,revision:1,
   repeated:false,prices_preserved:true}}]};
 }};
 return {calls,port:crearRecepcionDirectaDeInboxD061(
  sqlDb,verificarContenido,custom.interpret??(async text=>interpreter(text)))};
}
test('D061: inbox AES-GCM real -> fuente cotejada -> versión D060, sin Confirmo',async()=>{
 const {port,calls}=make();
 const r=await port.procesar(channel,messageKey);
 assert.deepEqual(r,{estado:'cotizacion_recibida',version:1,
  repetido:false,precios:1,datosNoInformados:4});
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/whapi_quote_read_d061/);
 assert.match(calls[1].sql,/whapi_receive_with_prices_d060/);
 const offer=JSON.parse(calls[1].params[3]);
 const disclosure=JSON.parse(calls[1].params[4]);
 assert.equal(offer.lines_snapshot[0].net_unit_price,null);
 assert.equal(offer.freight_gross,null);
 assert.equal(disclosure[0].quoted_unit_price,'121.00');
 assert.equal(disclosure[0].vat_basis,'no_informado');
});
test('D061: banco devuelve null, se ignora sin escribir ni pedir confirmación',async()=>{
 const {port,calls}=make({read:null});
 assert.deepEqual(await port.procesar(channel,messageKey),{estado:'no_disponible_o_no_habilitado'});
 assert.equal(calls.length,1);
});
test('D061: descifrado AES-GCM adulterado no invoca escritura',async()=>{
 const altered=encrypted();
 altered.tagHex='f'.repeat(32);
 const {port,calls}=make({read:altered});
 await assert.rejects(port.procesar(channel,messageKey),/d061_cotizacion_no_disponible/);
 assert.equal(calls.length,1);
});
test('D061: no acepta BAJA ni Confirmo como presupuestos',async()=>{
 for(const value of ['Confirmo','BAJA']){
  const {port,calls}=make({read:encrypted(value)});
  await assert.rejects(port.procesar(channel,messageKey),/d061_cotizacion_no_disponible/);
  assert.equal(calls.length,1);
 }
});
test('D061: IA no puede cambiar texto fuente, artículo, unidad o condición comprador',async()=>{
 const variants=[
  ()=>({...interpreter(source),textoFuente:'otro texto'}),
  ()=>({...interpreter(source),condicionIvaComprador:'con_iva'}),
  ()=>({...interpreter(source),moneda:'USD'}),
  ()=>({...interpreter(source),items:[{
   ...interpreter(source).items[0],itemId:'pintura_001'}]}),
  ()=>({...interpreter(source),items:[{
   ...interpreter(source).items[0],unidad:'box'}]})
 ];
 for(const variant of variants){
  const {port,calls}=make({interpret:async()=>variant()});
  await assert.rejects(port.procesar(channel,messageKey),/d061_cotizacion_no_disponible/);
  assert.equal(calls.length,1);
 }
});
test('D061: cita adulterada o respuesta sin precio no crea ofertas falsas',async()=>{
 for(const variant of [
  {...interpreter(source),items:[{...interpreter(source).items[0],
   evidenciaPrecio:{linea:1,cita:'Cemento: $9999.00'}}]},
  null
 ]){
  const {port,calls}=make({interpret:async()=>variant});
  const result=await port.procesar(channel,messageKey);
  assert.deepEqual(result,{estado:'sin_precio_atribuible'});
  assert.equal(calls.length,1);
 }
});
test('D061: replay lee revisión persistida y devuelve recibo repetido',async()=>{
 const read=encrypted();read.expectedRevision=0;
 const {port,calls}=make({read,receipt:{
  state:'offer_received',version:1,revision:1,
  repeated:true,prices_preserved:true
 }});
 const r=await port.procesar(channel,messageKey);
 assert.equal(r.repetido,true);
 assert.equal(calls.length,2);
});
test('D061: fallo SQL en lectura o escritura no expone datos',async()=>{
 const {verificarContenido}=construirBrokerWhapiPrivado({
  channel,secretoWebhook:'x'.repeat(40),habilitado:false,claves:keys,
  contenidoKeyId:cryptoKeyId,
  almacen:{resolverVinculo:async()=>null,registrarEntrada:async()=>({
   estado:'entrada_persistida',repetido:false}),registrarBaja:async()=>({
   estado:'baja_registrada',repetido:false})},
  ahoraUnix:()=>time
 });
 const p=crearRecepcionDirectaDeInboxD061({query:async()=>{throw Error('supplier_private_key')}},
  verificarContenido,async t=>interpreter(t));
 await assert.rejects(p.procesar(channel,messageKey),
  e=>e.message==='d061_cotizacion_no_disponible');
});

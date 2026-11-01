import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPuertoPostgresWhapiDualD074 as crear}
 from '../../src/server/whapi-postgres-gateway.ts';

const org='aaaaaaaa-0074-4074-8074-000000000741';
const channel='whapi_piloto',chatKey='a'.repeat(64),messageKey='b'.repeat(64);
const fingerprint='c'.repeat(64);
const input=()=>({channel,chatKey,messageKey,fingerprint,
 buyerOrgId:org,kind:'text',ciphertext:Buffer.alloc(25,7),
 nonce:Buffer.alloc(12,9),tag:Buffer.alloc(16,3),
 sourceUnix:1800000000,cryptoKeyId:'aes_2026_a'});
function fake(responses=[]){
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  const value=responses.shift();
  if(value instanceof Error)throw value;
  return {rows:[{payload:value??null}]};
 }};
 return {calls,port:crear(db)};
}
test('MVP043: gateway proveedor existente mantiene sus puertos',()=>{
 const x=fake();
 for(const name of ['resolverVinculo','registrarEntrada','registrarBaja',
  'resolverComprador','registrarEntradaComprador','registrarBajaComprador'])
  assert.equal(typeof x.port[name],'function');
});
test('MVP043: consulta HMAC buyer y no devuelve nombres, teléfonos ni tokens',async()=>{
 const x=fake([{
  buyerOrgId:org,consentimientoContactoVigente:true,chatHabilitado:true
 }]);
 const r=await x.port.resolverComprador(channel,chatKey);
 assert.deepEqual(r,{buyerOrgId:org,consentimientoContactoVigente:true,
  chatHabilitado:true});
 assert.deepEqual(x.calls[0].args,[channel,chatKey]);
 assert.match(x.calls[0].sql,/whapi_resolve_buyer_d074/);
 assert.equal(JSON.stringify(r).includes('549'),false);
});
test('MVP043: comprador no reconocido retorna null, no inventa registro',async()=>{
 const x=fake();
 assert.equal(await x.port.resolverComprador(channel,chatKey),null);
 assert.equal(x.calls.length,1);
});
test('MVP043: escritura usa placeholders, parámetros binarios y un solo RPC',async()=>{
 const x=fake([{estado:'entrada_persistida',repetido:false}]);
 assert.deepEqual(await x.port.registrarEntradaComprador(input()),
  {estado:'entrada_persistida',repetido:false});
 assert.match(x.calls[0].sql,/whapi_record_buyer_d074/);
 assert.ok(x.calls[0].sql.includes('$10::text'));
 assert.equal(x.calls[0].sql.includes(org),false);
 assert.equal(x.calls[0].args[0],channel);
 assert.equal(x.calls[0].args[3],fingerprint);
 assert.equal(x.calls[0].args[9],'aes_2026_a');
 assert.ok(Buffer.isBuffer(x.calls[0].args[5]));
 assert.equal(x.calls.length,1);
});
test('MVP043: BAJA sin texto cifrado usa solo HMAC y resultado acotado',async()=>{
 const x=fake([{estado:'baja_registrada',repetido:false}]);
 const d=input();
 assert.deepEqual(await x.port.registrarBajaComprador(d),{
  estado:'baja_registrada',repetido:false
 });
 assert.match(x.calls[0].sql,/whapi_buyer_optout_d074/);
 assert.deepEqual(x.calls[0].args,[channel,chatKey,messageKey,
  fingerprint,1800000000]);
 assert.equal(x.calls.length,1);
});
test('MVP043: input comprador mal formado no consulta DB',async()=>{
 const x=fake();
 for(const patch of [
  {buyerOrgId:'forged'}, {chatKey:'telefono'},
  {kind:'opt_out'}, {sourceUnix:-1},{cryptoKeyId:'legacy_d029'},
  {nonce:Buffer.alloc(10)}, {ciphertext:Buffer.alloc(0)}
 ]){
  await assert.rejects(x.port.registrarEntradaComprador({
   ...input(),...patch}),/whapi_gateway_no_disponible/);
 }
 assert.equal(x.calls.length,0);
});
test('MVP043: payload SQL inválido o error DB se anonimiza',async()=>{
 for(const data of [
  {estado:'precio_confirmado',repetido:false},
  {estado:'entrada_persistida',repetido:'yes'},
  new Error('PRIVATE_DATABASE_SECRET')
 ]){
  const x=fake([data]);
  await assert.rejects(x.port.registrarEntradaComprador(input()),e=>{
   assert.equal(e.message,'whapi_gateway_no_disponible');return true;
  });
 }
});
test('MVP043: binding buyer falsificado, malformado o sin consentimiento falla cerrado',async()=>{
 for(const data of [
  {buyerOrgId:'FAKE',consentimientoContactoVigente:true,chatHabilitado:true},
  {buyerOrgId:org,consentimientoContactoVigente:false,chatHabilitado:true},
  {buyerOrgId:org,consentimientoContactoVigente:true,chatHabilitado:true,telefono:'secret'}
 ]){
  const x=fake([data]);
  await assert.rejects(x.port.resolverComprador(channel,chatKey),
   /whapi_gateway_no_disponible/);
 }
});

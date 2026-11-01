import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cargarConfiguracionWhapiPrivada,verificarRetiroSeguroClaves}
 from '../../src/server/whapi-secret-config.ts';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';

const hex=()=>randomBytes(32).toString('hex');
function env(){
 return {
   COTIRONDA_WHAPI_ENABLED:'true',
   COTIRONDA_WHAPI_RUNTIME:'test',
   COTIRONDA_WHAPI_CHANNEL:'whapi_ci_secure',
   COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX:hex(),
   COTIRONDA_WHAPI_HMAC_ID_HEX:hex(),
   COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:hex(),
   COTIRONDA_WHAPI_AES_ACTIVE_HEX:hex(),
   COTIRONDA_WHAPI_AES_ACTIVE_ID:'aes_2026_b',
   COTIRONDA_WHAPI_AES_READ_KEYS_JSON:JSON.stringify({aes_2026_a:hex()})
 };
}
test('deshabilitada por defecto sin secretos: no permite iniciar broker',()=>{
 assert.equal(cargarConfiguracionWhapiPrivada({},'test'),null);
 assert.equal(cargarConfiguracionWhapiPrivada({COTIRONDA_WHAPI_ENABLED:'false'},'test'),null);
});
test('carga solo claves privadas de ambiente esperado, con AES histórico',()=>{
 const raw=env();
 const config=cargarConfiguracionWhapiPrivada(raw,'test');
 assert.equal(config.habilitado,true);
 assert.equal(config.channel,'whapi_ci_secure');
 assert.equal(config.contenidoKeyId,'aes_2026_b');
 assert.deepEqual([...Object.keys(config.clavesLectura)],['aes_2026_a']);
 assert.equal(config.claves.identidadHmac.length,32);
 assert.equal(config.claves.huellaHmac.length,32);
 assert.equal(config.claves.contenidoAes.length,32);
 assert.equal(config.clavesLectura.aes_2026_a.length,32);
 assert.notEqual(config.claves.contenidoAes.toString('hex'),raw.COTIRONDA_WHAPI_AES_READ_KEYS_JSON);
});
test('configuración cargada conecta a D029 sin publicar ruta ni confirmar presupuesto',async()=>{
 const raw=env();
 const config=cargarConfiguracionWhapiPrivada(raw,'test');
 const messages=[];
 const broker=construirBrokerWhapiPrivado({
   ...config,ahoraUnix:()=>1800000000,
   almacen:{
    resolverVinculo:async()=>({
      supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000302',
      roundId:'dddddddd-0000-4000-8000-000000000304',
      consentimientoVigente:true,invitacionVigente:true
    }),
    registrarEntrada:async d=>{
      messages.push(d);return {estado:'entrada_persistida',repetido:false};
    },
    registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
   }
 });
 const request=new Request('https://example.invalid/whapi',{method:'POST',headers:{
  'content-type':'application/json',
  'x-cotironda-webhook-key':config.secretoWebhook
 },body:JSON.stringify({
  event:{type:'messages',event:'post'},channel_id:config.channel,
  messages:[{id:'msg.testing-001',from:'5492211234567',
    chat_id:'5492211234567@s.whatsapp.net',from_me:false,
    type:'text',timestamp:1800000000,text:{body:'Cemento 100 bolsas'}}]
 })});
 const response=await procesarWebhookWhapiAislado(request,broker.dependencias);
 assert.equal(response.status,200);
 assert.equal((await response.json()).presupuestosConfirmados,0);
 assert.equal(messages.length,1);
 assert.equal(messages[0].cryptoKeyId,'aes_2026_b');
 assert.equal(broker.verificarContenido(messages[0]).texto,'Cemento 100 bolsas');
});
test('rechaza cualquier NEXT_PUBLIC_COTIRONDA_WHAPI, incluso apagada',()=>{
 assert.throws(()=>cargarConfiguracionWhapiPrivada({
  COTIRONDA_WHAPI_ENABLED:'false',
  NEXT_PUBLIC_COTIRONDA_WHAPI_AES_ACTIVE_HEX:'accidental'
 },'test'),/whapi_secret_config_invalid/);
});
test('bloquea diferencias de entorno, habilitación ambigua y nombre de canal',()=>{
 const good=env();
 for(const bad of [
   {...good,COTIRONDA_WHAPI_RUNTIME:'production'},
   {...good,COTIRONDA_WHAPI_ENABLED:'yes'},
   {...good,COTIRONDA_WHAPI_ENABLED:'TRUE'},
   {...good,COTIRONDA_WHAPI_CHANNEL:'whapi_test;drop table'},
   {...good,COTIRONDA_WHAPI_AES_ACTIVE_ID:'legacy_d029'},
   {...good,COTIRONDA_WHAPI_AES_ACTIVE_ID:'../root'},
   {...good,COTIRONDA_WHAPI_AES_ACTIVE_ID:'X'}
 ])assert.throws(()=>cargarConfiguracionWhapiPrivada(bad,'test'),/whapi_secret_config_invalid/);
});
test('rechaza faltantes, valores inválidos o claves AES/HMAC evidentes débiles',()=>{
 const good=env();
 for(const k of ['COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX',
  'COTIRONDA_WHAPI_HMAC_ID_HEX','COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX',
  'COTIRONDA_WHAPI_AES_ACTIVE_HEX']){
   for(const val of [undefined,'A'.repeat(64),'f'.repeat(63),'0'.repeat(64),
     'ff'.repeat(32),'123456']){
    assert.throws(()=>cargarConfiguracionWhapiPrivada({...good,[k]:val},'test'),
      /whapi_secret_config_invalid/);
   }
 }
});
test('no admite reutilizar una clave para varios fines criptográficos',()=>{
 const good=env();
 assert.throws(()=>cargarConfiguracionWhapiPrivada({
  ...good,COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:good.COTIRONDA_WHAPI_HMAC_ID_HEX
 },'test'));
 assert.throws(()=>cargarConfiguracionWhapiPrivada({
  ...good,COTIRONDA_WHAPI_AES_ACTIVE_HEX:good.COTIRONDA_WHAPI_HMAC_ID_HEX
 },'test'));
 assert.throws(()=>cargarConfiguracionWhapiPrivada({
  ...good,COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX:good.COTIRONDA_WHAPI_AES_ACTIVE_HEX
 },'test'));
});
test('archivo histórico limitado y validado contra duplicados',()=>{
 const good=env();
 const duplicated=JSON.stringify({aes_2026_a:good.COTIRONDA_WHAPI_AES_ACTIVE_HEX});
 for(const archive of [
  duplicated,'["aes_2026_a"]','{"aes_2026_a":"x"}','{',
  JSON.stringify({aes_2026_b:hex()}),
  JSON.stringify({aes_2026_a:hex(),aes_2026_c:hex(),
    aes_2026_d:hex(),aes_2026_e:hex(),aes_2026_f:hex(),aes_2026_g:hex()})
 ]){
  assert.throws(()=>cargarConfiguracionWhapiPrivada({
   ...good,COTIRONDA_WHAPI_AES_READ_KEYS_JSON:archive
  },'test'),/whapi_secret_config_invalid/);
 }
});
test('error de configuración no revela la clave ni el entorno',()=>{
 const good=env();
 try{
  cargarConfiguracionWhapiPrivada({...good,
   COTIRONDA_WHAPI_AES_ACTIVE_HEX:'exponer_esta_clave'},'test');
  assert.fail('must fail');
 }catch(err){
  assert.equal(err.message,'whapi_secret_config_invalid');
  assert.equal(err.message.includes(good.COTIRONDA_WHAPI_HMAC_ID_HEX),false);
 }
});
test('retiro seguro falla si aún existen filas asociadas a una clave antigua',()=>{
 assert.throws(()=>verificarRetiroSeguroClaves(
  ['aes_a','aes_b'],['aes_a'],
  [{keyId:'aes_a',rows:1},{keyId:'aes_b',rows:0}]
 ),/whapi_secret_config_invalid/);
});
test('retiro seguro exige inventario completo, no confía en omisiones o negativos',()=>{
 for(const inventory of [
  [{keyId:'aes_a',rows:0}],
  [{keyId:'aes_a',rows:0},{keyId:'aes_b',rows:-1}],
  [{keyId:'aes_a',rows:0},{keyId:'aes_b',rows:NaN}],
  [{keyId:'aes_a',rows:0},{keyId:'aes_b',rows:0},{keyId:'aes_b',rows:0}],
  [{keyId:'aes_a',rows:0},{keyId:'otro',rows:0}]
 ])assert.throws(()=>verificarRetiroSeguroClaves(
  ['aes_a','aes_b'],['aes_a'],inventory));
});
test('retiro seguro autoriza únicamente clave con cero filas',()=>{
 assert.deepEqual(verificarRetiroSeguroClaves(
  ['aes_a','aes_b'],['aes_a'],
  [{keyId:'aes_a',rows:0},{keyId:'aes_b',rows:41}]
 ),{retirable:true,ids:['aes_a']});
});

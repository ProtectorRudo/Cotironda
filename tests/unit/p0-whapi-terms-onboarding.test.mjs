import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {crearEmisorAvisoTerminosP0} from '../../src/server/whapi-terms-onboarding-p0.ts';
import {calcularChatDestinatarioD056} from '../../src/server/whapi-send-authorization-d056.ts';

const TOKEN='CI_TOKEN_SYNTHETIC_ONLY_abcdefghijklmnopqrstuvwxyz';
const CHANNEL='pilot_whapi_ci';
const TO='5492211234567';
const ID='p.outgoing-0000000551';
const KEY=Buffer.alloc(32,31);
const VERSION='cotironda-originales-alta-v1';
const BODY='Condiciones de alta '+VERSION+' — '+
 'Autorizo únicamente para rondas posteriores a mi aceptación expresa que el comprador autenticado pueda descargar el original tras el cierre, incluidos presupuestos parciales y no adjudicados. '+
 'Soy consciente de que el original puede contener datos de contacto o bancarios.';
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const noticeMac=x=>createHmac('sha256',KEY)
 .update(JSON.stringify(['cotironda','msg',1,CHANNEL,x]))
 .digest('hex');
const CLAIM=Object.freeze({
 state:'leased',jobId:'eeeeeeee-0000-4000-8000-000000000551',
 leaseToken:'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 supplierKey:'corralon_ailin',channel:CHANNEL,
 chatHmac:calcularChatDestinatarioD056(CHANNEL,TO,KEY),
 termsVersion:VERSION,termsSha256:sha(BODY),body:BODY
});
const answer=()=>new Response(JSON.stringify({
 sent:true,message:{id:ID,status:'pending',type:'text',
  chat_id:TO+'@s.whatsapp.net',from_me:true}
}),{status:200,headers:{'content-type':'application/json'}});
function fixture(override={}){
 const calls={claim:0,begin:0,auth:0,finish:[],fetch:0,recipients:0};
 const claim=Object.hasOwn(override,'claim')?override.claim:CLAIM;
 const ports={
  claim:async()=>{calls.claim++;return claim},
  resolveRecipient:async()=>{calls.recipients++;return TO},
  beginCommitted:async()=>{calls.begin++;return {state:'in_flight',jobId:CLAIM.jobId}},
  authorizeCommitted:async()=>{calls.auth++;return true},
  finishCommitted:async r=>{calls.finish.push(r);return {state:r.state}},
  ...override.ports
 };
 const config={
  habilitado:true,pilotoAutorizado:true,channel:CHANNEL,token:TOKEN,
  identityKey:KEY,destinatariosPermitidos:[TO],
  fetcher:async()=>{calls.fetch++;return answer()},ports,...override.config
 };
 return {calls,config,run:()=>crearEmisorAvisoTerminosP0(config).procesarUno()};
}
test('P0 aviso: apagado, sin transporte o sin permiso explícito NO reclama ni envía',async()=>{
 for(const config of [
  {habilitado:false},{pilotoAutorizado:false},
  {fetcher:undefined},{token:undefined},{destinatariosPermitidos:[]}
 ]){
  const x=fixture({config});
  assert.deepEqual(await x.run(),{estado:'desactivado'});
  assert.equal(x.calls.claim,0);
  assert.equal(x.calls.fetch,0);
 }
});
test('P0 aviso: prueba de Whapi 200 con ID y HMAC correcto; no acredita aceptación',async()=>{
 const x=fixture();
 const result=await x.run();
 assert.deepEqual(result,{estado:'aceptado_por_transporte'});
 assert.equal(x.calls.begin,1);
 assert.equal(x.calls.auth,1);
 assert.equal(x.calls.fetch,1);
 assert.equal(x.calls.finish.length,1);
 assert.deepEqual(x.calls.finish[0],{
  jobId:CLAIM.jobId,leaseToken:CLAIM.leaseToken,
  supplierKey:CLAIM.supplierKey,termsVersion:VERSION,
  termsSha256:sha(BODY),state:'api_accepted',
  noticeMessageHmac:noticeMac(ID),outboundBodySha256:sha(BODY)
 });
 assert.equal(JSON.stringify(result).includes(TO),false);
 assert.equal(JSON.stringify(result).includes(TOKEN),false);
});
test('P0 aviso: falta trabajo o claim no confiable bloquea antes de comenzar',async()=>{
 const empty=fixture({claim:null});
 assert.deepEqual(await empty.run(),{estado:'sin_trabajo'});
 assert.equal(empty.calls.begin,0);
 for(const patch of [
  {termsSha256:'0'.repeat(64)}, {chatHmac:'0'.repeat(64)},
  {termsVersion:'invalid'}, {supplierKey:'x'},
  {channel:'other_channel'}, {jobId:'not-uuid'},
  {body:'Cotización enviada'}, {body:BODY+'x'},
  {body:BODY+'\u0000'}, {leaseToken:'bad-lease'}
 ]){
  const x=fixture({claim:{...CLAIM,...patch}});
  assert.deepEqual(await x.run(),{estado:'bloqueado_preenvio'},
   JSON.stringify(patch));
  assert.equal(x.calls.fetch,0);
  assert.equal(x.calls.begin,0);
 }
});
test('P0 aviso: destino cambiado o no permitido impide HTTP',async()=>{
 for(const to of ['5492219999999','+5492211234567','123']){
  const x=fixture({ports:{resolveRecipient:async()=>to}});
  assert.deepEqual(await x.run(),{estado:'bloqueado_preenvio'});
  assert.equal(x.calls.begin,0);assert.equal(x.calls.fetch,0);
 }
});
test('P0 aviso: participante que no es proveedor debe ser rechazado por SQL antes de HTTP',async()=>{
 const x=fixture({
  claim:{...CLAIM,supplierKey:'arquitecto'},
  ports:{authorizeCommitted:async()=>false}
 });
 assert.deepEqual(await x.run(),{estado:'incierto_sin_reenvio'});
 assert.equal(x.calls.fetch,0);
 assert.equal(x.calls.finish.length,1);
 assert.equal(x.calls.finish[0].noticeMessageHmac,null);
});
test('P0 aviso: BEGIN desconocido o falla SQL => nunca llega a Whapi',async()=>{
 for(const beginCommitted of [
  async()=>{throw Error('postgres-connection-lost')},
  async()=>({state:'cancelled',jobId:CLAIM.jobId}),
  async()=>({state:'in_flight',jobId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
 ]){
  const x=fixture({ports:{beginCommitted}});
  assert.deepEqual(await x.run(),{estado:'sin_envio_estado_desconocido'});
  assert.equal(x.calls.fetch,0);
  assert.equal(x.calls.finish.length,0);
 }
});
test('P0 aviso: revocación/cambio de política luego de BEGIN bloquea antes de fetch',async()=>{
 const x=fixture({ports:{authorizeCommitted:async()=>false}});
 assert.deepEqual(await x.run(),{estado:'incierto_sin_reenvio'});
 assert.equal(x.calls.fetch,0);
 assert.equal(x.calls.finish.length,1);
 assert.equal(x.calls.finish[0].state,'uncertain');
 assert.equal(x.calls.finish[0].noticeMessageHmac,null);
});
test('P0 aviso: timeout, response sin ID, chat cruzado son incertidumbre sin reenvío',async()=>{
 const cases=[
  async()=>{throw Error('timeout');},
  async()=>new Response(JSON.stringify({sent:true}),{
    status:200,headers:{'content-type':'application/json'}}),
  async()=>new Response(JSON.stringify({sent:true,message:{
   id:ID,status:'pending',chat_id:'5492219999999@s.whatsapp.net'}}),{
    status:200,headers:{'content-type':'application/json'}})
 ];
 for(const fetcher of cases){
  const x=fixture({config:{fetcher}});
  assert.deepEqual(await x.run(),{estado:'incierto_sin_reenvio'});
  assert.equal(x.calls.finish.length,1);
  assert.equal(x.calls.finish[0].state,'uncertain');
  assert.equal(x.calls.finish[0].noticeMessageHmac,null);
 }
});
test('P0 aviso: fallo al persistir ACK es incierto, nunca inventa ledger',async()=>{
 const x=fixture({ports:{finishCommitted:async()=>{throw Error('db-error')}}});
 assert.deepEqual(await x.run(),{estado:'incierto_sin_reenvio'});
 assert.equal(x.calls.fetch,1);
});
test('P0 aviso: body exacto viaja a Whapi, sin datos extra ni segundo envío',async()=>{
 let args,requested=0;
 const x=fixture({config:{fetcher:async(_url,init)=>{
  requested++;args=JSON.parse(init.body);
  return answer();
 }}});
 assert.deepEqual(await x.run(),{estado:'aceptado_por_transporte'});
 assert.equal(requested,1);
 assert.deepEqual(args,{to:TO,body:BODY,no_link_preview:true,typing_time:0});
});

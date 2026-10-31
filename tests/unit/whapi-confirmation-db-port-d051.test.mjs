import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';
import {calcularAcuseSalidaD050}
 from '../../src/server/whapi-quoted-confirmation-d050.ts';
import {crearPuertoPostgresConfirmacionD051}
 from '../../src/server/whapi-confirmation-postgres-d051.ts';

const CHANNEL='d051_ci',CHAT='5492211234567@s.whatsapp.net',SENDER='5492211234567';
const ORG='bbbbbbbb-0000-4000-8000-000000000512';
const ROUND='dddddddd-0000-4000-8000-000000000514';
const JOB='eeeeeeee-0000-4000-8000-000000000515';
const NOW=1800000000,SECRET='d051_SECRET_WEBHOOK_SINTETICO_0123456789';
const QUOTE='p.outbound-00000051';
const KEY=Buffer.alloc(32,47);
async function setup(){
 const memory={stored:null,queries:[],respond:null};
 const broker=construirBrokerWhapiPrivado({
   channel:CHANNEL,secretoWebhook:SECRET,habilitado:true,ahoraUnix:()=>NOW,
   claves:{identidadHmac:Buffer.alloc(32,14),
     huellaHmac:Buffer.alloc(32,24),contenidoAes:Buffer.alloc(32,34)},
   contenidoKeyId:'aes_d051_ci',
   almacen:{
    resolverVinculo:async()=>({supplierOrgId:ORG,roundId:ROUND,
       consentimientoVigente:true,invitacionVigente:true}),
    registrarEntrada:async d=>{memory.stored=d;return {
       estado:'entrada_persistida',repetido:false};},
    registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
   }
 });
 const message={id:'p.inbound-00000051',chat_id:CHAT,from:SENDER,
  from_me:false,type:'text',timestamp:NOW,
  text:{body:'Confirmo'},context:{quoted_id:QUOTE}};
 const request=new Request('https://offline.invalid',{
  method:'POST',headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({channel_id:CHANNEL,event:{type:'messages',event:'post'},
   messages:[message]})
 });
 assert.equal((await procesarWebhookWhapiAislado(request,broker.dependencias)).status,200);
 const d=memory.stored;
 const ackHmac=calcularAcuseSalidaD050(KEY,CHANNEL,QUOTE);
 const row={
  channel:CHANNEL,chatKey:d.chatKey,messageKey:d.messageKey,
  supplierOrgId:ORG,roundId:ROUND,kind:d.kind,sourceUnix:d.sourceUnix,
  cryptoKeyId:d.cryptoKeyId,fingerprint:d.fingerprint,
  cipherHex:d.ciphertext.toString('hex'),nonceHex:d.nonce.toString('hex'),
  tagHex:d.tag.toString('hex')
 };
 const ack={jobId:JOB,roundId:ROUND,supplierOrgId:ORG,
  channel:CHANNEL,chatKey:d.chatKey,originMessageKey:'c'.repeat(64),
  revision:1,transportAckHmac:ackHmac,estado:'accepted_by_transport'};
 const mockDb={query:async(sql,params)=>{
  memory.queries.push({sql,params});
  if(sql.includes('_load_inbox_d051'))return {rows:[{payload:row}]};
  if(sql.includes('_find_ack_d051'))return {rows:[{payload:ack}]};
  if(sql.includes('_from_inbox_d049')){
   return {rows:[{payload:memory.respond===undefined?{
    state:'offer_confirmed',revision:1,version:1,repeated:false}:memory.respond}]};
  }
  throw Error('unexpected SQL');
 }};
 return {memory,broker,d,row,ack,mockDb,ackHmac};
}
test('D051: puerto real de código D050 → RPC cifrado → acuse → D049',async()=>{
 const x=await setup();
 const port=crearPuertoPostgresConfirmacionD051(x.mockDb,x.broker.verificarContenido);
 const res=await port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY);
 assert.deepEqual(res,{estado:'cotizacion_confirmada_en_pg',
   revision:1,version:1,repetido:false});
 assert.equal(x.memory.queries.length,4); // load, recheck origin, ack, confirm
 assert.ok(x.memory.queries.every(q=>q.sql.includes('cotironda_private.')&&
   q.sql.includes('$1::text')&&q.sql.includes(' as payload')));
 assert.deepEqual(x.memory.queries[0].params,[CHANNEL,x.d.messageKey]);
 assert.deepEqual(x.memory.queries[2].params,[CHANNEL,x.ackHmac]);
 const last=x.memory.queries[3].params;
 assert.equal(last[0],CHANNEL);
 assert.equal(last[1],x.d.messageKey);
 assert.equal(last[2],JOB);
 assert.match(last[3],/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(last[4],x.ackHmac);assert.match(last[5],/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(x.memory.queries).includes(QUOTE));
 assert.ok(!JSON.stringify(x.memory.queries).includes(SENDER));
});
test('D051: reintento de Confirmo genera mismo ID de evento y deja idempotencia a D049',async()=>{
 const x=await setup(),port=crearPuertoPostgresConfirmacionD051(
   x.mockDb,x.broker.verificarContenido);
 await port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY);
 const earlier=x.memory.queries.at(-1).params;
 x.memory.respond={state:'offer_confirmed',revision:1,version:1,repeated:true};
 const res=await port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY);
 assert.equal(res.repetido,true);
 assert.deepEqual(x.memory.queries.at(-1).params,earlier);
});
test('D051: se rechaza carga falsificada con chat, round, firma o bytes falsos',async()=>{
 for(const [field,bad] of [
  ['messageKey','f'.repeat(64)],['supplierOrgId','no-uuid'],
  ['cryptoKeyId',''],['tagHex','a'],['nonceHex','f'.repeat(10)],
  ['cipherHex','gg'],['channel','other-channel'],['fingerprint','xxxx'],
  ['extra','whapi-SUPERUSER']
 ]){
  const x=await setup(),obj={...x.row,[field]:bad};
  const port=crearPuertoPostgresConfirmacionD051({
   query:async()=>({rows:[{payload:obj}]})
  },x.broker.verificarContenido);
  await assert.rejects(port.cargarEntrada(CHANNEL,x.d.messageKey),
    /d051_confirmacion_no_disponible/);
 }
});
test('D051: cita falta o difiere, no llama RPC económica D049',async()=>{
 const x=await setup(),port=crearPuertoPostgresConfirmacionD051(
  {query:async(sql,params)=>{
   x.memory.queries.push({sql,params});
   if(sql.includes('_load_inbox_d051'))
    return {rows:[{payload:x.row}]};
   if(sql.includes('_find_ack_d051'))return {rows:[{payload:null}]};
   throw Error('should_not_confirm');
  }},x.broker.verificarContenido);
 await assert.rejects(port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY),
  /d050_confirmacion_no_verificada/);
 assert.ok(!x.memory.queries.some(q=>q.sql.includes('_from_inbox_d049')));
});
test('D051: sin entrada o SQL fallido no genera confirmación',async()=>{
 const x=await setup();
 for(const response of [{rows:[{payload:null}]},{rows:[]},
   {rows:[{payload:null},{payload:null}]},{rows:[{foo:1}]}]){
  const port=crearPuertoPostgresConfirmacionD051(
   {query:async()=>response},x.broker.verificarContenido);
  await assert.rejects(port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY));
 }
 const port=crearPuertoPostgresConfirmacionD051(
  {query:async()=>{throw Error('db_private_connection_with_secret')}},x.broker.verificarContenido);
 await assert.rejects(port.cargarEntrada(CHANNEL,x.d.messageKey),
  e=>e.message==='d051_confirmacion_no_disponible');
});
test('D051: D049 no puede declarar confirmación malformada',async()=>{
 const x=await setup();
 for(const invalid of [
  {state:'offer_confirmed',revision:0,version:1,repeated:false},
  {state:'inventado',revision:1,version:1,repeated:false},
  {state:'offer_confirmed',revision:1,version:1,repeated:'false'},
  {state:'offer_confirmed',revision:1,version:1,repeated:false,phone:'123'},
  null
 ]){
  x.memory.respond=invalid;
  const port=crearPuertoPostgresConfirmacionD051(x.mockDb,x.broker.verificarContenido);
  await assert.rejects(port.prepararYConfirmar(CHANNEL,x.d.messageKey,KEY),
   /d051_confirmacion_no_disponible/);
 }
});
test('D051: validación estricta de claves y parámetros antes de consultar BD',async()=>{
 const x=await setup(),port=crearPuertoPostgresConfirmacionD051(
  x.mockDb,x.broker.verificarContenido);
 for(const [channel,key] of [
  ['bad',x.d.messageKey],[CHANNEL,'abc'],
  ['other|sql',x.d.messageKey],[CHANNEL,'1'.repeat(65)]
 ]){
  await assert.rejects(port.cargarEntrada(channel,key),
   /d051_confirmacion_no_disponible/);
 }
 await assert.rejects(port.prepararYConfirmar(CHANNEL,x.d.messageKey,Buffer.alloc(4)));
});

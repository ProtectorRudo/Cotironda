import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';
import {crearLectorPedidoCompradorD076}
 from '../../src/server/buyer-whatsapp-inbox-reader-d076.ts';

const CHANNEL='whapi_d076',SECRET='x'.repeat(64);
const CHAT='5492211234567@s.whatsapp.net',TEL='5492211234567';
const BUYER='aaaaaaaa-0076-4076-8076-000000000761';
const ROUND='bbbbbbbb-0076-4076-8076-000000000762';
const NOW=1800000000;
const KEYS={identidadHmac:Buffer.alloc(32,4),
 huellaHmac:Buffer.alloc(32,9),contenidoAes:Buffer.alloc(32,16)};
const ID='d076.ci-0000001';
const textWithZone='20 bolsas de Cemento CPC Loma Negra 50 kg\nEntrega en: La Plata';
const noZone='20 bolsas de Cemento CPC Loma Negra 50 kg';
function factory({text=textWithZone,kind='text',revoked=false}={}){
 const dbStore=new Map(),ops={read:0,zone:0,round:0,planned:0};
 const store={
  resolverVinculo:async()=>null,
  registrarEntrada:async()=>{throw Error('never supplier')},
  registrarBaja:async()=>{throw Error('never supplier')},
  resolverComprador:async()=>revoked?null:{
   buyerOrgId:BUYER,chatHabilitado:true,
   consentimientoContactoVigente:true
  },
  registrarEntradaComprador:async d=>{
   const prior=dbStore.get(d.messageKey);
   if(prior){
    if(prior.fingerprint!==d.fingerprint)throw Error('collision');
    return {estado:'entrada_persistida',repetido:true};
   }
   dbStore.set(d.messageKey,d);
   return {estado:'entrada_persistida',repetido:false};
  }
 };
 const broker=construirBrokerWhapiPrivado({
  channel:CHANNEL,secretoWebhook:SECRET,claves:KEYS,
  contenidoKeyId:'aes_2026_a',habilitado:true,ahoraUnix:()=>NOW,
  almacen:store
 });
 const msg={
  id:ID,from_me:false,chat_id:CHAT,from:TEL,type:kind,timestamp:NOW,
  ...(kind==='text'?{text:{body:text}}:{[kind]:{link:'https://untrusted.example/media'}})
 };
 const req=new Request('https://local.test/webhook',{
  method:'POST',headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({channel_id:CHANNEL,event:{type:'messages',event:'post'},
   messages:[msg]})
 });
 const db={query:async(sql,args)=>{
  ops.read++;
  assert.match(sql,/whapi_buyer_read_d076/);
  assert.deepEqual(args[0],CHANNEL);
  const saved=dbStore.get(args[1]);
  if(!saved||revoked)return {rows:[{payload:null}]};
  return {rows:[{payload:{
   channel:saved.channel,messageKey:saved.messageKey,
   chatKey:saved.chatKey,buyerOrgId:saved.buyerOrgId,
   kind:saved.kind,sourceUnix:saved.sourceUnix,
   cryptoKeyId:saved.cryptoKeyId,fingerprint:saved.fingerprint,
   cipherHex:saved.ciphertext.toString('hex'),
   nonceHex:saved.nonce.toString('hex'),tagHex:saved.tag.toString('hex')
  }}]};
 }};
 const actions={
  registrarFaltaZona:async data=>{
   ops.zone++;
   assert.equal(data.channel,CHANNEL);
   assert.equal(data.buyerOrgId,BUYER);
   assert.equal(data.pregunta,'¿En qué localidad se entregan los materiales?');
   assert.equal(data.textoOriginal,noZone);
   return ops.zone===1?'registrada':'duplicada';
  },
  crearRonda:async data=>{
   ops.round++;
   assert.equal(data.buyerOrgId,BUYER);
   assert.equal(data.pedido.deliveryZone,'La Plata');
   assert.equal(data.pedido.items[0].quantity,'20');
   assert.equal(data.pedido.items[0].productCode,'cemento_gris_obra');
   return {roundId:ROUND,repetida:ops.round>1};
  },
  prepararInvitaciones:async r=>{
   assert.equal(r,ROUND);
   ops.planned++;
   return {estado:'queued_without_sending',mensajesEnviados:0};
  }
 };
 const worker=crearLectorPedidoCompradorD076({
  habilitado:true,channel:CHANNEL,db,
  verificarComprador:broker.verificarContenidoComprador,acciones:actions
 });
 return {broker,req,ops,dbStore,db,actions,worker,
  async ingest(){return procesarWebhookWhapiAislado(req,broker.dependencias)}};
}
test('MVP044: texto arquitecto Whapi → HMAC → AES → SQL → pedido con zona → ronda/invitaciones OFF',async()=>{
 const x=factory(),received=await x.ingest();
 assert.equal(received.status,200);
 const d=[...x.dbStore.values()][0];
 const r=await x.worker.procesar(d.messageKey);
 assert.equal(r.estado,'ronda_registrada_consultas_en_cola');
 assert.equal(r.rondaId,ROUND);
 assert.equal(r.mensajesWhatsappEnviados,0);
 assert.deepEqual(x.ops,{read:1,zone:0,round:1,planned:1});
 assert.equal(JSON.stringify(r).includes(TEL),false);
 assert.equal(JSON.stringify(r).includes(textWithZone),false);
});
test('MVP044: texto sin zona solo prepara pregunta y conserva pedido',async()=>{
 const x=factory({text:noZone});
 await x.ingest();
 const d=[...x.dbStore.values()][0];
 assert.equal((await x.worker.procesar(d.messageKey)).estado,'zona_solicitada_en_cola');
 assert.equal((await x.worker.procesar(d.messageKey)).estado,'zona_solicitada_en_cola');
 assert.deepEqual(x.ops,{read:2,zone:2,round:0,planned:0});
});
test('MVP044: documento remoto sin extracción segura permanece pendiente',async()=>{
 const x=factory({kind:'document'});
 await x.ingest();
 const d=[...x.dbStore.values()][0];
 assert.equal((await x.worker.procesar(d.messageKey)).estado,
  'esperando_extraccion_segura');
 assert.equal(x.ops.round,0);
});
test('MVP044: no hay lectura de WhatsApp si el worker está apagado',async()=>{
 const x=factory();
 const worker=crearLectorPedidoCompradorD076({
  habilitado:false,channel:CHANNEL,db:x.db,
  verificarComprador:x.broker.verificarContenidoComprador,
  acciones:x.actions
 });
 const r=await worker.procesar('a'.repeat(64));
 assert.equal(r.estado,'desactivado');
 assert.equal(x.ops.read,0);
});
test('MVP044: sin vínculo vigente SQL devuelve NULL y bloquea cifrado',async()=>{
 const x=factory({revoked:true});
 assert.equal((await x.worker.procesar('a'.repeat(64))).estado,'sin_entrada_verificada');
 assert.deepEqual(x.ops,{read:1,zone:0,round:0,planned:0});
});
test('MVP044: ALTERACIÓN de empresa en la DB rompe AAD, no crea ronda',async()=>{
 const x=factory();await x.ingest();
 const old=x.db.query;
 x.db.query=async(sql,args)=>{
  const out=await old(sql,args);
  out.rows[0].payload.buyerOrgId='aaaaaaaa-0076-4076-8076-000000000799';
  return out;
 };
 const d=[...x.dbStore.values()][0];
 await assert.rejects(x.worker.procesar(d.messageKey),/d073_ingreso_no_disponible/);
 assert.equal(x.ops.round,0);
});
test('MVP044: tag AES manipulado se rechaza antes de interpretar',async()=>{
 const x=factory();await x.ingest();
 const old=x.db.query;
 x.db.query=async(sql,args)=>{
  const out=await old(sql,args);
  out.rows[0].payload.tagHex='0'.repeat(32);
  return out;
 };
 const d=[...x.dbStore.values()][0];
 await assert.rejects(x.worker.procesar(d.messageKey),/d073_ingreso_no_disponible/);
 assert.equal(x.ops.round,0);
});
test('MVP044: respuesta SQL con teléfono en campos extra se bloquea',async()=>{
 const x=factory();await x.ingest();
 const old=x.db.query;
 x.db.query=async(sql,args)=>{
  const out=await old(sql,args);
  out.rows[0].payload.phone=TEL;
  return out;
 };
 const d=[...x.dbStore.values()][0];
 await assert.rejects(x.worker.procesar(d.messageKey),/d073_ingreso_no_disponible/);
 assert.equal(x.ops.round,0);
});
test('MVP044: fallo SQL no revela su error privado ni da ACK falso',async()=>{
 const x=factory();
 x.db.query=async()=>{throw Error('CONNECTION_STRING_SECRET')};
 await assert.rejects(x.worker.procesar('a'.repeat(64)),e=>{
  assert.equal(e.message,'d073_ingreso_no_disponible');
  return true;
 });
 assert.equal(x.ops.round,0);
});
test('MVP044: key HMAC/URL falsos nunca se usan como pedido',async()=>{
 const x=factory();await x.ingest();
 await assert.rejects(x.worker.procesar('formato-telefonico'),
  /d073_ingreso_no_disponible/);
 assert.equal(x.ops.round,0);
});
test('MVP044: SQL con fecha, ID o ciphertext incorrectos falla cerrado',async()=>{
 for(const patch of [
  {sourceUnix:-1},{chatKey:'invalid'},{kind:'contact'},
  {nonceHex:'aa'},{cipherHex:'url:https://evil'},
  {cryptoKeyId:'legacy_d029'}, {fingerprint:'not_sha'}
 ]){
  const x=factory();await x.ingest();
  const old=x.db.query;
  x.db.query=async(sql,args)=>{
   const out=await old(sql,args);
   Object.assign(out.rows[0].payload,patch);return out;
  };
  const d=[...x.dbStore.values()][0];
  await assert.rejects(x.worker.procesar(d.messageKey),
   /d073_ingreso_no_disponible/);
  assert.equal(x.ops.round,0);
 }
});

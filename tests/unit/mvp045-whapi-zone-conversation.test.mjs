import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';
import {crearLectorCompradorConZonaD077}
 from '../../src/server/buyer-whatsapp-zone-conversation-d077.ts';

const CH='whapi_d077',CHAT='5492211234567@s.whatsapp.net',TEL='5492211234567';
const BUYER='aaaaaaaa-0077-4077-8077-000000000771';
const ROUND='bbbbbbbb-0077-4077-8077-000000000772';
const SECRET='s'.repeat(48),NOW=1800000000;
const KEYS={identidadHmac:Buffer.alloc(32,21),
 huellaHmac:Buffer.alloc(32,35),contenidoAes:Buffer.alloc(32,7)};
const full='20 bolsas de Cemento CPC Loma Negra 50 kg';
const m1={id:'d077.primero-001',from_me:false,chat_id:CHAT,from:TEL,
 type:'text',timestamp:NOW,text:{body:full}};
const m2={...m1,id:'d077.segundo-002',timestamp:NOW+20,
 text:{body:'La Plata'}};
function testHarness(){
 const rows=new Map(),history=new Map();
 const ops={read:0,ask:0,round:0,planned:0};
 let pending=null,permission=true;
 const broker=construirBrokerWhapiPrivado({
  channel:CH,claves:KEYS,contenidoKeyId:'aes_2026_a',
  secretoWebhook:SECRET,habilitado:true,
  ahoraUnix:()=>NOW+20,
  almacen:{
   resolverVinculo:async()=>null,
   registrarEntrada:async()=>{throw Error('supplier_not_used')},
   registrarBaja:async()=>{throw Error('supplier_not_used')},
   resolverComprador:async()=>permission?{
    buyerOrgId:BUYER,consentimientoContactoVigente:true,chatHabilitado:true
   }:null,
   registrarEntradaComprador:async d=>{
    if(rows.has(d.messageKey))return {estado:'entrada_persistida',repetido:true};
    rows.set(d.messageKey,d);
    history.set(d.sourceUnix,d.messageKey);
    return {estado:'entrada_persistida',repetido:false};
   }
  }
 });
 function payload(d){
  return {channel:d.channel,messageKey:d.messageKey,chatKey:d.chatKey,
   buyerOrgId:d.buyerOrgId,kind:d.kind,sourceUnix:d.sourceUnix,
   cryptoKeyId:d.cryptoKeyId,fingerprint:d.fingerprint,
   cipherHex:d.ciphertext.toString('hex'),nonceHex:d.nonce.toString('hex'),
   tagHex:d.tag.toString('hex')};
 }
 const readDb={query:async(sql,params)=>{
  ops.read++;
  assert.match(sql,/whapi_zone_context_d077/);
  assert.equal(params[0],CH);
  const d=rows.get(params[1]);
  if(!d||!permission)return {rows:[{payload:null}]};
  const origin=pending!==null&&pending.chatKey===d.chatKey&&
   pending.buyerOrgId===d.buyerOrgId&&
   pending.messageKey!==d.messageKey&&
   pending.sourceUnix<d.sourceUnix&&pending.alive?
    rows.get(pending.messageKey):null;
  return {rows:[{payload:{
   entry:payload(d),original:origin?payload(origin):null
  }}]};
 }};
 const zoneDb={query:async(sql,params)=>{
  ops.ask++;
  assert.match(sql,/whapi_zone_enqueue_d077/);
  assert.equal(params[0],CH);
  assert.equal(params[3],BUYER);
  const d=rows.get(params[2]);
  if(!d||d.chatKey!==params[1]||d.buyerOrgId!==params[3]||!permission)
   throw Error('revoked_or_cross_tenant');
  if(pending&&pending.alive&&pending.messageKey!==d.messageKey)
   throw Error('already_pending');
  const repeated=!!pending&&pending.alive;
  pending={chatKey:d.chatKey,buyerOrgId:d.buyerOrgId,
   messageKey:d.messageKey,sourceUnix:d.sourceUnix,alive:true};
  return {rows:[{payload:{estado:'zona_solicitada_en_cola',
   repetido:repeated}}]};
 }};
 const actions={
  crearRonda:async request=>{
   ops.round++;
   assert.equal(request.buyerOrgId,BUYER);
   assert.equal(request.pedido.deliveryZone,'La Plata');
   assert.equal(request.pedido.items[0].quantity,'20');
   assert.equal(request.pedido.items[0].product_code,'cemento_gris_obra');
   return {roundId:ROUND,repetida:ops.round>1};
  },
  prepararInvitaciones:async round=>{
   ops.planned++;
   assert.equal(round,ROUND);
   return {estado:'queued_without_sending',mensajesEnviados:0};
  }
 };
 const create=()=>crearLectorCompradorConZonaD077({
  habilitado:true,channel:CH,readDb,zoneDb,
  verificarComprador:broker.verificarContenidoComprador,acciones
 });
 const ingest=async msg=>{
  const req=new Request('https://local.invalid/whapi',{
   method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-webhook-key':SECRET},
   body:JSON.stringify({channel_id:CH,event:{type:'messages',event:'post'},
    messages:[msg]})
  });
  const r=await procesarWebhookWhapiAislado(req,broker.dependencias);
  assert.equal(r.status,200);
  return history.get(msg.timestamp);
 };
 return {rows,ops,payload,readDb,zoneDb,actions,create,ingest,
  stop:()=>{permission=false},expire:()=>{pending.alive=false},
  pending:()=>pending};
}
test('MVP045: lista por Whapi, pregunta única SQL, responde solo zona, ronda sin enviar',async()=>{
 const h=testHarness(),worker=h.create();
 const first=await h.ingest(m1);
 assert.equal((await worker.procesar(first)).estado,'zona_solicitada_en_cola');
 assert.equal((await worker.procesar(first)).estado,'zona_solicitada_en_cola');
 const second=await h.ingest(m2);
 const r=await worker.procesar(second);
 assert.equal(r.estado,'ronda_registrada_consultas_en_cola');
 assert.equal(r.rondaId,ROUND);
 assert.equal(r.mensajesWhatsappEnviados,0);
 assert.deepEqual(h.ops,{read:3,ask:2,round:1,planned:1});
 const stored=JSON.stringify([...h.rows.values()].map(x=>({
  chatKey:x.chatKey,messageKey:x.messageKey,cipherHex:x.ciphertext.toString('hex')
 })));
 assert.equal(stored.includes(TEL),false);
 assert.equal(stored.includes(full),false);
});
test('MVP045: responder sin origen pendiente no crea solicitud',async()=>{
 const h=testHarness(),m=await h.ingest(m2);
 const r=await h.create().procesar(m);
 assert.equal(r.estado,'requiere_revision_interna');
 assert.equal(h.ops.round,0);
});
test('MVP045: medio externo sin verificar no se vuelve localidad ni descarga URL',async()=>{
 const h=testHarness();
 const img={...m1,type:'image',image:{link:'http://169.254.169.254/secret'}};
 delete img.text;
 const id=await h.ingest(img);
 assert.equal((await h.create().procesar(id)).estado,'esperando_extraccion_segura');
 assert.equal(h.ops.ask,0);
});
test('MVP045: un pedido pendiente no se reemplaza silenciosamente por otro',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 await h.create().procesar(a);
 const m={...m2,text:{body:'5 bolsas de cemento'}};
 const id=await h.ingest(m);
 // The reply is not a valid bare locality: reject, never create/overwrite.
 assert.equal((await h.create().procesar(id)).estado,'requiere_revision_interna');
 assert.equal(h.ops.round,0);
});
test('MVP045: contacto revocado no puede consultar ni preguntar',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 h.stop();
 assert.equal((await h.create().procesar(a)).estado,'sin_entrada_verificada');
 assert.equal(h.ops.ask,0);
});
test('MVP045: pregunta sin port de escritura habilitado falla y no inventa envío',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 h.zoneDb.query=async()=>{throw Error('DATABASE_URL_SECRET')};
 await assert.rejects(h.create().procesar(a),/d073_ingreso_no_disponible/);
 assert.equal(h.ops.round,0);
});
test('MVP045: original cambiado de empresa se detecta con AES AAD',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 await h.create().procesar(a);
 const b=await h.ingest(m2);
 const old=h.readDb.query;
 h.readDb.query=async(...args)=>{
  const v=await old(...args);
  v.rows[0].payload.original.buyerOrgId=
   'aaaaaaaa-0077-4077-8077-000000000799';
  return v;
 };
 await assert.rejects(h.create().procesar(b),/d073_ingreso_no_disponible/);
 assert.equal(h.ops.round,0);
});
test('MVP045: un original de otro chat nunca se vincula a zona actual',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 await h.create().procesar(a);
 const b=await h.ingest(m2);
 const old=h.readDb.query;
 h.readDb.query=async(...args)=>{
  const v=await old(...args);
  v.rows[0].payload.original.chatKey='f'.repeat(64);
  return v;
 };
 await assert.rejects(h.create().procesar(b),/d073_ingreso_no_disponible/);
 assert.equal(h.ops.round,0);
});
test('MVP045: cifrado original adulterado se rechaza',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 await h.create().procesar(a);
 const b=await h.ingest(m2);
 const old=h.readDb.query;
 h.readDb.query=async(...args)=>{
  const v=await old(...args);
  v.rows[0].payload.original.tagHex='0'.repeat(32);
  return v;
 };
 await assert.rejects(h.create().procesar(b),/d073_ingreso_no_disponible/);
});
test('MVP045: after expiration no recupera pedido, zona no genera ronda',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 await h.create().procesar(a);
 h.expire();
 const b=await h.ingest(m2);
 assert.equal((await h.create().procesar(b)).estado,'requiere_revision_interna');
 assert.equal(h.ops.round,0);
});
test('MVP045: no se acepta respuesta SQL con contacto o campo extra',async()=>{
 const h=testHarness(),a=await h.ingest(m1);
 const old=h.readDb.query;
 h.readDb.query=async(...args)=>{
  const v=await old(...args);
  v.rows[0].payload.phone=TEL;
  return v;
 };
 await assert.rejects(h.create().procesar(a),/d073_ingreso_no_disponible/);
});
test('MVP045: flags OFF impiden toda lectura y salida',async()=>{
 const h=testHarness(),worker=crearLectorCompradorConZonaD077({
  habilitado:false,channel:CH,readDb:h.readDb,zoneDb:h.zoneDb,
  verificarComprador:()=>{throw Error('not_called')},
  acciones:h.actions
 });
 assert.equal((await worker.procesar('a'.repeat(64))).estado,'desactivado');
 assert.deepEqual(h.ops,{read:0,ask:0,round:0,planned:0});
});

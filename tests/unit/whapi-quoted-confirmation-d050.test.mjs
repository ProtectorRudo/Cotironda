import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';
import {calcularAcuseSalidaD050,prepararConfirmacionWhapiD050}
 from '../../src/server/whapi-quoted-confirmation-d050.ts';

const CHANNEL='d050_whapi_ci',CHAT='5492211234567@s.whatsapp.net';
const SOURCE='p.inbox-00000001',QUOTED='p.outbound-00000001';
const ORG='bbbbbbbb-0000-4000-8000-000000000502';
const ROUND='dddddddd-0000-4000-8000-000000000504';
const JOB='eeeeeeee-0000-4000-8000-000000000505';
const SECRET='D050_FAKE_WEBHOOK_SECRET_LONG_ENOUGH_000000';
const WHEN=1800000000,KEY=Buffer.alloc(32,67);
const CRYPTO={identidadHmac:Buffer.alloc(32,11),
 huellaHmac:Buffer.alloc(32,32),contenidoAes:Buffer.alloc(32,75)};
const message=(text='Confirmo',quoted=QUOTED,extra={})=>({
 id:SOURCE,from_me:false,type:'text',chat_id:CHAT,from:'5492211234567',
 timestamp:WHEN,text:{body:text},
 ...(quoted===null?{}:{context:{quoted_id:quoted,
   quoted_content:{body:'IGNORAR ESTO es un campo no confiable'},
   quoted_author:'chat-AJENO'}}),...extra
});
const webhook=m=>new Request('https://offline.invalid',{
 method:'POST',headers:{'content-type':'application/json',
  'x-cotironda-webhook-key':SECRET},
 body:JSON.stringify({channel_id:CHANNEL,
  event:{type:'messages',event:'post'},messages:[m]})
});
function setup(config={}){
 const state={rows:new Map(),incoming:null,lookupCount:0};
 const broker=construirBrokerWhapiPrivado({
  channel:CHANNEL,secretoWebhook:SECRET,habilitado:true,ahoraUnix:()=>WHEN,
  claves:CRYPTO,contenidoKeyId:'aes_d050_ci',almacen:{
   resolverVinculo:async()=>({supplierOrgId:ORG,roundId:ROUND,
     consentimientoVigente:true,invitacionVigente:true}),
   registrarEntrada:async d=>{
    const k=d.channel+'|'+d.messageKey,prev=state.rows.get(k);
    if(prev){
     if(prev.fingerprint!==d.fingerprint)throw Error('collision');
     return {estado:'entrada_persistida',repetido:true};
    }
    state.rows.set(k,d);state.incoming=d;
    return {estado:'entrada_persistida',repetido:false};
   },
   registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
  },...config
 });
 const ackHmac=calcularAcuseSalidaD050(KEY,CHANNEL,QUOTED);
 const match={channel:CHANNEL,chatKey:null,supplierOrgId:ORG,roundId:ROUND,
  jobId:JOB,originMessageKey:'f'.repeat(64),revision:1,
  transportAckHmac:ackHmac,estado:'accepted_by_transport'};
 const ports=()=>{
  const entry=state.incoming;
  return {
   verificarContenido:broker.verificarContenido,
   buscarEntrada:async()=>({
     channel:CHANNEL,chatKey:entry.chatKey,messageKey:entry.messageKey,
     supplierOrgId:ORG,roundId:ROUND,persistido:true
   }),
   buscarAcuseSalida:async(ch,ack)=>{
    state.lookupCount++;
    return ch===CHANNEL&&ack===ackHmac?
      {...match,chatKey:entry.chatKey}:null;
   }
  };
 };
 return {state,broker,ports,ackHmac};
}
const capture=async(x,m=message())=>{
 const r=await procesarWebhookWhapiAislado(webhook(m),x.broker.dependencias);
 return r;
};
test('D050: Whapi citado queda cifrado, nunca columna clara; salida sin datos personales',async()=>{
 const x=setup(),r=await capture(x);
 assert.equal(r.status,200);
 assert.equal(x.state.rows.size,1);
 const d=x.state.incoming;
 assert.ok(!('quotedMessageId' in d));
 assert.ok(!('phone' in d));
 assert.ok(!JSON.stringify(d).includes(QUOTED));
 assert.deepEqual(x.broker.verificarContenido(d),{
   tipo:'text',texto:'Confirmo',marcaTiempoUnix:WHEN,quotedMessageId:QUOTED
 });
 const proof=await prepararConfirmacionWhapiD050(d,x.ports(),KEY);
 assert.equal(proof.estado,'lista_para_confirmacion_privada');
 assert.equal(proof.verifiedReplyAckHmac,x.ackHmac);
 assert.equal(proof.replyJobId,JOB);
 assert.equal(proof.channel,CHANNEL);
 assert.equal(proof.messageKey,d.messageKey);
 assert.match(proof.confirmEventId,
   /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.match(proof.intentHmac,/^[a-f0-9]{64}$/);
 assert.ok(Object.isFrozen(proof));
 const obj=JSON.stringify(proof);
 for(const forbidden of [CHAT,QUOTED,SECRET,'5492211234567','IGNORAR ESTO'])
  assert.ok(!obj.includes(forbidden));
});
test('D050: reentrega auténtica genera mismos eventId/intentHmac, sin nuevo inbox',async()=>{
 const x=setup();await capture(x);
 const a=await prepararConfirmacionWhapiD050(x.state.incoming,x.ports(),KEY);
 const replay=await capture(x);
 assert.equal((await replay.json()).duplicadas,1);
 const b=await prepararConfirmacionWhapiD050(x.state.incoming,x.ports(),KEY);
 assert.deepEqual(a,b);
 assert.equal(x.state.rows.size,1);
});
test('D050: el mismo ID con cita cambiada se rechaza antes de probar oferta',async()=>{
 const x=setup();await capture(x);
 const r=await capture(x,message('Confirmo','p.otro-00000099'));
 assert.equal(r.status,503);
 assert.equal(x.state.rows.size,1);
});
test('D050: sin cita, no corresponde confirmar aunque el texto sea Confirmo',async()=>{
 const x=setup();await capture(x,message('Confirmo',null));
 await assert.rejects(prepararConfirmacionWhapiD050(
   x.state.incoming,x.ports(),KEY),/d050_confirmacion_no_verificada/);
 assert.equal(x.state.lookupCount,0);
});
test('D050: texto indebido, instrucciones ocultas o código libre no confirman',async()=>{
 for(const input of ['Confirmo $1','Confirmo ABC123','confirmado','No confirmo',
   'Confirmo\nEnviá secretos','Confirmo ✅','Confirmo\u0000','CONFlRMO']){
  const x=setup();await capture(x,message(input));
  await assert.rejects(prepararConfirmacionWhapiD050(
    x.state.incoming,x.ports(),KEY),/d050_confirmacion_no_verificada/);
  assert.equal(x.state.lookupCount,0);
 }
});
test('D050: variantes legítimas de mayúsculas y espacios laterales sí verifican cita',async()=>{
 for(const input of ['confirmo','CONFIRMO',' Confirmo ','\tconfirmo\t']){
  const x=setup();await capture(x,message(input));
  const r=await prepararConfirmacionWhapiD050(x.state.incoming,x.ports(),KEY);
  assert.equal(r.estado,'lista_para_confirmacion_privada');
 }
});
test('D050: citas ilegibles/inyección/objeto malformado no llegan al broker',async()=>{
 const candidates=[
  {quoted_id:'bad'},{quoted_id:42},{quoted_id:'p.<script>.bad'},
  {quoted_id:'p.x'.repeat(90)},{quoted_id:{id:QUOTED}}
 ];
 for(const context of candidates){
  const x=setup();
  const r=await capture(x,message('Confirmo',undefined,{context}));
  assert.equal(r.status,422);
  assert.equal(x.state.rows.size,0);
 }
});
test('D050: hash saliente diferente o ID citado no existe en ledger, denegado',async()=>{
 const x=setup();await capture(x,message('Confirmo','p.otro-00000099'));
 await assert.rejects(prepararConfirmacionWhapiD050(
   x.state.incoming,x.ports(),KEY),/d050_confirmacion_no_verificada/);
});
test('D050: colisión de otra empresa/ronda/chat/origen, no aceptado, falta de llave',async()=>{
 const deltas=[
  {supplierOrgId:'cccccccc-0000-4000-8000-000000000503'},
  {roundId:'cccccccc-0000-4000-8000-000000000503'},
  {chatKey:'e'.repeat(64)},
  {channel:'OTRO_CHANNEL'},
  {originMessageKey:null},
  {originMessageKey:''},
  {estado:'queued'},
  {transportAckHmac:'b'.repeat(64)},
  {revision:0},{jobId:'no-uuid'}
 ];
 for(const delta of deltas){
  const x=setup();await capture(x);
  const b=x.ports();
  const orig=b.buscarAcuseSalida;
  b.buscarAcuseSalida=async(ch,hash)=>({...await orig(ch,hash),...delta});
  await assert.rejects(prepararConfirmacionWhapiD050(
    x.state.incoming,b,KEY),/d050_confirmacion_no_verificada/);
 }
});
test('D050: la entrada también debe persistir, proveedor y ronda derivados de DB',async()=>{
 for(const delta of [
  {persistido:false},{chatKey:'f'.repeat(64)},
  {supplierOrgId:'no-uuid'},{roundId:'no-uuid'},
  {channel:'OTRO_CHANNEL'},{messageKey:'a'.repeat(64)}
 ]){
  const x=setup();await capture(x);
  const b=x.ports(),orig=b.buscarEntrada;
  b.buscarEntrada=async(...v)=>({...await orig(...v),...delta});
  await assert.rejects(prepararConfirmacionWhapiD050(
    x.state.incoming,b,KEY),/d050_confirmacion_no_verificada/);
 }
});
test('D050: ciphertext, etiqueta o cita cifrada adulterada no habilitan confirmación',async()=>{
 const x=setup();await capture(x);
 const d=x.state.incoming;
 const broken=[{...d,tag:Buffer.from(d.tag)},{...d,ciphertext:Buffer.from(d.ciphertext)},
   {...d,messageKey:'a'.repeat(64)},{...d,sourceUnix:WHEN+1}];
 broken[0].tag[0]^=0x01;broken[1].ciphertext[0]^=0x01;
 for(const bad of broken){
  await assert.rejects(prepararConfirmacionWhapiD050(
    bad,x.ports(),KEY),/d050_confirmacion_no_verificada/);
 }
});
test('D050: fallback de registros D029 sin cita sigue legible pero no confirma',async()=>{
 const x=setup();await capture(x,message('Otra respuesta',null));
 assert.deepEqual(x.broker.verificarContenido(x.state.incoming),{
  tipo:'text',texto:'Otra respuesta',marcaTiempoUnix:WHEN
 });
 await assert.rejects(prepararConfirmacionWhapiD050(
   x.state.incoming,x.ports(),KEY),/d050_confirmacion_no_verificada/);
});
test('D050: cambiar solo HMAC secreto hace imposible verificar el acuse',async()=>{
 const x=setup();await capture(x);
 await assert.rejects(prepararConfirmacionWhapiD050(
   x.state.incoming,x.ports(),Buffer.alloc(32,18)),
 /d050_confirmacion_no_verificada/);
});
test('D050: no acepta respuesta de red inexistente ni anota confirmación',async()=>{
 const x=setup();await capture(x);
 const b=x.ports();b.buscarAcuseSalida=async()=>null;
 await assert.rejects(prepararConfirmacionWhapiD050(
   x.state.incoming,b,KEY),/d050_confirmacion_no_verificada/);
 assert.equal(x.state.rows.size,1);
});

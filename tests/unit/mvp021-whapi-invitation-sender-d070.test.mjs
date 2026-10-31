import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cifrarDestinatarioD068}
 from '../../src/server/whapi-encrypted-recipient-d068.ts';
import {crearEmisorInvitacionD070}
 from '../../src/server/whapi-invitation-sender-d070.ts';

const ROUND='dddddddd-0016-4016-8016-000000000661';
const ORG='bbbbbbbb-0016-4016-8016-000000000662';
const JOB='cccccccc-0016-4016-8016-000000000661';
const LEASE='eeeeeeee-0016-4016-8016-000000000661';
const CHANNEL='d065_ci',TO='5492211234567';
const K={hmacIdentity:Buffer.alloc(32,17),recipientAes:Buffer.alloc(32,91)};
const ACK=Buffer.alloc(32,33);
const sealed=cifrarDestinatarioD068({channel:CHANNEL,supplierOrgId:ORG,to:TO,
 cryptoKeyId:'recipient_ci'},K);
const claim={state:'leased',jobId:JOB,leaseToken:LEASE,roundId:ROUND,
 supplierOrgId:ORG,channel:CHANNEL,chatKey:sealed.chatKey};
const packet={roundId:ROUND,supplierOrgId:ORG,channel:CHANNEL,
 deliveryZone:'La Plata',vatRequest:'no_especificado',items:[
 {lineNo:1,productCode:'cemento_001',label:'Cemento CPC 50 kg',
 quantity:'10.000',unit:'bag'}]};
function fixture(options={}){
 const calls=[], sent=[];
 let taken=false,started=false,checked=true;
 const db=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('whapi_claim_invite_d070')){
   if(taken)return{payload:null};
   taken=true;return{payload:claim};
  }
  if(sql.includes('whapi_read_recipient_packet_d068')){
   return{payload:{packet,chatKey:sealed.chatKey,cryptoKeyId:sealed.cryptoKeyId,
    nonceHex:sealed.nonceHex,cipherHex:sealed.cipherHex,tagHex:sealed.tagHex}};
  }
  if(sql.includes('whapi_begin_invite_d070')){
   if(options.beginReject)throw Error('lost DB ACK');
   started=true;return{payload:{state:'in_flight',jobId:JOB}};
  }
  if(sql.includes('whapi_authorize_invite_d070'))return {payload:checked};
  if(sql.includes('whapi_finish_invite_d070')){
   if(options.finishReject)throw Error('db disconnected');
   return {payload:{state:args[2],repeated:false}};
  }
  if(sql.includes('whapi_fail_preflight_invite_d070')){
   return{payload:{state:'queued'}};
  }
  throw Error('unexpected SQL');
 };
 const fetcher=async (_url,request)=>{
  sent.push(request);
  if(options.httpReject)throw Error('timeout');
  if(options.httpStatus)return new Response('{}',{status:options.httpStatus,
   headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({sent:true,message:{
   id:'coti.message-00000001',status:'pending',from_me:true,
   chat_id:TO+'@s.whatsapp.net'}}),{
   status:200,headers:{'content-type':'application/json'}});
 };
 const config={
  habilitado:true,pilotoAutorizado:true,channel:CHANNEL,
  token:'test_whapi_token_not_real_abcdefg',
  destinatariosPermitidos:[TO],keys:K,ackKey:ACK,
  fetcher,committedRpc:db,...options.config};
 const sender=crearEmisorInvitacionD070(config);
 return {sender,calls,sent,setAuthorized:v=>checked=v,started:()=>started};
}
test('D070 envía UNA consulta por D055 después del begin COMMIT y check HMAC',async()=>{
 const f=fixture();
 const r=await f.sender.procesarUno();
 assert.deepEqual(r,{estado:'aceptado_por_transporte'});
 assert.equal(f.sent.length,1);
 const order=f.calls.map(x=>x.sql).join('|');
 assert.ok(order.indexOf('whapi_begin_invite_d070')<
  order.indexOf('whapi_authorize_invite_d070'));
 assert.ok(order.indexOf('whapi_authorize_invite_d070')<
  order.indexOf('whapi_finish_invite_d070'));
 assert.equal(f.calls.some(x=>JSON.stringify(x.args).includes(TO)),false);
 assert.equal(f.sent[0].method,'POST');
 const payload=JSON.parse(f.sent[0].body);
 assert.deepEqual(Object.keys(payload).sort(),
  ['to','body','no_link_preview','typing_time'].sort());
 assert.equal(payload.to,TO);
 assert.match(payload.body,/Entrega: La Plata/);
 assert.match(payload.body,/Cemento CPC 50 kg/);
 assert.doesNotMatch(payload.body,/Pintura|Confirmo/);
 assert.equal(f.calls.at(-1).args[2],'accepted_by_transport');
 assert.match(f.calls.at(-1).args[3],/^[a-f0-9]{64}$/);
 assert.deepEqual(await f.sender.procesarUno(),{estado:'cola_vacia'});
 assert.equal(f.sent.length,1);
});
test('D070 por defecto no reclama SQL ni envía por Whapi',async()=>{
 let n=0;
 const f=fixture({config:{habilitado:false,committedRpc:async()=>{
  n++;throw Error('do not call');}}});
 assert.deepEqual(await f.sender.procesarUno(),{estado:'desactivado'});
 assert.equal(n,0);assert.equal(f.sent.length,0);
});
test('D070 no intenta HTTP tras begin de estado incierto',async()=>{
 const f=fixture({beginReject:true});
 assert.deepEqual(await f.sender.procesarUno(),{
  estado:'estado_desconocido_sin_envio'});
 assert.equal(f.sent.length,0);
 assert.equal(f.calls.some(x=>x.sql.includes('whapi_authorize_invite_d070')),false);
});
test('D070 niega BAJA u otra revocación entre begin y HTTP',async()=>{
 const f=fixture();f.setAuthorized(false);
 assert.deepEqual(await f.sender.procesarUno(),{estado:'incierto_sin_reenvio'});
 assert.equal(f.started(),true);assert.equal(f.sent.length,0);
 assert.deepEqual(f.calls.at(-1).args.slice(2),['uncertain',null]);
});
test('D070 timeout/HTTP error no reenvía y no libera reserva',async()=>{
 for(const opts of [{httpReject:true},{httpStatus:429},{finishReject:true}]){
  const f=fixture(opts);
  assert.deepEqual(await f.sender.procesarUno(),{estado:'incierto_sin_reenvio'});
  assert.equal(f.sent.length,1);
  assert.equal(f.calls.filter(x=>x.sql.includes('whapi_begin_invite_d070')).length,1);
  assert.deepEqual(await f.sender.procesarUno(),{estado:'cola_vacia'});
  assert.equal(f.sent.length,1);
 }
});
test('D070 no envía si no puede recuperar cifrado o scope antes de begin',async()=>{
 let n=0;
 const f=fixture({config:{committedRpc:async(sql,args)=>{
  if(sql.includes('whapi_claim_invite_d070'))return{payload:claim};
  if(sql.includes('whapi_read_recipient_packet_d068'))
   return{payload:null};
  if(sql.includes('whapi_fail_preflight_invite_d070'))return{payload:{state:'queued'}};
  n++;throw Error('unexpected');
 }}});
 assert.deepEqual(await f.sender.procesarUno(),{estado:'reintento_preenvio'});
 assert.equal(f.sent.length,0);assert.equal(n,0);
});
test('D070 canal/ID adulterado nunca pasa BEGIN ni HTTP',async()=>{
 let n=0;
 const f=fixture({config:{committedRpc:async(sql)=>{
  n++;return{payload:sql.includes('whapi_claim_invite_d070')?
   {...claim,channel:'other_chan'}:null};
 }}});
 assert.deepEqual(await f.sender.procesarUno(),{estado:'estado_desconocido_sin_envio'});
 assert.equal(n,1);assert.equal(f.sent.length,0);
});
test('D070 allowlist y token de prueba faltante no envían',async()=>{
 for(const change of [{destinatariosPermitidos:['5492210000000']},
  {token:'bad'}]){
  const f=fixture({config:change});
  assert.deepEqual(await f.sender.procesarUno(),{estado:'incierto_sin_reenvio'});
  assert.equal(f.sent.length,0);
 }
});
test('D070 requiere claves válidas y separadas',()=>{
 const base={habilitado:false,pilotoAutorizado:false,channel:CHANNEL,
  keys:K,ackKey:ACK,committedRpc:async()=>({payload:null})};
 for(const patch of [{ackKey:Buffer.alloc(31)},
  {keys:{hmacIdentity:K.hmacIdentity,recipientAes:K.hmacIdentity}},
  {keys:{hmacIdentity:K.hmacIdentity,recipientAes:Buffer.alloc(30)}},
  {channel:'un canal'}, {committedRpc:null}]){
  assert.throws(()=>crearEmisorInvitacionD070({...base,...patch}),
   /d070_sender_unavailable/);
 }
});

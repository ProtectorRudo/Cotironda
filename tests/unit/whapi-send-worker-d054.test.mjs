import test from 'node:test';
import assert from 'node:assert/strict';
import {crearTrabajadorSalidaD054}
 from '../../src/server/whapi-send-worker-d054.ts';
import {calcularAcuseSalidaD050}
 from '../../src/server/whapi-quoted-confirmation-d050.ts';

const JOB='eeeeeeee-0000-4000-8000-000000000541';
const LEASE='eeeeeeee-0000-4000-8000-000000000542';
const ROUND='dddddddd-0000-4000-8000-000000000543';
const SUPPLIER='bbbbbbbb-0000-4000-8000-000000000544';
const CHAT='c'.repeat(64),CHANNEL='whapi_d054_ci',KEY=Buffer.alloc(32,74);
const MESSAGE_ID='whapi.outgoing-0000000541';
const claim={state:'leased',jobId:JOB,leaseToken:LEASE,roundId:ROUND,
 supplierOrgId:SUPPLIER,revision:1,channelId:CHANNEL,chatKey:CHAT};
const msg={channelId:CHANNEL,chatKey:CHAT,roundId:ROUND,
 supplierOrgId:SUPPLIER,revision:1,to:'5492211234567',
 body:'Confirmá estos materiales cotizados y condiciones'};
function mock(overrides={}){
 const state={calls:[],sent:0,sendArgs:null,claimReturn:claim};
 const ports={
  committedRpc:async(sql,args)=>{
   state.calls.push(sql.includes('_lease_reply')?'claim':sql.includes('_begin_send')?'begin':
     sql.includes('_record_send')?'outcome':'preflight');
   const payload=sql.includes('_lease_reply')?state.claimReturn:
     sql.includes('_begin_send')?{state:'in_flight',jobId:JOB}:
     sql.includes('_record_send')?{state:args[2],repeated:false}:{state:'queued'};
   return {payload};
  },
  resolverMensaje:async()=>({...msg}),
  transport:{sendText:async(v)=>{state.sent++;state.sendArgs=v;
    return {state:'accepted',messageId:MESSAGE_ID}}},
  ...overrides
 };
 return {state,ports,worker:crearTrabajadorSalidaD054(ports,KEY)};
}
test('D054: orden DB claim→begin confirmado→transporte→ACK, solo HMAC en SQL',async()=>{
 const {state,worker}=mock();
 const result=await worker.procesarUno();
 assert.deepEqual(result,{estado:'aceptado_por_transporte'});
 assert.deepEqual(state.calls,['claim','begin','outcome']);
 assert.equal(state.sent,1);
 assert.equal(state.sendArgs.jobId,JOB);
 const x=mock();x.ports.committedRpc=async(sql,params)=>{
   x.state.calls.push({sql,params});
   return {payload:sql.includes('_lease_reply')?claim:
     sql.includes('_begin_send')?{state:'in_flight',jobId:JOB}:
     {state:'accepted_by_transport',repeated:false}};
 };
 // Recreate using modified port to inspect exact HMAC argument.
 const w=crearTrabajadorSalidaD054(x.ports,KEY);
 assert.deepEqual(await w.procesarUno(),{estado:'aceptado_por_transporte'});
 const ack=x.state.calls.find(t=>t.sql.includes('_record_send')).params;
 assert.equal(ack[3],calcularAcuseSalidaD050(KEY,CHANNEL,MESSAGE_ID));
 assert.equal(ack[2],'accepted_by_transport');
 assert.ok(!JSON.stringify(x.state.calls).includes(MESSAGE_ID));
 assert.ok(!JSON.stringify(x.state.calls).includes('5492211234567'));
});
test('D054: DB bloquea begin, no sale un mensaje',async()=>{
 const x=mock();
 const original=x.ports.committedRpc;
 x.ports.committedRpc=(sql,args)=>sql.includes('_begin_send')?
   Promise.resolve({payload:{state:'cancelled'}}):original(sql,args);
 const w=crearTrabajadorSalidaD054(x.ports,KEY);
 assert.deepEqual(await w.procesarUno(),{estado:'cancelado_preenvio'});
 assert.equal(x.state.sent,0);
});
test('D054: timeout después del inicio -> incierto, nunca reintento',async()=>{
 const x=mock();
 x.ports.transport.sendText=async()=>{x.state.sent++;throw Error('SECRET_USER_PHONE_timeout')};
 const w=crearTrabajadorSalidaD054(x.ports,KEY);
 assert.deepEqual(await w.procesarUno(),{estado:'incierto_sin_reenvio'});
 assert.deepEqual(x.state.calls,['claim','begin','outcome']);
 assert.equal(x.state.sent,1);
});
test('D054: respuesta vacía/ambigua de transporte queda incierta',async()=>{
 for(const result of [null,{}, {state:'pending',messageId:MESSAGE_ID},
  {state:'accepted',messageId:''},{state:'accepted',messageId:'x'},
  {state:'accepted',messageId:MESSAGE_ID,extra:'sospechoso'}]){
  const x=mock();
  x.ports.transport.sendText=async()=>{x.state.sent++;return result};
  assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
    {estado:'incierto_sin_reenvio'});
  assert.equal(x.state.sent,1);
 }
});
test('D054: pérdida de ACK del begin: jamás iniciar transporte',async()=>{
 const x=mock();const orig=x.ports.committedRpc;
 x.ports.committedRpc=(sql,args)=>sql.includes('_begin_send')?
   Promise.reject(Error('possibly committed')):orig(sql,args);
 assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
   {estado:'sin_envio_estado_desconocido'});
 assert.equal(x.state.sent,0);
 assert.deepEqual(x.state.calls,['claim']);
});
test('D054: pérdida de DB al registrar ACK no reenvía el texto',async()=>{
 const x=mock();const orig=x.ports.committedRpc;
 x.ports.committedRpc=(sql,args)=>sql.includes('_record_send')?
   Promise.reject(Error('secret_connection')):orig(sql,args);
 assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
   {estado:'incierto_sin_reenvio'});
 assert.equal(x.state.sent,1);
});
test('D054: falla antes de HTTP reintenta por D047 con presupuesto controlado',async()=>{
 const x=mock();
 x.ports.resolverMensaje=async()=>{throw Error('contact_unavailable')};
 assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
   {estado:'reintento_preenvio'});
 assert.deepEqual(x.state.calls,['claim','preflight']);
 assert.equal(x.state.sent,0);
});
test('D054: datos cruzados de proveedor/chat/revisión no llegan al transporte',async()=>{
 for(const delta of [
  {supplierOrgId:'cccccccc-0000-4000-8000-000000000545'},
  {chatKey:'b'.repeat(64)},{roundId:'dddddddd-0000-4000-8000-000000000545'},
  {revision:2},{channelId:'other_channel'},{body:'OK'},{to:'javascript:123'},
  {extra:'forged'},{body:'Confirmo\u0000'},
 ]){
  const x=mock();
  x.ports.resolverMensaje=async()=>({...msg,...delta});
  assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
    {estado:'reintento_preenvio'});
  assert.equal(x.state.sent,0);
 }
});
test('D054: DB claim malformado: sin envío ni intentos de update',async()=>{
 for(const candidate of [null,{...claim,revision:0},
   {...claim,chatKey:'bad'},{...claim,extra:'leak'},
   {...claim,jobId:'bad'},{...claim,state:'queued'}]){
  const x=mock();x.state.claimReturn=candidate;
  const result=await x.worker.procesarUno();
  assert.equal(result.estado,candidate===null?'sin_trabajo':'sin_envio_estado_desconocido');
  assert.equal(x.state.sent,0);
  assert.deepEqual(x.state.calls,['claim']);
 }
});
test('D054: fallo del backend PREHTTP con DB caída no envía ni garantiza reintento',async()=>{
 const x=mock();
 x.ports.resolverMensaje=async()=>{throw Error('untrusted_quote')};
 x.ports.committedRpc=async(sql)=>{
  if(sql.includes('_lease_reply'))return {payload:claim};
  throw Error('db_disconnected');
 };
 assert.deepEqual(await crearTrabajadorSalidaD054(x.ports,KEY).procesarUno(),
   {estado:'sin_envio_estado_desconocido'});
 assert.equal(x.state.sent,0);
});
test('D054: ningún método real de envío se implementa en el módulo',()=>{
 const x=mock();
 assert.deepEqual(Object.keys(x.worker),['procesarUno']);
 assert.ok(Object.isFrozen(x.worker));
});

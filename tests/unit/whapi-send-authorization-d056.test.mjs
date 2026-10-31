import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {crearAutorizadorEnvioD056,calcularChatDestinatarioD056}
 from '../../src/server/whapi-send-authorization-d056.ts';
import {crearTransporteWhapiCloudD055}
 from '../../src/server/whapi-cloud-transport-d055.ts';
import {crearTrabajadorSalidaD054}
 from '../../src/server/whapi-send-worker-d054.ts';

const CHANNEL='whapi_d056_ci',TO='5492211234567',KEY=Buffer.alloc(32,56);
const JOB='eeeeeeee-0000-4000-8000-000000000565';
const ROUND='dddddddd-0000-4000-8000-000000000566';
const SUP='bbbbbbbb-0000-4000-8000-000000000567';
const BODY='Presupuesto ficticio, confirmá el resumen y las condiciones.';
const TOKEN='fake_synthetic_WHAPI_TOKEN_12345678901234567890';
const MESSAGE_ID='p.outgoing-0000000561';
const chatKey=calcularChatDestinatarioD056(CHANNEL,TO,KEY);
test('D056: HMAC chat igual al contrato de D029 para el número normalizado',()=>{
 const expected=createHmac('sha256',KEY).update(JSON.stringify([
  'cotironda','chat',1,CHANNEL,TO+'@s.whatsapp.net'
 ])).digest('hex');
 assert.equal(chatKey,expected);
 assert.match(chatKey,/^[a-f0-9]{64}$/);
 assert.notEqual(calcularChatDestinatarioD056(CHANNEL,'5492211111111',KEY),chatKey);
 assert.throws(()=>calcularChatDestinatarioD056(CHANNEL,'+5492211234567',KEY));
});
test('D056: RPC fija parametrizada, SQL ve HMAC pero no ve teléfono ni cuerpo',async()=>{
 let args;let sql;
 const gate=crearAutorizadorEnvioD056({
  committedRpc:async(q,p)=>{sql=q;args=p;return {payload:true}},
 },CHANNEL,KEY);
 assert.equal(await gate.autorizarIntento({jobId:JOB,to:TO,body:BODY}),true);
 assert.equal(sql,'select cotironda_private.whapi_check_send_authorized_d056($1::uuid,$2::text,$3::text) as payload');
 assert.deepEqual(args,[JOB,CHANNEL,chatKey]);
 assert.ok(!JSON.stringify(args).includes(TO));
 assert.ok(!JSON.stringify(args).includes(BODY));
});
test('D056: SQL false, nulo, vacío y string true denegados',async()=>{
 for(const answer of [{payload:false},{payload:null},{payload:'true'},null,
  {payload:1},{foo:true},{payload:true,extra:'secret'}]){
  const gate=crearAutorizadorEnvioD056({
   committedRpc:async()=>answer
  },CHANNEL,KEY);
  assert.equal(await gate.autorizarIntento({jobId:JOB,to:TO,body:BODY}),false);
 }
});
test('D056: error DB no divulga secreto, no autoriza',async()=>{
 const gate=crearAutorizadorEnvioD056({
  committedRpc:async()=>{throw Error('internal_secret_connection')}
 },CHANNEL,KEY);
 assert.equal(await gate.autorizarIntento({jobId:JOB,to:TO,body:BODY}),false);
});
test('D056: campos ajenos, inyección y cuerpo inválido no consultan SQL',async()=>{
 let calls=0;
 const gate=crearAutorizadorEnvioD056({
  committedRpc:async()=>{calls++;return {payload:true}}
 },CHANNEL,KEY);
 for(const payload of [
  {jobId:JOB,to:'+5492211234567',body:BODY},
  {jobId:'bad',to:TO,body:BODY},
  {jobId:JOB,to:TO,body:'ab'},
  {jobId:JOB,to:TO,body:'X'.repeat(1601)},
  {jobId:JOB,to:TO,body:BODY,admin:true},
 ]){
  assert.equal(await gate.autorizarIntento(payload),false);
 }
 assert.equal(calls,0);
});
test('D056 + D055: cuota SQL false bloquea HTTP aunque flags y token habilitados',async()=>{
 let network=0;
 const quota=crearAutorizadorEnvioD056({
   committedRpc:async()=>({payload:false})
 },CHANNEL,KEY);
 const transport=crearTransporteWhapiCloudD055({
  habilitado:true,pilotoAutorizado:true,token:TOKEN,
  destinatariosPermitidos:[TO],autorizarIntento:quota.autorizarIntento,
  fetcher:async()=>{network++;return new Response(JSON.stringify({
    sent:true,message:{id:MESSAGE_ID,status:'pending'}
  }),{headers:{'content-type':'application/json'}})}
 });
 await assert.rejects(transport.sendText({jobId:JOB,to:TO,body:BODY}),
  /d055_transporte_no_disponible/);
 assert.equal(network,0);
});
test('D056 + D055: autorización SQL true habilita solo transporte simulado',async()=>{
 let network=0,queries=0;
 const quota=crearAutorizadorEnvioD056({
  committedRpc:async()=>{queries++;return {payload:true}}
 },CHANNEL,KEY);
 const adapter=crearTransporteWhapiCloudD055({
  habilitado:true,pilotoAutorizado:true,token:TOKEN,
  destinatariosPermitidos:[TO],autorizarIntento:quota.autorizarIntento,
  fetcher:async()=>{network++;return new Response(JSON.stringify({
   sent:true,message:{id:MESSAGE_ID,status:'pending',
    chat_id:TO+'@s.whatsapp.net'}
  }),{headers:{'content-type':'application/json'}})}
 });
 assert.deepEqual(await adapter.sendText({jobId:JOB,to:TO,body:BODY}),{
  state:'accepted',messageId:MESSAGE_ID
 });
 assert.equal(queries,1);assert.equal(network,1);
});
test('D056 + D054 + D055: cupo denegado tras begin no reenvía automáticamente',async()=>{
 const records=[];let network=0;
 const quota=crearAutorizadorEnvioD056({
  committedRpc:async()=>({payload:false})
 },CHANNEL,KEY);
 const adapter=crearTransporteWhapiCloudD055({
  habilitado:true,pilotoAutorizado:true,token:TOKEN,
  destinatariosPermitidos:[TO],autorizarIntento:quota.autorizarIntento,
  fetcher:async()=>{network++;throw Error('must_not_send')}
 });
 const claim={state:'leased',jobId:JOB,
  leaseToken:'eeeeeeee-0000-4000-8000-000000000568',roundId:ROUND,
  supplierOrgId:SUP,revision:1,channelId:CHANNEL,chatKey};
 const worker=crearTrabajadorSalidaD054({
  committedRpc:async(sql,params)=>{
    records.push([sql,params]);
    return {payload:sql.includes('lease_reply')?claim:
      sql.includes('begin_send')?{state:'in_flight',jobId:JOB}:
      {state:'uncertain',repeated:false}};
  },
  resolverMensaje:async()=>({
   channelId:CHANNEL,chatKey,roundId:ROUND,supplierOrgId:SUP,
   revision:1,to:TO,body:BODY
  }),transport:adapter
 },Buffer.alloc(32,57));
 assert.deepEqual(await worker.procesarUno(),{estado:'incierto_sin_reenvio'});
 assert.equal(network,0);
 assert.equal(records.length,3);
 assert.equal(records[2][1][2],'uncertain');
 assert.equal(records[2][1][3],null);
});

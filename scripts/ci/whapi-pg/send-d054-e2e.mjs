/**
 * D054: REAL Node22 + PostgreSQL17 with isolated connections and fake transport.
 * Strictly NO HTTP/Whapi/AI. Only local PostgreSQL socket 127.0.0.1.
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import {crearTrabajadorSalidaD054}
 from '../../../src/server/whapi-send-worker-d054.ts';
import {calcularAcuseSalidaD050}
 from '../../../src/server/whapi-quoted-confirmation-d050.ts';

const env=process.env;
if(env.COTIRONDA_D054_CI!=='true'||
  env.PGHOST!=='127.0.0.1'||env.PGDATABASE!=='cotironda_ci'||
  env.COTIRONDA_D054_DB_LOGIN!=='cotironda_send_d054_ci'||
  !env.COTIRONDA_D054_DB_PASSWORD||
  !/^[a-f0-9]{64}$/.test(env.COTIRONDA_D054_ACK_HMAC_KEY||''))
 throw Error('d054_requires_ephemeral_ci_connection');
const ackKey=Buffer.from(env.COTIRONDA_D054_ACK_HMAC_KEY,'hex');
const cfg={host:'127.0.0.1',port:5432,
 database:'cotironda_ci',user:'cotironda_send_d054_ci',
 password:env.COTIRONDA_D054_DB_PASSWORD,ssl:false,
 connectionTimeoutMillis:4000,query_timeout:5000,
 statement_timeout:4500,application_name:'cotironda-d054-fake-transport-ci'};
async function dbCall(query,params){
 // ONE isolated connection, one SQL query, auto-committed BEFORE return.
 const client=new pg.Client(cfg);
 await client.connect();
 try{
  const result=await client.query(query,[...params]);
  assert.equal(result.rows.length,1);
  return result.rows[0];
 }finally{await client.end()}
}
const activity={sends:[],rpc:[],resolves:[]};
let sendAttempts=0;
const ports={
 committedRpc:async(sql,params)=>{
  activity.rpc.push(sql.includes('whapi_lease_reply')?'claim':
   sql.includes('whapi_begin_send')?'begin':
   sql.includes('whapi_record_send_outcome')?'outcome':'preflight');
  return dbCall(sql,params);
 },
 resolverMensaje:async claim=>{
  activity.resolves.push(claim.roundId.slice(-3));
  if(claim.roundId.endsWith('543'))throw Error('fake_template_unavailable');
  return {
   channelId:claim.channelId,chatKey:claim.chatKey,
   roundId:claim.roundId,supplierOrgId:claim.supplierOrgId,
   revision:claim.revision,to:'5492211234567', // synthetic only, never logged
   body:'Presupuesto sintético D054_A '+
     (claim.roundId.endsWith('541')?'A':'B')
  };
 },
 transport:{
  sendText:async({to,body,jobId})=>{
   assert.equal(to,'5492211234567');
   assert.match(body,/^Presupuesto sintético D054_A [AB]$/);
   assert.ok(jobId);
   sendAttempts++;
   activity.sends.push(body.slice(-1));
   // B simulates provider having processed HTTP but losing ACK.
   if(body.endsWith('B'))throw Error('fake_HTTP_timeout_after_send');
   return {state:'accepted',messageId:'whapi.fake_outbound-0000000541'};
  }
 }
};
const worker=crearTrabajadorSalidaD054(ports,ackKey);
assert.deepEqual(await worker.procesarUno(),{estado:'aceptado_por_transporte'});
assert.deepEqual(await worker.procesarUno(),{estado:'incierto_sin_reenvio'});
assert.deepEqual(await worker.procesarUno(),{estado:'reintento_preenvio'});
assert.deepEqual(await worker.procesarUno(),{estado:'sin_trabajo'});
assert.equal(sendAttempts,2);
assert.deepEqual(activity.sends,['A','B']);
assert.deepEqual(activity.resolves,['541','542','543']);
assert.deepEqual(activity.rpc,[
 'claim','begin','outcome','claim','begin','outcome',
 'claim','preflight','claim'
]);
const expectedAck=calcularAcuseSalidaD050(
 ackKey,'whapi_d054_ci','whapi.fake_outbound-0000000541');
assert.match(expectedAck,/^[a-f0-9]{64}$/);
await assert.rejects(dbCall(
 'select * from cotironda_private.whapi_reply_jobs_d047 limit 1',[]),
 err=>err?.code==='42501');
await assert.rejects(dbCall('set role postgres',[]),err=>err?.code==='42501');
console.log('D054_NODE_PG17_FAKE_TRANSPORT_PASS: commit_before_fake_send,ack_hmac,timeout_uncertain,no_resend,preflight_retry,no_table_access');

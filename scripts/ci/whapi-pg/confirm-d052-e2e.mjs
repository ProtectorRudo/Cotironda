/**
 * D052 - end-to-end REAL Node22 -> pg driver -> PostgreSQL17 SQL.
 * ALL data and keys CI synthetic. No Whapi/OpenAI/external calls, no DEV.
 * The only network socket allowed is ephemeral PostgreSQL on 127.0.0.1.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import pg from 'pg';
import {procesarWebhookWhapiAislado} from '../../../src/server/whapi-inbound-offline.ts';
import {construirBrokerWhapiPrivado} from '../../../src/server/whapi-crypto-broker.ts';
import {crearPuertoPostgresWhapiD030} from '../../../src/server/whapi-postgres-gateway.ts';
import {calcularAcuseSalidaD050}
 from '../../../src/server/whapi-quoted-confirmation-d050.ts';
import {crearPuertoPostgresConfirmacionD051}
 from '../../../src/server/whapi-confirmation-postgres-d051.ts';

const env=process.env;
const USER='cotironda_confirm_d052_ci_login';
const CHANNEL='whapi_d052_ci';
const CHAT='5492211234567@s.whatsapp.net';
const SENDER='5492211234567'; // never emit to stdout/log/SQL
const ROUND='dddddddd-0000-4000-8000-000000000524';
const NOW=1800000000;
const OFFER_EVENT_1='eeeeeeee-0000-4000-8000-000000000521';
const OFFER_EVENT_2='eeeeeeee-0000-4000-8000-000000000522';
const OUT_1='pg.outgoing-0000000521',OUT_2='pg.outgoing-0000000522';
if(env.COTIRONDA_D052_E2E!=='true'||env.PGHOST!=='127.0.0.1'||
  env.PGDATABASE!=='cotironda_ci'||env.COTIRONDA_D052_DB_LOGIN!==USER||
  !env.COTIRONDA_D052_DB_PASSWORD||!env.COTIRONDA_D052_WEBHOOK_SECRET||
  !env.COTIRONDA_D052_HMAC_ID||!env.COTIRONDA_D052_HMAC_PAYLOAD||
  !env.COTIRONDA_D052_AES_KEY||!env.COTIRONDA_D052_ACK_HMAC_KEY)
 throw Error('d052_requires_explicit_synthetic_local_ci');
function secret(name){
 const s=env[name];if(!/^[a-f0-9]{64}$/.test(s??''))throw Error('d052_ci_key_invalid');
 return Buffer.from(s,'hex');
}
const keys={identidadHmac:secret('COTIRONDA_D052_HMAC_ID'),
 huellaHmac:secret('COTIRONDA_D052_HMAC_PAYLOAD'),
 contenidoAes:secret('COTIRONDA_D052_AES_KEY')};
const ackKey=secret('COTIRONDA_D052_ACK_HMAC_KEY');
assert.ok(!keys.identidadHmac.equals(keys.huellaHmac));
assert.ok(!keys.identidadHmac.equals(keys.contenidoAes));
assert.ok(!keys.huellaHmac.equals(keys.contenidoAes));
const options={host:'127.0.0.1',port:5432,database:'cotironda_ci',
 user:USER,password:env.COTIRONDA_D052_DB_PASSWORD,
 ssl:false,connectionTimeoutMillis:4000,query_timeout:5000,
 statement_timeout:4500,application_name:'cotironda-d052-synthetic-ci'};
const {Client}=pg;
async function withDb(fn){
 const db=new Client(options);await db.connect();
 try{return await fn(db)}finally{await db.end()}
}
function makeBroker(db){
 const storage=crearPuertoPostgresWhapiD030({
  query:(sql,params)=>db.query(sql,[...params])});
 return construirBrokerWhapiPrivado({
  channel:CHANNEL,claves:keys,contenidoKeyId:'aes_d052_ci',
  secretoWebhook:env.COTIRONDA_D052_WEBHOOK_SECRET,
  habilitado:true,almacen:storage,ahoraUnix:()=>NOW
 });
}
const message=(id,text,quotedId=null)=>({
 id,chat_id:CHAT,from:SENDER,from_me:false,type:'text',timestamp:NOW,
 text:{body:text},...(quotedId?{context:{quoted_id:quotedId}}:{})
});
const toRequest=m=>new Request('https://local.invalid/d052',{
 method:'POST',headers:{'content-type':'application/json',
 'x-cotironda-webhook-key':env.COTIRONDA_D052_WEBHOOK_SECRET},
 body:JSON.stringify({channel_id:CHANNEL,
  event:{type:'messages',event:'post'},messages:[m]})
});
const key=id=>createHmac('sha256',keys.identidadHmac)
 .update(JSON.stringify(['cotironda','msg',1,CHANNEL,id]))
 .digest('hex');
async function inbound(m){
 return withDb(async(db)=>{
  const b=makeBroker(db);
  const res=await procesarWebhookWhapiAislado(toRequest(m),b.dependencias);
  return {status:res.status,body:res.status===204?null:await res.json()};
 });
}
const OFFER=(price)=>({
 currency:'ARS',payment_method:'transferencia',lead_days:3,
 freight_gross:'150.00',min_goods_gross:'0.00',
 lines_snapshot:[{line_no:1,unit:'bag',available_qty:'10',
   net_unit_price:price,vat_rate:'21'}]
});
const saveSql='select cotironda_private.whapi_save_draft_from_inbox_d048($1::text,$2::text,$3::uuid,$4::integer,$5::jsonb) as payload';
const enqueueSql='select cotironda_private.whapi_enqueue_reply_d047($1::text,$2::text,$3::integer) as payload';
const leaseSql='select cotironda_private.whapi_lease_reply_d047() as payload';
const finishSql='select cotironda_private.whapi_finish_reply_d047($1::uuid,$2::uuid,$3::boolean,$4::text) as payload';
async function registerOrigin(sourceId,eventId,expected,price,externalId){
 const seen=await inbound(message(sourceId,'Cotización sintética, datos en fixture seguro'));
 assert.equal(seen.status,200);
 assert.equal(seen.body.presupuestosConfirmados,0);
 const orig=key(sourceId);
 const ackHmac=calcularAcuseSalidaD050(ackKey,CHANNEL,externalId);
 return withDb(async(db)=>{
  const saved=await db.query(saveSql,[CHANNEL,orig,eventId,expected,OFFER(price)]);
  assert.equal(saved.rows[0].payload.revision,expected+1);
  assert.equal(saved.rows[0].payload.repeated,false);
  const queued=await db.query(enqueueSql,[CHANNEL,orig,expected+1]);
  assert.equal(queued.rows[0].payload.state,'queued');
  const leased=await db.query(leaseSql);
  assert.equal(leased.rows[0].payload.jobId,queued.rows[0].payload.jobId);
  const finished=await db.query(finishSql,[
   leased.rows[0].payload.jobId,leased.rows[0].payload.leaseToken,
   true,ackHmac]);
  assert.equal(finished.rows[0].payload.state,'accepted_by_transport');
  return {jobId:queued.rows[0].payload.jobId,ackHmac};
 });
}
async function verifyConfirm(inboundId){
 return withDb(async(db)=>{
  const broker=makeBroker(db);
  const bridge=crearPuertoPostgresConfirmacionD051({
    query:(sql,params)=>db.query(sql,[...params])
  },broker.verificarContenido);
  return bridge.prepararYConfirmar(CHANNEL,key(inboundId),ackKey);
 });
}
async function expectRejected(id){
 await assert.rejects(verifyConfirm(id),error=>{
  assert.ok(error instanceof Error);
  // SQL errors are sanitized by the D051 port; do not display PG internals.
  return ['d051_confirmacion_no_disponible',
   'd050_confirmacion_no_verificada'].includes(error.message);
 });
}
async function denyQuery(sql){
 await withDb(async(db)=>{
  await assert.rejects(db.query(sql),e=>e.code==='42501');
 });
}
await withDb(async(db)=>{
 const info=await db.query('select current_user as role_name');
 assert.equal(info.rows[0].role_name,USER);
});
await denyQuery('select * from cotironda_private.whapi_inbox_v1 limit 1');
await denyQuery('select * from cotironda_private.whapi_reply_jobs_d047 limit 1');
await denyQuery('select * from cotironda_private.offer_versions_v1 limit 1');
await withDb(async(db)=>await assert.rejects(db.query('set role postgres'),
 e=>e.code==='42501'));

const first=await registerOrigin('pg.source-000000521',OFFER_EVENT_1,0,
 '2500.00',OUT_1);
// Transport accepted is synthetic. No WhatsApp outbound HTTP.
assert.ok(first.ackHmac);
const noQuote='pg.confirm-000000521';
assert.equal((await inbound(message(noQuote,'Confirmo'))).status,200);
await expectRejected(noQuote);
const wrongQuote='pg.confirm-000000522';
assert.equal((await inbound(message(wrongQuote,'Confirmo','pg.outgoing-99999999'))).status,200);
await expectRejected(wrongQuote);
const fakeText='pg.confirm-000000523';
assert.equal((await inbound(message(fakeText,'No confirmo',OUT_1))).status,200);
await expectRejected(fakeText);

const ok1='pg.confirm-000000524';
assert.equal((await inbound(message(ok1,' Confirmo ',OUT_1))).status,200);
const result1=await verifyConfirm(ok1);
assert.deepEqual(result1,{estado:'cotizacion_confirmada_en_pg',
 revision:1,version:1,repetido:false});
const reDelivery=await inbound(message(ok1,' Confirmo ',OUT_1));
assert.equal(reDelivery.status,200);
assert.equal(reDelivery.body.duplicadas,1);
assert.equal((await verifyConfirm(ok1)).repetido,true);
// Duplicate inbound ID, different quoted_id: reject before DB writes.
const poisoned=await inbound(message(ok1,' Confirmo ',OUT_2));
assert.equal(poisoned.status,503);

const second=await registerOrigin('pg.source-000000522',OFFER_EVENT_2,1,
 '2600.00',OUT_2);
assert.notEqual(second.jobId,first.jobId);
const staleId='pg.confirm-000000525';
assert.equal((await inbound(message(staleId,'Confirmo',OUT_1))).status,200);
await expectRejected(staleId); // D049 revision 1 no longer current

const ok2='pg.confirm-000000526';
assert.equal((await inbound(message(ok2,'CONFIRMO',OUT_2))).status,200);
const result2=await verifyConfirm(ok2);
assert.deepEqual(result2,{estado:'cotizacion_confirmada_en_pg',
 revision:2,version:2,repetido:false});
assert.equal((await verifyConfirm(ok2)).repetido,true);
assert.equal((await verifyConfirm(ok1)).repetido,true); // old recorded receipt survives
const baja=await inbound(message('pg.optout-000000521','BAJA'));
assert.equal(baja.status,200);
assert.equal(baja.body.bajasRegistradas,1);
assert.equal((await verifyConfirm(ok2)).repetido,true); // replay safe after BAJA
const afterBaja=await inbound(message('pg.confirm-000000527','Confirmo',OUT_2));
assert.equal(afterBaja.status,403);

await denyQuery('select payload_ciphertext from cotironda_private.whapi_inbox_v1');
console.log('D052_E2E_NODE_POSTGRES17_PASS: actual_pg_driver,encrypted_webhook,private_gateways,provenance,outbox_ack,quoted_confirm,replay,revision2,stale_quote,optout,no_external_calls');

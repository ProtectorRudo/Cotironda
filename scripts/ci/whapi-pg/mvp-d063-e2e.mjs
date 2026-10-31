/**
 * MVP-013: real Node22 + pg driver + PostgreSQL17 ephemeral GitHub CI.
 * Synthetic incoming WhatsApp -> encrypted D028 -> D062 queue ->
 * AES-authenticated D061 + conservative interpreter D063 ->
 * atomic D060 version/price -> queue ACK. No actual Whapi/OpenAI/DEV.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import pg from 'pg';
import {procesarWebhookWhapiAislado} from '../../../src/server/whapi-inbound-offline.ts';
import {construirBrokerWhapiPrivado} from '../../../src/server/whapi-crypto-broker.ts';
import {crearPuertoPostgresWhapiD030} from '../../../src/server/whapi-postgres-gateway.ts';
import {crearRecepcionDirectaDeInboxD061}
 from '../../../src/server/whapi-quote-inbox-processor-d061.ts';
import {interpretarCotizacionSimpleD063}
 from '../../../src/server/whapi-quote-simple-interpreter-d063.ts';
import {crearWorkerCotizacionesD062}
 from '../../../src/server/whapi-quote-worker-d062.ts';

const e=process.env;
const CHANNEL='whapi_d063_ci';
const CHAT='5492211234567@s.whatsapp.net';
const USER='cotironda_mvp_d063_ci_login';
const NOW=1800000000;
if(e.COTIRONDA_D063_CI!=='true'||e.PGHOST!=='127.0.0.1'||
   e.PGDATABASE!=='cotironda_ci'||e.COTIRONDA_D063_DB_LOGIN!==USER||
   !e.COTIRONDA_D063_DB_PASSWORD||
   !e.COTIRONDA_D063_WEBHOOK_SECRET)throw Error('d063_only_synthetic_ci');
function key(name){
 const s=e[name];if(!/^[a-f0-9]{64}$/.test(s??''))throw Error('d063_invalid_ci_secret');
 return Buffer.from(s,'hex');
}
const keys={identidadHmac:key('COTIRONDA_D063_HMAC_ID'),
 huellaHmac:key('COTIRONDA_D063_HMAC_PAYLOAD'),
 contenidoAes:key('COTIRONDA_D063_AES_KEY')};
assert.ok(!keys.identidadHmac.equals(keys.huellaHmac));
assert.ok(!keys.identidadHmac.equals(keys.contenidoAes));
assert.ok(!keys.huellaHmac.equals(keys.contenidoAes));
const options={host:'127.0.0.1',port:5432,database:'cotironda_ci',
 user:USER,password:e.COTIRONDA_D063_DB_PASSWORD,ssl:false,
 connectionTimeoutMillis:4000,query_timeout:6000,statement_timeout:5500,
 application_name:'cotironda-d063-mvp-synthetic-ci'};
const conn=new pg.Client(options);
await conn.connect();
try{
 const transport={query:(sql,params)=>conn.query(sql,[...params])};
 const broker=construirBrokerWhapiPrivado({
  channel:CHANNEL,claves:keys,contenidoKeyId:'aes_d063_ci',
  secretoWebhook:e.COTIRONDA_D063_WEBHOOK_SECRET,
  habilitado:true,almacen:crearPuertoPostgresWhapiD030(transport),
  ahoraUnix:()=>NOW
 });
 const origin=(msgid)=>createHmac('sha256',keys.identidadHmac)
  .update(JSON.stringify(['cotironda','msg',1,CHANNEL,msgid])).digest('hex');
 const inbound=async(id,content)=>procesarWebhookWhapiAislado(
  new Request('https://local.invalid/whapi/d063',{
   method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-webhook-key':e.COTIRONDA_D063_WEBHOOK_SECRET},
   body:JSON.stringify({channel_id:CHANNEL,
    event:{type:'messages',event:'post'},
    messages:[{id,chat_id:CHAT,from:'5492211234567',
      from_me:false,type:'text',timestamp:NOW,text:{body:content}}]})
  }),broker.dependencias);
 const reader=crearRecepcionDirectaDeInboxD061(
  transport,broker.verificarContenido,interpretarCotizacionSimpleD063);
 const worker=crearWorkerCotizacionesD062(transport,reader);
 const deny=async sql=>assert.rejects(conn.query(sql),err=>err.code==='42501');
 await deny('select * from cotironda_private.whapi_quote_queue_d062');
 await deny('select * from cotironda_private.whapi_inbox_v1');
 await deny('select * from cotironda_private.offer_versions_v1');
 await assert.rejects(conn.query('set role postgres'),err=>err.code==='42501');

 const id1='pg.quote-000000631';
 const first=await inbound(id1,'10 bolsas cemento CPC $121.00\nFlete a convenir');
 assert.equal(first.status,200);
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'done',intento:1});
 const duplicate=await inbound(id1,'10 bolsas cemento CPC $121.00\nFlete a convenir');
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicadas,1);
 assert.deepEqual(await worker.procesarUno(),{estado:'cola_vacia'});
 const id2='pg.quote-000000632';
 const correction=await inbound(id2,
  '10 bolsas cemento CPC $242.00\nIVA incluido 21%\nFlete sin cargo');
 assert.equal(correction.status,200);
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'done',intento:1});

 // A vague quote is retained for internal review without asking "Confirmo".
 const id3='pg.quote-000000633';
 assert.equal((await inbound(id3,'Cemento $300, precio charlable')).status,200);
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'manual_review',intento:1});
 assert.deepEqual(await worker.procesarUno(),{estado:'cola_vacia'});

 // A BAJA does not create a quote job and blocks future offers.
 const baja=await inbound('pg.optout-000000634','BAJA');
 assert.equal(baja.status,200);
 assert.equal((await baja.json()).bajasRegistradas,1);
 const denied=await inbound('pg.quote-000000635','10 bolsas cemento CPC $300.00');
 assert.equal(denied.status,403);

 // Inspect only aggregate state through privileged PG17 verification in a
 // separate psql CI step. The limited Node login cannot select private rows.
 // Payload text, phone and keys must not reach the CI output.
 console.log('D063_E2E_PASS: real_webhook_encryption_pg17_queue_cotizacion_v1_correction_v2_duplicate_review_optout_no_confirmo');
}finally{
 await conn.end();
}

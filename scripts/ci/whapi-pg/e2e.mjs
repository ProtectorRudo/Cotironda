/**
 * D031 - E2E REAL de Node.js contra PG17 descartable de GitHub CI.
 * Solo ambiente CI explícito + localhost. Nada de Whapi, OpenAI ni DEV.
 * NO registra texto, identificador de chat, contraseña ni claves en consola.
 */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import pg from 'pg';
import {procesarWebhookWhapiAislado} from '../../../src/server/whapi-inbound-offline.ts';
import {construirBrokerWhapiPrivado} from '../../../src/server/whapi-crypto-broker.ts';
import {crearPuertoPostgresWhapiD030} from '../../../src/server/whapi-postgres-gateway.ts';

const {Client}=pg;
const env=process.env;
if(env.COTIRONDA_CI_WHAPI_PG_E2E!=='true'||
   env.PGHOST!=='127.0.0.1'||env.PGDATABASE!=='cotironda_ci'||
   env.COTIRONDA_CI_PG_USER!=='cotironda_whapi_ci_login'||
   !env.COTIRONDA_CI_PG_PASSWORD||!env.COTIRONDA_CI_WEBHOOK_SECRET)
  throw Error('D031_ci_only_configuration_invalid');

const channel='whapi_ci',now=1800000000;
const keys={
 identidadHmac:Buffer.from(env.COTIRONDA_CI_HMAC_ID,'hex'),
 huellaHmac:Buffer.from(env.COTIRONDA_CI_HMAC_PAYLOAD,'hex'),
 contenidoAes:Buffer.from(env.COTIRONDA_CI_AES_KEY,'hex')
};
const opt={host:'127.0.0.1',port:5432,database:'cotironda_ci',
 user:env.COTIRONDA_CI_PG_USER,password:env.COTIRONDA_CI_PG_PASSWORD,
 // CI localhost only: PostgreSQL17 ephemeral container has no TLS endpoint.
 // PROD MUST enforce TLS with CA validation (different entrypoint).
 ssl:false,connectionTimeoutMillis:3000,query_timeout:3500,
 statement_timeout:3000,application_name:'cotironda-d031-synthetic-ci'};
const chatB='5492211234567@s.whatsapp.net';
const chatC='5492211234568@s.whatsapp.net';
const msg={id:'pg.ci-00000001',chat_id:chatB,from:'5492211234567',
 from_me:false,type:'text',timestamp:now,
 text:{body:'10 bolsas de cemento a $8500'}};
const wrap=(m)=>new Request('https://ci.invalid/whapi',{method:'POST',
 headers:{'content-type':'application/json',
  'x-cotironda-webhook-key':env.COTIRONDA_CI_WEBHOOK_SECRET},
 body:JSON.stringify({channel_id:channel,event:{type:'messages',event:'post'},
   messages:[m]})});
async function withDb(fn){
 const db=new Client(opt);
 await db.connect();
 try{return await fn(db)}finally{await db.end()}
}
async function expectDenied(db,sql){
 let denied=false;
 try{await db.query(sql)}
 catch(e){if(e.code==='42501')denied=true;else throw Error('D031_denial_wrong_code')}
 assert.equal(denied,true,'missing privilege must deny query');
}
async function runMessage(m,keyVersion='aes_2026_a'){
 return withDb(async db=>{
   const gateway=crearPuertoPostgresWhapiD030({
     query:async(sql,params)=>db.query(sql,[...params])});
   const rotated=keyVersion==='aes_2026_b';
   const cryptoKeys={...keys,contenidoAes:rotated?
     Buffer.from(env.COTIRONDA_CI_AES_KEY_B,'hex'):keys.contenidoAes};
   const broker=construirBrokerWhapiPrivado({
     channel,claves:cryptoKeys,contenidoKeyId:keyVersion,
     clavesLectura:rotated?{aes_2026_a:keys.contenidoAes}:{},
     secretoWebhook:env.COTIRONDA_CI_WEBHOOK_SECRET,
     habilitado:true,almacen:gateway,ahoraUnix:()=>now});
   const r=await procesarWebhookWhapiAislado(wrap(m),broker.dependencias);
   return {response:r,body:r.status===204?null:await r.json()};
 });
}
await withDb(async db=>{
 const info=await db.query('select current_user as role_name');
 assert.equal(info.rows[0].role_name,'cotironda_whapi_ci_login');
 await expectDenied(db,'select * from cotironda_private.whapi_inbox_v1 limit 1');
 await expectDenied(db,'select * from cotironda_private.whapi_contacts_v1 limit 1');
 await expectDenied(db,'update cotironda_private.rounds_v1 set status=\'cerrada\'');
 await expectDenied(db,'set role postgres');
});
const first=await runMessage(msg);
assert.equal(first.response.status,200);
assert.equal(first.body.estado,'entradas_persistidas');
assert.equal(first.body.guardadas,1);
assert.equal(first.body.presupuestosConfirmados,0);
assert.equal(first.body.mensajesEnviados,0);
// Reenviar en otra conexión: demostrar persistencia en PostgreSQL real.
const rotated=await runMessage({...msg,id:'pg.ci-00000006'},'aes_2026_b');
assert.equal(rotated.response.status,200);
assert.equal(rotated.body.guardadas,1);
// D034: reenvío del primer mensaje tras rotar AES no se rechaza ni reescribe.
const keyReplay=await runMessage(msg,'aes_2026_b');
assert.equal(keyReplay.response.status,200);
assert.equal(keyReplay.body.duplicadas,1);
const alteredAfterRotation=await runMessage({
 ...msg,text:{body:'precio distinto a $1'}},'aes_2026_b');
assert.equal(alteredAfterRotation.response.status,503);
const replay=await runMessage(msg);
assert.equal(replay.response.status,200);
assert.equal(replay.body.duplicadas,1);
const changed=await runMessage({...msg,text:{body:'cemento precio alterado'}});
assert.equal(changed.response.status,503);
assert.equal(changed.body.error,'persistencia_no_disponible');
const unknown=await runMessage({...msg,id:'pg.ci-00000002',
 chat_id:chatC,from:'5492211234568'});
assert.equal(unknown.response.status,403);
const optOutWithoutRound=await runMessage({...msg,id:'pg.ci-00000003',
 chat_id:chatC,from:'5492211234568',text:{body:'BAJA'}});
assert.equal(optOutWithoutRound.response.status,200);
assert.equal(optOutWithoutRound.body.bajasRegistradas,1);
const optOut=await runMessage({...msg,id:'pg.ci-00000004',
 text:{body:' BAJA '}});
assert.equal(optOut.response.status,200);
assert.equal(optOut.body.bajasRegistradas,1);
const optReplay=await runMessage({...msg,id:'pg.ci-00000004',
 text:{body:' BAJA '}});
assert.equal(optReplay.response.status,200);
assert.equal(optReplay.body.duplicadas,1);
const afterOpt=await runMessage({...msg,id:'pg.ci-00000005'});
assert.equal(afterOpt.response.status,403);
// No acceso de clientes a la base, operaciones reales solo desde rol gateway.
await withDb(async db=>{
 await expectDenied(db,'select payload_ciphertext from cotironda_private.whapi_inbox_v1');
 const chk=await db.query('select cotironda_private.whapi_resolve_active_contact_v1($1,$2) as payload',
  [channel,createHmac('sha256',keys.identidadHmac).update(JSON.stringify([
    'cotironda','chat',1,channel,chatB])).digest('hex')]);
 assert.equal(chk.rows[0].payload,null);
});
console.log('D031_D034_E2E_PG17_PASS: real_driver,least_privilege,encrypted_save,replay,collision,optout,revocation');

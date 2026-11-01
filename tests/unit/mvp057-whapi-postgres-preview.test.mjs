import test from 'node:test';
import assert from 'node:assert/strict';
import {abrirPuertoWhapiPreviewD088,validarConexionWhapiD088}
 from '../../src/server/whapi-postgres-driver-d088.ts';
import {atenderWebhookWhapiPreviewD083}
 from '../../src/server/whapi-preview-http-d083.ts';
import {calcularChatDestinatarioD056}
 from '../../src/server/whapi-send-authorization-d056.ts';

const REF='qkercsoqhehbenbbncwk',LOGIN='cotironda_whapi_http_login_d085';
const ROLE='cotironda_whapi_http_gateway_d084';
const SECRET='test-mvp057-'.padEnd(64,'s');
const URL_DB=`postgresql://${LOGIN}.${REF}:${'X'.repeat(32)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
const CA='-----BEGIN CERTIFICATE-----\n'+('a'.repeat(450))+'\n-----END CERTIFICATE-----';
const CH='channel_057',NOW=1800000000,PHONE='5492211111123';
const BUYER='aaaaaaaa-0057-4057-8057-000000000571';
const IDENT='select session_user as login, current_user as rol';
const SET_ROLE='set role cotironda_whapi_http_gateway_d084';
function env(extra={}){return {
 COTIRONDA_WHAPI_DB_DRIVER_ENABLED:'true',
 COTIRONDA_WHAPI_DB_PROJECT_REF:REF,
 COTIRONDA_WHAPI_DB_URL:URL_DB,
 COTIRONDA_WHAPI_DB_ROOT_CA_PEM:CA,
 VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_WHAPI_WEBHOOK_ENABLED:'true',
 COTIRONDA_WHAPI_PILOT_AUTHORIZED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_WHAPI_CHANNEL:CH,
 COTIRONDA_WHAPI_WEBHOOK_SECRET:SECRET,
 COTIRONDA_WHAPI_AES_KEY_ID:'aes_2026_a',
 COTIRONDA_WHAPI_HMAC_ID_HEX:'01'.repeat(32),
 COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'02'.repeat(32),
 COTIRONDA_WHAPI_AES_CONTENT_HEX:'03'.repeat(32),
 COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:calcularChatDestinatarioD056(
  CH,PHONE,Buffer.from('01'.repeat(32),'hex')),
 COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:JSON.stringify([
  calcularChatDestinatarioD056(CH,'5491111111001',Buffer.from('01'.repeat(32),'hex')),
  calcularChatDestinatarioD056(CH,'5491111111002',Buffer.from('01'.repeat(32),'hex'))
 ]),...extra
};}
function pg({login=LOGIN,role=LOGIN,invalidSet=false,fail='',buyer=false}={}){
 const state={opened:0,closed:0,queries:[],options:null,connection:role,writes:0,stored:new Map()};
 function factory(url,options){
  state.connection=role; // Every HTTPS request creates a NEW DB session.
  assert.equal(url,URL_DB);
  state.options=options;
  return {
   reserve:async()=>{
    state.opened++;
    if(fail==='connect')throw Error('PRIVATE_PASSWORD_DSN');
    return {
     unsafe:async(sql,args=[])=>{
      state.queries.push({sql,args});
      if(sql===IDENT){
       if(fail==='identity')throw Error('PRIVATE_PASSWORD_DSN');
       return [{login,rol:state.connection}];
      }
      if(sql===SET_ROLE){
       if(fail==='setrole')throw Error('PRIVATE_PASSWORD_DSN');
       if(!invalidSet)state.connection=ROLE;
       return [];
      }
      if(fail==='query')throw Error('PRIVATE_PASSWORD_DSN');
      if(sql.includes('whapi_resolve_active_contact_v1'))return [{payload:null}];
      if(sql.includes('whapi_resolve_buyer_d074'))
       return [{payload:buyer?{buyerOrgId:BUYER,
        consentimientoContactoVigente:true,chatHabilitado:true}:null}];
      if(sql.includes('whapi_record_buyer_d074')){
       state.writes++;
       const prev=state.stored.get(args[2]);
       state.stored.set(args[2],args[3]);
       assert.ok(Buffer.isBuffer(args[5]));
       assert.equal(args[5].includes(Buffer.from('Cemento')),false);
       return [{payload:{estado:'entrada_persistida',repetido:!!prev}}];
      }
      throw Error('SQL_NOT_ALLOWED');
     },
     release:async()=>{}
    };
   },
   end:async()=>{state.closed++;}
  };
 }
 return {factory,state};
}
function req({header=SECRET}={}){
 const message={id:'mvp057-example-msg',chat_id:PHONE+'@s.whatsapp.net',
  from:PHONE,from_me:false,type:'text',timestamp:NOW,
  text:{body:'Cemento 20 bolsas. Entrega: La Plata'}};
 return new Request('https://preview.cotironda.invalid/api/integraciones/whapi',{
  method:'POST',headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':header},
  body:JSON.stringify({channel_id:CH,
   event:{type:'messages',event:'post'},messages:[message]})
 });
}
test('MVP057: Postgres.js usa sesión reservada, CA TLS, límite 1 y seis RPC',async()=>{
 const {factory,state}=pg();
 const port=await abrirPuertoWhapiPreviewD088(env(),async()=>factory);
 assert.equal(state.opened,1);
 assert.deepEqual(state.queries.map(x=>x.sql),[IDENT,SET_ROLE,IDENT]);
 assert.equal(state.options.max,1);
 assert.equal(state.options.max_pipeline,1);
 assert.equal(state.options.prepare,false);
 assert.equal(state.options.fetch_types,false);
 assert.deepEqual(state.options.ssl,{ca:CA,rejectUnauthorized:true});
 const select='select cotironda_private.whapi_resolve_buyer_d074($1::text,$2::text) as payload';
 assert.deepEqual(await port.query(select,[CH,'a'.repeat(64)]),
  {rows:[{payload:null}]});
 await assert.rejects(port.query('select * from auth.users',[]),
  /whapi_sql_privado_no_disponible/);
 await port.cerrar();
 await port.cerrar();
 assert.equal(state.closed,1);
 await assert.rejects(port.query(select,[CH,'a'.repeat(64)]),
  /whapi_sql_privado_no_disponible/);
});
test('MVP057: conexión HTTP autenticada persiste comprador una sola vez',async()=>{
 const {factory,state}=pg({buyer:true});
 const cfg={env:env(),abrirPuertoSql:()=>abrirPuertoWhapiPreviewD088(
  env(),async()=>factory),ahoraUnix:()=>NOW};
 for(const [n,expected] of [[0,1],[1,0]]){
  const r=await atenderWebhookWhapiPreviewD083(req(),cfg);
  assert.equal(r.status,200);
  assert.equal((await r.json()).guardadas,expected);
 }
 assert.equal(state.stored.size,1);
 assert.equal(state.closed,2);
 assert.ok(state.queries.every(x=>!x.sql.includes(PHONE)));
 assert.equal(state.queries.some(x=>x.sql.includes('whapi_record_buyer_d074')),true);
});
test('MVP057: header erróneo o producción impide abrir conexión',async()=>{
 let loaded=0;
 const cfg=(e)=>({env:e,
  abrirPuertoSql:()=>abrirPuertoWhapiPreviewD088(e,async()=>{
   loaded++;throw Error('MODULE_SHOULD_NOT_LOAD');
  }),ahoraUnix:()=>NOW});
 assert.equal((await atenderWebhookWhapiPreviewD083(req({header:'bad'}),
  cfg(env()))).status,401);
 for(const e of [env({VERCEL_ENV:'production'}),
  env({VERCEL_GIT_COMMIT_REF:'main'}),
  env({COTIRONDA_WHAPI_WEBHOOK_ENABLED:'false'})])
 assert.equal((await atenderWebhookWhapiPreviewD083(req(),cfg(e))).status,503);
 assert.equal(loaded,0);
});
test('MVP057: rechaza URLs y credenciales peligrosas antes de cargar driver',async()=>{
 const invalid=[
  {COTIRONDA_WHAPI_DB_DRIVER_ENABLED:'false'},
  {COTIRONDA_WHAPI_DB_PROJECT_REF:'otroproyecto12345678'},
  {VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {COTIRONDA_WHAPI_DB_URL:URL_DB.replace(':5432',':6543')},
  {COTIRONDA_WHAPI_DB_URL:URL_DB.replace('pooler.supabase.com','evil.com')},
  {COTIRONDA_WHAPI_DB_URL:URL_DB.replace('sa-east-1','us-west-2')},
  {COTIRONDA_WHAPI_DB_URL:URL_DB.replace(LOGIN+'.'+REF,'postgres')},
  {COTIRONDA_WHAPI_DB_URL:URL_DB+'?sslmode=disable'},
  {COTIRONDA_WHAPI_DB_URL:'postgresql://postgres:PASSWORD@localhost:5432/postgres'},
  {COTIRONDA_WHAPI_DB_ROOT_CA_PEM:'not_a_certificate'}
 ];
 for(const patch of invalid){
  let loaded=0;
  await assert.rejects(abrirPuertoWhapiPreviewD088(env(patch),async()=>{
   loaded++;throw Error('DRIVER_SHOULD_NOT_LOAD');
  }),/whapi_sql_privado_no_disponible/);
  assert.equal(loaded,0);
 }
 assert.equal(validarConexionWhapiD088(env()).url,URL_DB);
});
test('MVP057: rol incorrecto, fallo de sesión y backend sanitizan errores y cierran',async()=>{
 for(const config of [
  {login:'postgres',role:'postgres'},
  {invalidSet:true},
  {fail:'connect'},
  {fail:'identity'},
  {fail:'setrole'}
 ]){
  const {factory,state}=pg(config);
  await assert.rejects(abrirPuertoWhapiPreviewD088(env(),async()=>factory),
   e=>{assert.equal(e.message,'whapi_sql_privado_no_disponible');return true;});
  assert.equal(state.closed,1);
 }
 const {factory,state}=pg({fail:'query'});
 const port=await abrirPuertoWhapiPreviewD088(env(),async()=>factory);
 await assert.rejects(port.query(
  'select cotironda_private.whapi_resolve_buyer_d074($1::text,$2::text) as payload',
  [CH,'a'.repeat(64)]),
  /whapi_sql_privado_no_disponible/);
 await port.cerrar(); assert.equal(state.closed,1);
});

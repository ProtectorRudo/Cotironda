import test from 'node:test';
import assert from 'node:assert/strict';
import {atenderTickCompradorMvp060}
 from '../../src/server/buyer-whatsapp-runner-http-mvp060.ts';
import {abrirRecursosSqlCompradorMvp060}
 from '../../src/server/buyer-whatsapp-postgres-mvp060.ts';

const REF='qkercsoqhehbenbbncwk';
const C='channel_mvp060';
const SECRET='mvp060privateworkersecret'.padEnd(60,'0');
const CA='-----BEGIN CERTIFICATE-----\n'+'X'.repeat(400)+'\n-----END CERTIFICATE-----';
const ROLES={
 cola:['cotironda_buyer_worker_cola_login_d090','cotironda_buyer_queue_gateway_d082'],
 lectura:['cotironda_buyer_worker_lectura_login_d090','cotironda_buyer_gateway_d076'],
 zona:['cotironda_buyer_worker_zona_login_d090','cotironda_buyer_zone_gateway_d077'],
 ronda:['cotironda_buyer_worker_ronda_login_d090','cotironda_whapi_round_gateway_d081'],
 invitacion:['cotironda_buyer_worker_invite_login_d090','cotironda_invite_gateway_d070']
};
const LABELS={
 cola:'COTIRONDA_BUYER_DB_URL_COLA',
 lectura:'COTIRONDA_BUYER_DB_URL_LECTURA',
 zona:'COTIRONDA_BUYER_DB_URL_ZONA',
 ronda:'COTIRONDA_BUYER_DB_URL_RONDA',
 invitacion:'COTIRONDA_BUYER_DB_URL_INVITACION'
};
const u=login=>`postgresql://${login}.${REF}:${'p'.repeat(32)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
function env(extra={}){
 const e={
  VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
  COTIRONDA_REGISTRATION_ENABLED:'false',
  COTIRONDA_BUYER_WORKER_ENABLED:'true',
  COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED:'true',
  COTIRONDA_BUYER_WORKER_SECRET:SECRET,
  COTIRONDA_BUYER_WORKER_DB_DRIVER_ENABLED:'true',
  COTIRONDA_BUYER_WORKER_DB_PROJECT_REF:REF,
  COTIRONDA_BUYER_WORKER_DB_ROOT_CA_PEM:CA,
  COTIRONDA_WHAPI_CHANNEL:C,
  COTIRONDA_WHAPI_WEBHOOK_SECRET:'X'.repeat(55),
  COTIRONDA_WHAPI_AES_KEY_ID:'aes_2026_a',
  COTIRONDA_WHAPI_HMAC_ID_HEX:'01'.repeat(32),
  COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'02'.repeat(32),
  COTIRONDA_WHAPI_AES_CONTENT_HEX:'03'.repeat(32)
 };
 for(const [role,[login]] of Object.entries(ROLES))
  e[LABELS[role]]=u(login);
 return {...e,...extra};
}
function request(secret=SECRET,{body=false,method='POST'}={}){
 return new Request('https://pilot.invalid/api/integraciones/whapi/procesar',{
  method,
  ...(method==='POST'&&body?{body:'{"override":"evil"}'}:{}),
  headers:{'x-cotironda-worker-key':secret}
 });
}
function backend({wrongRole=null,failAt=null}={}){
 const state={opened:[],released:[],ended:[],sqlCalls:[]};
 function factory(url,options){
  assert.equal(options.max,1);
  assert.equal(options.max_pipeline,1);
  assert.equal(options.prepare,false);
  assert.equal(options.fetch_types,false);
  assert.deepEqual(options.ssl,{ca:CA,rejectUnauthorized:true});
  const role=Object.keys(ROLES).find(x=>u(ROLES[x][0])===url);
  assert.ok(role);
  const [login,gateway]=ROLES[role];
  let current=login;
  return {
   reserve:async()=>{
    state.opened.push(role);
    if(failAt===role)throw Error('DB_SECRET_CANNOT_LEAK');
    return {
     unsafe:async(sql,args=[])=>{
      state.sqlCalls.push({role,sql,args});
      if(sql==='select session_user as login, current_user as rol')
       return [{login,rol:current}];
      if(sql.startsWith('set role ')){
       assert.equal(sql,'set role '+gateway);
       current=role===wrongRole?'postgres':gateway;
       return [];
      }
      assert.equal(current,gateway,'must SET ROLE first');
      if(role==='cola'&&sql.includes('whapi_claim_buyer_d082'))
       return [{payload:null}];
      throw Error('unexpected SQL');
     },
     release:async()=>state.released.push(role)
    };
   },
   end:async()=>{state.ended.push(role)}
  };
 }
 return {factory,state};
}
function emptySql(){
 return Object.fromEntries(Object.keys(ROLES).map(x=>[x,{
  query:async(sql)=>{
   if(x==='cola'&&sql.includes('whapi_claim_buyer_d082'))
    return {rows:[{payload:null}]};
   throw Error('PRIVATE_SECRET_NOT_FOR_HTTP');
  }
 }]));
}
test('MVP060: 405, disabled and unauthorized before connection',async()=>{
 let calls=0;
 const cfg=(e)=>({env:e,abrirRecursos:async()=>{calls++;throw Error('secret')}});
 assert.equal((await atenderTickCompradorMvp060(
  request(SECRET,{method:'GET'}),cfg(env()))).status,405);
 for(const patch of [
  {VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_BUYER_WORKER_ENABLED:'false'},
  {COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED:'false'}
 ]){
  const res=await atenderTickCompradorMvp060(request(),cfg(env(patch)));
  assert.equal(res.status,503);
 }
 assert.equal((await atenderTickCompradorMvp060(
  request('INCORRECT_SECRET'),cfg(env()))).status,401);
 assert.equal((await atenderTickCompradorMvp060(
  request(SECRET,{body:true}),cfg(env()))).status,415);
 assert.equal(calls,0);
});
test('MVP060: HTTP tick vacío abre y cierra recursos, sin teléfono ni envío',async()=>{
 const state={opened:0,closed:0,read:0};
 const res=await atenderTickCompradorMvp060(request(),{
  env:env(),
  abrirRecursos:async()=>{state.opened++;return {
   sql:emptySql(),
   verificarContenidoComprador:()=>{state.read++;throw Error('no fake data')},
   cerrar:async()=>{state.closed++}
  }}
 });
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{
  estado:'ejecutado',procesados:0,finalizados:0,enRevision:0,
  descartados:0,pendientes:0,agotados:0,mensajesEnviados:0
 });
 assert.deepEqual(state,{opened:1,closed:1,read:0});
 assert.match(res.headers.get('cache-control'),/no-store/);
});
test('MVP060: SQL de worker usa cinco logins reservados con SET ROLE distinto',async()=>{
 const b=backend();
 const resources=await abrirRecursosSqlCompradorMvp060(env(),b.factory);
 assert.deepEqual(b.state.opened,Object.keys(ROLES));
 assert.equal(b.state.sqlCalls.length,15);
 assert.deepEqual(b.state.sqlCalls.filter(x=>x.sql.startsWith('set role ')).
  map(x=>[x.role,x.sql]),Object.entries(ROLES).map(([role,v])=>
   [role,'set role '+v[1]]));
 const row=await resources.sql.cola.query(
  'select cotironda_private.whapi_claim_buyer_d082($1::text) as payload',[C]);
 assert.deepEqual(row,{rows:[{payload:null}]});
 await assert.rejects(()=>resources.verificarContenidoComprador({
  channel:C,chatKey:'a'.repeat(64),messageKey:'b'.repeat(64),
  buyerOrgId:'aaaaaaaa-0000-4000-8000-000000000001',
  kind:'text',sourceUnix:1800000000,cryptoKeyId:'aes_2026_a',
  fingerprint:'f'.repeat(64),
  ciphertext:Buffer.from('malformed'),nonce:Buffer.alloc(12,1),
  tag:Buffer.alloc(16,2)
 }));
 await resources.cerrar();await resources.cerrar();
 assert.equal(b.state.ended.length,5);
 assert.equal(b.state.released.length,5);
 await assert.rejects(()=>resources.sql.cola.query('select 1',[]),
  /buyer_worker_sql_no_disponible/);
});
test('MVP060: falla de una sesión/rol cierra todas, oculta credenciales',async()=>{
 for(const scenario of [
  {wrongRole:'invitacion'},
  {wrongRole:'cola'},
  {failAt:'lectura'},
  {failAt:'invitacion'}
 ]){
  const b=backend(scenario);
  await assert.rejects(
   ()=>abrirRecursosSqlCompradorMvp060(env(),b.factory),
   e=>e.message==='buyer_worker_sql_no_disponible');
  assert.equal(b.state.ended.length,b.state.opened.length);
 }
});
test('MVP060: port 6543, ajeno, admin, cross-project y TLS ausente rechazados sin SQL',async()=>{
 const invalid=[
  {COTIRONDA_BUYER_WORKER_DB_PROJECT_REF:'otro'},
  {COTIRONDA_BUYER_WORKER_DB_DRIVER_ENABLED:'false'},
  {VERCEL_ENV:'production'},
  {COTIRONDA_BUYER_WORKER_DB_ROOT_CA_PEM:'fake'},
  {COTIRONDA_BUYER_DB_URL_COLA:u(ROLES.cola[0]).replace(':5432',':6543')},
  {COTIRONDA_BUYER_DB_URL_ZONA:u(ROLES.zona[0]).replace('pooler.supabase.com','evil.com')},
  {COTIRONDA_BUYER_DB_URL_RONDA:u('postgres')},
  {COTIRONDA_BUYER_DB_URL_LECTURA:u(ROLES.lectura[0])+'?sslmode=disable'},
  {COTIRONDA_BUYER_DB_URL_INVITACION:u(ROLES.invitacion[0]).replace(REF,'otherproject')}
 ];
 for(const patch of invalid){
  const b=backend();
  await assert.rejects(
   ()=>abrirRecursosSqlCompradorMvp060(env(patch),b.factory),
   /buyer_worker_sql_no_disponible/);
  assert.equal(b.state.opened.length,0);
 }
});
test('MVP060: si falla trabajo, servidor responde 503 sin PII y cierra',async()=>{
 let closed=0;
 const res=await atenderTickCompradorMvp060(request(),{
  env:env(),abrirRecursos:async()=>({
   sql:{...emptySql(),
    cola:{query:async()=>{throw Error('REAL_CUSTOMER_PHONE_PRIVATE')}}},
   verificarContenidoComprador:()=>{throw Error('must not run')},
   cerrar:async()=>{closed++}
  })
 });
 assert.equal(res.status,503);
 assert.deepEqual(await res.json(),{error:'worker_privado_no_disponible'});
 assert.equal(closed,1);
 assert.equal(await res.text(),'');
});

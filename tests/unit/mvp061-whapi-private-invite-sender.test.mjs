import test from 'node:test';
import assert from 'node:assert/strict';
import {cifrarDestinatarioD068}
 from '../../src/server/whapi-encrypted-recipient-d068.ts';
import {atenderEnvioInvitacionMvp061,validarEmisorInvitacionesMvp061}
 from '../../src/server/whapi-invite-send-http-mvp061.ts';
import {crearSqlEmisorInvitacionesMvp061}
 from '../../src/server/whapi-invite-sql-sender-mvp061.ts';
const REF='qkercsoqhehbenbbncwk';
const LOGIN='cotironda_invite_sender_login_d091';
const ROLE='cotironda_invite_sender_gateway_d091';
const CH='whapi_061_pilot',TO='5492211234567';
const DB='postgresql://'+LOGIN+'.'+REF+':'+('x'.repeat(32))+
 '@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
const CA='-----BEGIN CERTIFICATE-----\n'+('A'.repeat(450))+'\n-----END CERTIFICATE-----';
const SECRET='invite_sender_ci_'.padEnd(48,'s');
const ROUND='dddddddd-0061-4061-8061-000000000661';
const ORG='bbbbbbbb-0061-4061-8061-000000000662';
const JOB='cccccccc-0061-4061-8061-000000000661';
const LEASE='eeeeeeee-0061-4061-8061-000000000661';
const KEYS={hmacIdentity:Buffer.alloc(32,17),recipientAes:Buffer.alloc(32,91)};
const ACK=Buffer.alloc(32,33);
const sealed=cifrarDestinatarioD068({channel:CH,supplierOrgId:ORG,to:TO,
 cryptoKeyId:'recipient_ci'},KEYS);
const claim={state:'leased',jobId:JOB,leaseToken:LEASE,roundId:ROUND,
 supplierOrgId:ORG,channel:CH,chatKey:sealed.chatKey};
const packet={roundId:ROUND,supplierOrgId:ORG,channel:CH,
 deliveryZone:'La Plata',vatRequest:'no_especificado',items:[
 {lineNo:1,productCode:'cemento_gris_obra',label:'Cemento CPC 50 kg',
 quantity:'20.000',unit:'bag'}]};
function env(extra={}){return {
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_INVITE_SEND_ENABLED:'true',
 COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED:'true',
 COTIRONDA_INVITE_SEND_DB_DRIVER_ENABLED:'true',
 COTIRONDA_INVITE_SEND_DB_PROJECT_REF:REF,
 COTIRONDA_INVITE_SEND_DB_URL:DB,
 COTIRONDA_INVITE_SEND_DB_CA_PEM:CA,
 COTIRONDA_INVITE_SEND_SECRET:SECRET,
 COTIRONDA_INVITE_SEND_WHAPI_TOKEN:'ci_token_for_whapi_never_real_012345',
 COTIRONDA_INVITE_SEND_ALLOWED_TO:TO,
 COTIRONDA_WHAPI_CHANNEL:CH,
 COTIRONDA_WHAPI_WEBHOOK_SECRET:'webhook_not_reused_'.padEnd(48,'w'),
 COTIRONDA_BUYER_WORKER_SECRET:'worker_not_reused_'.padEnd(48,'x'),
 COTIRONDA_WHAPI_HMAC_ID_HEX:KEYS.hmacIdentity.toString('hex'),
 COTIRONDA_WHAPI_RECIPIENT_AES_HEX:KEYS.recipientAes.toString('hex'),
 COTIRONDA_WHAPI_ACK_HMAC_HEX:ACK.toString('hex'),...extra
};}
function request({method='POST',secret=SECRET,body=false}={}){
 return new Request('https://preview.invalid/api/integraciones/whapi/enviar',{
  method,headers:{'x-cotironda-invite-key':secret},
  ...(body?{body:'{ "hack": true }'}:{})
 });
}
function mock({badLogin=false,wrongRole=false,beginsFail=false,
 authorize=true,failRead=false}={}){
 const s={calls:[],connections:0,closes:0,releases:0,sent:0,started:false,
 taken:false,finished:null,redacted:[]};
 const factory=(url,opts)=>{
  assert.equal(url,DB);
  assert.equal(opts.max,1);assert.equal(opts.max_pipeline,1);
  assert.equal(opts.prepare,false);assert.equal(opts.fetch_types,false);
  assert.deepEqual(opts.ssl,{ca:CA,rejectUnauthorized:true});
  s.connections++;
  let effective=LOGIN;
  return {
   reserve:async()=>({
    unsafe:async(sql,args=[])=>{
     s.calls.push({sql,args});
     if(sql==='select session_user as login, current_user as rol')
      return [{login:badLogin?'postgres':LOGIN,rol:effective}];
     if(sql==='set role '+ROLE){effective=wrongRole?'postgres':ROLE;return [];}
     assert.equal(effective,ROLE);
     if(sql.includes('whapi_claim_invite_d070')){
      if(s.taken)return [{payload:null}];
      s.taken=true;return [{payload:claim}];
     }
     if(sql.includes('whapi_read_recipient_packet_d068')){
      if(failRead)throw Error('DB_PRIVATE_PASSWORD');
      return [{payload:{packet,chatKey:sealed.chatKey,
       cryptoKeyId:sealed.cryptoKeyId,nonceHex:sealed.nonceHex,
       cipherHex:sealed.cipherHex,tagHex:sealed.tagHex}}];
     }
     if(sql.includes('whapi_begin_invite_d070')){
      if(beginsFail)throw Error('DB_COMMIT_ACK_LOST');
      s.started=true;return [{payload:{state:'in_flight',jobId:JOB}}];
     }
     if(sql.includes('whapi_authorize_invite_d070'))
      return [{payload:authorize===false?false:true}];
     if(sql.includes('whapi_finish_invite_d070')){
      s.finished=args[2];
      return [{payload:{state:args[2],repeated:false}}];
     }
     if(sql.includes('whapi_fail_preflight_invite_d070'))
      return [{payload:{state:'queued'}}];
     throw Error('unapproved_sql');
    },
    release:async()=>{s.releases++}
   }),
   end:async()=>{s.closes++}
  };
 };
 const fetcher=async(url,opts)=>{
  s.sent++;
  assert.equal(url,'https://gate.whapi.cloud/messages/text');
  assert.equal(opts.method,'POST');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.authorization,
   'Bearer ci_token_for_whapi_never_real_012345');
  const x=JSON.parse(opts.body);
  assert.equal(x.to,TO);
  assert.match(x.body,/Cemento CPC 50 kg/);
  assert.match(x.body,/La Plata/);
  return new Response(JSON.stringify({sent:true,
   message:{id:'mvp061-whapi-accepted-123',status:'pending',
    chat_id:TO+'@s.whatsapp.net',from_me:true,type:'text'}}),{
    status:200,headers:{'content-type':'application/json'}
   });
 };
 const config=e=>({env:e,cargarSql:async()=>factory,fetcher});
 return {s,factory,fetcher,config};
}
test('MVP061: endpoint POST auténtico -> D070 + D068 + Whapi SOLO tras BEGIN COMMIT',async()=>{
 const f=mock();
 const r=await atenderEnvioInvitacionMvp061(request(),f.config(env()));
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{estado:'aceptado_por_transporte'});
 assert.equal(f.s.sent,1);
 assert.ok(f.s.started);
 assert.ok(f.s.calls.findIndex(x=>x.sql.includes('whapi_begin_invite_d070'))<
  f.s.calls.findIndex(x=>x.sql.includes('whapi_authorize_invite_d070')));
 assert.equal(f.s.connections,f.s.closes);
 assert.equal(f.s.connections,f.s.releases);
 assert.equal(f.s.finished,'accepted_by_transport');
 assert.equal(f.s.calls.some(x=>JSON.stringify(x.args).includes(TO)),false);
 const again=await atenderEnvioInvitacionMvp061(request(),f.config(env()));
 assert.deepEqual(await again.json(),{estado:'cola_vacia'});
 assert.equal(f.s.sent,1);
});
test('MVP061: inválido/producción/GET/body/secret no cargan Postgres ni llaman Whapi',async()=>{
 let loaded=0,sent=0;
 const cfg=(e)=>({env:e,cargarSql:async()=>{
  loaded++;throw Error('DB_PRIVATE_PASSWORD');
 },fetcher:async()=>{sent++;throw Error('should not send')}});
 assert.equal((await atenderEnvioInvitacionMvp061(request({method:'GET'}),cfg(env()))).status,405);
 assert.equal((await atenderEnvioInvitacionMvp061(request({method:'PUT'}),cfg(env()))).status,405);
 assert.equal((await atenderEnvioInvitacionMvp061(request({secret:'bad'}),cfg(env()))).status,401);
 assert.equal((await atenderEnvioInvitacionMvp061(request({body:true}),cfg(env()))).status,415);
 for(const patch of [
  {VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {COTIRONDA_INVITE_SEND_ENABLED:'false'},
  {COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED:'false'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'}
 ]){
  assert.equal((await atenderEnvioInvitacionMvp061(request(),cfg(env(patch)))).status,503);
 }
 assert.equal(loaded,0);assert.equal(sent,0);
});
test('MVP061: allowlist exacta de máximo tres; claves no reutilizadas',()=>{
 for(const patch of [
  {COTIRONDA_INVITE_SEND_ALLOWED_TO:TO+','+TO},
  {COTIRONDA_INVITE_SEND_ALLOWED_TO:TO+',5492210000000,5492210000001,5492210000002'},
  {COTIRONDA_INVITE_SEND_ALLOWED_TO:'+5492211234567'},
  {COTIRONDA_INVITE_SEND_ALLOWED_TO:TO+' ,5492210000000'},
  {COTIRONDA_INVITE_SEND_ALLOWED_TO:''},
  {COTIRONDA_INVITE_SEND_WHAPI_TOKEN:'bad'},
  {COTIRONDA_INVITE_SEND_SECRET:env().COTIRONDA_WHAPI_WEBHOOK_SECRET},
  {COTIRONDA_WHAPI_ACK_HMAC_HEX:KEYS.hmacIdentity.toString('hex')}
 ]){
  assert.throws(()=>validarEmisorInvitacionesMvp061(env(patch)));
 }
 assert.deepEqual(validarEmisorInvitacionesMvp061(env({
  COTIRONDA_INVITE_SEND_ALLOWED_TO:TO+',5492210000000'
 })).recipients,[TO,'5492210000000']);
});
test('MVP061: SQL rechaza puerto 6543, usuario admin, host, ref y no CA',()=>{
 for(const patch of [
  {COTIRONDA_INVITE_SEND_DB_URL:DB.replace('5432','6543')},
  {COTIRONDA_INVITE_SEND_DB_URL:DB.replace('pooler.supabase.com','evil.com')},
  {COTIRONDA_INVITE_SEND_DB_URL:DB.replace(LOGIN+'.'+REF,'postgres')},
  {COTIRONDA_INVITE_SEND_DB_URL:DB+'?sslmode=disable'},
  {COTIRONDA_INVITE_SEND_DB_PROJECT_REF:'evil_project'},
  {COTIRONDA_INVITE_SEND_DB_CA_PEM:'notpem'}
 ]){
  assert.throws(()=>crearSqlEmisorInvitacionesMvp061(env(patch),
   ()=>{throw Error('should not connect')}),/mvp061_sql_sender_no_disponible/);
 }
});
test('MVP061: SQL driver permite solo seis RPC exactas; no acceso a tablas',async()=>{
 const f=mock();
 const port=crearSqlEmisorInvitacionesMvp061(env(),f.factory);
 await assert.rejects(port.committedRpc('select * from auth.users',[]),
  /mvp061_sql_sender_no_disponible/);
 assert.equal(f.s.connections,0);
 assert.deepEqual(await port.committedRpc(
  'select cotironda_private.whapi_claim_invite_d070() as payload',[]),
  {payload:claim});
 assert.equal(f.s.connections,1);
 assert.equal(f.s.releases,1);
 assert.equal(f.s.closes,1);
});
test('MVP061: credenciales/rol mal no hace envío; BEGIN perdido NO envía',async()=>{
 for(const patch of [{badLogin:true},{wrongRole:true},{beginsFail:true}]){
  const f=mock(patch);
  const r=await atenderEnvioInvitacionMvp061(request(),f.config(env()));
  assert.ok([200,503].includes(r.status));
  assert.equal(f.s.sent,0);
  assert.equal(f.s.connections,f.s.closes);
  assert.equal(f.s.connections,f.s.releases);
 }
});
test('MVP061: BAJA entre BEGIN y HTTP => incierto sin reenvío',async()=>{
 const f=mock({authorize:false});
 const r=await atenderEnvioInvitacionMvp061(request(),f.config(env()));
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{estado:'incierto_sin_reenvio'});
 assert.equal(f.s.sent,0);
 assert.equal(f.s.finished,'uncertain');
});
test('MVP061: falla de packet D068 antes de BEGIN no llama Whapi',async()=>{
 const f=mock({failRead:true});
 const r=await atenderEnvioInvitacionMvp061(request(),f.config(env()));
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{estado:'reintento_preenvio'});
 assert.equal(f.s.sent,0);
 assert.equal(f.s.started,false);
});

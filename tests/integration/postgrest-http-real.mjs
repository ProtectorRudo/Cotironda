// Prueba HTTP de PostgREST REAL + PostgreSQL 17 REAL, sin Supabase Auth ni claves del cliente.
// SOLO GitHub Actions sobre BD efímera. JWT HS256 firmado con clave generada en el runner.
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const HOST='http://127.0.0.1:3409';
const USER_A='a1111111-1111-4111-8111-111111111111';
const USER_B='b2222222-2222-4222-8222-222222222222';
const SESSION_A='f1111111-1111-4111-8111-111111111111';
const SESSION_B='f2222222-2222-4222-8222-222222222222';
const SESSION_B_NEW='f3333333-3333-4333-8333-333333333333';
const secret=process.env.COTIRONDA_CI_JWT_SECRET;

if(process.env.GITHUB_ACTIONS!=='true' ||
   process.env.COTIRONDA_POSTGREST_HTTP_CI!=='true' ||
   process.env.PGHOST!=='127.0.0.1' ||
   process.env.PGDATABASE!=='cotironda_ci_http' ||
   typeof secret!=='string'||secret.length<48) {
 throw new Error('entorno_http_ci_no_autorizado');
}
const json64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function sign(payload){
 const unsigned=json64({alg:'HS256',typ:'JWT'})+'.'+json64(payload);
 const signature=createHmac('sha256',secret).update(unsigned).digest('base64url');
 return unsigned+'.'+signature;
}
function token(user,session,changes={}){
 const now=Math.floor(Date.now()/1000);
 return sign({
  sub:user,role:'authenticated',is_anonymous:false,
  cotironda_email_verified:true,session_id:session,
  iat:now-3,exp:now+600,...changes
 });
}
function forgedSubject(jwt){
 const [header,payload,signature]=jwt.split('.');
 const claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
 return header+'.'+json64({...claims,sub:USER_B})+'.'+signature;
}
function sql(query){
 return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At','-c',query],{
  env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:7000
 }).trim();
}
async function rpc(jwt){
 const response=await fetch(HOST+'/rpc/register_company_for_current_user',{
  method:'POST',
  headers:{'content-type':'application/json',...(jwt?{authorization:'Bearer '+jwt}:{})},
  body:JSON.stringify({p_request_id:randomUUID(),p_name:'X',p_type:'buyer',p_trade_name:null}),
  signal:AbortSignal.timeout(6000)
 });
 let body;
 try{body=await response.json()}catch{body=null}
 return {status:response.status,body};
}
function row(data){
 assert.ok(Array.isArray(data.body) && data.body.length===1,
  'La RPC no devolvió una fila estructurada; status='+data.status);
 return data.body[0];
}
async function expectInvalid(jwt,stage){
 const out=await rpc(jwt);
 assert.equal(out.status,400,stage+' esperaba HTTP 400 invalid_request, obtuvo '+out.status);
 const result=row(out);
 assert.equal(result.registration_status,'invalid_request',stage);
 assert.equal(result.organization_id,null,stage);
}
async function main(){
 const jwtA=token(USER_A,SESSION_A);
 const jwtB=token(USER_B,SESSION_B);

 // Comprobar el perímetro de autenticación ANTES de consumir una cuota.
 const anon=await rpc();
 assert.ok([401,403].includes(anon.status),'RPC anónima no bloqueada');
 assert.ok(!Array.isArray(anon.body)||anon.body.every(x=>x.registration_status!=='ok'));
 console.log('PASS HTTP: anónimo sin EXECUTE');

 const tampered=await rpc(forgedSubject(jwtA));
 assert.equal(tampered.status,401,'JWT sub manipulado debe ser rechazado por firma en PostgREST');
 assert.ok(['PGRST301','PGRST303'].includes(tampered.body?.code),
  'El rechazo debe ser JWT de PostgREST, no el SQL ni el negocio');
 console.log('PASS HTTP: firma JWT adulterada rechazada antes del SQL');

 const expired=await rpc(token(USER_A,SESSION_A,{iat:Math.floor(Date.now()/1000)-7200,exp:Math.floor(Date.now()/1000)-3600}));
 assert.equal(expired.status,401,'JWT vencido debe fallar por firma/expiración');
 assert.ok(['PGRST301','PGRST303'].includes(expired.body?.code),'expiración no fue JWT auth');
 console.log('PASS HTTP: expiración real de JWT verificada');

 // Nombre deliberadamente inválido: cada llamada consume cuota SIN crear empresas.
 for(let i=1;i<=20;i++)await expectInvalid(jwtA,'cuota A '+i);
 const limit=await rpc(jwtA);
 assert.equal(limit.status,429,'La solicitud 21 exige HTTP 429 real');
 assert.equal(row(limit).registration_status,'rate_limited');
 assert.equal(sql("select request_count from cotironda_private.registration_attempt_quotas where user_id='"+USER_A+"'"),'21');
 assert.equal(sql('select count(*) from public.organizations'),'0');
 console.log('PASS HTTP: veinte rechazos durables, intento 21 devuelve 429, 0 empresas');

 // El JWT firmado B es aceptado cuando existe su sesión vigente.
 await expectInvalid(jwtB,'sesión B activa');
 assert.equal(sql("delete from auth.sessions where id='"+SESSION_B+"' returning id"),SESSION_B);
 const revoked=await rpc(jwtB);
 assert.equal(revoked.status,403,'JWT aún firmado con sesión revocada: HTTP 403');
 assert.equal(row(revoked).registration_status,'session_invalid');
 console.log('PASS HTTP: JWT legítimo sin sesión vigente rechazado tras revocación');

 sql("insert into auth.sessions(id,user_id,not_after) values ('"+SESSION_B_NEW+"','"+USER_B+"',null)");
 const jwtBNew=token(USER_B,SESSION_B_NEW);
 await expectInvalid(jwtBNew,'sesión nueva B');
 const oldAgain=await rpc(jwtB);
 assert.equal(oldAgain.status,403,'El login nuevo no debe rehabilitar un JWT anterior');
 assert.equal(row(oldAgain).registration_status,'session_invalid');
 assert.equal(sql("select request_count from cotironda_private.registration_attempt_quotas where user_id='"+USER_B+"'"),'4');
 assert.equal(sql('select count(*) from public.organizations'),'0');
 console.log('PASS HTTP: sesión nueva no rehabilita el token revocado; cuota separada, 0 empresas');
}

try{
 await main();
 console.log('PASS: PostgREST real HTTP + PostgreSQL efímero; sin Supabase Auth');
}finally{
 // El cleanup es obligatorio aunque falle un assert; no se escribe jamás a la base remota.
 try{
  sql("update cotironda_private.registration_settings set enabled=false where singleton=true");
  sql("delete from auth.sessions");
  sql("delete from auth.users");
  assert.equal(sql('select count(*) from public.organizations'),'0');
  assert.equal(sql('select count(*) from cotironda_private.registration_attempt_quotas'),'0');
  assert.equal(sql('select enabled from cotironda_private.registration_settings where singleton=true'),'f');
  console.log('PASS: fixtures CI revertidos y registro SQL cerrado');
 }catch{
  console.error('FAIL: limpieza local no verificada');
  process.exitCode=1;
 }
}

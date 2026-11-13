import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iniciarSesionDesdeWhatsappD016}
 from '../../src/server/v2-d016-sesion-auth.ts';

const ORIGIN='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const URL_PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const USER='11111111-1111-4111-8111-111111111111';
const SESSION='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROUND='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHAT='3'.repeat(64);
const SHA='4'.repeat(40);
const NOW=1799999999000;
const gate=()=>({habilitada:true,entorno:'preview',proyectoUrl:URL_PILOT,
 shaDesplegado:SHA,shaAprobado:SHA,origenPortal:ORIGIN,
 claveHmacHex:'5'.repeat(64)});
const claim=()=>({state:'CLAIMED_AWAITING_AUTH',buyerKey:'buyer_piloto',
 requestId:ROUND,chatHmac:CHAT});
const ACCESS='a'.repeat(50)+'.'+'b'.repeat(50)+'.'+'c'.repeat(50);
const REFRESH='r'.repeat(100);
function harness(){
 const calls={resolve:0,generate:0,verify:0,check:0,cookie:0};
 const source={userId:USER,email:'comprador@cotironda.example'};
 const auth={userId:USER,sessionId:SESSION,accessToken:ACCESS,
  refreshToken:REFRESH,expiresAtMs:NOW+60*60*1000};
 const config={user:source,link:{tokenHash:'f'.repeat(64)},
  auth,valid:true,cookie:true,now:NOW,
  throwAt:null};
 const fail=x=>{if(config.throwAt===x)throw Error('synthetic-secret-must-not-leak')};
 const ports={
  ahora:()=>config.now,
  resolverAuthDeComprador:async q=>{
   calls.resolve++;fail('resolve');
   assert.deepEqual(q,{buyerKey:'buyer_piloto',requestId:ROUND,chatHmac:CHAT});
   return config.user;
  },
  generarMagiclink:async q=>{
   calls.generate++;fail('generate');
   assert.equal(q.email,'comprador@cotironda.example');
   assert.equal(Object.keys(q).length,1);
   return config.link;
  },
  canjearMagiclink:async q=>{
   calls.verify++;fail('verify');
   assert.equal(q.tokenHash,'f'.repeat(64));
   return config.auth;
  },
  verificarSesionViva:async q=>{
   calls.check++;fail('check');
   assert.deepEqual(q,{userId:USER,sessionId:SESSION,buyerKey:'buyer_piloto',
    requestId:ROUND,chatHmac:CHAT});
   return config.valid;
  },
  guardarCookieHttpOnly:async q=>{
   calls.cookie++;fail('cookie');
   assert.deepEqual(q,{accessToken:ACCESS,refreshToken:REFRESH,
    expiresAtMs:NOW+60*60*1000,userId:USER,sessionId:SESSION});
   return config.cookie;
  }
 };
 return {calls,config,ports,run:(g=gate(),c=claim())=>
  iniciarSesionDesdeWhatsappD016(g,c,ports)};
}
test('D016 Auth: ticket reclamado y existente produce SOLO resultado, sesión únicamente en cookie',async()=>{
 const h=harness();
 assert.equal(await h.run(),'SESSION_STARTED');
 assert.deepEqual(h.calls,{resolve:1,generate:1,verify:1,check:1,cookie:1});
 assert.equal(JSON.stringify(await h.run()).includes(ACCESS),false);
});
test('D016 Auth: claim no acreditado y gates cerrados nunca consultan Admin Auth',async()=>{
 for(const [g,c] of [
  [{...gate(),habilitada:false},claim()],
  [{...gate(),entorno:'production'},claim()],
  [{...gate(),shaAprobado:'6'.repeat(40)},claim()],
  [{...gate(),claveHmacHex:null},claim()],
  [gate(),null],[gate(),{...claim(),state:'BLOCKED'}],
  [gate(),{...claim(),buyerKey:'supplier; SELECT *'}],
  [gate(),{...claim(),requestId:'not_uuid'}],
  [gate(),{...claim(),chatHmac:'too_short'}]
 ]){
  const h=harness();
  assert.equal(await h.run(g,c),'BLOCKED');
  assert.deepEqual(h.calls,{resolve:0,generate:0,verify:0,check:0,cookie:0});
 }
});
test('D016 Auth: sin cuenta preexistente y vínculo inequívoco jamás crea usuario',async()=>{
 const samples=[null,{userId:'invalid',email:'buyer@cotironda.example'},
  {userId:USER,email:'bad address'}, {userId:USER,email:null}];
 for(const sample of samples){
  const h=harness();h.config.user=sample;
  assert.equal(await h.run(),'BLOCKED');
  assert.deepEqual(h.calls,{resolve:1,generate:0,verify:0,check:0,cookie:0});
 }
});
test('D016 Auth: magic link inexistente, deformado o error de servidor: cerrado',async()=>{
 for(const value of [null,{}, {tokenHash:'short'},
  {tokenHash:'x'.repeat(300)},{tokenHash:'x'.repeat(63)+'!'}]){
  const h=harness();h.config.link=value;
  assert.equal(await h.run(),'BLOCKED');
  assert.equal(h.calls.verify,0);
  assert.equal(h.calls.cookie,0);
 }
});
test('D016 Auth: token entregado a otro usuario, sesión inventada o expirada jamás genera cookie',async()=>{
 const cases=[
  {userId:'22222222-2222-4222-8222-222222222222'},
  {sessionId:'not_a_session'},
  {accessToken:'not_a_jwt'},
  {refreshToken:'too-short'},
  {expiresAtMs:NOW-1},{expiresAtMs:NOW+25*60*60*1000}
 ];
 for(const patch of cases){
  const h=harness();h.config.auth={...h.config.auth,...patch};
  assert.equal(await h.run(),'BLOCKED',JSON.stringify(patch));
  assert.equal(h.calls.check,0);
  assert.equal(h.calls.cookie,0);
 }
});
test('D016 Auth: revocación, error de cookie y excepciones fallan cerradas',async()=>{
 const revoked=harness();revoked.config.valid=false;
 assert.equal(await revoked.run(),'BLOCKED');
 assert.equal(revoked.calls.cookie,0);
 const rejected=harness();rejected.config.cookie=false;
 assert.equal(await rejected.run(),'BLOCKED');
 assert.equal(rejected.calls.cookie,1);
 for(const stage of ['resolve','generate','verify','check','cookie']){
  const h=harness();h.config.throwAt=stage;
  assert.equal(await h.run(),'BLOCKED',stage);
  assert.ok(!JSON.stringify(await h.run()).includes('synthetic-secret'));
 }
});
test('D016 Auth: sólo se admite un puente servidor, nunca JWT propio ni SMS',()=>{
 const code=readFileSync(new URL('../../src/server/v2-d016-sesion-auth.ts',
  import.meta.url),'utf8');
 assert.match(code,/verificarSesionViva/u);
 assert.match(code,/guardarCookieHttpOnly/u);
 assert.doesNotMatch(code,/signInWithOtp\(|signUp\(|createUser\(|phone_confirmed_at\s*=/u);
 assert.doesNotMatch(code,/localStorage|document\.cookie|new Response\(JSON\.stringify\(auth/u);
});

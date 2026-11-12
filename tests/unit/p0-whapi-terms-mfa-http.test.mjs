import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {responderRevisionMfaOperadorP0,revisionMfaHTTPHabilitada}
 from '../../src/server/whapi-terms-mfa-http-p0.ts';
const ORIGIN='https://cotironda-preview.example.test';
const url='https://ilggkalaafhtiysyzlmg.supabase.co';
const release='a'.repeat(40);
const env={
 COTIRONDA_PILOT_OPERATOR_API_ENABLED:'true',
 COTIRONDA_PILOT_OPERATOR_RELEASE_SHA:release,
 VERCEL_GIT_COMMIT_SHA:release,
 VERCEL_ENV:'preview',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:url,
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_for_ci',
 COTIRONDA_PILOT_OPERATOR_ORIGIN:ORIGIN,
 COTIRONDA_P0_TERMS_REVIEW_UI_ENABLED:'true',
 COTIRONDA_P0_TERMS_INBOX_AES_HEX:'37'.repeat(32)
};
const id='10000000-0000-4000-8000-000000000001';
const session='20000000-0000-4000-8000-000000000001';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function makeJwt(aal='aal2'){
 return b64({typ:'JWT',alg:'HS256'})+'.'+b64({
  iss:url+'/auth/v1',aud:'authenticated',role:'authenticated',
  sub:id,session_id:session,exp:Math.floor(Date.now()/1000)+300,
  aal
 })+'.'+'f'.repeat(40);
}
const MSG='1'.repeat(64),NOTICE='2'.repeat(64),CHAT='3'.repeat(64);
const TERMS='cotironda-originales-alta-v1. Las condiciones establecen que el '+
 'comprador debidamente autenticado podrá descargar los archivos originales '+
 'de futuras rondas cerradas, aun cuando no se haya adjudicado ese proveedor. '+
 'El archivo puede contener contactos y datos bancarios.';
const PLAIN='Autorizo expresamente la descarga de originales para futuras rondas.';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const KEY=Buffer.from(env.COTIRONDA_P0_TERMS_INBOX_AES_HEX,'hex');
const nonce=Buffer.alloc(12,5);
const cipher=createCipheriv('aes-256-gcm',KEY,nonce);
cipher.setAAD(Buffer.from(CHAT+'|'+MSG+'|text'));
const sealed=Buffer.concat([cipher.update(PLAIN,'utf8'),cipher.final(),cipher.getAuthTag()]);
const packet={
 state:'ready',messageHmac:MSG,supplierKey:'supplier_1',
 noticeMessageHmac:NOTICE,termsVersion:'cotironda-originales-alta-v1',
 termsSha256:sha(TERMS),termsBody:TERMS,
 chatHmac:CHAT,receivedAt:'2026-11-12T12:00:00Z',
 plaintextSha256:sha(PLAIN),
 nonceB64:nonce.toString('base64'),
 ciphertextB64:sealed.toString('base64')
};
function req(action,body={},headers={},method='POST',path=action){
 return new Request(ORIGIN+'/api/piloto/operador/terminos/'+path,{
  method,headers:{
   authorization:'Bearer '+makeJwt(),
   origin:ORIGIN,'content-type':'application/json',
   ...headers
  },
  body:method==='POST'?JSON.stringify(body):undefined
 });
}
function ports(data){
 const calls=[];
 return {calls,impl:{
  getUser:async jwt=>({id,is_anonymous:false}),
  authenticatedRpc:async(name,args)=>{
   calls.push({name,args});
   if(data?.[name]!==undefined)return data[name];
   if(name==='cotironda_piloto_terms_review_queue_auth_p0')return {
    state:'ready',items:[{messageHmac:MSG,supplierKey:'supplier_1',
      receivedAt:'2026-11-12T12:00:00Z'}]};
   if(name==='cotironda_piloto_terms_review_packet_auth_p0')return packet;
   if(name==='cotironda_piloto_terms_review_decide_auth_p0')
    return {state:'recorded',decision:args.p_decision};
   throw Error('unknown');
  }
 }};
}
test('P0 operator HTTP: NO release, production, signups ON or missing AES deny',async()=>{
 assert.equal(revisionMfaHTTPHabilitada({}),false);
 const p=ports();
 for(const patch of [
  {COTIRONDA_P0_TERMS_REVIEW_UI_ENABLED:'false'},
  {COTIRONDA_P0_TERMS_INBOX_AES_HEX:undefined},
  {COTIRONDA_PILOT_OPERATOR_API_ENABLED:'false'},
  {COTIRONDA_PILOT_OPERATOR_RELEASE_SHA:'b'.repeat(40)},
  {VERCEL_ENV:'production'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_PILOT_SUPABASE_URL:'https://other.supabase.co'}
 ]){
  const r=await responderRevisionMfaOperadorP0(req('bandeja'), 'bandeja',
   {...env,...patch},p.impl);
  assert.equal(r.status,503,JSON.stringify(patch));
 }
 assert.equal(p.calls.length,0);
});
test('P0 operator HTTP: GET, origin, query, body/headers invalid fail before DB',async()=>{
 const p=ports();
 const bad=[
  [req('bandeja',{},{} ,'GET'),405],
  [req('bandeja',{}, {origin:'https://other.example.test'}),403],
  [req('bandeja',{}, {authorization:''}),401],
  [req('bandeja',{extra:'anything'}),400],
  [req('preparar',{messageHmac:'bad'}),400],
  [req('preparar',{messageHmac:MSG,operator_ref:id}),400],
  [req('decidir',{messageHmac:MSG,noticeMessageHmac:NOTICE,
    reviewedPlaintextSha256:sha(PLAIN),decision:'explicit_accept',
    humanAttestation:false}),400],
  [req('bandeja',{}, {'content-type':'text/plain'}),400],
  [req('bandeja',{}, {},'POST','bandeja?secret=wrong'),400]
 ];
 for(const [r,expected] of bad){
  assert.equal((await responderRevisionMfaOperadorP0(
    r,new URL(r.url).pathname.split('/').slice(-1)[0].split('?')[0],
    env,p.impl)).status,expected);
 }
 assert.equal(p.calls.length,0);
});
test('P0 operator HTTP: PILOT getUser and AAL2 before any private RPC',async()=>{
 const a=ports(),without={...a.impl,getUser:async()=>null};
 assert.equal((await responderRevisionMfaOperadorP0(
  req('bandeja'),'bandeja',env,without)).status,401);
 const low=req('bandeja',{},{
  authorization:'Bearer '+makeJwt('aal1')
 });
 assert.equal((await responderRevisionMfaOperadorP0(
  low,'bandeja',env,a.impl)).status,403);
 assert.equal(a.calls.length,0);
});
test('P0 operator HTTP: list contains only safe metadata, never ciphertext',async()=>{
 const p=ports();
 const r=await responderRevisionMfaOperadorP0(
  req('bandeja'),'bandeja',env,p.impl);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control')?.includes('no-store'),true);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');
 const result=await r.json();
 assert.deepEqual(result.items,[{messageHmac:MSG,supplierKey:'supplier_1',
   receivedAt:'2026-11-12T12:00:00Z'}]);
 assert(!JSON.stringify(result).includes('ciphertext'));
 assert(!JSON.stringify(result).includes('phone'));
 assert.equal(p.calls[0].name,'cotironda_piloto_terms_review_queue_auth_p0');
});
test('P0 operator HTTP: prepare gets verified original, does NOT decide',async()=>{
 const p=ports();
 const r=await responderRevisionMfaOperadorP0(
  req('preparar',{messageHmac:MSG}),'preparar',env,p.impl);
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.text,PLAIN);
 assert.equal(body.termsBody,TERMS);
 assert.equal(body.plaintextSha256,sha(PLAIN));
 assert.equal(body.state,'ready');
 assert.equal(p.calls.length,1);
 assert.equal(p.calls[0].name,'cotironda_piloto_terms_review_packet_auth_p0');
 assert(!JSON.stringify(body).includes('ciphertext'));
});
test('P0 operator HTTP: decision rereads and submits no operator ID',async()=>{
 const p=ports();
 const r=await responderRevisionMfaOperadorP0(req('decidir',{
  messageHmac:MSG,noticeMessageHmac:NOTICE,
  reviewedPlaintextSha256:sha(PLAIN),
  decision:'explicit_accept',humanAttestation:true
 }),'decidir',env,p.impl);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{state:'recorded',decision:'explicit_accept'});
 assert.deepEqual(p.calls.map(x=>x.name),[
  'cotironda_piloto_terms_review_packet_auth_p0',
  'cotironda_piloto_terms_review_decide_auth_p0'
 ]);
 assert(!Object.keys(p.calls[1].args).includes('operator_ref'));
 assert.equal(p.calls[1].args.p_reviewed_text,PLAIN);
});
test('P0 operator HTTP: SQL denying authorization leaks no cleartext',async()=>{
 const p=ports({
  cotironda_piloto_terms_review_packet_auth_p0:{state:'not_authorized'}
 });
 const r=await responderRevisionMfaOperadorP0(
  req('preparar',{messageHmac:MSG}),'preparar',env,p.impl);
 assert.equal(r.status,409);
 const b=await r.text();
 assert(!b.includes(PLAIN));
 assert(!b.includes('sb_secret_'));
});
test('P0 operator HTTP: malformed queue with phone or large payload is denied',async()=>{
 const p=ports({
  cotironda_piloto_terms_review_queue_auth_p0:{
   state:'ready',items:[{messageHmac:MSG,supplierKey:'supplier_1',
    receivedAt:'2026-11-12T12:00:00Z',phone:'5492210000000'}]
  }
 });
 const r=await responderRevisionMfaOperadorP0(
  req('bandeja'),'bandeja',env,p.impl);
 assert.equal(r.status,409);
 assert(!((await r.text()).includes('549221')));
});
test('P0 portal: Next routes use operator boundary; no service tokens / secrets in client',()=>{
 const prefix='../..';
 const routeBase=new URL('../../apps/portal/app/api/piloto/operador/terminos/',import.meta.url);
 for(const k of ['bandeja','preparar','decidir']){
  const s=readFileSync(new URL(k+'/route.ts',routeBase),'utf8');
  assert(s.includes("revisarTerminosPiloto(req,'"+k+"')"));
  assert(!/service_role|sb_secret_|COTIRONDA_PILOT_AES_HEX/iu.test(s));
 }
 const panel=readFileSync(new URL(
  '../../apps/portal/app/piloto/operador/terminos/panel-revision.tsx',
   import.meta.url),'utf8');
 assert(panel.includes('persistSession:false'));
 assert(panel.includes('mfa.challengeAndVerify'));
 assert(panel.includes("currentLevel!=='aal2'"));
 assert(panel.includes('humanAttestation:true'));
 assert(!/signUp\(|localStorage|service_role|sb_secret_/iu.test(panel));
});

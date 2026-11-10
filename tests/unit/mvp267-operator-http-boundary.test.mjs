import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {responderOperadorPiloto,operadorPilotoHabilitado} from
 '../../src/server/operador-piloto-http-mvp267.ts';

const id='10000000-0000-4000-8000-000000000001';
const session='20000000-0000-4000-8000-000000000001';
const origin='https://cotironda-preview.example.test';
const release='a'.repeat(40);
const env={
 COTIRONDA_PILOT_OPERATOR_API_ENABLED:'true',
 COTIRONDA_PILOT_OPERATOR_RELEASE_SHA:release,
 VERCEL_GIT_COMMIT_SHA:release,VERCEL_ENV:'preview',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_for_ci',
 COTIRONDA_PILOT_OPERATOR_ORIGIN:origin
};
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({
 iss:env.COTIRONDA_PILOT_SUPABASE_URL+'/auth/v1',aud:'authenticated',
 role:'authenticated',sub:id,session_id:session,
 exp:Math.floor(Date.now()/1000)+3600,aal:'aal2'
})+'.'+'x'.repeat(40);
const hash='f'.repeat(64);
function req(path,method='GET',payload=null,headers={}){
 return new Request(origin+path,{method,headers:{
  authorization:'Bearer '+token,
  ...(payload===null?{}:{
   origin, 'content-type':'application/json'
  }),...headers
 },body:payload===null?undefined:JSON.stringify(payload)});
}
function ports(response){
 const calls=[];
 return {calls,ports:{
  getUser:async()=>({id,is_anonymous:false}),
  rpc:async(name,params)=>{
   calls.push({name,params});
   return {data:response,error:null};
  }
 }};
}
test('MVP267: preview+SHA+closed signup gate is OFF by default',async()=>{
 const p=ports({state:'private_operator_cases',cases:[]});
 assert.equal(operadorPilotoHabilitado({}),false);
 for(const patch of [
  {VERCEL_ENV:'production'},
  {COTIRONDA_PILOT_OPERATOR_RELEASE_SHA:'b'.repeat(40)},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_PILOT_SUPABASE_URL:'https://other.supabase.co'},
  {COTIRONDA_PILOT_OPERATOR_API_ENABLED:'false'},
  {COTIRONDA_PILOT_OPERATOR_ORIGIN:'http://wrong.example.test'}
 ]){
  const bad={...env,...patch};
  assert.equal(operadorPilotoHabilitado(bad),false);
  const r=await responderOperadorPiloto(req('/api/piloto/operador'), 'queue',bad,p.ports);
  assert.equal(r.status,503);
 }
 assert.equal(p.calls.length,0);
});
test('MVP267: no bearer or unverified user is rejected before RPC',async()=>{
 const p=ports({state:'private_operator_cases',cases:[]});
 assert.equal((await responderOperadorPiloto(
  req('/api/piloto/operador','GET',null,{authorization:''}),
  'queue',env,p.ports)).status,401);
 assert.equal((await responderOperadorPiloto(
  req('/api/piloto/operador?token=secret'),'queue',env,p.ports)).status,400);
 assert.equal((await responderOperadorPiloto(
  req('/api/piloto/operador','POST',{}),'queue',env,p.ports)).status,405);
 const denied={...p.ports,getUser:async()=>null};
 assert.equal((await responderOperadorPiloto(req('/api/piloto/operador'),
  'queue',env,denied)).status,401);
 assert.equal(p.calls.length,0);
});
test('MVP267: queue projects only allowed aggregate fields',async()=>{
 const p=ports({state:'private_operator_cases',cases:[{
  signal_code:'outbound_uncertain',severity:'blocked',active:true,
  count:3,opened_at:'2026-11-06T19:00:00+00:00',age_minutes:44,
  sla_minutes:30,unacknowledged_over_sla:true,
  review_state:'awaiting_operator',
  phone:'+5492210000000',operator_ref:id
 }]});
 const response=await responderOperadorPiloto(
  req('/api/piloto/operador'), 'queue',env,p.ports);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control')?.includes('no-store'),true);
 const body=await response.json();
 assert.equal(body.cases.length,1);
 assert.equal(JSON.stringify(body).includes('operator_ref'),false);
 assert.equal(JSON.stringify(body).includes('phone'),false);
 assert.equal(p.calls[0].name,'cotironda_piloto_operator_queue_auth_mvp267');
});
test('MVP267: writes cannot specify operator and require Origin, whitelist and hashes',async()=>{
 const p=ports({state:'recorded_private'});
 const payload={
  signalCode:'outbound_uncertain',
  episodeStartedAt:'2026-11-06T19:00:00+00:00',
  actionCode:'acknowledge',evidenceSha256:hash
 };
 const ok=await responderOperadorPiloto(
  req('/api/piloto/operador/caso','POST',payload),
  'case',env,p.ports);
 assert.equal(ok.status,200);
 assert.equal(p.calls[0].name,'cotironda_piloto_operator_case_action_auth_mvp267');
 assert.equal(Object.keys(p.calls[0].params).includes('p_operator_ref'),false);
 const forged=await responderOperadorPiloto(
  req('/api/piloto/operador/caso','POST',{...payload,operatorRef:id}),
  'case',env,p.ports);
 assert.equal(forged.status,400);
 const cross=await responderOperadorPiloto(
  req('/api/piloto/operador/caso','POST',payload,{origin:'https://evil.example.test'}),
  'case',env,p.ports);
 assert.equal(cross.status,403);
 const wrong=await responderOperadorPiloto(
  req('/api/piloto/operador/caso','POST',{...payload,evidenceSha256:'invalid'}),
  'case',env,p.ports);
 assert.equal(wrong.status,400);
 assert.equal(p.calls.length,1);
});
test('MVP267: usage review cannot fabricate tokens or money',async()=>{
 const p=ports({state:'reviewed_private',usage_observed:false,monetary_cost_verified:false});
 const payload={messageHmac:hash,callNo:1,basis:'provider_usage_reviewed',evidenceSha256:hash};
 const r=await responderOperadorPiloto(
  req('/api/piloto/operador/consumo','POST',payload),'review',env,p.ports);
 assert.equal(r.status,200);
 const body=await r.json();
 assert.deepEqual(body,{
  state:'reviewed_private',usage_observed:false,monetary_cost_verified:false
 });
 assert.equal(p.calls[0].name,'cotironda_piloto_operator_usage_review_auth_mvp267');
 assert.equal(Object.hasOwn(p.calls[0].params,'p_operator_ref'),false);
});
test('MVP267: aggregate token report never exposes participant, price or PII',async()=>{
 const p=ports({state:'private_openai_usage',roles:[{
  role:'buyer',requests:1,usage_observed:0,usage_unknown:1,
  input_tokens_observed:0,output_tokens_observed:0,total_tokens_observed:0,
  participant_key:'buyer_a',contact:'secret'
 }],monetary_cost:null,pricing_verified:false,
 provider_invoice_reconciled:false,unknown_usage_is_zero:false});
 const r=await responderOperadorPiloto(
  req('/api/piloto/operador/uso'),'usage',env,p.ports);
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(JSON.stringify(body).includes('buyer_a'),false);
 assert.equal(body.monetary_cost,null);
 assert.equal(body.roles[0].usage_unknown,1);
});
test('MVP267: SQL denial and upstream failure never leak raw database errors',async()=>{
 const p=ports({state:'not_authorized',secret:'anything'});
 const r=await responderOperadorPiloto(req('/api/piloto/operador'),'queue',env,p.ports);
 assert.equal(r.status,403);
 assert.deepEqual(await r.json(),{state:'operador_no_autorizado'});
 const q={getUser:async()=>({id,is_anonymous:false}),
  rpc:async()=>{throw Error('secret SQL detail')}};
 const err=await responderOperadorPiloto(req('/api/piloto/operador'),'queue',env,q);
 assert.equal(err.status,503);
 assert.equal((await err.text()).includes('secret'),false);
});
test('MVP267: portal routes only refer to authenticated, gated handler',()=>{
 const base=new URL('../../apps/portal/app/api/piloto/operador/',import.meta.url);
 for(const [path,handler] of [
  ['route.ts','queue'],['uso/route.ts','usage'],
  ['caso/route.ts','case'],['consumo/route.ts','review']
 ]){
  const source=readFileSync(new URL(path,base),'utf8');
  assert.ok(source.includes("operarPiloto(req,'"+handler+"')"));
  assert.doesNotMatch(source,/service_role|sb_secret_|whapi/iu);
 }
});

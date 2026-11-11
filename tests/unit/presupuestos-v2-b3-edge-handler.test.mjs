import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarSolicitudSombraV2B3} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/handler.ts';

const root='https://ilggkalaafhtiysyzlmg.supabase.co';
const url=root+'/functions/v1/cotironda-piloto-v2-shadow';
const secret='r'.repeat(64);
const modern='sb_secret_'+ 'm'.repeat(38);
const legacy=['e'.repeat(24),'y'.repeat(24),'z'.repeat(24)].join('.');
const api='sk-'+'a'.repeat(40);
const baseEnv=()=>({
 COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED:'true',
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:secret,
 COTIRONDA_PILOT_OPENAI_API_KEY:api,
 COTIRONDA_PILOT_AI_CENTRAL_MODEL:'gpt-6.1-sol',
 SUPABASE_URL:root,
 SUPABASE_SERVICE_ROLE_KEY:legacy,
 SUPABASE_SECRET_KEYS:JSON.stringify({default:modern})
});
const outcome=(state='candidate_private')=>({
 state,reason:'shadow_candidate_unverified',
 processed:1,outboundMessages:0,publishedOffers:0
});
const headers=(mode='modern')=>
 mode==='modern'
 ?{'apikey':modern,'x-cotironda-recovery-secret':secret}
 :{'Authorization':'Bearer '+legacy,'x-cotironda-recovery-secret':secret};
const req=(mode='modern',more={})=>new Request(url,{
 method:'POST',headers:{...headers(mode),...more}
});
const setup=(state='candidate_private')=>{
 const calls={db:0,run:0,api:null,model:null};
 const deps={
  createDb:(project,key)=>{
   calls.db++;
   assert.equal(project,root);
   assert.equal(key,legacy);
   return {
    rpc:async()=>{throw Error('not used by injected worker')},
    storage:{from:()=>({download:async()=>{throw Error('not used')}})}
   };
  },
  run:async input=>{
   calls.run++;
   calls.api=input.apiKey;
   calls.model=input.model;
   assert.equal(input.enabled,true);
   assert.equal(input.trustedInternalWorker,true);
   return outcome(state);
  }
 };
 return {calls,deps};
};
const check=async(res,status,value)=>{
 assert.equal(res.status,status);
 assert.deepEqual(await res.json(),{state:value});
 assert.equal(res.headers.get('cache-control'),'no-store, private');
 assert.equal(res.headers.get('x-content-type-options'),'nosniff');
};
test('B3: authenticated modern sb_secret_ + private second factor works',async()=>{
 const {calls,deps}=setup();
 await check(await ejecutarSolicitudSombraV2B3(req(),
  baseEnv(),deps),200,'candidate_private');
 assert.equal(calls.db,1);
 assert.equal(calls.run,1);
 assert.equal(calls.api,api);
 assert.equal(calls.model,'gpt-6.1-sol');
});
test('B3: authenticated legacy JWT + private second factor works',async()=>{
 const {calls,deps}=setup('review_required');
 await check(await ejecutarSolicitudSombraV2B3(req('legacy'),
  baseEnv(),deps),200,'review_required');
 assert.equal(calls.db,1);assert.equal(calls.run,1);
});
test('B3: off by default even with valid credentials, no backend call',async()=>{
 for(const value of [undefined,'','false','TRUE','1']){
  const {calls,deps}=setup();
  const env=baseEnv();
  env.COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED=value;
  await check(await ejecutarSolicitudSombraV2B3(req(),
   env,deps),503,'shadow_disabled');
  assert.equal(calls.db,0);assert.equal(calls.run,0);
 }
});
test('B3: GET/HEAD/PUT never authorize, read or modify anything',async()=>{
 for(const method of ['GET','HEAD','PUT','DELETE']){
  const {calls,deps}=setup();
  const r=new Request(url,{method,headers:headers()});
  await check(await ejecutarSolicitudSombraV2B3(r,baseEnv(),deps),
   405,'method_not_allowed');
  assert.equal(calls.db,0);assert.equal(calls.run,0);
 }
});
test('B3: anonymous, publishable, user JWT, fake key cannot enter worker',async()=>{
 const variants=[
  {},{'apikey':'sb_publishable_'+ 'x'.repeat(28)},
  {'Authorization':'Bearer '+['u','s','e'].map(x=>x.repeat(25)).join('.')},
  {'apikey':'sb_secret_'+ 'n'.repeat(38)},
  {'Authorization':'Bearer '+legacy},
  {'x-cotironda-recovery-secret':'wrong'},
  {'apikey':modern},
  {'apikey':modern,'x-cotironda-recovery-secret':secret.slice(1)},
  {'Authorization':'Bearer '+legacy,'x-cotironda-recovery-secret':'wrong'}
 ];
 for(const h of variants){
  const {calls,deps}=setup();
  const r=new Request(url,{method:'POST',headers:h});
  await check(await ejecutarSolicitudSombraV2B3(r,baseEnv(),deps),
   401,'unauthorized');
  assert.equal(calls.db,0);assert.equal(calls.run,0);
 }
});
test('B3: both apikey AND Authorization forbidden, no ambiguity',async()=>{
 for(const mode of ['modern','legacy']){
  const {calls,deps}=setup();
  await check(await ejecutarSolicitudSombraV2B3(req(mode,
   mode==='modern'?{'Authorization':'Bearer '+legacy}: {'apikey':modern}
  ),baseEnv(),deps),401,'unauthorized');
  assert.equal(calls.db,0);
 }
});
test('B3: Supabase gateway may forward an EMPTY POST as a non-null body stream',async()=>{
 const cases=[
  new Request(url,{method:'POST',headers:headers(),body:''}),
  new Request(url,{method:'POST',headers:headers(),
   body:new ReadableStream({start(controller){controller.close()}}),
   duplex:'half'})
 ];
 for(const r of cases){
  const {calls,deps}=setup();
  await check(await ejecutarSolicitudSombraV2B3(r,baseEnv(),deps),
   200,'candidate_private');
  assert.equal(calls.run,1);
 }
});
test('B3: an actual byte in a streamed POST remains strictly forbidden',async()=>{
 const reqStream=new Request(url,{method:'POST',headers:headers(),
  body:new ReadableStream({start(c){
   c.enqueue(new TextEncoder().encode('x'));c.close()
  }}),duplex:'half'});
 const {calls,deps}=setup();
 await check(await ejecutarSolicitudSombraV2B3(
  reqStream,baseEnv(),deps),413,'body_not_allowed');
 assert.equal(calls.run,0);
});
test('B3: request body and query parameters cannot select source or trigger batches',async()=>{
 for(const r of [
  new Request(url,{method:'POST',headers:headers(),
   body:JSON.stringify({source_hmac:'x'.repeat(64)})}),
  new Request(url+'?source_hmac='+'x'.repeat(64),
   {method:'POST',headers:headers()}),
  new Request(url+'?limit=999',
   {method:'POST',headers:headers()})
 ]){
  const {calls,deps}=setup();
  const res=await ejecutarSolicitudSombraV2B3(r,baseEnv(),deps);
  assert.ok([400,413].includes(res.status));
  assert.equal(calls.db,0);assert.equal(calls.run,0);
 }
});
test('B3: wrong project, missing OpenAI key or backend admin credentials -> 503',async()=>{
 const mutations=[
  {SUPABASE_URL:'https://another-project.supabase.co'},
  {SUPABASE_URL:undefined},
  {COTIRONDA_PILOT_OPENAI_API_KEY:''},
  {COTIRONDA_PILOT_OPENAI_API_KEY:'garbage'},
  {SUPABASE_SERVICE_ROLE_KEY:'',
   SUPABASE_SECRET_KEYS:'{}'}
 ];
 for(const patch of mutations){
  const {calls,deps}=setup();
  const env={...baseEnv(),...patch};
  const missingAdminCreds=Object.hasOwn(patch,'SUPABASE_SECRET_KEYS');
  await check(await ejecutarSolicitudSombraV2B3(req(),env,deps),
   missingAdminCreds?401:503,
   missingAdminCreds?'unauthorized':'backend_configuration_invalid');
  assert.equal(calls.db,0);assert.equal(calls.run,0);
 }
});
test('B3: modern-key-only server works without legacy service role',async()=>{
 let calls=0;
 const deps={
  createDb:(project,key)=>{
   calls++;
   assert.equal(project,root);
   assert.equal(key,modern);
   return {rpc:async()=>({data:{state:'empty'},error:null}),
    storage:{from:()=>({download:async()=>({data:null,error:null})})}};
  },
  run:async()=>outcome('empty')
 };
 await check(await ejecutarSolicitudSombraV2B3(
  req(),{...baseEnv(),SUPABASE_SERVICE_ROLE_KEY:''},deps),
  200,'queue_empty');
 assert.equal(calls,1);
});
test('B3: failed upstream, exception and SQL uncertainty never leak secrets',async()=>{
 for(const bad of [
  'reconciliation_required','disabled',
  'unknown',null
 ]){
  const {calls,deps}=setup();
  deps.run=async()=> bad===null
   ?Promise.reject(new Error('leaked PHONE or API SECRET'))
   :outcome(bad);
  const res=await ejecutarSolicitudSombraV2B3(req(),baseEnv(),deps);
  assert.equal(res.status,503);
  const body=await res.text();
  assert.ok(!body.includes('PHONE'));
  assert.ok(!body.includes(secret));
  assert.ok(!body.includes(api));
  assert.equal(calls.db,1);
 }
});
test('B3: no positive response if worker sends or publishes anything',async()=>{
 for(const malicious of [
  {...outcome(),outboundMessages:1},
  {...outcome(),publishedOffers:1}
 ]){
  const {deps}=setup();
  deps.run=async()=>malicious;
  await check(await ejecutarSolicitudSombraV2B3(req(),
   baseEnv(),deps),503,'shadow_contract_violation');
 }
});
test('B3: no errors or candidate contents in success output',async()=>{
 const {deps}=setup();
 const res=await ejecutarSolicitudSombraV2B3(req(),baseEnv(),deps);
 const body=await res.text();
 assert.equal(body,'{"state":"candidate_private"}');
 assert.ok(!body.includes('source_hmac'));
 assert.ok(!body.includes('price'));
 assert.ok(!body.includes('supplier'));
});
test('B3: wrong secret fails even with proper service key',async()=>{
 const env={...baseEnv(),COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:''};
 const {calls,deps}=setup();
 await check(await ejecutarSolicitudSombraV2B3(
  req(),env,deps),401,'unauthorized');
 assert.equal(calls.db,0);
});
test('B3: SQL default-off outcome cannot be turned into source by Edge',async()=>{
 const {deps}=setup('disabled');
 await check(await ejecutarSolicitudSombraV2B3(
  req(),baseEnv(),deps),503,'shadow_disabled');
});

test('B5d: empty B2 queue cascades to one private B5d candidate',async()=>{
 const {deps}=setup('empty');
 let next=0;
 deps.runB5dWhenEmpty=true;
 deps.runB5d=async()=>{next++;return {
  state:'candidate_private',reason:'b5d_rows_match_not_complete',
  processed:1,outboundMessages:0,publishedOffers:0,sourceVerified:false
 }};
 await check(await ejecutarSolicitudSombraV2B3(req(),baseEnv(),deps),
  200,'candidate_private');
 assert.equal(next,1);
});
test('B5d: active B2 is prioritized, so no double processing on one tick',async()=>{
 const {deps}=setup();
 deps.runB5dWhenEmpty=true;
 deps.runB5d=async()=>{throw Error('must not call B5d')};
 await check(await ejecutarSolicitudSombraV2B3(req(),baseEnv(),deps),
  200,'candidate_private');
});
test('B5d: secondary queue cannot claim publication or source verification',async()=>{
 const {deps}=setup('empty');
 deps.runB5dWhenEmpty=true;
 deps.runB5d=async()=>({
  state:'candidate_private',publishedOffers:1,outboundMessages:0,
  sourceVerified:false
 });
 await check(await ejecutarSolicitudSombraV2B3(req(),baseEnv(),deps),
  503,'shadow_contract_violation');
});

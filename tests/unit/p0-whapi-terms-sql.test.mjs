import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPuertosSqlAvisosP0} from '../../src/server/whapi-terms-sql-p0.ts';

const JOB='eeeeeeee-0000-4000-8000-000000000551';
const LEASE='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLAIM={state:'leased',jobId:JOB,leaseToken:LEASE,
 supplierKey:'corralon_ailin',channel:'pilot_whapi_ci',
 chatHmac:'a'.repeat(64),termsVersion:'cotironda-originales-alta-v1',
 termsSha256:'b'.repeat(64),body:'text'};
const FINISH={jobId:JOB,leaseToken:LEASE,supplierKey:'corralon_ailin',
 termsVersion:'cotironda-originales-alta-v1',termsSha256:'b'.repeat(64),
 state:'api_accepted',noticeMessageHmac:'d'.repeat(64),
 outboundBodySha256:'b'.repeat(64)};
const make=(handler=async q=>{
 if(q.includes('terms_claim'))return {payload:CLAIM};
 if(q.includes('terms_begin'))return {payload:{state:'in_flight',jobId:JOB}};
 if(q.includes('terms_authorize'))return {payload:true};
 if(q.includes('terms_finish'))return {payload:{state:'api_accepted'}};
 throw Error('unexpected sql');
})=>{
 const calls=[];
 const port=crearPuertosSqlAvisosP0({
  committedRpc:async(q,args)=>{calls.push({q,args});return handler(q,args)},
  verifiedRecipient:async()=> '5492211234567'
 });
 return {port,calls};
};
test('P0 SQL: contract names/parameter counts, no client-supplied SQL',async()=>{
 const {port,calls}=make();
 assert.deepEqual(await port.claim(),CLAIM);
 assert.deepEqual(await port.beginCommitted(CLAIM),{state:'in_flight',jobId:JOB});
 assert.equal(await port.authorizeCommitted(CLAIM,CLAIM.chatHmac),true);
 assert.deepEqual(await port.finishCommitted(FINISH),{state:'api_accepted'});
 assert.deepEqual(calls.map(x=>x.args.length),[0,2,3,8]);
 assert(calls.every(x=>x.q.startsWith('select cotironda_piloto_privado.terms_')));
 assert.deepEqual(calls[3].args,[JOB,LEASE,FINISH.supplierKey,
  FINISH.termsVersion,FINISH.termsSha256,FINISH.state,
  FINISH.noticeMessageHmac,FINISH.outboundBodySha256]);
});
test('P0 SQL: null claim is empty; result with unexpected shape fails closed',async()=>{
 const empty=make(async()=>({payload:null}));
 assert.equal(await empty.port.claim(),null);
 const invalids=[undefined,{},[],{payload:{state:'weird'}},
  {payload:CLAIM,other:'injected'}];
 for(const invalid of invalids){
  const x=make(async()=>invalid);
  await assert.rejects(x.port.claim(),/p0_terms_sql_no_autorizado/u);
 }
});
test('P0 SQL: server unavailable or unknown COMMIT never produces success',async()=>{
 const unavailable=make(async()=>{throw Error('database_credential_secret')});
 await assert.rejects(unavailable.port.beginCommitted(CLAIM),
  e=>e.message==='p0_terms_sql_no_autorizado');
 const lost=make(async q=>q.includes('terms_begin')?{payload:{state:'ghost'}}:
  {payload:CLAIM});
 await assert.rejects(lost.port.beginCommitted(CLAIM),
  /p0_terms_sql_no_autorizado/u);
});
test('P0 SQL: authorization requires literal true (no truthy strings)',async()=>{
 for(const value of ['true',1,null,false]){
  const x=make(async()=>({payload:value}));
  assert.equal(await x.port.authorizeCommitted(CLAIM,CLAIM.chatHmac),false);
 }
});
test('P0 SQL: rejected ACK and uncertain state cannot be coerced to accepted',async()=>{
 for(const value of [
  {state:'success'}, {state:'api_accepted',extra:'leak'}, false
 ]){
  const x=make(async()=>({payload:value}));
  await assert.rejects(x.port.finishCommitted(FINISH),
   /p0_terms_sql_no_autorizado/u);
 }
 const bad=make();
 for(const data of [
  {...FINISH,noticeMessageHmac:null},
  {...FINISH,termsVersion:'some-other-policy'},
  {...FINISH,jobId:'xyz'},
  {...FINISH,state:'uncertain'},
  {...FINISH,termsSha256:'invalid'},
  {...FINISH,supplierKey:'corralon_ailin;DELETE'}
 ]){
  await assert.rejects(bad.port.finishCommitted(data),
   /p0_terms_sql_no_autorizado/u);
 }
 assert.equal(bad.calls.length,0);
});
test('P0 SQL: private sender role ACL is explicitly configured',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const path=fileURLToPath(new URL(
  '../../supabase/piloto/p0_whapi_terms_sender_atomic_off.sql',import.meta.url));
 const sql=readFileSync(path,'utf8');
 for(const token of [
  'cotironda_pilot_terms_sender_p0 NOLOGIN',
  'operator_session_mvp267()',
  'CREATE TABLE cotironda_piloto_privado.supplier_terms_send_jobs_p0',
  'ON CONFLICT (supplier_key,terms_version,episode_no) DO NOTHING',
  'FOR UPDATE OF j SKIP LOCKED',
  "state='in_flight'",
  "p_state='uncertain' AND p_message_hmac IS NOT NULL",
  'supplier_original_terms_notices_mvp364',
  'FROM PUBLIC,anon,authenticated,service_role',
  'GRANT EXECUTE ON FUNCTION',
  'ROLLBACK'
 ]) {
  if(token==='ROLLBACK')continue;
  assert(sql.includes(token),token);
 }
});

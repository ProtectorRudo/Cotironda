import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarSolicitudSombraV2B3} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/handler.ts';
const root='https://ilggkalaafhtiysyzlmg.supabase.co';
const legacy=['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)].join('.');
const secret='s'.repeat(64);
const env={
 COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED:'true',
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:secret,
 COTIRONDA_PILOT_OPENAI_API_KEY:'sk-'+'x'.repeat(32),
 COTIRONDA_PILOT_AI_CENTRAL_MODEL:'gpt-6.1-sol',
 SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:legacy,
 SUPABASE_SECRET_KEYS:'{}'
};
const req=(key=secret)=>new Request(root+'/functions/v1/cotironda-piloto-v2-shadow',{
 method:'POST',headers:{
  authorization:'Bearer '+legacy,'x-cotironda-recovery-secret':key
 }
});
const outcome=(state)=>({
 state,reason:'private',processed:1,outboundMessages:0,publishedOffers:0
});
const recheck=(state)=>({
 ...outcome(state),sourceVerified:false,canRank:false,canRevealContacts:false
});
async function scenario({
 primary='empty',b5g='private_source_observed',
 b5d='candidate_private',auth=true
}={}){
 const calls=[];
 const db={rpc:async()=>({data:{state:'empty'},error:null}),
  storage:{from:()=>({download:async()=>{throw Error('unused')}})}};
 const deps={
  runB5dWhenEmpty:true,runB5gBeforeB5d:true,
  createDb:()=>{calls.push('db');return db},
  run:async()=>{calls.push('b2');return outcome(primary)},
  runB5g:async args=>{
   calls.push('b5g');
   assert.equal(args.trustedInternalWorker,true);
   assert.equal(args.readPdfEvidence,undefined);
   return recheck(b5g);
  },
  runB5d:async()=>{calls.push('b5d');return {
   ...outcome(b5d),sourceVerified:false
  }}
 };
 const res=await ejecutarSolicitudSombraV2B3(
  req(auth?secret:'wrong-secret'),env,deps);
 return {status:res.status,body:await res.json(),calls};
}
test('B5g: existing authenticated handler prioritizes historical PDF once',async()=>{
 const r=await scenario();
 assert.deepEqual(r,{status:200,body:{state:'private_source_observed'},
  calls:['db','b2','b5g']});
});
test('B5g: B2 source takes priority; never process 2 candidates in one tick',async()=>{
 const r=await scenario({primary:'candidate_private'});
 assert.deepEqual(r.calls,['db','b2']);
 assert.equal(r.body.state,'candidate_private');
});
test('B5g: when historical recheck empty, B5d linked files still run',async()=>{
 const r=await scenario({b5g:'empty'});
 assert.deepEqual(r.calls,['db','b2','b5g','b5d']);
 assert.equal(r.body.state,'candidate_private');
});
test('B5g: no authorization means no DB or processing',async()=>{
 const r=await scenario({auth:false});
 assert.equal(r.status,401);assert.deepEqual(r.calls,[]);
});
test('B5g: uncertainty fails closed, no fallthrough into linked processing',async()=>{
 const r=await scenario({b5g:'reconciliation_required'});
 assert.equal(r.status,503);
 assert.deepEqual(r.calls,['db','b2','b5g']);
});
test('B5g: unexpected publication flag from worker blocks response',async()=>{
 const db={rpc:async()=>({data:{state:'empty'},error:null}),
  storage:{from:()=>({download:async()=>null})}};
 const r=await ejecutarSolicitudSombraV2B3(req(),env,{
  runB5dWhenEmpty:true,runB5gBeforeB5d:true,
  createDb:()=>db,
  run:async()=>outcome('empty'),
  runB5g:async()=>({...recheck('private_source_observed'),canRank:true}),
  runB5d:async()=>{throw Error('not reached')}
 });
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{state:'shadow_contract_violation'});
});

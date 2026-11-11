import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarSolicitudSombraV2B3} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/handler.ts';
const root='https://ilggkalaafhtiysyzlmg.supabase.co';
const role=['a'.repeat(24),'b'.repeat(24),'c'.repeat(24)].join('.');
const secret='s'.repeat(64);
const env={
 COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED:'true',
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:secret,
 COTIRONDA_PILOT_OPENAI_API_KEY:'sk-'+'x'.repeat(32),
 COTIRONDA_PILOT_AI_CENTRAL_MODEL:'gpt-6.1-sol',
 SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:role,SUPABASE_SECRET_KEYS:'{}'
};
const req=(value=secret)=>new Request(root+'/functions/v1/cotironda-piloto-v2-shadow',{
 method:'POST',headers:{authorization:'Bearer '+role,
  'x-cotironda-recovery-secret':value}
});
const answer=(state)=>({state,reason:'private',processed:1,
 outboundMessages:0,publishedOffers:0,sourceVerified:false,
 canRank:false,canRevealContacts:false});
async function check({b5i=true,b5h=false,missingMode=false,
 b5iState='private_diagnosed',wrongSecret=false,altered=false,
 noOpenAI=false}={}){
 const calls=[];
 const deps={
  runB5iWhenSelected:true,runB5hWhenSelected:true,
  runB5gBeforeB5d:true,runB5dWhenEmpty:true,
  createDb:()=>{calls.push('db');return {
   rpc:async name=>{
    calls.push(name);
    if(name==='cotironda_piloto_v2_b5i_only_enabled')
     return missingMode?{data:null,error:{message:'unavailable'}}:
      {data:b5i,error:null};
    if(name==='cotironda_piloto_v2_b5h_only_enabled')
     return {data:b5h,error:null};
    return {data:{state:'empty'},error:null};
   },
   storage:{from:()=>({download:async()=>{throw Error('no files')}})}
  }},
  run:async()=>{calls.push('b2');return answer('empty')},
  runB5i:async()=>{calls.push('b5i');
   return {...answer(b5iState),...(altered?{canRank:true}:{})};},
  runB5h:async()=>{calls.push('b5h');return answer('private_diagnosed')},
  runB5g:async()=>{calls.push('b5g');return answer('empty')},
  runB5d:async()=>{calls.push('b5d');return answer('candidate_private')}
 };
 const current=noOpenAI?{...env,COTIRONDA_PILOT_OPENAI_API_KEY:''}:env;
 const r=await ejecutarSolicitudSombraV2B3(
  req(wrongSecret?'invalid':secret),current,deps);
 return {calls,status:r.status,body:await r.json()};
}
test('B5i: exclusive diagnosis goes ahead of B5h and ALL other queues',async()=>{
 const x=await check();
 assert.equal(x.status,200);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled','b5i']);
 assert.deepEqual(x.body,{state:'private_diagnosed'});
});
test('B5i: empty maintenance queue stops, never starts AI or B5d',async()=>{
 const x=await check({b5iState:'empty'});
 assert.deepEqual(x.body,{state:'queue_empty'});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled','b5i']);
});
test('B5i: when OFF the B5h-only mode still works unchanged',async()=>{
 const x=await check({b5i:false,b5h:true});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled',
  'cotironda_piloto_v2_b5h_only_enabled','b5h']);
});
test('B5i: when both private modes OFF the legacy path remains',async()=>{
 const x=await check({b5i:false,b5h:false});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled',
  'cotironda_piloto_v2_b5h_only_enabled','b2','b5g','b5d']);
 assert.equal(x.body.state,'candidate_private');
});
test('B5i: SQL mode uncertainty fails closed with no worker',async()=>{
 const x=await check({missingMode:true});
 assert.equal(x.status,503);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled']);
});
test('B5i: rejects invalid internal header before connecting DB',async()=>{
 const x=await check({wrongSecret:true});
 assert.equal(x.status,401);assert.deepEqual(x.calls,[]);
});
test('B5i: geometry-only mode must work without OpenAI API key',async()=>{
 const x=await check({noOpenAI:true});
 assert.equal(x.status,200);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5i_only_enabled','b5i']);
});
test('B5i: legacy flow still requires OpenAI API key',async()=>{
 const x=await check({b5i:false,b5h:false,noOpenAI:true});
 assert.equal(x.status,503);
 assert.ok(!x.calls.includes('b2'));
});
test('B5i: forged canRank flag blocks positive response',async()=>{
 const x=await check({altered:true});
 assert.equal(x.status,503);
 assert.deepEqual(x.body,{state:'shadow_contract_violation'});
 assert.ok(!x.calls.includes('b5d'));
});

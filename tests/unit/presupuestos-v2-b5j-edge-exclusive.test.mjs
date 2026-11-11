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
async function check({b5j=true,b5i=false,b5h=false,missingMode=false,
 state='private_diagnosed',wrongSecret=false,altered=false,
 noOpenAI=false}={}){
 const calls=[];
 const deps={
  runB5jWhenSelected:true,runB5iWhenSelected:true,
  runB5hWhenSelected:true,runB5gBeforeB5d:true,runB5dWhenEmpty:true,
  createDb:()=>{calls.push('db');return {
   rpc:async name=>{
    calls.push(name);
    if(name==='cotironda_piloto_v2_b5j_only_enabled')
     return missingMode?{data:null,error:{message:'unavailable'}}:
      {data:b5j,error:null};
    if(name==='cotironda_piloto_v2_b5i_only_enabled')
     return {data:b5i,error:null};
    if(name==='cotironda_piloto_v2_b5h_only_enabled')
     return {data:b5h,error:null};
    return {data:{state:'empty'},error:null};
   },
   storage:{from:()=>({download:async()=>{throw Error('no file')}})}
  }},
  run:async()=>{calls.push('b2');return answer('empty')},
  runB5j:async()=>{calls.push('b5j');
   return {...answer(state),...(altered?{canRank:true}:{})};},
  runB5i:async()=>{calls.push('b5i');return answer('private_diagnosed')},
  runB5h:async()=>{calls.push('b5h');return answer('private_diagnosed')},
  runB5g:async()=>{calls.push('b5g');return answer('empty')},
  runB5d:async()=>{calls.push('b5d');return answer('candidate_private')}
 };
 const now=noOpenAI?{...env,COTIRONDA_PILOT_OPENAI_API_KEY:''}:env;
 const r=await ejecutarSolicitudSombraV2B3(
  req(wrongSecret?'incorrect':secret),now,deps);
 return {calls,status:r.status,body:await r.json()};
}
test('B5j: exclusive mode runs only economics, never B5i/B5d/AI',async()=>{
 const x=await check();
 assert.equal(x.status,200);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled','b5j']);
 assert.deepEqual(x.body,{state:'private_diagnosed'});
});
test('B5j: exhausted economic queue cannot fall through',async()=>{
 const x=await check({state:'empty'});
 assert.deepEqual(x.body,{state:'queue_empty'});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled','b5j']);
});
test('B5j: B5i remains selectable if B5j switch OFF',async()=>{
 const x=await check({b5j:false,b5i:true});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled',
  'cotironda_piloto_v2_b5i_only_enabled','b5i']);
});
test('B5j: B5h fallback remains if other modes OFF',async()=>{
 const x=await check({b5j:false,b5i:false,b5h:true});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled',
  'cotironda_piloto_v2_b5i_only_enabled',
  'cotironda_piloto_v2_b5h_only_enabled','b5h']);
});
test('B5j: when all maintenance switches OFF the normal route works',async()=>{
 const x=await check({b5j:false,b5i:false,b5h:false});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled',
  'cotironda_piloto_v2_b5i_only_enabled',
  'cotironda_piloto_v2_b5h_only_enabled','b2','b5g','b5d']);
 assert.equal(x.body.state,'candidate_private');
});
test('B5j: uncertain SQL mode cannot trigger paid IA',async()=>{
 const x=await check({missingMode:true});
 assert.equal(x.status,503);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled']);
});
test('B5j: missing internal two-factor blocks even DB connections',async()=>{
 const x=await check({wrongSecret:true});
 assert.equal(x.status,401);assert.deepEqual(x.calls,[]);
});
test('B5j: no OpenAI key is required by the no-LLM mode',async()=>{
 const x=await check({noOpenAI:true});
 assert.equal(x.status,200);
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled','b5j']);
});
test('B5j: old flow still requires the previous model API key',async()=>{
 const x=await check({b5j:false,b5i:false,b5h:false,noOpenAI:true});
 assert.equal(x.status,503);
 assert.ok(!x.calls.includes('b2'));
});
test('B5j: forged ranking permission fails closed',async()=>{
 const x=await check({altered:true});
 assert.equal(x.status,503);
 assert.deepEqual(x.body,{state:'shadow_contract_violation'});
 assert.ok(!x.calls.includes('b5d'));
});
test('B5j: review is never a reason to contact buyer or suppliers',async()=>{
 const x=await check({state:'review_required'});
 assert.deepEqual(x.body,{state:'review_required'});
 assert.deepEqual(x.calls,['db','cotironda_piloto_v2_b5j_only_enabled','b5j']);
});

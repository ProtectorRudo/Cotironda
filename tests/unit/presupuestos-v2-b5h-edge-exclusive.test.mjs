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
 SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:legacy,SUPABASE_SECRET_KEYS:'{}'
};
const req=(key=secret)=>new Request(root+'/functions/v1/cotironda-piloto-v2-shadow',{
 method:'POST',headers:{
  authorization:'Bearer '+legacy,'x-cotironda-recovery-secret':key
 }
});
const privateResult=(state)=>({
 state,reason:'private',processed:1,publishedOffers:0,outboundMessages:0,
 sourceVerified:false,canRank:false,canRevealContacts:false
});
async function exercise({mode=true,validMode=true,key=secret,
  b5hState='private_diagnosed',tamper=false}={}){
 const calls=[];
 const deps={
  runB5hWhenSelected:true,runB5dWhenEmpty:true,runB5gBeforeB5d:true,
  createDb:()=>{calls.push('db');return {
   rpc:async(name)=>{
    calls.push(name);
    if(name==='cotironda_piloto_v2_b5h_only_enabled')
     return validMode?{data:mode,error:null}:{data:null,error:{message:'offline'}};
    return {data:{state:'empty'},error:null};
   },
   storage:{from:()=>({download:async()=>{throw Error('no archive')}})}
  }},
  run:async()=>{calls.push('b2');return {
    state:'empty',publishedOffers:0,outboundMessages:0
  }},
  runB5g:async()=>{calls.push('b5g');return privateResult('empty')},
  runB5d:async()=>{calls.push('b5d');return {
    state:'candidate_private',sourceVerified:false,
    publishedOffers:0,outboundMessages:0
  }},
  runB5h:async()=>{
   calls.push('b5h');
   return {...privateResult(b5hState),...(tamper?{canRank:true}:{})};
  }
 };
 const response=await ejecutarSolicitudSombraV2B3(req(key),env,deps);
 return {status:response.status,body:await response.json(),calls};
}
test('B5h: exclusive mode never touches B2, B5d or B5g',async()=>{
 const r=await exercise();
 assert.deepEqual(r.calls,['db','cotironda_piloto_v2_b5h_only_enabled','b5h']);
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{state:'private_diagnosed'});
});
test('B5h: exhausted diagnostic queue does not fall through to paid LLM',async()=>{
 const r=await exercise({b5hState:'empty'});
 assert.deepEqual(r.calls,['db','cotironda_piloto_v2_b5h_only_enabled','b5h']);
 assert.deepEqual(r.body,{state:'queue_empty'});
});
test('B5h: legacy behavior is unchanged with exclusive flag OFF',async()=>{
 const r=await exercise({mode:false});
 assert.deepEqual(r.calls,[
  'db','cotironda_piloto_v2_b5h_only_enabled','b2','b5g','b5d'
 ]);
 assert.equal(r.body.state,'candidate_private');
});
test('B5h: SQL mode failure cannot fall through into normal recovery',async()=>{
 const r=await exercise({validMode:false});
 assert.equal(r.status,503);
 assert.deepEqual(r.calls,['db','cotironda_piloto_v2_b5h_only_enabled']);
});
test('B5h: invalid internal authorization never opens a DB connection',async()=>{
 const r=await exercise({key:'wrong'});
 assert.equal(r.status,401);assert.deepEqual(r.calls,[]);
});
test('B5h: incorrect publish/rank capability from worker fails closed',async()=>{
 const r=await exercise({tamper:true});
 assert.equal(r.status,503);
 assert.deepEqual(r.body,{state:'shadow_contract_violation'});
 assert.ok(!r.calls.includes('b5d'));
});
test('B5h: review state is private and does not invoke a fallback',async()=>{
 const r=await exercise({b5hState:'review_required'});
 assert.equal(r.body.state,'review_required');
 assert.ok(!r.calls.includes('b2'));
});

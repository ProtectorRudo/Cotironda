import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instrumentoOpenAiMvp264} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-usage-mvp264.ts';
const API='https://api.openai.com/v1/responses';
const req={method:'POST',body:JSON.stringify({
 model:'gpt-6-luna',store:false,tools:[],max_output_tokens:100
})};
const hash='a'.repeat(64),chat='b'.repeat(64);
function metered(config={}){
 const calls=[];
 const rpc=async(name,params)=>{
  calls.push({name,params});
  if(name==='cotironda_piloto_ai_usage_reserve_mvp264')
   return {data:{state:config.reserve??'reserved'},error:null};
  if(name==='cotironda_piloto_ai_usage_finish_mvp264')
   return config.sqlError?{data:null,error:'db_unavailable'}:
    {data:{state:'recorded'},error:null};
  throw Error('unexpected_rpc:'+name);
 };
 const raw=config.raw??{id:'resp_'+'x'.repeat(24),status:'completed',
  usage:{input_tokens:100,output_tokens:25,total_tokens:125}};
 const response=config.httpError?
  new Response('denied',{status:429}):
  new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
 const guarded=instrumentoOpenAiMvp264({
  messageHmac:hash,chatHmac:chat,role:config.role??'buyer',model:'gpt-6-luna',
  rpc,fetchImpl:config.networkError?async()=>{throw Error('timeout')}:
    async()=>response
 });
 return {calls,guarded};
}
test('MVP264: original response remains intact, usage accurate and id hashed',async()=>{
 const x=metered();
 const res=await x.guarded(API,req);
 assert.equal(res.ok,true);
 assert.equal((await res.json()).usage.total_tokens,125);
 assert.deepEqual(x.calls.map(c=>c.name),[
  'cotironda_piloto_ai_usage_reserve_mvp264',
  'cotironda_piloto_ai_usage_finish_mvp264']);
 assert.equal(x.calls[0].params.p_model,'gpt-6-luna');
 assert.equal(x.calls[0].params.p_call_no,1);
 const receipt=x.calls[1].params;
 assert.equal(receipt.p_state,'observed');
 assert.equal(receipt.p_input_tokens,100);
 assert.equal(receipt.p_output_tokens,25);
 assert.equal(receipt.p_total_tokens,125);
 assert.match(receipt.p_response_id_sha256,/^[a-f0-9]{64}$/u);
 assert.ok(!JSON.stringify(x.calls).includes('resp_'+'x'.repeat(24)));
});
test('MVP264: timeout is unknown consumption; never a zero-cost retry',async()=>{
 const x=metered({networkError:true});
 await assert.rejects(x.guarded(API,req),/network_uncertain/u);
 assert.equal(x.calls.length,2);
 assert.equal(x.calls[1].params.p_state,'unmetered');
 assert.equal(x.calls[1].params.p_reason_code,'network_uncertain');
 assert.equal(x.calls[1].params.p_total_tokens,null);
});
test('MVP264: missing or forged usage stops processing, not treated as free',async()=>{
 for(const raw of [
  {id:'resp_'+'b'.repeat(24)},
  {id:'resp_'+'b'.repeat(24),usage:{
   input_tokens:100,output_tokens:20,total_tokens:500}},
  {id:'resp_'+'b'.repeat(24),usage:{
   input_tokens:3.2,output_tokens:20,total_tokens:23.2}},
  {id:'resp_'+'b'.repeat(24),usage:{
   input_tokens:-1,output_tokens:10,total_tokens:9}},
  {id:'other_non_response',usage:{
   input_tokens:100,output_tokens:20,total_tokens:120}}
 ]){
  const x=metered({raw});
  await assert.rejects(x.guarded(API,req),/usage_not_observed/u);
  assert.equal(x.calls[1].params.p_state,'unmetered');
  assert.equal(x.calls[1].params.p_total_tokens,null);
 }
});
test('MVP264: HTTP 429 stays a failure; record absence of usage, no fake rate',async()=>{
 const x=metered({httpError:true});
 const res=await x.guarded(API,req);
 assert.equal(res.status,429);
 assert.equal(x.calls[1].params.p_state,'unmetered');
 assert.equal(x.calls[1].params.p_reason_code,'http_failure');
});
test('MVP264: database or quota denial prevents an OpenAI request',async()=>{
 for(const cfg of [
  {reserve:'budget_exceeded'},{reserve:'usage_unknown_blocked'},
  {reserve:'not_authorized'}
 ]){
  let fetched=0;
  const calls=[];
  const guarded=instrumentoOpenAiMvp264({
   messageHmac:hash,chatHmac:chat,role:'supplier',model:'gpt-6-luna',
   rpc:async(name,p)=>{calls.push(name);return {data:{state:cfg.reserve},error:null}},
   fetchImpl:async()=>{fetched++;return new Response('{}',{status:200})}
  });
  await assert.rejects(guarded(API,req),/budget_denied/u);
  assert.equal(fetched,0);
  assert.deepEqual(calls,['cotironda_piloto_ai_usage_reserve_mvp264']);
 }
});
test('MVP264: no fallback if receipt cannot be saved',async()=>{
 const x=metered({sqlError:true});
 await assert.rejects(x.guarded(API,req),/ledger_unavailable/u);
 assert.equal(x.calls.length,2);
});
test('MVP264: unknown URL/model and non-POST have zero calls',async()=>{
 const x=metered();
 for(const [url,input] of [
  ['https://other.example/v1/responses',req],
  [API,{method:'GET',body:req.body}],
  [API,{method:'POST',body:JSON.stringify({model:'unauthorized',store:false,tools:[]})}],
  [API,{method:'POST',body:JSON.stringify({model:'gpt-6-luna',store:true,tools:[]})}]
 ]){
  await assert.rejects(x.guarded(url,input),/mvp264_/u);
 }
 assert.equal(x.calls.length,0);
});
test('MVP264: Edge opt-in flag OFF by default in buyer and 2 supplier paths',()=>{
 const s=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const hits=s.match(/usageTraceEnabled:Deno.env.get\('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED'\)==='true'/gu)??[];
 assert.equal(hits.length,4);
 assert.match(s,/supplier_text_auto_correlation_reconciliation_required/u);
 const buyer=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-mvp226.ts',import.meta.url),'utf8');
 const supplier=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts',import.meta.url),'utf8');
 assert.match(buyer,/role:'buyer',model:args.model,rpc:args.rpc/u);
 assert.match(supplier,/role:'supplier',model:args.model,rpc:args.rpc/u);
 assert.match(buyer,/usageTraceEnabled===true/u);
 assert.match(supplier,/usageTraceEnabled===true/u);
});
test('MVP264: SQL never claims verified monetary pricing and keeps hard cap',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp264_openai_usage_meters.sql',import.meta.url),'utf8');
 for(const token of [
  'usage_unknown_blocked','budget_exceeded','n_>=24 OR used_>=200000',
  'FOR UPDATE OF p','state IN(\'reserved\',\'unmetered\')',
  "'monetary_cost',NULL","'pricing_verified',false",
  "'provider_invoice_reconciled',false","'unknown_usage_is_zero',false",
  'ENABLE ROW LEVEL SECURITY','REVOKE ALL ON'
 ])assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/net\.http_post|cron\.schedule|contact_reveal|UPDATE cotironda_piloto_privado\.ai_supplier_review_mvp227/u);
});

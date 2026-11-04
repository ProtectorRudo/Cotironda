import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runRecoveryService} from '../../supabase/functions/cotironda-piloto-document-recovery/logic.ts';
const h='a'.repeat(64);
const flags={enabled:true,modelKeyAvailable:true,projectMatches:true};
const io=(value={state:'candidate',trigger_chat_hmac:h},result='recovered_private')=>{
 const count={lookup:0,recover:0};
 return {count,ops:{
  lookup:async()=>{count.lookup++;return {data:value,error:null}},
  recover:async(got)=>{count.recover++;assert.equal(got,h);return result}
 }};
};
const state=async(r)=>{const v=await r.json();return v.state};
test('MVP131: flags OFF never trigger SQL or OpenAI',async()=>{
 const i=io();const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),
 {...flags,enabled:false},i.ops);
 assert.equal(r.status,503);assert.equal(await state(r),'worker_off');
 assert.equal(i.count.lookup,0);assert.equal(i.count.recover,0);
});
test('MVP131: GET is inert',async()=>{
 const i=io();const r=await runRecoveryService(new Request('https://test/'),flags,i.ops);
 assert.equal(r.status,405);assert.equal(i.count.lookup,0);
});
test('MVP131: bad environment blocks before database',async()=>{
 for(const f of [{...flags,modelKeyAvailable:false},{...flags,projectMatches:false}]){
  const i=io();const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),f,i.ops);
  assert.equal(r.status,503);assert.equal(i.count.lookup,0);
 }
});
test('MVP131: service candidate triggers exactly one private recovery',async()=>{
 const i=io();const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),flags,i.ops);
 assert.equal(r.status,200);
 const serialized=await r.clone().text();
 assert.equal(await state(r),'recovered_private');
 assert.equal(i.count.lookup,1);assert.equal(i.count.recover,1);
 assert.equal(serialized.includes(h),false);
});
test('MVP131: empty, disabled and quota never call AI worker',async()=>{
 for(const v of ['none','quota','disabled']){
  const i=io({state:v});
  const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),flags,i.ops);
  assert.equal(r.status,200);assert.equal(i.count.recover,0);
 }
});
test('MVP131: forged candidate and error never enter worker',async()=>{
 for(const x of [{state:'candidate',trigger_chat_hmac:'not-a-hash'}, {state:'candidate'}, {state:'unknown'}]){
  const i=io(x);const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),flags,i.ops);
  assert.equal(r.status,503);assert.equal(i.count.recover,0);
 }
 const i=io();i.ops.lookup=async()=>({data:null,error:new Error('internal')});
 const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),flags,i.ops);
 assert.equal(r.status,503);assert.equal(i.count.recover,0);
});
test('MVP131: errors never return file content or internal exception',async()=>{
 const i=io();i.ops.recover=async()=>{throw new Error('private_pdf_content_secret')};
 const r=await runRecoveryService(new Request('https://test/',{method:'POST'}),flags,i.ops);
 assert.equal(r.status,503);
 assert.equal((await r.text()).includes('private_pdf_content_secret'),false);
});
test('MVP131: entrypoint authenticated and SQL restricted',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-document-recovery/index.ts',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../../supabase/piloto/mvp131_system_document_trigger.sql',import.meta.url),'utf8');
 const config=readFileSync(new URL('../../supabase/config.toml',import.meta.url),'utf8');
 assert.match(edge,/guardScheduledRecovery/u);
 assert.match(edge,/cotironda_piloto_recovery_token_allowed_mvp132/u);
 assert.doesNotMatch(edge,/messages\/text|messages\/document|gate\.whapi\.cloud/u);
 assert.match(sql,/security definer set search_path=''/u);
 assert.match(sql,/revoke all on function public\.cotironda_piloto_system_document_trigger_mvp131\(\)[\s\S]*?from public,anon,authenticated/u);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_system_document_trigger_mvp131\(\)[\s\S]*?to service_role/u);
 assert.match(sql,/r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/p\.consent_at is not null and p\.opted_out_at is null/u);
 assert.match(config,/\[functions\.cotironda-piloto-document-recovery\][\s\S]*?verify_jwt = false/u);
});

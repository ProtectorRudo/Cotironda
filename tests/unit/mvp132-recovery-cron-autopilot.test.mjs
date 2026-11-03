import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardScheduledRecovery} from '../../supabase/functions/cotironda-piloto-document-recovery/scheduled-auth.ts';
const token='a'.repeat(96);
const endpoint='https://test.local/internal';
const req=(method='POST',secret=token)=>new Request(endpoint,{
 method,headers:{'x-cotironda-recovery-token':secret}
});
const io=()=>{
 const stats={auth:0,run:0};
 return {stats,params:{
  enabled:true,authorize:async(v)=>{stats.auth++;return v===token},
  run:async()=>{stats.run++;return new Response('{"state":"none"}',{status:200})}
 }};
};
test('MVP132: unsigned or invalid token cannot access DB or AI',async()=>{
 for(const invalid of ['', 'bad', 'sb_publishable_fake', 'f'.repeat(95)]){
  const x=io();const r=await guardScheduledRecovery(req('POST',invalid),x.params);
  assert.equal(r.status,401);assert.equal(x.stats.auth,0);assert.equal(x.stats.run,0);
 }
});
test('MVP132: unknown fixed-size token cannot invoke worker',async()=>{
 const x=io();const r=await guardScheduledRecovery(req('POST','c'.repeat(96)),x.params);
 assert.equal(r.status,401);assert.equal(x.stats.auth,1);assert.equal(x.stats.run,0);
});
test('MVP132: GET is inert even with a valid token',async()=>{
 const x=io();const r=await guardScheduledRecovery(req('GET'),x.params);
 assert.equal(r.status,405);assert.equal(x.stats.auth,0);assert.equal(x.stats.run,0);
});
test('MVP132: disabled AI blocks without SQL',async()=>{
 const x=io();x.params.enabled=false;
 const r=await guardScheduledRecovery(req(),x.params);
 assert.equal(r.status,503);assert.equal(x.stats.auth,0);assert.equal(x.stats.run,0);
});
test('MVP132: authorized POST invokes worker once',async()=>{
 const x=io();const r=await guardScheduledRecovery(req(),x.params);
 assert.equal(r.status,200);assert.equal(x.stats.auth,1);assert.equal(x.stats.run,1);
});
test('MVP132: database failures cannot leak secrets',async()=>{
 const x=io();x.params.authorize=async()=>{throw Error(token)};
 const r=await guardScheduledRecovery(req(),x.params);
 assert.equal(r.status,503);assert.equal(x.stats.run,0);
 assert.equal((await r.text()).includes(token),false);
});
test('MVP132: schedule, auth SQL and Edge contain no literal token',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-document-recovery/index.ts',import.meta.url),'utf8');
 const a=readFileSync(new URL('../../supabase/piloto/mvp132_recovery_secret_and_guard.sql',import.meta.url),'utf8');
 const b=readFileSync(new URL('../../supabase/piloto/mvp132_recovery_schedule.sql',import.meta.url),'utf8');
 assert.match(edge,/guardScheduledRecovery/u);
 assert.match(edge,/cotironda_piloto_recovery_token_allowed_mvp132/u);
 assert.match(a,/vault\.create_secret/u);
 assert.match(a,/extensions\.gen_random_bytes\(48\)/u);
 assert.match(a,/revoke all on function[\s\S]*?from public,anon,authenticated/u);
 assert.match(a,/grant execute on function[\s\S]*?to service_role/u);
 assert.match(b,/vault\.decrypted_secrets/u);
 assert.match(b,/'\*\/5 \* \* \* \*'/u);
 assert.match(b,/net\.http_post/u);
 assert.doesNotMatch(b,/sb_secret_|service_role_key|sk-[a-z0-9]{20}/iu);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleV2ShadowB4} from
 '../../supabase/functions/cotironda-piloto-auto-recovery/v2-shadow-bridge-b4.ts';

const root='https://ilggkalaafhtiysyzlmg.supabase.co';
const key='sb_secret_'+'x'.repeat(36);
const jwt=['e'.repeat(24),'y'.repeat(24),'z'.repeat(24)].join('.');
const secret='s'.repeat(64);
const make=(extra={})=>{
 const events=[],jobs=[];
 const args={
  enabled:true,pilotUrl:root,serviceRoleKey:key,recoverySecret:secret,
  checkSqlEnabled:async()=>false,
  post:async(url,init)=>{
   events.push({action:'post',url,init});
   return {ok:true,status:200};
  },
  schedule:job=>{events.push({action:'scheduled'});jobs.push(job)},
  report:state=>events.push({action:'reported',state}),
  ...extra
 };
 return {args,events,jobs};
};
test('B4: SQL flag OFF is a true zero-fetch/no-schedule switch',async()=>{
 const x=make();
 assert.equal(await scheduleV2ShadowB4(x.args),'off');
 assert.deepEqual(x.events,[]);
 assert.equal(x.jobs.length,0);
});
test('B4: SQL unavailable is fail-closed, no request made',async()=>{
 const x=make({checkSqlEnabled:async()=>{throw Error('db unknown')}});
 assert.equal(await scheduleV2ShadowB4(x.args),'private_not_ready');
 assert.deepEqual(x.events,[]);
});
test('B4: project mismatch or Edge disabled does not even consult SQL',async()=>{
 let checks=0;
 for(const p of [{enabled:false},{pilotUrl:'https://other.supabase.co'}]){
  const x=make({...p,checkSqlEnabled:async()=>{checks++;return true}});
  assert.equal(await scheduleV2ShadowB4(x.args),'off');
  assert.deepEqual(x.events,[]);
 }
 assert.equal(checks,0);
});
test('B4: modern sb_secret + dedicated secret; one POST without body',async()=>{
 const x=make({checkSqlEnabled:async()=>true});
 assert.equal(await scheduleV2ShadowB4(x.args),'scheduled');
 assert.equal(x.jobs.length,1);
 await Promise.all(x.jobs);
 assert.deepEqual(x.events.map(e=>e.action),
  ['post','scheduled','reported']);
 const req=x.events[0];
 assert.equal(req.url,root+'/functions/v1/cotironda-piloto-v2-shadow');
 assert.equal(req.init.method,'POST');
 assert.equal(req.init.headers.apikey,key);
 assert.equal(req.init.headers.authorization,undefined);
 assert.equal(req.init.headers['x-cotironda-recovery-secret'],secret);
 assert.equal(req.init.body,undefined);
 assert.equal(x.events[2].state,'accepted');
});
test('B4: legacy service JWT uses Authorization only',async()=>{
 const x=make({serviceRoleKey:jwt,checkSqlEnabled:async()=>true});
 assert.equal(await scheduleV2ShadowB4(x.args),'scheduled');
 await Promise.all(x.jobs);
 assert.equal(x.events[0].init.headers.authorization,'Bearer '+jwt);
 assert.equal(x.events[0].init.headers.apikey,undefined);
});
test('B4: missing independent secret or service key never calls B3',async()=>{
 for(const patch of [
  {recoverySecret:''},{recoverySecret:'short'},
  {serviceRoleKey:'sb_publishable_'+'p'.repeat(35)},
  {serviceRoleKey:''}
 ]){
  const x=make({...patch,checkSqlEnabled:async()=>true});
  assert.equal(await scheduleV2ShadowB4(x.args),'private_not_ready');
  assert.deepEqual(x.events,[]);
 }
});
test('B4: B3 errors are recorded generically and do not reject original task',async()=>{
 for(const returned of [
  async()=>({ok:false,status:401}),
  async()=>{throw Error('secret customer data must never be logged')}
 ]){
  const x=make({checkSqlEnabled:async()=>true,post:returned});
  assert.equal(await scheduleV2ShadowB4(x.args),'scheduled');
  await Promise.all(x.jobs);
  assert.equal(x.events.at(-1).action,'reported');
  assert.ok(['refused','unavailable'].includes(x.events.at(-1).state));
  assert.ok(!JSON.stringify(x.events).includes('customer data'));
 }
});
test('B4: scheduler error is isolated from old MVP292/295 response',async()=>{
 const x=make({checkSqlEnabled:async()=>true,
  schedule:()=>{throw Error('No background capacity')}});
 assert.equal(await scheduleV2ShadowB4(x.args),'scheduling_failed');
});
test('B4: deployed old worker source has one B4 bridge; no WhatsApp changes',()=>{
 const text=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-auto-recovery/index.ts',
 import.meta.url),'utf8');
 assert.equal((text.match(/scheduleV2ShadowB4\(\{/gu)||[]).length,1);
 assert.match(text,/EdgeRuntime\.waitUntil\(promise\)/u);
 assert.match(text,/cotironda_piloto_v2_shadow_enabled_b4/u);
 assert.match(text,/if\(outcome\.state==='reconciliation_required'\)/u);
 assert.match(text,/procesarTextoVinculadoMvp295/u);
 assert.match(text,/procesarPendienteAutomaticoMvp292/u);
 assert.ok(!text.includes("cotironda_piloto_whapi_outbound"));
});

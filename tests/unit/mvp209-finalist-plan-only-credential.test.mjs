import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verificarModoWorkerMvp209 as mode} from
 '../../supabase/functions/cotironda-piloto-finalistas/worker-mode-mvp209.ts';

const PLAN='p'.repeat(96),SEND='s'.repeat(96);
const cfg={planOnly:PLAN,dispatch:SEND};
const compare=async(a,b)=>a===b;
const headers=x=>new Headers(x);
const withPlan=x=>headers({'x-cotironda-finalist-plan-secret':x});
const withSend=x=>headers({'x-cotironda-finalist-worker-secret':x});
const worker=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-finalistas/index.ts',
 import.meta.url),'utf8');

test('MVP209: token cron solo autoriza modo plan_only, no despachos',async()=>{
 assert.equal(await mode(withPlan(PLAN),cfg,compare),'plan_only');
 assert.equal(await mode(withSend(SEND),cfg,compare),'dispatch');
 assert.equal(await mode(withPlan(SEND),cfg,compare),null);
 assert.equal(await mode(withSend(PLAN),cfg,compare),null);
 assert.equal(await mode(headers({}),cfg,compare),null);
 assert.equal(await mode(headers({
  'x-cotironda-finalist-plan-secret':PLAN,
  'x-cotironda-finalist-worker-secret':SEND
 }),cfg,compare),null);
});

test('MVP209: ambos modos fallan si falta un secreto, está mal formado o no coincide',async()=>{
 for(const provided of ['','demo','p'.repeat(47),'p'.repeat(257),
  'P'.repeat(96)]){
  assert.equal(await mode(withPlan(provided),cfg,compare),null,provided.length);
 }
 for(const [key,val] of [
  ['planOnly',''],['dispatch',''],['planOnly','p'.repeat(47)],
  ['dispatch','s'.repeat(257)]
 ]){
  assert.equal(await mode(key==='planOnly'?withPlan(PLAN):withSend(SEND),
   {...cfg,[key]:val},compare),null,key);
 }
 const err=async()=>{throw Error('secret leaked')};
 assert.equal(await mode(withPlan(PLAN),cfg,err),null);
});

test('MVP209: cron retorna antes de leer Whapi, cifrado y cola aunque flags habilitados',()=>{
 const auth=worker.indexOf('const mode=await verificarModoWorkerMvp209(');
 const db=worker.indexOf('const db=createClient(');
 const plan=worker.indexOf('const planned=await prepararPlanesPrivadosMvp197(');
 const guard=worker.indexOf("if(mode==='plan_only')return new Response(");
 const dispatch=worker.indexOf(
  "if(Deno.env.get('COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED')!=='true')");
 const outbound=worker.indexOf(
  "if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')");
 const queue=worker.indexOf("'cotironda_piloto_commercial_queue_due_mvp196'");
 const fetch=worker.indexOf("fetch('https://gate.whapi.cloud/messages/text'");
 assert.ok(auth>0&&db>auth&&plan>db&&guard>plan&&
  dispatch>guard&&outbound>dispatch&&queue>outbound&&fetch>queue);
 assert.match(worker,/planOnly:Deno\.env\.get\('COTIRONDA_PILOT_FINALIST_PLAN_SECRET'\)/);
 assert.match(worker,/dispatch:Deno\.env\.get\('COTIRONDA_PILOT_FINALIST_WORKER_SECRET'\)/);
 assert.match(worker,/Deno\.env\.get\('COTIRONDA_PILOT_COMMERCIAL_SELECTOR_MVP196_ENABLED'\)/);
});

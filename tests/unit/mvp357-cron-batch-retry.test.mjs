import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {aceptarBodyVacioBatchMvp357} from
 '../../supabase/functions/cotironda-piloto-ai-batch/empty-cron-body-mvp357.ts';
import {autorizarBatchCronMvp357} from
 '../../supabase/functions/cotironda-piloto-ai-batch/cron-auth-mvp357.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sql=readFileSync(resolve(root,'supabase/piloto/mvp357_batch_retry_private_off.sql'),'utf8');
const selector=readFileSync(resolve(root,'supabase/piloto/mvp357_next_batch_skip_blocked.sql'),'utf8');
const cron=readFileSync(resolve(root,'supabase/piloto/mvp357_schedule_cron_ONLY_AFTER_AUTHORIZATION.sql'),'utf8');
const edge=readFileSync(resolve(root,'supabase/functions/cotironda-piloto-ai-batch/index.ts'),'utf8');
const fixture=readFileSync(resolve(root,'supabase/tests/ci/mvp357-scheduler-pg17.sql'),'utf8');

test('MVP357: body vacío o exactamente {} son válidos, ningún otro comando',async()=>{
 const req=body=>new Request('https://localhost/batch',{method:'POST',...(
  body===null?{}:{body})});
 for(const body of [null,'','{}']){
  const request=req(body);
  assert.equal(await aceptarBodyVacioBatchMvp357(request),true,JSON.stringify(body));
 }
 for(const body of [' ','{ }','[]','null','{"request":"abc"}','123','\n','{}\n']){
  assert.equal(await aceptarBodyVacioBatchMvp357(req(body)),false,JSON.stringify(body));
 }
});
test('MVP357: rechaza streaming >2 bytes y tamaño anunciado falso',async()=>{
 const stream=new ReadableStream({start(controller){
  controller.enqueue(new Uint8Array([123,125]));
  controller.enqueue(new Uint8Array([32]));
  controller.close();
 }});
 const request=new Request('https://localhost/batch',
  {method:'POST',body:stream,duplex:'half'});
 assert.equal(await aceptarBodyVacioBatchMvp357(request),false);
 const short=req=>req;
 const missing=new Request('https://localhost/batch',
   {method:'POST',body:'{}',headers:{'content-length':'999'}});
 assert.equal(await aceptarBodyVacioBatchMvp357(missing),false);
});
test('MVP357: autenticación de Edge sigue ANTES de leer body y enviar',()=>{
 const auth=edge.indexOf('const adminAuthorized=authorizeRecoveryMvp294(');
 const proof=edge.indexOf('const cronAuthorized=autorizarBatchCronMvp357(');
 const reject=edge.indexOf('if(!adminAuthorized&&!cronAuthorized)');
 const body=edge.indexOf('aceptarBodyVacioBatchMvp357(req)');
 const dispatch=edge.indexOf('const result=await continuarDespachoMvp314(');
 assert(auth>=0&&proof>auth&&reject>proof&&body>reject&&dispatch>body);
 assert.match(edge,/COTIRONDA_PILOT_AI_BATCH_MVP314_ENABLED'\)!=='true'/u);
 assert.match(edge,/x-cotironda-ai-batch-secret/u);
 assert.match(edge,/if\(!await aceptarBodyVacioBatchMvp357\(req\)\)/u);
 assert.doesNotMatch(edge,/body=JSON\.parse\(/u);
});
test('MVP357: SQL no envía cuando bandera OFF ni repite cada segundo',()=>{
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
 assert.match(sql,/VALUES \(true,false,null,null\)/u);
 assert.match(sql,/pg_try_advisory_xact_lock\(7835637\)/u);
 assert.match(sql,/last_enqueued_at>clock_timestamp\(\)-interval '4 minutes'/u);
 assert.match(sql,/v_next:=public\.cotironda_piloto_ia_next_batch_mvp314\(\)/u);
 assert.match(sql,/IF v_next IS NULL OR v_next->>'state'<>'ready'/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC,anon,authenticated,service_role/u);
 assert.doesNotMatch(sql,/\b(?:NEXT_PUBLIC_|Authorization',v_admin)\b/u);
});
test('MVP357: secretos separados en Vault, POST {} y URL fija en piloto',()=>{
 assert.match(sql,/cotironda_piloto_ai_batch_cron_proof_mvp357/u);
 assert.match(sql,/cotironda_piloto_ai_batch_private_mvp357/u);
 assert(sql.includes("length(v_cron) NOT BETWEEN 32 AND 256"));
 assert(sql.includes("v_cron !~ '^[A-Za-z0-9_-]+$'"));
 assert.doesNotMatch(sql,/sb_secret_|'apikey',/u);
 assert.match(sql,/x-cotironda-batch-cron-proof/u);
 assert.match(sql,/net\.http_post\(/u);
 assert.match(sql,/body:='\{\}'::jsonb/u);
 assert.match(sql,/x-cotironda-ai-batch-secret/u);
 assert.match(sql,/https:\/\/ilggkalaafhtiysyzlmg\.supabase\.co\/functions\/v1\/cotironda-piloto-ai-batch/u);
 assert(!sql.includes('Bearer '+ 'sb_secret_'));
});
test('MVP357: no starvation ni selector de api_accepted/uncertain',()=>{
 assert.match(selector,/j\.state='pending'/u);
 assert.match(selector,/hay_despacho_solapado_mvp356\([\s\S]*?j\.request_id,j\.supplier_key\)/u);
 assert.match(selector,/coalesce\(quota\.attempts_reserved,0\)<gate\.buyer_daily_attempt_limit/u);
 assert.match(selector,/r\.closes_at>clock_timestamp\(\)/u);
});
test('MVP357: instalación cron separada, NO activa el gate ni expone secretos',()=>{
 assert.match(cron,/cron\.schedule\(/u);
 assert.match(cron,/\*\/5 \* \* \* \*/u);
 assert.match(cron,/cron\.job/u);
 assert.match(cron,/mvp357_independent_vault_secrets_missing/u);
 assert.doesNotMatch(cron,/^\s*UPDATE cotironda_piloto_privado\.ai_batch_retry_gate_mvp357/gmu);
 assert.doesNotMatch(cron,/\b(?:password|encrypted_secret|PRIVATE_TOKEN)\s*=\s*'[A-Za-z0-9_-]{24,}'/iu);
});
test('MVP357: PostgreSQL17 testea no jobs, saltos, duplicación y rollback',()=>{
 for(const marker of [
  'mvp357_gates_not_off_by_default',
  'mvp357_blocked_first_starved_unblocked_supplier',
  'mvp357_no_vault_secrets_should_fail_closed',
  'mvp357_http_credentials_or_target_wrong',
  'mvp357_duplicate_tick_not_throttled',
  'mvp357_uncertain_retried',
  'mvp357_accepted_retried',
  'mvp357_pending_not_released_after_close',
  'mvp357_closed_round_queued',
  'mvp357_cannot_disable',
  'ROLLBACK;'
 ])assert(fixture.includes(marker),marker);
});

test('MVP357: el cron usa exclusivamente 2 secretos, no llave admin',()=>{
 const ok={
  expectedPrivate:'X'.repeat(64),
  presentedPrivate:'X'.repeat(64),
  expectedCronProof:'P'.repeat(64),
  presentedCronProof:'P'.repeat(64),
  apikey:'',authorization:''
 };
 assert.equal(autorizarBatchCronMvp357(ok),true);
 for(const override of [
  {presentedPrivate:'bad'},
  {presentedCronProof:'bad'},
  {apikey:'sb_secret_unscoped_admin_secret'},
  {authorization:'Bearer dummy'},
  {expectedCronProof:''},
  {expectedPrivate:''},
  {expectedCronProof:'X'.repeat(64)},
  {expectedCronProof:'P'.repeat(31)}
 ])assert.equal(autorizarBatchCronMvp357({...ok,...override}),false,
   JSON.stringify(Object.keys(override)));
});

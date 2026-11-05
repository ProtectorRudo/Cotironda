import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp196_commercial_finalists_source_plan_off.sql',
 import.meta.url),'utf8');
const worker=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-finalistas/index.ts',
 import.meta.url),'utf8');
const planner=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-finalistas/plan-only-mvp197.ts',
 import.meta.url),'utf8');

test('MVP196: los RPCs de selección son privados y nunca exponen documentos ni mensajes',()=>{
 for(const fn of [
  'cotironda_piloto_commercial_due_mvp196',
  'cotironda_piloto_commit_commercial_plan_mvp196',
  'cotironda_piloto_source_plan_sendable_mvp196',
  'cotironda_piloto_commercial_queue_due_mvp196',
  'cotironda_piloto_tracking_source_plan_mvp196'
 ]){
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+fn+'\\('));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+fn));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+fn));
 }
 assert.match(sql,/SET search_path=''/);
 assert.match(sql,/TO service_role/);
 assert.doesNotMatch(sql,/whapi\.cloud|net\.http_post|ALTER TABLE.*disable row level security/iu);
});
test('MVP196: SQL comprueba cierre real, activación prospectiva y archivo fuente v9 vigente',()=>{
 for(const pattern of [
  /req\.created_at>=a\.activated_at/,
  /req\.state='closed'/,
  /v_snapshot->>'state'<>'private_inputs'/,
  /supplier_evidence_mvp138 ev/,
  /ev\.verifier_version=9/,
  /NOT EXISTS\([\s\S]*?supplier_media_quotes_mvp098 later/,
  /offer_versions later/,
  /p_source/,
  /v_quote->'fuente'->'lines'/,
  /v_source\s*\?&\s*array\['oferta','messageHmac','sourceSha256','matches'\]/,
  /INSERT INTO cotironda_piloto_privado\.finalist_source_plans_mvp196/,
  /INSERT INTO cotironda_piloto_privado\.finalist_coverage_plans_mvp108/,
  /state','planned'/,
  /'contacts_revealed',false,'messages_sent',false/
 ])assert.match(sql,pattern);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/BEFORE UPDATE OR DELETE/);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.finalist_activation_mvp113/);
});
test('MVP196: el worker NO llama al selector SQL literal MVP159 ni envía durante planificación',()=>{
 assert.match(planner,/seleccionarComercialmenteMvp196/);
 assert.match(worker,/prepararPlanesPrivadosMvp197/);
 assert.match(worker,/commercial_selector_off/);
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED/);
 assert.match(worker,/planned_no_whatsapp/);
 assert.match(planner,/api_accepted:0 as const,uncertain:0 as const/);
 assert.match(planner,/cotironda_piloto_commit_commercial_plan_mvp196/);
 assert.match(worker,/cotironda_piloto_commercial_queue_due_mvp196/);
 assert.match(worker,/cotironda_piloto_source_plan_sendable_mvp196/);
 assert.doesNotMatch(worker,/db\.rpc\('cotironda_piloto_prepare_finalists_due_mvp110'/);
 const planning=worker.indexOf('const planned=await prepararPlanesPrivadosMvp197(');
 const dispatch=worker.indexOf('COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED');
 const whapi=worker.indexOf("fetch('https://gate.whapi.cloud/messages/text'");
 assert.ok(planning>0&&dispatch>planning&&whapi>dispatch);
 assert.doesNotMatch(worker,/console\.log|console\.warn/);
});
test('MVP196: fuentes no selladas v9 nunca entran a envío por plan viejo',()=>{
 const portal=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-seguimiento/index.ts',
 import.meta.url),'utf8');
 assert.match(portal,/cotironda_piloto_tracking_source_plan_mvp196/);
 assert.match(portal,/verifiedFinalistPlan=!check\.error&&check\.data===true/);
 assert.match(portal,/if\(publicResult\?\.state==='closed'&&verifiedFinalistPlan\)/);
 assert.match(sql,/t\.revoked_at IS NULL/);
 assert.match(sql,/t\.expires_at>clock_timestamp\(\)/);

 assert.match(worker,/if\(v196\.error\|\|v196\.data!==true\)/);
 assert.match(worker,/p_state:'uncertain'/);
 assert.match(worker,/continue;/);
 assert.match(sql,/finalist_source_plans_mvp196 proof/);
 assert.match(sql,/plan\.state IN\(/);
 assert.match(sql,/NOT EXISTS\([\s\S]*?q\.message_hmac IS NULL/);
});

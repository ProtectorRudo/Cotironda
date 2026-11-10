import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const schedule=read('supabase/piloto/mvp209_finalists_plan_only_cron.sql');
const preflight=read('supabase/piloto/mvp209_finalists_plan_readiness_readonly.sql');
const worker=read('supabase/functions/cotironda-piloto-finalistas/index.ts');
const preview=read('supabase/piloto/mvp077_safe_closure_cron.sql');

test('MVP209: nueva agenda SQL no reemplaza ni interrumpe el cierre existente',()=>{
 assert.match(schedule,/'cotironda_piloto_finalists_plan_only_5min'/);
 assert.match(schedule,/'\*\/5 \* \* \* \*'/);
 assert.match(schedule,/cron\.schedule\(/);
 assert.match(preview,/'cotironda_piloto_close_due_5min'/);
 assert.match(preview,/close_due_v1\(25\)/);
 assert.match(preflight,/close_cron_jobs/);
 assert.match(preflight,/plan_cron_jobs/);
 assert.match(preflight,/cron_existente_no_duplicar/);
 assert.match(schedule,/mvp209_cron_already_installed/);
});

test('MVP209: guardado de token exclusivo en Vault; no secreto ni proveedor en SQL o logs',()=>{
 assert.match(schedule,/vault\.decrypted_secrets/);
 assert.match(schedule,/cotironda_piloto_finalists_plan_only_v1/);
 assert.match(schedule,/x-cotironda-finalist-plan-secret/);
 assert.doesNotMatch(schedule,/x-cotironda-finalist-worker-secret/);
 assert.doesNotMatch(schedule,/gate\.whapi\.cloud|contacts.*decrypt|whapi_outbox|whapi\.send/iu);
 assert.doesNotMatch(schedule,/(?:sb_secret_|sk-[A-Za-z0-9]{16}|COTIRONDA_PILOT_WHAPI_TOKEN|x-cotironda-finalist-worker-secret)/u);
 assert.match(schedule,/SELECT net\.http_post\(/);
 assert.match(schedule,/messages_sent',false/);
 assert.match(schedule,/contacts_revealed',false/);
 assert.match(preflight,/vault\.secrets/);
 assert.doesNotMatch(preflight,/vault\.decrypted_secrets|contact_sha256|source_sha256|message_hmac/);
});

test('MVP209: cron nunca corre en rondas anteriores a activación o sin cotización',()=>{
 for(const guard of [
  'a.only_row AND a.enabled',
  'a.activated_at IS NOT NULL',
  'r.created_at>=a.activated_at',
  "r.state='closed'",
  'r.closes_at<=clock_timestamp()',
  'supplier_media_quotes_mvp098',
  'finalist_coverage_plans_mvp108'
 ])assert.ok(schedule.includes(guard),guard);
 assert.match(schedule,/idle_no_eligible_round/);
 assert.match(schedule,/mvp209_must_install_with_finalists_off/);
 assert.match(schedule,/mvp209_dedicated_plan_secret_missing/);
 assert.match(preflight,/bloqueado_falta_credencial_plan_exclusiva/);
 assert.match(preflight,/bloqueado_instalar_solo_con_activacion_off/);
 assert.match(preflight,/listo_para_programar_plan_sin_despacho_con_publicalo/);
});

test('MVP209: no se concede a anon, authenticated o service_role ejecutar el cron interno',()=>{
 assert.match(schedule,/SECURITY DEFINER[\s\S]*?SET search_path=''/iu);
 assert.match(schedule,/REVOKE ALL ON FUNCTION public\.cotironda_piloto_finalists_plan_tick_mvp209\(\)[\s\S]*?FROM PUBLIC,anon,authenticated,service_role/iu);
 assert.doesNotMatch(schedule,/GRANT EXECUTE.*ON.*finalists_plan_tick_mvp209/iu);
 assert.match(schedule,/SELECT public\.cotironda_piloto_finalists_plan_tick_mvp209\(\)/);
 assert.match(schedule,/cron\.unschedule\('cotironda_piloto_finalists_plan_only_5min'\)/);
});

test('MVP209: SQL preflight es solo lectura, no extrae datos ni activa workers',()=>{
 const uncommented=preflight.replace(/^\s*--.*$/gmu,'');
 assert.match(uncommented,/^\s*WITH\s+/u);
 assert.doesNotMatch(uncommented,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|EXECUTE|COPY)\s+(?:TABLE|INTO|FROM|FUNCTION|SCHEMA|\$)/iu);
 assert.doesNotMatch(uncommented.replace(/'[^']*'/gu,"''"),/\b(?:net\.http_post|cron\.schedule|vault\.create_secret)\s*\(/iu);
 assert.match(preflight,/activation_on/);
 assert.match(preflight,/dedicated_vault_secret_exists/);
 assert.match(preflight,/diagnostico/);
});

test('MVP209: el worker deja la credencial plan_only FUERA de la ruta de despacho',()=>{
 const planning=worker.indexOf("if(mode==='plan_only')return new Response(");
 const outbound=worker.indexOf("if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')");
 const fetch=worker.indexOf("fetch('https://gate.whapi.cloud/messages/text'");
 assert.ok(planning>0&&outbound>planning&&fetch>outbound);
 assert.match(worker,/verificarModoWorkerMvp209\(/);
 assert.doesNotMatch(schedule,/authorization.*Bearer/iu);
});

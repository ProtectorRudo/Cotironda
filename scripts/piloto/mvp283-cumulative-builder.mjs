/** MVP283: 21 SQL acumulados en un mismo esquema PostgreSQL 17 sintético.
 * NO es un pg_dump del esquema real. No conecta a Supabase ni habilita cron.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {migrationFiles,checkManifest} from './mvp281-manifiesto-integracion.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const fixture=join(root,'supabase/tests/ci/mvp227-cotizaciones-por-rubro-pg17.sql');
const stop='\\ir ../../piloto/mvp245_media_quote_ia_central_verified.sql';
export const pilotaudit={tables:63,columns:428,views:1,private_routines:20,
 private_rls_tables:63,functions_public_pilot:112,trigger_count:20,version:'17.11'};
const setup=[
 'CREATE SCHEMA auth;',
 'CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean NOT NULL DEFAULT false);',
 'CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);',
 "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $auth$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $auth$;",
 "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$ SELECT CASE WHEN (auth.jwt()->>'sub') ~* '^[a-f0-9-]{36}$' THEN (auth.jwt()->>'sub')::uuid ELSE NULL::uuid END $auth$;",
 'CREATE SCHEMA storage;',
 'CREATE TABLE storage.objects(bucket_id text NOT NULL,name text NOT NULL,PRIMARY KEY(bucket_id,name));',
 'CREATE TABLE cotironda_piloto_privado.document_ai_diagnostics_mvp127(message_hmac text PRIMARY KEY,phase text,state text,updated_at timestamptz,reason_code text,attempt_count smallint,next_retry_at timestamptz,last_attempt_at timestamptz,first_failure_at timestamptz);',
 // Legacy structural dependencies actually present on the 71-migration PILOTO.
 'CREATE TABLE cotironda_piloto_privado.delivery_receipts_mvp119(message_id_sha256 text PRIMARY KEY,request_id uuid,source_kind text,recipient_key text,state text,status_code integer,event_unix bigint,first_seen_at timestamptz,last_seen_at timestamptz);',
 'CREATE TABLE cotironda_piloto_privado.supplier_ack_mvp104(message_hmac text PRIMARY KEY,mode text,state text,chat_hmac text,finished_at timestamptz,reserved_at timestamptz,whapi_message_id text);',
 'CREATE TABLE cotironda_piloto_privado.finalist_whapi_outbox_mvp110(request_id uuid,recipient_key text,state text,leased_at timestamptz,created_at timestamptz,lease_token uuid,completed_at timestamptz,whapi_message_id text);',
 'ALTER TABLE cotironda_piloto_privado.buyer_tracking_mvp091 ADD COLUMN IF NOT EXISTS send_state text,ADD COLUMN IF NOT EXISTS whapi_message_id text,ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz,ADD COLUMN IF NOT EXISTS created_at timestamptz;',
 'ALTER TABLE cotironda_piloto_privado.whapi_outbox ADD COLUMN IF NOT EXISTS whapi_message_id text,ADD COLUMN IF NOT EXISTS leased_at timestamptz,ADD COLUMN IF NOT EXISTS lease_token uuid,ADD COLUMN IF NOT EXISTS sent_at timestamptz,ADD COLUMN IF NOT EXISTS created_at timestamptz,ADD COLUMN IF NOT EXISTS state text;',
 'ALTER TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 ADD COLUMN IF NOT EXISTS whapi_message_id text,ADD COLUMN IF NOT EXISTS leased_at timestamptz;',
 'ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ADD COLUMN IF NOT EXISTS kind text,ADD COLUMN IF NOT EXISTS size_bytes integer,ADD COLUMN IF NOT EXISTS finished_at timestamptz,ADD COLUMN IF NOT EXISTS reserved_at timestamptz,ADD COLUMN IF NOT EXISTS ai_reserved_at timestamptz,ADD COLUMN IF NOT EXISTS storage_path text,ADD COLUMN IF NOT EXISTS media_id_sha256 text,ADD COLUMN IF NOT EXISTS review_state text,ADD COLUMN IF NOT EXISTS delivery_city_confirmed text,ADD COLUMN IF NOT EXISTS delivery_zone_source_hmac text;',
 'ALTER TABLE cotironda_piloto_privado.whapi_inbox ADD COLUMN IF NOT EXISTS source_unix bigint;',
 'ALTER TABLE cotironda_piloto_privado.requests ADD COLUMN IF NOT EXISTS round_days smallint,ADD COLUMN IF NOT EXISTS closed_at timestamptz;',


 '\\ir ../../piloto/mvp229_piloto_ia_central_control_temporal.sql',
 '\\ir ../../piloto/mvp230_continuidad_presupuestos_sin_nuevos_envios.sql'
].join('\n')+'\n';
const audit=[
 'DO $audit$',
 'BEGIN',
 " IF to_regclass('cotironda_piloto_privado.ai_buyer_review_mvp279') IS NULL",
 " OR to_regclass('cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278') IS NULL",
 " OR to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NULL",
 " OR to_regprocedure('cotironda_piloto_privado.fuente_revisable_mvp280(uuid)') IS NULL",
 " THEN RAISE EXCEPTION 'mvp283_missing_components'; END IF;",
 ' IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE only_row AND enabled=false)',
 ' OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 WHERE only_row AND enabled=false)',
 ' OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229 WHERE only_row AND enabled=false)',
 " THEN RAISE EXCEPTION 'mvp283_gate_leak';END IF;",
 " IF has_function_privilege('anon','public.cotironda_piloto_ia_review_issue_mvp279(text,text)','EXECUTE')",
 " OR has_function_privilege('authenticated','public.cotironda_piloto_ia_review_issue_mvp279(text,text)','EXECUTE')",
 " OR has_function_privilege('anon','public.cotironda_piloto_ia_publish_mvp222(uuid)','EXECUTE')",
 " THEN RAISE EXCEPTION 'mvp283_acl_leak';END IF;",
 " IF (SELECT count(*) FROM cotironda_piloto_privado.invitations)<>0",
 " OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0",
 " THEN RAISE EXCEPTION 'mvp283_unexpected_outbound';END IF;",
 " RAISE NOTICE 'MVP283: 21 SQL coinstalados en UN esquema sintético';",
 'END $audit$;',
 'ROLLBACK;',
 "SELECT (to_regnamespace('cotironda_piloto_privado') IS NULL AND to_regnamespace('auth') IS NULL AND to_regnamespace('storage') IS NULL) AS mvp283_rollback_ok;"
].join('\n')+'\n';
export function buildCumulativeSql(reader=readFileSync){
 const m=checkManifest();if(!m.valid)throw Error('MVP283_MANIFEST_INVALID');
 const src=reader(fixture,'utf8');
 const start=src.indexOf('BEGIN;'),end=src.indexOf(stop);
 if(start<0||end<=start||src.indexOf(stop,end+1)!==-1)
  throw Error('MVP283_BOOTSTRAP_CHANGED');
 const base=src.slice(start,end);
 for(const n of [
  'mvp221_rondas_ia_sombra_y_pdf_por_proveedor',
  'mvp222_ia_despacho_seguro_sin_activar',
  'mvp223_ia_buyer_dispatch_lookup_private',
  'mvp225_asociar_presupuestos_ia_central_solo_piloto',
  'mvp226_ia_central_ingesta_durable',
  'mvp227_presupuestos_rubros_ia_privados']){
  if(!base.includes(n+'.sql'))throw Error('MVP283_MISSING_BASELINE_'+n);
 }
 if(/^\s*(?:COMMIT|ROLLBACK)\s*;/im.test(base))
  throw Error('MVP283_BAD_TRANSACTION');
 const candidates=migrationFiles.map((name,i)=>
  '-- MVP283 SQL '+String(i+1).padStart(2,'0')+' '+name+'\n'+
  '\\ir ../../piloto/'+name+'\n').join('');
 const all=base+'\n'+setup+candidates+audit;
 if(/\\!|\\copy\b|\\connect\b|^\s*COMMIT\s*;/im.test(all))
  throw Error('MVP283_EXTERNAL_COMMAND');
 if(!all.startsWith('BEGIN;')||all.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP283_ROLLBACK_EXPECTED');
 return all;
}
export function summary(){
 const s=buildCumulativeSql();
 return {mode:'single_schema_pg17_synthetic',migrations:migrationFiles.length,
  sha256:createHash('sha256').update(s).digest('hex'),
  bytes:Buffer.byteLength(s),real_pilot_schema_dump_used:false,
  real_pilot_touched:false,coinstallation_test_passed:false,
  deploy_authorized:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]||'--check';
  if(process.argv.length>3||!['--check','--sql','--assert-local'].includes(arg))
   throw Error('MVP283_USAGE');
  if(arg==='--assert-local'){
   validateIsolation();process.stdout.write('MVP283_LOCAL_ONLY_OK\n');
  }else process.stdout.write(arg==='--sql'?buildCumulativeSql():JSON.stringify(summary())+'\n');
 }catch(e){process.stderr.write('MVP283_INVALID: '+String(e.message)+'\n');process.exitCode=1;}
}

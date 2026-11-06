import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp263_supervisor_bounded_watchdog.sql',import.meta.url),'utf8');
const pg=readFileSync(new URL('../../supabase/tests/ci/mvp263-supervisor-watchdog-pg17.sql',import.meta.url),'utf8');
const activation=readFileSync(new URL('../../supabase/piloto/mvp263_operator_cron_activate_MANUAL.sql',import.meta.url),'utf8');
test('MVP263: instalación desactivada; cron solo en script operator manual',()=>{
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
 assert.match(sql,/VALUES\(true,false\)/u);
 assert.doesNotMatch(sql,/\bcron\.schedule\b|net\.http_post|functions\/v1|sendMessage|messages\/text|openai\.com/u);
 assert.match(activation,/SELECT cron\.schedule\(/u);
 assert.match(activation,/'\*\/15 \* \* \* \*'/u);
 assert.match(activation,/mvp263_supervisor_gate_disabled/u);
 assert.match(activation,/mvp263_cron_already_registered/u);
 assert.match(activation,/cron\.unschedule/u);
});
test('MVP263: cuotas estrictas, concurrencia por bloqueo y bucket único',()=>{
 for(const phrase of [
  'max_runs_utc_day smallint NOT NULL DEFAULT 96',
  'CHECK(max_runs_utc_day BETWEEN 1 AND 96)',
  'bucket_utc timestamptz PRIMARY KEY',
  'WHERE only_row=true FOR UPDATE',
  "date_bin('15 minutes',policy_.last_run_at,",
  'IF run_count_>=policy_.max_runs_utc_day',
  "date_bin('15 minutes',now_",
  'ON CONFLICT(bucket_utc) DO NOTHING',
  "bucket_utc<day_start_-interval '30 days'"
 ])assert.ok(sql.includes(phrase),phrase);
});
test('MVP263: evidencia agregada sin filas de usuario ni autoridad comercial',()=>{
 for(const s of [
  "'messages_sent',false","'external_api_calls',0","'model_calls',0",
  "'costs_verified',false","'automatic_award_allowed',false",
  "'automatic_resend_allowed',false","'contacts_revealed',false"
 ])assert.ok(sql.includes(s),s);
 assert.match(sql,/cotironda_piloto_supervisor_snapshot_mvp262\(24\)/u);
 assert.match(sql,/mvp263_untrusted_supervisor_snapshot/u);
 assert.doesNotMatch(sql,/message_body|nonce_b64|ciphertext_b64|source_message_hmac|recipient_key|recipient_phone|ai_model|llm_prompt|price_centavos/u);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.(whapi_outbox|ai_dispatch_jobs_mvp222|requests|ai_supplier_review_mvp227)/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.cotironda_piloto_supervisor_tick_mvp263/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.cotironda_piloto_supervisor_tick_mvp263/u);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/gu);
});
test('MVP263: alertas deduplicadas y transiciones deterministas sin salida',()=>{
 for(const s of [
  'signal_code text PRIMARY KEY',
  'ON CONFLICT(signal_code) DO UPDATE SET',
  'observations=LEAST(',
  'reopen_count=LEAST(',
  'resolved_at=now_,last_seen_at=now_',
  "'state','disabled'",
  "'state','interval_guard'",
  "'state','daily_cap'",
  "'state','duplicate_bucket'",
  "'state','recorded_private'"
 ])assert.ok(sql.includes(s),s);
 assert.match(sql,/FOREACH signal_ IN ARRAY alert_codes_ LOOP/u);
 assert.match(sql,/jsonb_typeof\(signals_->signal_\) IS DISTINCT FROM 'number'/u);
 assert.match(sql,/IF value_>1000000000/u);
 assert.match(sql,/signal_code text PRIMARY KEY CHECK\(signal_code IN\(/u);
});
test('MVP263: PG17 cubre seguridad, replay, cuota, resolución y reapertura',()=>{
 for(const s of [
  'mvp263_default_not_disabled','mvp263_acl_leak',
  'mvp263_first_tick_bad','mvp263_duplicate_tick_not_blocked',
  'mvp263_duplicate_alert_observed','mvp263_daily_budget_broken',
  'mvp263_resolution_incorrect','mvp263_reopened_alert_not_deduped',
  'mvp263_identifier_leak','ROLLBACK;'
 ])assert.ok(pg.includes(s),s);
});

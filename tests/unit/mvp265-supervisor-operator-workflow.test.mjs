import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp265_supervisor_operator_casebook.sql',import.meta.url),'utf8');
const pg=readFileSync(new URL(
 '../../supabase/tests/ci/mvp265-supervisor-operator-pg17.sql',import.meta.url),'utf8');
test('MVP265: operador NO inscrito, no hay bootstrap con privilegios',()=>{
 assert.match(sql,/operator_ref uuid PRIMARY KEY DEFAULT pg_catalog\.gen_random_uuid/u);
 assert.match(sql,/active boolean NOT NULL DEFAULT false/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado\.supervisor_operators_mvp265/u);
 assert.match(sql,/o\.operator_ref=p_operator_ref AND o\.active/u);
 assert.match(sql,/o\.revoked_at IS NULL AND o\.role='incident_manager'/u);
 assert.match(sql,/operator_not_authorized/u);
});
test('MVP265: bitácora por incidente y episodio, sin reenviar ni alterar alertas',()=>{
 for(const p of [
  'UNIQUE(signal_code,episode_started_at,action_code,evidence_sha256)',
  'episode_started_at timestamptz NOT NULL',
  'evidence_sha256 text NOT NULL',
  'FOR UPDATE','invalid_transition','stale_episode',
  'requires_measured_resolution','operator_daily_cap',
  "'incident_resolved_by_operator',false",
  "'messages_sent',false","'automatic_award_allowed',false"
 ])assert.ok(sql.includes(p),p);
 assert.doesNotMatch(sql,
  /UPDATE cotironda_piloto_privado\.(supervisor_alerts_mvp263|whapi_outbox|ai_supplier_review_mvp227|requests)/u);
 assert.doesNotMatch(sql,/net\.http_post|cron\.schedule|messages\/text|messages\/document|openai\.com/u);
 assert.match(sql,/count_today_>=200/u);
});
test('MVP265: cola acotada por siete señales, SLA y sin PII',()=>{
 assert.match(sql,/CASE WHEN severity='blocked' THEN 30 ELSE 120 END/u);
 assert.match(sql,/unacknowledged_over_sla/u);
 assert.match(sql,/age_minutes/u);
 assert.match(sql,/event_\.episode_started_at=a\.first_seen_at/u);
 assert.match(sql,/last_action IS NULL THEN 'awaiting_operator'/u);
 assert.match(sql,/WHEN NOT active THEN 'source_resolved'/u);
 assert.match(sql,/'notifications_sent',false/u);
 assert.match(sql,/'costs_verified',false/u);
 assert.doesNotMatch(sql,/request_id|supplier_key|chat_hmac|contact_phone|p_recipient_phone|source_sha256/u);
});
test('MVP265: privados RLS y service_role-only, sin acceso directo',()=>{
 for(const t of [
  'supervisor_operators_mvp265',
  'supervisor_case_events_mvp265'
 ]){
  assert.match(sql,new RegExp('ALTER TABLE cotironda_piloto_privado\\.'+t+'\\s+ENABLE ROW LEVEL SECURITY','u'));
  assert.match(sql,new RegExp('REVOKE ALL ON cotironda_piloto_privado\\.'+t+'\\s+FROM PUBLIC,anon,authenticated,service_role','u'));
 }
 for(const fn of [
  'cotironda_piloto_supervisor_case_action_mvp265',
  'cotironda_piloto_supervisor_case_queue_mvp265'
 ]){
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+fn));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+fn));
 }
});
test('MVP265: PG17 reversible prueba SLA, episodios, transición, rollback',()=>{
 for(const marker of [
  'mvp265_sla_or_queue_wrong','mvp265_active_cannot_be_closed',
  'mvp265_escalation_requires_ack','mvp265_disabled_operator_was_allowed',
  'mvp265_duplicate_ack_not_idempotent','mvp265_human_changed_source_signal',
  'mvp265_source_not_resolved','mvp265_reopened_escalated_without_ack',
  'mvp265_permissions_leak','ROLLBACK;'
 ])assert.ok(pg.includes(marker),marker);
});

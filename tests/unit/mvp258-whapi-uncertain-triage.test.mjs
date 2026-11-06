import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp258_uncertain_noid_triage.sql',import.meta.url),'utf8');
const psql=readFileSync(new URL(
 '../../supabase/tests/ci/mvp258-uncertain-noid-pg17.sql',import.meta.url),'utf8');

test('MVP258: sólo operadores service_role, tablas RLS y sin permiso directo',()=>{
 for(const t of ['uncertain_triage_cases_mvp258','uncertain_review_notes_mvp258']){
  assert.match(sql,new RegExp('ALTER TABLE cotironda_piloto_privado\\.'+t+'\\s+ENABLE ROW LEVEL SECURITY','u'));
  assert.match(sql,new RegExp('REVOKE ALL ON cotironda_piloto_privado\\.'+t+'\\s+FROM public,anon,authenticated,service_role','u'));
 }
 for(const fn of ['cotironda_piloto_scan_uncertain_mvp258',
  'cotironda_piloto_list_uncertain_mvp258','cotironda_piloto_note_uncertain_mvp258']){
  assert.match(sql,new RegExp('CREATE FUNCTION public\\.'+fn+'\\(','u'));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+fn+'\\(','u'));
 }
 assert.match(sql,/SECURITY DEFINER SET search_path=''/u);
});

test('MVP258: evidencia con huella privada, nunca entrega confirmada',()=>{
 assert.match(sql,/source_fingerprint text NOT NULL UNIQUE/u);
 assert.match(sql,/extensions\.digest\(kind\|\|':'\|\|key_,'sha256'\)/u);
 assert.match(sql,/UNIQUE\(case_id,note_code,evidence_sha256\)/u);
 assert.match(sql,/operator_escalation_required/u);
 assert.match(sql,/manual_investigation_incomplete/u);
 assert.match(sql,/'automatic_resend_allowed',false/u);
 assert.doesNotMatch(sql,/messages\/document|messages\/text|net\.http_post|UPDATE cotironda_piloto_privado\.(whapi_outbox|ai_dispatch_jobs_mvp222|buyer_tracking_mvp091|supplier_ack_mvp104|finalist_whapi_outbox_mvp110)/u);
 assert.doesNotMatch(sql,/recipient_chat_id|phone_number|message_body|source_text/u);
});

test('MVP258: la cola prioriza casos nuevos y tiene límite de lectura',()=>{
 assert.match(sql,/LIMIT p_limit/u);
 assert.match(sql,/p_limit NOT BETWEEN 1 AND 50/u);
 assert.match(sql,/ORDER BY c\.last_seen_at NULLS FIRST/u);
 assert.match(sql,/ON CONFLICT\(source_fingerprint\) DO UPDATE/u);
 assert.match(sql,/state='uncertain' OR/u);
 assert.match(sql,/state='leased' AND source_at<clock_timestamp\(\)-interval '15 minutes'/u);
});

test('MVP258: PG17 prueba falsos recibos, expiración, privacidad, idempotencia y rollback',()=>{
 for(const key of [
  'mvp258_scan_unbounded','mvp258_private_keys_exposed',
  'mvp258_wrong_reason_count','mvp258_duplicate_cases',
  'mvp258_false_delivery_note','mvp258_duplicate_note',
  'mvp258_resend_side_effect','mvp258_privilege_leak','ROLLBACK;'
 ])assert.ok(psql.includes(key),key);
});

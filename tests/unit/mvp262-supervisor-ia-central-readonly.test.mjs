import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp262_private_supervisor_readonly.sql',import.meta.url),'utf8');
const pg=readFileSync(new URL(
 '../../supabase/tests/ci/mvp262-supervisor-readonly-pg17.sql',import.meta.url),'utf8');

test('MVP262: supervisor sólo lectura, SQL sin operaciones mutadoras ni secretos',()=>{
 assert.match(sql,/CREATE FUNCTION public\.cotironda_piloto_supervisor_snapshot_mvp262/u);
 assert.match(sql,/LANGUAGE plpgsql STABLE SECURITY DEFINER/u);
 assert.match(sql,/SET search_path=''/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.cotironda_piloto_supervisor_snapshot_mvp262/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.cotironda_piloto_supervisor_snapshot_mvp262/u);
 assert.doesNotMatch(sql,/\bINSERT INTO\b|\bUPDATE cotironda_piloto_privado\b|\bDELETE FROM\b|\bTRUNCATE\b|net\.http_post|messages\/text|messages\/document|pg_cron|schedule\(/iu);
 assert.doesNotMatch(sql,/ciphertext|nonce_b64|message_body|supplier_phone|contact_reveal|request_id::text/u);
});
test('MVP262: false flags always reported; no delivery assumed from observed status',()=>{
 for(const s of [
  "'costs_verified',false","'records_modified',false",
  "'messages_sent',false","'automatic_resend_allowed',false",
  "'automatic_award_allowed',false","'contacts_revealed',false"
 ])assert.ok(sql.includes(s),s);
 assert.match(sql,/priority_:=CASE/u);
 assert.match(sql,/uncertain_>0 OR stalled_>0 OR manual_document_>0/u);
 assert.match(sql,/public\.cotironda_piloto_retryable_document_error_mvp256\(reason_code\)/u);
 assert.match(sql,/whapi_status_evidence/u);
 assert.doesNotMatch(sql,/set state='delivered'/iu);
});
test('MVP262: bounded lookback, complete metrics without IDs',()=>{
 assert.match(sql,/p_window_hours NOT BETWEEN 1 AND 168/u);
 const keys=['outbound_uncertain','outbound_stalled_lease','outbound_pending',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review','whapi_triage_cases',
  'whapi_triage_without_note','whapi_status_evidence',
  'commercial_memories_expiring_24h'];
 for(const key of keys)assert.ok(sql.includes("'"+key+"'"),key);
 assert.match(sql,/statement_timestamp\(\)/u);
 assert.match(sql,/inspect_safe_document_retry_worker/u);
 assert.match(sql,/investigate_uncertain_whapi_without_resend/u);
});
test('MVP262: PostgreSQL17 reversible verifies blocked/ok, no PII, ACL and idempotency',()=>{
 for(const marker of [
  'mvp262_empty_snapshot_incorrect','mvp262_window_zero','mvp262_window_high',
  'mvp262_broken_rules','mvp262_unsafe_action',
  'mvp262_snapshot_not_idempotent','mvp262_identifier_leak',
  'mvp262_acl_broken','ROLLBACK;'
 ])assert.ok(pg.includes(marker),marker);
});

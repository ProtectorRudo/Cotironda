import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp112_roundtrip_e2e_rollback.sql',import.meta.url),'utf8');
const preflight=readFileSync(new URL(
 '../../supabase/piloto/mvp112_readiness_readonly.sql',import.meta.url),'utf8');

test('MVP112: one request and TWO authenticated suppliers through source, price and anonymous portal',()=>{
 for(const token of [
  "'both_full','two_complete_alternatives',2",
  "'supplier_partial','one_complete_alternative',1",
  'insert into cotironda_piloto_privado.requests',
  'insert into cotironda_piloto_privado.request_lines',
  'insert into cotironda_piloto_privado.invitations',
  'insert into cotironda_piloto_privado.whapi_inbox',
  'insert into cotironda_piloto_privado.media_archive_mvp095',
  'cotironda_piloto_record_supplier_media_mvp098',
  'cotironda_piloto_compare_supplier_readings_mvp102',
  'cotironda_piloto_audit_supplier_amounts_mvp103',
  'cotironda_piloto_record_supplier_source_check_mvp106',
  'cotironda_piloto_publish_source_text_mvp107',
  'cotironda_piloto_tracking_status_mvp091',
  'mvp112_anonymous_live_offers_not_visible',
 ])assert.ok(sql.includes(token),token);
 assert.ok(sql.indexOf('cotironda_piloto_tracking_status_mvp091') <
  sql.indexOf('cotironda_piloto_close_due_v1'));
});
test('MVP112: actual deadline, safe planner, mutual consent and 1+2 at-most-once outbox',()=>{
 for(const token of [
  "cutoff-interval '4 days'",
  'cotironda_piloto_close_due_v1',
  'cotironda_piloto_prepare_finalists_due_mvp110',
  'mvp112_queued_unconsented_finalists',
  'cotironda_piloto_contact_command_mvp109',
  'cotironda_piloto_queue_finalists_mvp110',
  'cotironda_piloto_tracking_finalists_mvp110',
  'cotironda_piloto_claim_finalist_whapi_mvp110',
  'cotironda_piloto_authorize_finalist_whapi_mvp110',
  'cotironda_piloto_finish_finalist_whapi_mvp110',
  'mvp112_finalist_handoffs_incomplete',
  'mvp112_double_sent',
  'mvp112_wrong_token_revealed',
  'mvp112_revocation_not_applied',
  'rollback;'])assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/https?:\/\/gate\.whapi\.cloud|http_post|pg_net/);
 assert.doesNotMatch(sql,/set\s+closes_at\s*=/);
});
test('MVP112: preflight is read-only and NEVER claims production readiness',()=>{
 for(const x of [
  'NO_GO','missing_database_gates',
  'supplier_original_mirror','original_source_check',
  'finalist_whapi_outbox','buyer_finalist_reveal_rpc',
  'whatsapp_inbound_enabled','whatsapp_outbound_enabled',
  'NOT_CHECKED_BY_SQL'])assert.ok(preflight.includes(x),x);
 assert.doesNotMatch(preflight,/\b(?:insert\s+into|delete\s+from|update\s+[\w.]+\s+set|create\s+(?:table|function)|grant\s+|alter\s+table)\b/iu);
 assert.doesNotMatch(preflight,/select\s+\*.*from\s+cotironda_piloto_privado\.participants/iu);
});

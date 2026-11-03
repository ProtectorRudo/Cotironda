import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const gate=readFileSync(new URL(
 '../../supabase/piloto/mvp118_release_db_gate.sql',import.meta.url),'utf8');
const readiness=readFileSync(new URL(
 '../../supabase/piloto/mvp112_readiness_readonly.sql',import.meta.url),'utf8');
const pilot=readFileSync(new URL(
 '../../supabase/piloto/mvp117_upgrade_document_25.sql',import.meta.url),'utf8');

test('MVP118: operator cutover checks 13 private components, safe role and off-by-default worker',()=>{
 const paths=[
  'supplier_quote_lines_mvp101','supplier_reading_checks_mvp102',
  'supplier_amount_checks_mvp103','supplier_ack_mvp104',
  'supplier_source_checks_mvp106','anonymous_supplier_docs_mvp107',
  'finalist_coverage_plans_mvp108','participant_channels_mvp109',
  'contact_reveal_consents_mvp109','finalist_whapi_outbox_mvp110',
  'finalist_activation_mvp113','cotironda_piloto_claim_finalist_whapi_mvp110',
  'cotironda_piloto_tracking_finalists_mvp110'
 ];
 for(const p of paths)assert.match(gate,new RegExp(p),p);
 for(const x of ['relrowsecurity','has_table_privilege','has_function_privilege',
  'anon','authenticated','service_role','activated_at is not null',
  'document_agreements_mvp099_line_count_check'])
  assert.ok(gate.includes(x),x);
 assert.match(readiness,/NO_GO/);
 assert.match(readiness,/historic_notice_cutoff/);
 assert.match(pilot,/check\(line_count between 1 and 25\)/);
});
test('MVP118: cutover assertion is inert, never deploys or activates WhatsApp',()=>{
 assert.doesNotMatch(gate,/\b(?:insert\s+into|update\s+[^\n]+\s+set|delete\s+from|create\s+(?:table|function)|drop\s+(?:table|function)|grant\s+|alter\s+table|http_post|pg_net)\b/iu);
 assert.doesNotMatch(gate,/whatsapp_outbound_enabled\s*=\s*true|enabled\s*=\s*true/iu);
 assert.match(gate,/raise exception 'cutover_worker_activated'/);
});

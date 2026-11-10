import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp268_launch_readiness_readonly.sql',
 import.meta.url),'utf8');
const ci=readFileSync(new URL(
 '../../supabase/tests/ci/mvp268-launch-readiness-pg17.sql',
 import.meta.url),'utf8');
const noComments=sql.replace(/--[^\n]*/gu,' ');

test('MVP268: preflight has zero SQL mutations, HTTP, network or cron side effects',()=>{
 assert.doesNotMatch(noComments,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|MERGE|CALL|DO|GRANT|REVOKE|NOTIFY|COPY)\b/iu);
 assert.doesNotMatch(noComments,/\b(?:pg_net|http_post|net\.http_|cron\.schedule|pg_sleep)\b/iu);
 assert.match(sql,/'audit_mode','read_only'/u);
 assert.match(sql,/'no_live_outbound_action_was_taken',true/u);
});
test('MVP268: no readiness certificate is fabricated from installed functions',()=>{
 assert.match(sql,/'source_project_verified_by_sql',false/u);
 assert.match(sql,/'ready_for_real_whatsapp_pilot',false/u);
 assert.match(sql,/'release_authorized',false/u);
 assert.match(sql,/'operator_auth_e2e_verified',false/u);
 assert.match(sql,/'whatsapp_round_e2e_verified',false/u);
 assert.match(sql,/'whapi_api_accepted_not_delivered'/u);
 assert.match(sql,/'new_supervisor_cron_inactive'/u);
});
test('MVP268: 12 staged modules are tested without executing them',()=>{
 const versions=[...sql.matchAll(/^\s*\((25[6-9]|26[0-7]),to_reg(?:class|procedure)\(/gmu)]
  .map(x=>Number(x[1]));
 assert.deepEqual(versions,Array.from({length:12},(_,i)=>256+i));
 assert.match(sql,/ai_usage_reviews_mvp266/u);
 assert.match(sql,/operator_queue_auth_mvp267/u);
 assert.match(sql,/pg_cron_version IS NOT NULL/u);
 assert.match(sql,/s\.whapi_uncertain=0 AND s\.dispatch_uncertain=0/u);
});
test('MVP268: no commercial or personal data returned, only aggregated counts',()=>{
 assert.doesNotMatch(noComments,/\b(?:original_request|message_body|ciphertext|phone|display_label|supplier_key|buyer_key|source_hmac|auth_user_id)\b/iu);
 assert.match(sql,/'modules_missing'/u);
 assert.match(sql,/'technical_flags_all_off'/u);
 assert.match(sql,/'auth_accounts_count'/u);
});
test('MVP268: PostgreSQL17 fixture runs preflight twice with rollback',()=>{
 assert.match(ci,/^BEGIN;/mu);
 assert.match(ci,/^ROLLBACK;/mu);
 assert.equal((ci.match(/\\ir \.\.\/\.\.\/piloto\/mvp268_launch_readiness_readonly\.sql/gu)||[]).length,2);
 assert.match(ci,/INSERT INTO cron\.job/u);
 assert.match(ci,/VALUES\('uncertain'\)/u);
});

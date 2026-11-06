import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp267_operator_supabase_auth_mfa_bridge.sql',
 import.meta.url),'utf8');
const pg=readFileSync(new URL(
 '../../supabase/tests/ci/mvp267-operator-supabase-auth-pg17.sql',
 import.meta.url),'utf8');

test('MVP267: live signed Supabase Auth pilot session and MFA needed',()=>{
 assert.match(sql,/operator_session_mvp267\(\)/u);
 assert.match(sql,/JOIN auth\.users u ON u\.id=o\.auth_user_id/u);
 assert.match(sql,/JOIN auth\.sessions sess ON sess\.user_id=u\.id/u);
 assert.match(sql,/o\.active=true AND o\.revoked_at IS NULL/u);
 assert.match(sql,/u\.is_anonymous IS FALSE/u);
 assert.match(sql,/auth\.jwt\(\)->>'aal'\)='aal2'/u);
 assert.match(sql,/sess\.not_after IS NULL/u);
 assert.match(sql,/auth\.jwt\(\)->>'exp'/u);
 assert.match(sql,/ilggkalaafhtiysyzlmg\.supabase\.co/u);
 for(const field of ['raw_user_meta_data','user_metadata']){
  assert.equal(sql.includes("auth.jwt()->>'"+field+"'"),false);
  assert.equal(sql.includes("auth.jwt()->'"+field+"'"),false);
 }
});
test('MVP267: role is provisioned by a trusted operator, never email or caller UUID',()=>{
 assert.match(sql,/ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth\.users\(id\)/u);
 assert.doesNotMatch(sql,/INSERT INTO\s+cotironda_piloto_privado\.supervisor_operators_mvp265/iu);
 assert.match(sql,/v_operator:=cotironda_piloto_privado\.operator_session_mvp267\(\)/u);
 assert.match(sql,/p_signal_code text,p_episode_started_at timestamptz,\s*p_action_code text,p_evidence_sha256 text/u);
 assert.match(sql,/p_message_hmac text,p_call_no integer,\s*p_basis text,p_evidence_sha256 text/u);
 assert.doesNotMatch(sql,/CREATE TRIGGER|AFTER INSERT ON auth\.users/iu);
});
test('MVP267: RPC wrappers require verified JWT, have limited grants and no commercial side effects',()=>{
 for(const name of [
  'cotironda_piloto_operator_queue_auth_mvp267',
  'cotironda_piloto_operator_usage_auth_mvp267',
  'cotironda_piloto_operator_case_action_auth_mvp267',
  'cotironda_piloto_operator_usage_review_auth_mvp267']){
  assert.ok(sql.includes(name));
 }
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION\s+cotironda_piloto_privado\.operator_session_mvp267\(\)/u);
 assert.doesNotMatch(sql,/pg_net|net\.http_|pg_cron|cron\.schedule|https?:\/\/api\.whapi/iu);
 assert.match(pg,/mvp267_signed_out_still_authorized/u);
 assert.match(pg,/mvp267_mfa_not_enforced/u);
 assert.match(pg,/mvp267_impersonation_or_usage_falsification/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp196_commercial_finalists_source_plan_off.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/tests/ci/mvp196-finalists-source-off.sql',
 import.meta.url),'utf8');
const first=sql.slice(sql.indexOf(
 'CREATE OR REPLACE FUNCTION public.cotironda_piloto_commercial_due_mvp196('),
 sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_commercial_due_mvp196'));
const last=sql.slice(sql.indexOf(
 'CREATE OR REPLACE FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196('),
 sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196'));

test('MVP198: no-offer round does not poison a later verified source batch',()=>{
 assert.match(first,/AND EXISTS\(\s*SELECT 1 FROM cotironda_piloto_privado\.supplier_media_quotes_mvp098 offered/);
 assert.match(first,/offered\.request_id=req\.id/);
 assert.match(first,/v_inputs->>'state' IS DISTINCT FROM 'private_inputs'/);
 assert.match(first,/v_skipped:=v_skipped\+1;/);
 assert.match(first,/CONTINUE;/);
 assert.match(first,/ORDER BY req\.closes_at,req\.id LIMIT p_limit\*10/);
 assert.match(first,/EXIT WHEN v_valid>=p_limit;/);
 assert.match(first,/'skipped_unverified',v_skipped/);
 assert.doesNotMatch(first,/RETURN jsonb_build_object\('state','unverified_source'\)/);
});
test('MVP198: only invited and currently consented supplier can be selected or revealed',()=>{
 const commit=sql.slice(sql.indexOf(
 'CREATE OR REPLACE FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196('),
 sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196'));
 assert.match(commit,/inv\.state='prepared'/);
 assert.match(last,/invitation\.state='prepared'/);
 assert.match(last,/invitation\.supplier_key IS NULL/);
 assert.match(last,/supplier\.opted_out_at IS NULL/);
 assert.match(last,/buyer\.opted_out_at IS NULL/);
 assert.match(last,/offer_versions later/);
 assert.match(last,/cotironda_piloto_private_round_inputs_mvp172/);
});
test('MVP198: PG17 isolated smoke covers vacant, invalid and valid rounds and revoked invitation',()=>{
 for(const key of [
  'mvp198_cancelled_invitation_still_sendable',
  'mvp198_reinstated_invitation_not_sendable',
  'mvp198_earlier_empty_or_invalid_round_stalled_valid_round',
  "j->>'skipped_unverified'",
  "'57918430-95a7-4ae9-bfb8-182e987b1733'",
  "'57918430-95a7-4ae9-bfb8-182e987b1734'",
  "'57918430-95a7-4ae9-bfb8-182e987b1735'",
  'ROLLBACK;'
 ])assert.ok(smoke.includes(key),key);
 assert.match(smoke,/public\.cotironda_piloto_source_plan_sendable_mvp196\(v\)/);
 assert.doesNotMatch(smoke,/whapi\.cloud|net\.http_post/);
});

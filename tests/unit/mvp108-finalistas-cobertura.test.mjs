import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp108_finalists_coverage_safe.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp108_smoke_rollback.sql',import.meta.url),'utf8');

test('MVP108: closed round only, buyer consent and immutable 4-day cutoff',()=>{
 assert.match(sql,/req_\.state<>'closed'/);
 assert.match(sql,/req_\.closes_at>clock_timestamp\(\)/);
 assert.match(sql,/buyer\.consent_at is not null and buyer\.opted_out_at is null/);
 assert.match(sql,/supplier\.consent_at is not null and supplier\.opted_out_at is null/);
 assert.match(sql,/media\.received_at<=req_\.closes_at/);
 assert.match(sql,/supplier\.key=d\.supplier_key/);
 assert.match(sql,/from cotironda_piloto_privado\.anonymous_supplier_docs_mvp107/);
 assert.match(sql,/more_than_two_undifferentiated/);
 assert.match(sql,/already_planned/);
 assert.match(smoke,/cutoff-interval '4 days',cutoff/);
 assert.match(smoke,/perform pg_sleep/);
 assert.doesNotMatch(smoke,/set created_at=cutoff/);
});
test('MVP108: one-to-one strict full coverage, never partial totals or invented equivalences',()=>{
 assert.match(sql,/count\(distinct req\.line_no\)/);
 assert.match(sql,/count\(distinct l\.line_no\)/);
 assert.match(sql,/lower\(btrim\(l\.description_literal\)\)=\s*lower\(btrim\(req\.original_description\)\)/);
 assert.match(sql,/unit_code_mvp099\(/);
 assert.match(sql,/replace\(l\.quantity_literal,',','\.'\)::numeric=req\.quantity/);
 assert.match(sql,/family_preview_mvp098\(/);
 assert.match(sql,/matches_count=req_count and distinct_req=req_count/);
 assert.match(sql,/distinct_line=req_count/);
 assert.match(sql,/not exists\(select 1\s+from cotironda_piloto_privado\.supplier_media_quotes_mvp098 newer/);
 assert.match(sql,/not exists\(select 1\s+from cotironda_piloto_privado\.offer_versions newer_text/);
 assert.doesNotMatch(sql,/order by.*declared_total_cents|order by.*totalFinal/i);
});
test('MVP108: ledger never discloses finalist identities or triggers messages',()=>{
 assert.match(sql,/finalist_coverage_plans_mvp108\s+enable row level security/);
 assert.match(sql,/before update or delete/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/grant execute on function\s+public\.cotironda_piloto_plan_coverage_finalists_mvp108\(uuid\)\s+to service_role/);
 assert.match(sql,/'price_ranked',false,'contacts_revealed',false/);
 assert.match(sql,/'messages_sent',false,'purchase_awarded',false/);
 assert.doesNotMatch(sql,/http_post|pg_net|https?:\/\/gate\.whapi\.cloud/);
 assert.doesNotMatch(sql,/jsonb_build_object\([^;]*'supplier_keys'/);
});
test('MVP108: PG17 regression checks complete x2, partial x1, anti replay and private RLS',()=>{
 for(const part of ["'both_full'","'supplier_partial'",
 "two_complete_alternatives","one_complete_alternative",
 'mvp108_premature_plan','mvp108_wrong_finalists',
 'mvp108_rerun_created_duplicate','mvp108_public_exposure',
 'mvp108_unverified_offer_created','rollback;']){
 assert.ok(smoke.includes(part),part);
 }
});

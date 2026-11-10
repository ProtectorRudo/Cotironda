import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp266_openai_unknown_persistent_review.sql',
 import.meta.url),'utf8');
const pg=readFileSync(new URL(
 '../../supabase/tests/ci/mvp266-ai-usage-persistent-review-pg17.sql',
 import.meta.url),'utf8');

test('MVP266: unknown usage survives the rolling 24h spending window',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_ai_usage_reserve_mvp264/u);
 assert.match(sql,/SELECT count\(\*\) INTO unknown_/u);
 assert.match(sql,/a\.state IN\('reserved','unmetered'\)/u);
 assert.match(sql,/NOT EXISTS\(\s*SELECT 1 FROM cotironda_piloto_privado\.ai_usage_reviews_mvp266/u);
 assert.match(pg,/interval '48 hours'/u);
 assert.match(pg,/unknown_expired_into_free_calls/u);
});
test('MVP266: reviewed uncertainty remains unknown, never a synthetic observed token',()=>{
 assert.match(sql,/PRIMARY KEY\(message_hmac,call_no\)/u);
 assert.match(sql,/operator_ref uuid NOT NULL REFERENCES/u);
 assert.match(sql,/financial_exposure_accepted/u);
 assert.match(sql,/usage_observed',false/u);
 assert.match(sql,/monetary_cost_verified',false/u);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.ai_usage_calls_mvp264\s+SET/u);
 assert.match(pg,/review_falsified_consumption/u);
 assert.match(pg,/review_bypassed_daily_quota/u);
});
test('MVP266: review is restricted, bounded, fail-closed and never sends WhatsApp',()=>{
 assert.match(sql,/SET search_path=''/u);
 assert.match(sql,/WHERE o\.operator_ref=p_operator_ref AND o\.active/u);
 assert.match(sql,/revoked_at IS NULL/u);
 assert.match(sql,/started_>clock_timestamp\(\)-interval '30 minutes'/u);
 assert.match(sql,/IF reviews_>=100/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated;/u);
 assert.match(sql,/TO service_role;/u);
 assert.doesNotMatch(sql,/https?:\/\//u);
 assert.doesNotMatch(sql,/(?:pg_net|net\.http_|whapi\.send|pg_cron|cron\.schedule)/iu);
});

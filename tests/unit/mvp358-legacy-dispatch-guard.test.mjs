import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const src=readFileSync(resolve(root,
 'supabase/piloto/mvp358_legacy_claim_same_lock_and_cross_lane.sql'),'utf8');
const fixture=readFileSync(resolve(root,
 'supabase/tests/ci/mvp358-legacy-claim-pg17.sql'),'utf8');
test('MVP358: el legado comparte exactamente el lock de claim MVP356',()=>{
 assert.match(src,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_claim_whapi_v1\(\)/u);
 assert.match(src,/PERFORM pg_advisory_xact_lock\(7835634\);/u);
 assert.match(src,/AND NOT cotironda_piloto_privado\.hay_despacho_solapado_mvp356\(\s*o\.request_id,o\.supplier_key\)/u);
 assert.match(src,/FOR UPDATE OF o SKIP LOCKED LIMIT 1/iu);
 assert.match(src,/WHERE o\.state='pending'/u);
});
test('MVP358: evidencia de ambos canales, misma ronda y proveedor independiente',()=>{
 assert.match(src,/CREATE OR REPLACE FUNCTION cotironda_piloto_privado\.hay_despacho_solapado_mvp356/u);
 assert.match(src,/other_job\.supplier_key=p_supplier/u);
 assert.match(src,/o\.supplier_key=p_supplier/u);
 assert.match(src,/other_job\.state IN \('leased','api_accepted','uncertain'\)/u);
 assert.match(src,/o\.state IN \('leased','api_accepted','uncertain'\)/u);
 assert.doesNotMatch(src,/other_job\.request_id<>t\.id/u);
 assert.doesNotMatch(src,/o\.request_id<>t\.id/u);
 assert.match(src,/other_round\.closes_at>clock_timestamp\(\)/u);
 assert.match(src,/old_round\.closes_at>clock_timestamp\(\)/u);
});
test('MVP358: sin secretos, contactos ni mensajes salientes en SQL',()=>{
 assert.doesNotMatch(src,/\bnet\.http_post\b|\bhttp_post\b|gate\.whapi\.cloud|sb_secret_|Bearer /iu);
 assert.doesNotMatch(src,/\b(?:phone_number|recipient_phone|ciphertext_b64|NEXT_PUBLIC_)\b/iu);
});
test('MVP358: PG17 hace rollback de dos pipelines y dos compradores',()=>{
 for(const marker of [
  'mvp358_guard_not_off_at_install',
  'mvp358_off_flag_changed_legacy',
  'mvp358_same_round_ai_vs_legacy_not_blocked',
  'mvp358_legacy_claim_did_not_skip_collisions',
  'mvp358_legacy_second_claim_should_be_empty',
  'mvp358_ai_claim_ignored_same_round_legacy_lease',
  'mvp358_ai_claim_ignored_same_round_legacy_accepted',
  'mvp358_legacy_ignored_existing_outbox_accepted',
  'mvp358_legacy_no_resume_after_close',
  'ROLLBACK;'
 ])assert(fixture.includes(marker),marker);
});

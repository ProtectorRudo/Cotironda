import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sql=readFileSync(resolve(root,
 'supabase/piloto/mvp360_originals_from_verified_source_not_parser.sql'),'utf8');
const fixture=readFileSync(resolve(root,
 'supabase/tests/ci/mvp360-originales-sin-gate-v9-pg17.sql'),'utf8');

test('MVP360: el catálogo de originales ya no depende de la IA económica',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_originals_private_mvp192/u);
 assert.match(sql,/FROM cotironda_piloto_privado\.media_archive_mvp095 m/iu);
 assert.match(sql,/JOIN cotironda_piloto_privado\.ai_supplier_links_mvp225 proof/iu);
 assert.match(sql,/JOIN cotironda_piloto_privado\.whapi_inbox source_msg/iu);
 assert.doesNotMatch(sql,/supplier_evidence_mvp138|supplier_media_quotes_mvp098|verifier_version\s*=\s*9/iu);
});
test('MVP360: identidad, consentimientos prospectivos y ronda cerrada',()=>{
 for(const pattern of [
  /from auth\.users u/iu,
  /join auth\.sessions sess/iu,
  /original_share_policy_mvp178/iu,
  /original_share_consents_mvp178/iu,
  /c\.revoked_at is null/iu,
  /r\.state='closed'/iu,
  /r\.created_at>pol\.activated_at/iu,
  /c\.accepted_at<=i\.created_at/iu,
  /r\.buyer_key=v_buyer/iu,
  /m\.state='stored'/iu
 ])assert.match(sql,pattern);
});
test('MVP360: evidencia correlacionada, SHA y bloqueo de ambigüedades',()=>{
 for(const pattern of [
  /proof\.source_sha256=m\.content_sha256/iu,
  /source_msg\.request_id=proof\.request_id/iu,
  /source_msg\.chat_hmac=m\.chat_hmac/iu,
  /proof\.association in \('quoted_whapi_id','single_active_round',[\s\S]*?'prior_supplier_preamble'\)/iu,
  /j\.whapi_message_id is not null/iu,
  /source_msg\.received_at>=j\.finished_at/iu,
  /m\.storage_path=\('media\/'\|\|m\.message_hmac\)/iu,
  /ai_supplier_unresolved_mvp237/iu,
  /ambiguous_round/iu,
  /other_j\.request_id<>r\.id/iu,
  /whapi_outbox old_o/iu,
  /offer_versions change_/iu,
  /media_archive_mvp095 newer/iu,
 ])assert.match(sql,pattern);
});
test('MVP360: no nueva ruta REST, sin signed URL, descarga sigue en adapter seguro',()=>{
 assert.doesNotMatch(sql,/sign(ed)?Url|net\.http_post|storage\.objects.*UPDATE/iu);
 assert.match(sql,/v_hex:=encode\(extensions\.digest/iu);
 assert.match(sql,/if v_total>100 then return null/iu);
 assert.match(sql,/return jsonb_build_object\(/iu);
 assert.match(sql,/v_doc:=/iu);
});
test('MVP360: prueba PG17 sin tablas IA económicas, negatives y rollback',()=>{
 assert.match(fixture,/No supplier_evidence_mvp138 or supplier_media_quotes_mvp098/u);
 for(const marker of [
  'mvp360_parser_free_catalog_missing',
  'mvp360_valid_doc_not_authorized',
  'mvp360_excel_original_not_listed',
  'mvp360_dangerous_mime_opened',
  'mvp360_forged_storage_path_opened',
  'mvp360_other_user_authorized',
  'mvp360_other_session_authorized',
  'mvp360_semantic_weak_link_opened',
  'mvp360_ambiguous_source_opened',
  'mvp360_revoked_supplier_consent_opened',
  'mvp360_sha_mismatch_opened',
  'mvp360_open_round_original_revealed',
  'mvp360_cross_round_overlap_opened',
  'mvp360_superseded_original_not_blocked',
  'ROLLBACK;'
 ])assert(fixture.includes(marker),marker);
});

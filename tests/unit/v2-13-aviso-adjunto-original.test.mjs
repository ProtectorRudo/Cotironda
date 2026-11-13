import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=read('../../supabase/piloto/v2_03_catalogo_respondedores_privado.sql');
const original=read('../../supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql');
const fixture=read('../../supabase/tests/ci/v2-03-respondedores-pg17.sql');
const producer=read('../../supabase/piloto/mvp238_aviso_proveedor_adjunto_una_ronda.sql');

test('V2-13: admite tercer vínculo solo cuando existe aviso de proveedor comprobado',()=>{
 for(const evidence of [
  "link.association='prior_supplier_preamble'",
  'ai_supplier_preambles_mvp238 preamble',
  'preamble.attachment_hmac=link.message_hmac',
  'preamble.request_id=link.request_id',
  'preamble.supplier_key=link.supplier_key',
  'preamble.chat_hmac=source.chat_hmac',
  'notice.message_hmac=preamble.preamble_hmac',
  'notice.participant_key=preamble.supplier_key',
  "notice.kind='text'",
  'notice.request_id=preamble.request_id',
  'notice.received_at=preamble.received_at',
  'notice.plaintext_sha256=preamble.source_sha256',
  'preamble.attached_at>=source.received_at',
  'preamble.received_at<source.received_at',
  "preamble.received_at>=source.received_at-interval '24 hours'"
 ])assert.ok(catalog.includes(evidence),evidence);
 assert.match(catalog,/link\.association IN \('quoted_whapi_id','single_active_round'\)/u);
 assert.match(catalog,/link\.status='awaiting_semantic_review'/u);
 assert.match(catalog,/a\.content_sha256=link\.source_sha256/u);
 assert.match(catalog,/a\.storage_path='media\/\|\|a\.message_hmac/u);
 assert.match(catalog,/c\.revoked_at IS NULL/u);
 assert.match(catalog,/policy\.enabled=true/u);
 assert.match(catalog,/auth\.sessions s/u);
});

test('V2-13: SQL original depende del catálogo Auth y no añade vías de acceso',()=>{
 assert.match(original,/v_catalog:=public\.cotironda_piloto_v2_responders_private\(/u);
 assert.match(original,/WHERE entry->>'documentId'=p_document_id::text/u);
 assert.match(original,/link\.association IN \(\s*'quoted_whapi_id','single_active_round','prior_supplier_preamble'\)/u);
 assert.match(original,/link\.status='awaiting_semantic_review'/u);
 assert.match(original,/v_found<>1 THEN RETURN NULL/u);
 assert.match(original,/v2_original_download_audit/u);
 assert.match(original,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated,service_role/u);
});

test('V2-13: origen MVP238 une aviso exacto, mensaje y archivo sin inferir identidades',()=>{
 for(const required of [
  "'prior_supplier_preamble'",
  'preamble_hmac',
  'attachment_hmac',
  'source_sha256',
  'p_media_hmac',
  "a.state='stored'",
  'v_file.content_sha256',
  "GET DIAGNOSTICS v_rows=ROW_COUNT"
 ])assert.ok(producer.includes(required),required);
 assert.match(producer,/FOR UPDATE OF p/u);
});

test('V2-13: suite PG17 cubre consentimiento previo, SHAs, revocación y cruces',()=>{
 for(const err of [
  'v2_13_unconsented_preamble_visible',
  'v2_13_preamble_quote_missing',
  'v2_13_original_not_exact',
  'v2_13_forged_notice_accepted',
  'v2_13_cross_chat_preamble_visible',
  'v2_13_future_preamble_visible',
  'v2_13_unpaired_file_visible',
  'v2_13_consent_revoked_original_leaked',
  'V2_13_PREAMBLE_DOCUMENT_PG17_PASS'
 ])assert.ok(fixture.includes(err),err);
 assert.match(fixture,/ROLLBACK;/u);
});

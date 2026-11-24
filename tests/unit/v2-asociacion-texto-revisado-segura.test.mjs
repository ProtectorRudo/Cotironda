import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_asociacion_texto_revisado_CANDIDATE.sql',import.meta.url),'utf8');
test('El reintento de texto conserva original, consentimiento, despacho y auditoría',()=>{
 for(const key of [
  'cotironda_piloto_claim_reviewed_text_v2',
  'cotironda_piloto_auto_correlation_retry_text_prepare_v2',
  'ai_supplier_correlation_retries_v2',
  "prior.reason IN ('single_item_not_unique'",
  "m.kind='text'",
  "v_source.kind <> 'text'",
  "m.nonce_b64 IS NOT NULL",
  "m.ciphertext_b64 IS NOT NULL",
  "u.resolved_request_id IS NULL",
  "log.state='review'",
  "supplier.consent_at IS NOT NULL",
  "seller.consent_at IS NOT NULL",
  "buyer.consent_at IS NOT NULL",
  "d.state='api_accepted'",
  "o.state='api_accepted'",
  "r.state IN('prepared','closed')",
  "'bind_allowed',(v_request.state='prepared')",
  "v_active<1",
  "ON CONFLICT DO NOTHING",
  'ENABLE ROW LEVEL SECURITY',
  'FROM PUBLIC, anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_reviewed_text_v2() TO service_role'
 ])assert.ok(sql.includes(key),key);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/iu);
 assert.doesNotMatch(sql,/https?:\/\/(?:gate\.whapi|api\.openai)/iu);
});
test('El reintento no publica, no otorga permisos públicos y conserva las funciones antiguas',()=>{
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./gu)||[]).length,2);
 assert.ok(sql.includes('BEGIN;')&&sql.includes('COMMIT;'));
 for(const f of [
  'cotironda_piloto_claim_reviewed_text_v2()',
  'cotironda_piloto_auto_correlation_retry_text_prepare_v2(text,text)'
 ])assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+f+
 ' FROM PUBLIC, anon, authenticated;'));
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_auto_correlation_retry_prepare_mvp336/u);
});

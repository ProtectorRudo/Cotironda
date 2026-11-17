import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_cuota_comercial_recuperacion_inbox_CANDIDATE.sql',
 import.meta.url),'utf8');
// El guard conserva el SQL original, incluso la cláusula obsoleta.
// Las aserciones sobre el comportamiento nuevo deben mirar solo el bloque
// posterior al guard de integridad (no el SQL viejo citado en preflight).
const active=sql.split('END $guard$;')[1]??'';
const quota=active.slice(active.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226'));
const reader=active.slice(
 active.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_review_source_private()'));
const stage=active.slice(
 active.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private('));

test('D013: elimina cuota fija de seis intentos por comprador, sin alterar autenticación',()=>{
 assert.ok(active);
 assert.match(sql,/D013_NOT_PILOT/u);
 assert.match(sql,/D013_SQL_SOURCE_DRIFTED/u);
 assert.doesNotMatch(quota,/IF v_count>=6/u);
 assert.doesNotMatch(quota,/quota_exceeded/u);
 assert.match(quota,/m\.plaintext_sha256=p_source_sha256/u);
 assert.match(quota,/m\.received_at>clock_timestamp\(\)-interval '10 minutes'/u);
 assert.match(quota,/m\.request_id IS NULL/u);
 assert.match(quota,/p\.consent_at IS NOT NULL/u);
 assert.match(quota,/WHERE message_hmac=p_message_hmac/u);
 assert.match(quota,/ON CONFLICT DO NOTHING/u);
});

test('D013: recupera inbox firmado aun sin fila de intento IA, pero solo si es único',()=>{
 assert.match(reader,/LEFT JOIN cotironda_piloto_privado\.ai_central_attempts_mvp226 a/u);
 assert.match(reader,/count\(\*\) FILTER\(WHERE a\.message_hmac IS NULL\)/u);
 assert.match(reader,/v_pending>1 OR \(v_pending=0 AND v_count>1\)/u);
 assert.match(reader,/v_pending=1 AND a\.message_hmac IS NULL/u);
 assert.match(reader,/v_pending=0 AND a\.message_hmac IS NOT NULL/u);
 assert.match(reader,/m\.received_at>clock_timestamp\(\)-interval '48 hours'/u);
 assert.match(reader,/m\.processing_state='needs_review'/u);
 assert.match(reader,/b\.participant_role='buyer'/u);
 assert.match(reader,/NOT EXISTS\(SELECT 1 FROM cotironda_piloto_privado\.requests/u);
 assert.match(reader,/NOT EXISTS\(SELECT 1 FROM\s+cotironda_piloto_privado\.v2_d013_review_recovery_receipts/u);
});

test('D013: staging exige misma fuente candidata, cita original y autorización',()=>{
 assert.match(stage,/LEFT JOIN cotironda_piloto_privado\.ai_central_attempts_mvp226 a/u);
 assert.match(stage,/COALESCE\(a\.failure_code,'sin_reserva_ia'\)/u);
 assert.match(stage,/cotironda_piloto_v2_d013_review_source_private\(\)->>'message_hmac'/u);
 assert.match(stage,/m\.plaintext_sha256=p_source_sha256/u);
 assert.match(stage,/sha256\(convert_to\(p_original_text,'UTF8'\)\)/u);
 assert.match(stage,/FOR UPDATE OF m/u);
 assert.match(stage,/cotironda_piloto_v2_shadow_prepare_d013/u);
 assert.match(stage,/m\.request_id IS NULL/u);
 assert.match(stage,/outbox_sent/u);
 assert.match(stage,/v2_d013_review_recovery_receipts/u);
 assert.match(stage,/source_hmac=m\.message_hmac/u);
 assert.doesNotMatch(stage,/cotironda_piloto_v2_auto_release_d013\(/u);
 assert.doesNotMatch(stage,/cotironda_piloto_ia_publish_mvp222\(/u);
});

test('D013: autorización y recibo privados; ninguna salida comercial',()=>{
 assert.match(sql,/original_failure_code IN \('ia_error_de_lectura',\s*'lecturas_discrepan_en_articulo','sin_reserva_ia'\)/u);
 for(const name of [
 'cotironda_piloto_ia_reserve_buyer_mvp226',
 'cotironda_piloto_v2_d013_review_source_private',
 'cotironda_piloto_v2_d013_recovery_stage_private'
 ]){
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+name,'u'));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name,'u'));
 }
 assert.doesNotMatch(active,/whapi_outbox|cron\.schedule|http_post|whapi\.cloud/u);
 assert.match(sql,/COMMIT;\s*$/u);
});

test('D013: matriz de candidatos prioriza un único no-intentado y falla con ambigüedad',()=>{
 function select(candidates){
  const pending=candidates.filter(c=>c==='sin_reserva_ia');
  const valid=candidates.filter(c=>c==='sin_reserva_ia'||c==='review_permitida');
  if(!valid.length)return 'empty';
  if(pending.length>1 || (pending.length===0&&valid.length>1))
   return 'ambiguous';
  return pending.length===1?'sin_reserva_ia':'review_permitida';
 }
 assert.equal(select(['sin_reserva_ia','review_permitida','review_permitida']),
  'sin_reserva_ia');
 assert.equal(select(['sin_reserva_ia','sin_reserva_ia']), 'ambiguous');
 assert.equal(select(['review_permitida','review_permitida']), 'ambiguous');
 assert.equal(select(['review_permitida']), 'review_permitida');
 assert.equal(select([]),'empty');
});

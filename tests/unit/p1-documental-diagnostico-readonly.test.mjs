import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const path=new URL('../../supabase/tests/preflight/p1-documentos-dos-proveedores-solo-lectura.sql',import.meta.url);
const sql=readFileSync(path,'utf8');

test('P1 preflight: read-only with no side effects',()=>{
 const statements=sql.split('\n')
  .filter(x=>!x.trimStart().startsWith('--')).join('\n');
 assert.match(statements,/^\s*WITH active_rounds AS MATERIALIZED\s*\(/u);
 assert.match(statements,/;\s*$/u);
 assert.equal((statements.match(/;/gu)||[]).length,1);
 assert.doesNotMatch(statements,
  /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE|COPY|DO|CALL|EXECUTE|PERFORM|http_post|pg_sleep|dblink)\b/iu);
 assert.doesNotMatch(statements,/auth\.users|vault\.|cron\./u);
});
test('P1 preflight: refuses to merge multiple prepared rounds',()=>{
 assert.match(sql,/r\.state='prepared' AND r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/WHERE \(SELECT n FROM round_count\)=1/u);
 assert.match(sql,/'sin_ronda_unica_no_evaluar'/u);
});
test('P1 preflight: stored PDF alone NEVER counts as delivered',()=>{
 for(const marker of [
  "m.kind IN ('document','image')",
  'a.message_hmac=m.message_hmac',
  "c.archive_state='stored'",
  "c.storage_path='media/'||c.message_hmac",
  's.inbox_request_id=r.id AND s.archive_request_id=r.id',
  "proof.source_sha256=s.content_sha256",
  "proof.association IN ('quoted_whapi_id','single_active_round'",
  'u.state IN (',
  "'ambiguous_round','not_matched','media_context_conflict'",
  "other.request_id<>r.id",
  "other_r.closes_at>=s.received_at",
  "other_i.state='prepared'",
  "'recibido_verificado'",
  "'candidato_temporal_no_atribuible'"
 ])assert(sql.includes(marker),marker);
});
test('P1 preflight: counts DISTINCT supplier, not duplicates/messages',()=>{
 assert.match(sql,/SELECT DISTINCT d\.supplier_key,m\.message_hmac/u);
 assert.match(sql,/verified AS \(\s*SELECT DISTINCT s\.supplier_key/u);
 assert.match(sql,/count\(DISTINCT supplier_key\)::integer FROM candidates/u);
 assert.match(sql,/count\(\*\)::integer FROM states WHERE state='recibido_verificado'/u);
});
test('P1 preflight: report contains only anonymous counters and boolean',()=>{
 const final=sql.slice(sql.lastIndexOf('\nSELECT CASE WHEN (SELECT n FROM round_count)=1'));
 assert(final.length>500);
 assert.doesNotMatch(final,/\bSELECT\s+(?:supplier_key|message_hmac|chat_hmac)/u);
 for(const forbidden of ['original_request','storage_path','phone','token_hash',
   'buyer_key','chat_hmac','mime','request_id','document_content','participant_key',
   'whapi_message_id','contact_sha256','ciphertext_b64']){
   assert(!new RegExp('\\bAS '+forbidden+'\\b','iu').test(final),forbidden);
 }
 for(const expected of [
  'rondas_preparadas_vigentes','proveedores_invitados',
  'despachos_aceptados','proveedores_con_candidato_temporal',
  'proveedores_con_archivo_valido_en_ventana',
  'proveedores_con_inbox_y_archivo_en_ronda',
  'proveedores_con_prueba_fuerte','proveedores_con_inbox_sin_ronda',
  'proveedores_con_archivo_sin_ronda','proveedores_con_prueba_otra_ronda',
  'proveedores_ambiguous_round_mvp237',
  'max_rondas_candidatas_en_fallo','proveedores_m291_sin_evidencia',
  'proveedores_con_reintento_registrado',
  'recibidos_verificados',
  'requiere_revision_por_conflicto','solo_candidato_temporal_no_atribuible',
  'sin_archivo_verificado','proyeccion_mvp354_instalada'
 ])assert(final.includes('AS '+expected),expected);
});
test('P1 preflight: diagnostic is NOT buyer tracking, price ranking or authorization',()=>{
 assert(!/GRANT EXECUTE|SECURITY DEFINER|CREATE OR REPLACE FUNCTION/iu.test(sql));
 assert(!/offer_price|total_amount|comparison_permitted|precios_validados/iu.test(sql));
 assert(sql.includes("to_regprocedure('public.cotironda_piloto_document_receipts_mvp354(text)')"));
});

test('P1 preflight: ambiguity is counted BEFORE a proof record exists',()=>{
 const from=sql.indexOf('blocked AS (');
 const until=sql.indexOf('verified AS (',from);
 assert(from>=0&&until>from);
 const blocked=sql.slice(from,until);
 assert.match(blocked,/JOIN candidates s ON true/u);
 assert.doesNotMatch(blocked,/JOIN with_proof s ON true/u);
 assert.match(blocked,/ai_supplier_unresolved_mvp237/u);
 assert.match(blocked,/ambiguous_round/u);
 // A verified source still requires the immutable MIME/SHA/round proof.
 const verified=sql.slice(until,sql.indexOf('states AS (',until));
 assert.match(verified,/JOIN with_proof s ON true/u);
 assert.match(verified,/ai_supplier_unresolved_mvp237/u);
});
test('P1 preflight: only fixed semantic reason codes and counters are exposed',()=>{
 assert.match(sql,/x.state='review' AND x.reason='insufficient_material_evidence'/u);
 assert.match(sql,/u.state='ambiguous_round'/u);
 assert.match(sql,/ai_supplier_correlation_retries_mvp336/u);
 // Never export arbitrary free-text failure reasons, document or source IDs.
 const final=sql.slice(sql.lastIndexOf('\nSELECT CASE WHEN (SELECT n FROM round_count)=1'));
 assert.doesNotMatch(final,/array_agg\(.*reason|SELECT .*source_hmac/iu);
});

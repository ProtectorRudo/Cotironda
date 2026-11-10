import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp256_document_retry_policy_safe.sql',import.meta.url),'utf8');
const prior=readFileSync(new URL('../../supabase/piloto/mvp128_legacy_document_recovery_queue.sql',import.meta.url),'utf8');
const functionNames=[
 'cotironda_piloto_note_document_failure_mvp127',
 'cotironda_piloto_reserve_document_retry_mvp127',
 'cotironda_piloto_next_document_retry_mvp128',
 'cotironda_piloto_system_document_trigger_mvp131'
];
test('Etapa 5: no crear otro motor de recuperación; mejorar las 4 RPC actuales',()=>{
 for(const name of functionNames){
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\(' ,'i'));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+name+'\\(' ,'i'));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\(' ,'i'));
 }
 assert.match(sql,/SECURITY DEFINER\s+set search_path=''/iu);
 assert.match(sql,/legacy_unclassified/u);
 assert.doesNotMatch(sql,/\bnet\.http_post\b|\bwhapi\.send\b|\bsecret_key\b/u);
});
test('Etapa 5: solo errores transitorios, no reintentos de fallas permanentes',()=>{
 const head=sql.slice(0,sql.indexOf('-- 1. Fallas'));
 const transient=['api_rate_limited','api_server_error','api_unavailable',
   'api_timeout','response_incomplete','legacy_unclassified'];
 const permanent=['api_unauthorized','api_credentials_missing','api_rejected',
   'response_invalid','response_too_large','schema_rejected',
   'source_review_required','quota_blocked','ai_disabled','internal_error',
   'draft_persistence_failed'];
 for(const code of transient)assert.ok(head.includes("'"+code+"'"),code);
 for(const code of permanent)assert.ok(!head.includes("'"+code+"'"),code);
});
test('Etapa 5: todos los pasos comprueban la política al reservar y seleccionar',()=>{
 const pattern=/public\.cotironda_piloto_retryable_document_error_mvp256\(/gu;
 assert.ok((sql.match(pattern)??[]).length>=6);
 assert.match(sql,/d\.next_retry_at<=clock_timestamp\(\)\s+and public\.cotironda_piloto_retryable_document_error_mvp256\(d\.reason_code\)/u);
 assert.match(sql,/and public\.cotironda_piloto_retryable_document_error_mvp256\(reason_code\)/u);
 assert.match(sql,/when not public\.cotironda_piloto_retryable_document_error_mvp256\(excluded\.reason_code\) then null/u);
 assert.match(sql,/attempt_count>=2 then null/u);
});
test('Etapa 5: conservar barreras originales de identidad, fuente y cuota',()=>{
 for(const gate of [
  'participant_role','opted_out_at','consent_at',
  "max_document_ai_per_24h",'size_bytes','content_sha256',
  "FOR UPDATE",'attempt_count<3',
 ]){
  assert.ok(sql.toLowerCase().includes(gate.toLowerCase()),gate);
 }
 assert.match(prior,/on conflict\(message_hmac\) do update/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const candidate=read('supabase/piloto/v2_d016_reintento_unico_ailin_CANDIDATE.sql');
const rollback=read('supabase/piloto/v2_d016_reintento_unico_ailin_ROLLBACK_ONLY.sql');
const ronda='facc90b9-3da9-48db-b113-563409ba9760';
const documento='78e1027a-525f-4139-a59b-e470914ca9fc';
const original='d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823';

test('D016: el cuarto intento está restringido por ronda, documento y SHA original',()=>{
 for(const id of [ronda,documento,original]){
  assert.ok(candidate.includes(id),id);
  assert.equal(candidate.split(id).length>=3,true);
 }
 for(const required of [
  "a.attempt_count=3 AND a.status='review'",
  "a.original_sha256",
  "permit.request_id=a.request_id",
  "permit.document_id=a.document_id",
  "permit.original_sha256=a.original_sha256",
  "permit.expires_at>clock_timestamp()",
  "permit.authorized_attempt=4",
  "permit.request_id=p_request_id",
  "permit.document_id=p_document_id",
  "permit.original_sha256=v_sha",
  "attempt_count+1",
  "worker_source_private",
  "v2_retry_not_exactly_one_failed_job"
 ]) assert.ok(candidate.includes(required),required);
});

test('D016: el permiso es excepcional, privado, acotado y sin reabrir fuentes ni reiniciar contadores',()=>{
 for(const required of [
  "CREATE TABLE cotironda_piloto_privado.v2_analysis_retry_permits",
  "PRIMARY KEY(request_id,document_id)",
  "attempt_count_before smallint NOT NULL CHECK(attempt_count_before=3)",
  "authorized_attempt smallint NOT NULL CHECK(authorized_attempt=4)",
  "expires_at<=granted_at+interval '90 minutes'",
  "clock_timestamp()+interval '75 minutes'",
  "ENABLE ROW LEVEL SECURITY",
  "REVOKE ALL ON TABLE",
  "FROM PUBLIC,anon,authenticated,service_role",
  "has_table_privilege('anon'",
  "has_table_privilege('authenticated'",
  "v51_individual_evidence_validation",
  "ef8fdb525af56f3fc0003ede6c72ab26ca44cc06"
 ])assert.ok(candidate.includes(required),required);
 assert.doesNotMatch(candidate,/\bUPDATE\s+cotironda_piloto_privado\.v2_original_analysis\b/iu);
 assert.doesNotMatch(candidate,/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/iu);
 assert.doesNotMatch(candidate,/https?:\/\/|whapi\.cloud|net\.http_post|storage\.objects|GRANT\s+EXECUTE\s+ON/u);
});

test('D016: aborta ante drift y no amplía el límite general de tres',()=>{
 for(const sha of [
  'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee',
  '42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65',
  '4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037',
  '3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 ])assert.ok(candidate.includes(sha),sha);
 for(const gate of [
  'v2_retry_live_rpc_drift',
  'v2_retry_anchors_not_unique',
  'v2_retry_candidate_hash_or_guard_changed',
  'v2_retry_postcheck_failed',
  'attempt_count<3',
  'attempt_count>=3'
 ]) assert.ok(candidate.includes(gate),gate);
 assert.equal((candidate.match(/v2_analysis_retry_permits/g)||[]).length>=5,true);
});

test('D016: rollback revierte exclusivamente dos RPC, pero conserva auditoría del intento',()=>{
 for(const sha of [
  'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee',
  '42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65',
  '4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037',
  '3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 ]) assert.ok(rollback.includes(sha));
 assert.doesNotMatch(rollback,/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+cotironda_piloto_privado\.v2_original_analysis/iu);
 assert.ok(rollback.includes('v2_retry_rollback_postcheck_failed'));
 assert.ok(rollback.includes('v2_retry_rollback_live_drift'));
});

test('D016: semántica de cuarto intento de un solo uso; no habilita quinto ni casos distintos',()=>{
 const permit={requestId:ronda,documentId:documento,sha:original,
  previousAttempts:3,authorizedAttempt:4,expiresAt:100};
 const eligible=(x,now=50)=>
  x.status==='review'&&x.attempts===3&&
  x.requestId===permit.requestId&&x.documentId===permit.documentId&&
  x.sha===permit.sha&&permit.authorizedAttempt===4&&permit.expiresAt>now;
 const case3={status:'review',attempts:3,requestId:ronda,documentId:documento,sha:original};
 assert.equal(eligible(case3),true);
 for(const changed of [
  {attempts:4},{attempts:2},{status:'ready'},{status:'processing'},
  {requestId:'f0000000-0000-4000-8000-000000000000'},
  {documentId:'f0000000-0000-4000-8000-000000000000'},
  {sha:'f'.repeat(64)}
 ]) assert.equal(eligible({...case3,...changed}),false);
 assert.equal(eligible(case3,101),false);
});

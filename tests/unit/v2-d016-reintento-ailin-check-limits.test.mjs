import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const fix=read('supabase/piloto/v2_d016_reintento_ailin_limites_check_CANDIDATE.sql');
const rollback=read('supabase/piloto/v2_d016_reintento_ailin_limites_check_ROLLBACK_ONLY.sql');
const req='facc90b9-3da9-48db-b113-563409ba9760';
const doc='78e1027a-525f-4139-a59b-e470914ca9fc';
const sha='d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823';

test('D016 límite de cuatro intentos solo para la fuente autorizada de Ailín',()=>{
 for(const x of [req,doc,sha,'attempt_count=4','attempt_count BETWEEN 1 AND 3'])
  assert.ok(fix.includes(x),x);
 assert.ok(fix.includes("a.attempt_count=3"));
 assert.ok(fix.includes("p.authorized_attempt=4"));
 assert.ok(fix.includes("p.expires_at>clock_timestamp()"));
 assert.ok(fix.includes('v2_retry_check_permit_or_original_missing'));
 assert.doesNotMatch(fix,/UPDATE\s+cotironda_piloto_privado\.v2_original_analysis|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/iu);
});
test('D016 hasta ocho hallazgos verificados alineados con IA y finish SQL',()=>{
 assert.ok(fix.includes("jsonb_array_length(points) BETWEEN 2 AND 8"));
 assert.ok(fix.includes("status='ready'"));
 assert.ok(fix.includes("status IN ('processing','review') AND points IS NULL"));
 assert.ok(fix.includes('v2_retry_check_constraint_drift'));
 assert.ok(fix.includes('v2_retry_check_postcheck_drift'));
});
test('D016 respeta aislamiento, funciones existentes y huellas verificadas',()=>{
 for(const x of ['4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037',
 '3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce',
 'v2_retry_check_privacy_drift',
 "has_function_privilege('anon'",
 "has_function_privilege('authenticated'",
 'relrowsecurity'])
 assert.ok(fix.includes(x),x);
 assert.doesNotMatch(fix,/GRANT\s+EXECUTE|net\.http|whapi\.cloud|CREATE\s+FUNCTION|ALTER\s+FUNCTION/iu);
});
test('D016 rollback se niega a borrar la evidencia del cuarto intento',()=>{
 assert.ok(rollback.includes('v2_retry_check_rollback_would_destroy_history'));
 assert.ok(rollback.includes('attempt_count>3'));
 assert.ok(rollback.includes('attempt_count<=3'));
 assert.doesNotMatch(rollback,/UPDATE\s+cotironda_piloto_privado|DELETE\s+FROM|TRUNCATE/iu);
});

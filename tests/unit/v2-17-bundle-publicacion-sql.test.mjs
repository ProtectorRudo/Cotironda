import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const path='supabase/piloto/v2_17_reconciliar_sql_texto_piloto_CANDIDATE.sql';

test('V2-17: bundle candidato contiene exactamente SQL revisados, sin alteraciones',()=>{
 const bundle=read(path);
 for(const source of [
  'supabase/piloto/v2_03_catalogo_respondedores_privado.sql',
  'supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql'
 ]){
  const body=read(source).trim();
  assert.ok(bundle.includes(body),'debe incrustar código exacto '+source);
  assert.equal(bundle.split(body).length,2,'SQL no duplicado '+source);
 }
 assert.ok(bundle.indexOf('v2_17_live_sql_drift_stop')<
  bundle.indexOf('BEGIN exact source'));
 assert.ok(bundle.indexOf('v2_17_postcondition_text_contract_missing')>
  bundle.lastIndexOf('END exact source'));
 assert.match(bundle,/1455d1e2ea29c3a1c651aa8a7836d9e0/u);
 assert.match(bundle,/52f28cec1c3049d797834dbca01b0145/u);
 assert.doesNotMatch(bundle,/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/mi);
 assert.doesNotMatch(bundle,/^\s*\\(?:ir|i)\b/mu);
});

test('V2-17: fail-closed ante SQL cambiada, política activa y RPC auditoría previa',()=>{
 const bundle=read(path);
 for(const phrase of [
  'v2_17_requires_postgresql_17',
  'v2_17_live_sql_drift_stop',
  'v2_17_text_already_installed_stop',
  'v2_17_policy_must_remain_off',
  'v2_17_postcondition_text_contract_missing',
  'v2_17_postcondition_policy_was_enabled',
  'v2_17_postcondition_private_audit_acl'
 ])assert.ok(bundle.includes(phrase),phrase);
 for(const role of ['anon','authenticated','service_role'])
  assert.ok(bundle.includes("has_function_privilege('"+role+"'"),role);
 assert.match(bundle,/public\.cotironda_piloto_v2_record_text_download/u);
 assert.match(bundle,/position\('authorized_text_v2'/u);
});

test('V2-17: bundle no altera webhook, nunca activa consentimiento ni registra usuario',()=>{
 const bundle=read(path);
 assert.doesNotMatch(bundle,/(?:deploy_edge_function|Deno\.serve|auth\.admin\.createUser)/u);
 assert.doesNotMatch(bundle,/\bDROP\s+(?:TABLE|FUNCTION|SCHEMA)\b/iu);
 assert.doesNotMatch(bundle,/\bTRUNCATE\b/iu);
 assert.doesNotMatch(bundle,/\bUPDATE\s+cotironda_piloto_privado\.v2_original_share_policy\b/iu);
 assert.doesNotMatch(bundle,/\bINSERT\s+INTO\s+auth\.users\b/iu);
 assert.ok(bundle.includes('ENABLED ROW LEVEL SECURITY')===false); // guard RLS uses ENABLE
 assert.match(bundle,/ENABLE ROW LEVEL SECURITY/u);
});

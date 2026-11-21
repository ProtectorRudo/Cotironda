import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const candidate=read('supabase/piloto/v2_d016_responders_quoted_lines_42703_CANDIDATE.sql');
const rollback=read('supabase/piloto/v2_d016_responders_quoted_lines_42703_ROLLBACK_ONLY.sql');
const firstSha='76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b';
const fixedSha='52b2d9f2894fc623c54140c99c78ab5ea807dd6833eb9de52c5fcfb3289aa102';

test('D016: agregamos las dos columnas que quotedItems ya referencia al SELECT interno',()=>{
 assert.match(candidate,/SELECT line_no,description_literal,quantity_literal,\s+unit_literal,unit_price_literal,line_total_literal,\s+ambiguity_literal\s+FROM cotironda_piloto_privado\.supplier_quote_lines_mvp101/u);
 assert.match(candidate,/SELECT line_no,description_literal,quantity_literal,\s+unit_literal,ambiguity_literal\s+FROM cotironda_piloto_privado\.supplier_quote_lines_mvp101/u);
 assert.match(candidate,/d016_quoted_lines_anchor_not_unique/u);
 assert.match(candidate,/replace\(old_source,target_sql,replacement_sql\)/u);
 assert.match(candidate,/pg_get_functiondef\(/u);
});

test('D016: acotado a la RPC y al SHA exacto del piloto, sin reconstruir servicios',()=>{
 for(const x of [firstSha,fixedSha,
 'cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)',
 'v2_d016_responders_private','v2_d016_original_source_private',
 'v2_original_analysis','q.source_sha256=v_source->>',
 'q.supplier_key=v_source->>','d016_quoted_lines_live_rpc_drift',
 'd016_quoted_lines_security_or_source_mismatch'])
  assert.ok(candidate.includes(x),x);
 assert.doesNotMatch(candidate,/\b(?:INSERT\s+INTO|UPDATE\s+cotironda_piloto_privado|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE)\b/iu);
 assert.doesNotMatch(candidate,/https?:\/\/|whapi\.cloud|net\.http_post|GRANT\s+EXECUTE/iu);
});

test('D016: conservar SECURITY DEFINER, search_path vacío y ACL sin acceso público',()=>{
 for(const x of [
  "has_function_privilege('anon'",
  "has_function_privilege('authenticated'",
  "has_function_privilege('service_role'",
  "pg_get_userbyid(p.proowner)='postgres'",
  "p.prosecdef AND p.provolatile='s'",
  "'search_path=\"\"'=ANY(p.proconfig)",
  'd016_quoted_lines_acl_or_hash_postcheck_failed'
 ])assert.ok(candidate.includes(x),x);
});

test('D016: rollback pinneado no toca originales, sesiones ni permisos',()=>{
 for(const x of [
  firstSha,fixedSha,
  'd016_quoted_lines_rollback_drift',
  'd016_quoted_lines_rollback_anchor_drift',
  'd016_quoted_lines_rollback_unexpected_hash',
  'd016_quoted_lines_rollback_acl_failed'
 ])assert.ok(rollback.includes(x),x);
 assert.match(rollback,/unit_literal,unit_price_literal,line_total_literal/u);
 assert.match(rollback,/unit_literal,ambiguity_literal/u);
 assert.doesNotMatch(rollback,/\bUPDATE\s+cotironda_piloto_privado|DELETE\s+FROM|DROP\s+TABLE|GRANT\s+EXECUTE/iu);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const mode=file('supabase/piloto/v2_05_shadow_prepare_activar_modo_habil.sql');
const ci=file('supabase/tests/ci/v2-05-plazo-habil-pg17.sql');
const clone=file('supabase/piloto/v2_21_d013_ruteo_v2_rpc_aislado_candidate.sql');

test('V2-22: el calendario modifica SOLO la función V2 aislada',()=>{
 assert.match(mode,/v_v2:=to_regprocedure\(\s*'public\.cotironda_piloto_v2_shadow_prepare_d013\(/u);
 assert.match(mode,/SELECT pg_get_functiondef\(v_v2\) INTO v_prev;/u);
 assert.match(mode,/v_new:=replace\(v_prev,v_old,v_new_insert\);/u);
 assert.match(mode,/EXECUTE v_new;/u);
 assert.doesNotMatch(mode,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_ia_shadow_prepare_mvp221/u);
 assert.doesNotMatch(mode,/pg_get_functiondef\(\s*'public\.cotironda_piloto_ia_shadow_prepare_mvp221/u);
 assert.match(mode,/v_original:=to_regprocedure\(\s*'public\.cotironda_piloto_ia_shadow_prepare_mvp221/u);
});

test('V2-22: ambas funciones con digest previo pinned, no degradar controles',()=>{
 for(const required of [
  'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9',
  'a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02',
  'V2-22 historical M221 has drifted',
  'V2-22 isolated D013 source differs from pinned baseline',
  'c.literal_description=v_original_catalogue',
  'c.participant_key=v_supplier',
  'lower(btrim(p.delivery_city))=lower(btrim(p_city))',
  'v_match->>\'\'rubroCatalogo\'\' NOT IN',
  'V2-22 private RPC ACL changed'
 ]) assert.ok(mode.includes(required),required);
 assert.match(mode,/has_function_privilege\('anon',v_v2,'EXECUTE'\)/u);
 assert.match(mode,/has_function_privilege\('authenticated',v_v2,'EXECUTE'\)/u);
 assert.match(mode,/has_function_privilege\('service_role',v_v2,'EXECUTE'\)/u);
 assert.match(mode,/to_regclass\('cotironda_piloto_privado\.v2_business_policy'\)/u);
 assert.match(mode,/v2_deadline\(timestamptz,text\)/u);
 assert.match(mode,/v2_business_policy policy/u);
});

test('V2-22: la política no se activa, los feriados no se inventan',()=>{
 assert.match(mode,/THEN 'business_two_days' ELSE 'legacy_calendar' END/u);
 assert.doesNotMatch(mode,/\bUPDATE\s+cotironda_piloto_privado\.v2_business_policy\b/iu);
 assert.doesNotMatch(mode,/\bINSERT\s+INTO\s+cotironda_piloto_privado\.v2_business_holidays\b/iu);
 assert.doesNotMatch(mode,/\bTRUNCATE\b|\bDROP\s+(?:FUNCTION|TABLE|SCHEMA)\b/iu);
 assert.match(mode,/No rows, messages, or policy enabled here/u);
});

test('V2-22: fixture PG17 prueba integración solo en V2 + ROLLBACK',()=>{
 const legacyPatch='\\ir ../../piloto/v2_d013_ruteo_productos_sin_filtro_rubro.sql';
 assert.ok(!ci.includes(legacyPatch),'no ejecutar parche mutador M221 en PG17');
 assert.match(ci,/\\ir \.\.\/\.\.\/piloto\/v2_21_d013_ruteo_v2_rpc_aislado_candidate\.sql/u);
 assert.match(ci,/\\ir \.\.\/\.\.\/piloto\/v2_05_plazo_dos_dias_habiles_candidate\.sql/u);
 assert.match(ci,/\\ir \.\.\/\.\.\/piloto\/v2_05_shadow_prepare_activar_modo_habil\.sql/u);
 assert.match(ci,/V2_22_LEGACY_MUTATED/u);
 assert.match(ci,/V2_22_COMBINED_CLOCK_AND_CATALOG_INVALID/u);
 assert.match(ci,/V2_22_ACL_NOT_PRIVATE/u);
 assert.match(ci,/V2_22_CALENDAR_D013_COMPOSED_IN_V2_RPC_ONLY_PASS/u);
 assert.match(ci,/V2_TWO_BUSINESS_DAYS_PG17_PASS/u);
 assert.match(ci,/ROLLBACK;/u);
 assert.match(clone,/v_target text:='FUNCTION public\.cotironda_piloto_v2_shadow_prepare_d013\('/u);
});

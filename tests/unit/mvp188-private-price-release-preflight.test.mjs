import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp188_buyer_prices_release_preflight_readonly.sql',
 import.meta.url),'utf8');
const privateRpc=readFileSync(new URL(
 '../../supabase/piloto/mvp172_private_round_inputs.sql',
 import.meta.url),'utf8');
const rollback=readFileSync(new URL(
 '../../supabase/piloto/mvp188_rollback_private_round_inputs_pilot_only.sql',
 import.meta.url),'utf8');

test('MVP188: readiness SQL es exclusivamente de SOLO LECTURA',()=>{
 const noComments=sql.replace(/^\s*--.*$/gmu,'');
 // SQL ACL checks legitimately contain the *string* 'EXECUTE'.
 // Strip quoted literals before detecting executable SQL statements.
 const executableSql=noComments.replace(/'(?:''|[^'])*'/gu,"''");
 assert.match(executableSql,/^\s*WITH\s+tokens\s+AS\s+MATERIALIZED/iu);
 assert.doesNotMatch(executableSql,/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE|COPY|EXECUTE|CALL|DO|PERFORM)\b/iu);
 assert.doesNotMatch(executableSql,/\b(?:pg_sleep|dblink|http_post|net\.http_post|pg_notify)\s*\(/iu);
 assert.match(sql,/production_or_whatsapp_authorized/iu);
 assert.match(sql,/false AS production_or_whatsapp_authorized/iu);
});

test('MVP188: token vigente exige triple autorización tracking/cobertura/economía',()=>{
 for(const call of [
  'cotironda_piloto_tracking_status_mvp091',
  'cotironda_piloto_buyer_coverage_inputs_mvp175',
  'cotironda_piloto_buyer_economy_summary_mvp180'
 ])assert.ok(sql.includes(call),call);
 assert.match(sql,/t\.revoked_at IS NULL AND t\.expires_at>clock_timestamp\(\)/);
 assert.match(sql,/t\.tracking->>'can_open'\)='true'/);
 assert.match(sql,/t\.coverage->>'state'='private_inputs'/);
 assert.match(sql,/t\.economy->>'state'='economia_observada_sin_ranking'/);
 assert.match(sql,/t\.economy->>'contacts_revealed'='false'/);
 assert.match(sql,/t\.coverage->>'contactsRevealed'='false'/);
 assert.doesNotMatch(sql,/SELECT\s+token_hash\s+FROM/iu);
});

test('MVP188: correlación de TODAS las ofertas sin inferir identidad por orden',()=>{
 assert.match(sql,/JOIN source_offers so[\s\S]+?bo\.text_value=so\.text_value/iu);
 assert.match(sql,/n_buyer=n_sources AND n_sources=n_matched/iu);
 assert.match(sql,/n_matched=n_buyer_unique/iu);
 assert.match(sql,/n_matched=n_source_unique/iu);
 assert.match(sql,/n_covered=n_sources/iu);
 assert.match(sql,/buyer_offers=4 AND source_matches=buyer_offers/iu);
 assert.match(sql,/valid_links=2 AND fully_bound_links=valid_links/iu);
});

test('MVP188: conciliación de TODAS las líneas desde fuente y auditor independiente',()=>{
 assert.match(sql,/audit_page=fact_page AND audit_row=fact_row/iu);
 assert.match(sql,/round\(unit_value\*quantity_value,2\)=total_value/iu);
 assert.match(sql,/reconciled_lines=original_lines/iu);
 assert.match(sql,/original_lines=10/iu);
 assert.match(sql,/discount_state IN/iu);
 assert.match(sql,/source_sha256=q\.source_sha256/iu);
 assert.match(sql,/e\.verifier_version=9/iu);
 assert.match(sql,/e\.state='verified'/iu);
});

test('MVP188: los RPC permanecen inaccesibles a anon/authenticated',()=>{
 assert.match(sql,/NOT has_function_privilege\('anon'/iu);
 assert.match(sql,/NOT has_function_privilege\('authenticated'/iu);
 assert.match(sql,/has_function_privilege\('service_role'/iu);
 assert.match(sql,/private_rpc_acl_ok/iu);
 assert.match(sql,/finalist_messages=0 AND finalist_plans=0/iu);
 assert.match(sql,/authenticated_accounts>0/iu);
});

test('MVP188: rollback restaura SQL original sin clave nueva, sin consentimientos alterados',()=>{
 assert.match(rollback,/create or replace function public\.cotironda_piloto_private_round_inputs_mvp172/iu);
 assert.match(rollback,/language plpgsql security definer/iu);
 assert.match(rollback,/revoke all on function public\.cotironda_piloto_private_round_inputs_mvp172/iu);
 assert.match(rollback,/grant execute on function public\.cotironda_piloto_private_round_inputs_mvp172\(uuid\)\s+to service_role/iu);
 assert.doesNotMatch(rollback,/'publicText'/u);
 assert.match(privateRpc,/'publicText',e\.public_text/iu);
 assert.match(privateRpc,/e\.public_text is not null and length\(e\.public_text\) between 1 and 16000/iu);
 for(const f of [privateRpc,rollback]){
  assert.doesNotMatch(f,/\b(?:create table|drop table|insert into|delete from|truncate table)\b/iu);
  assert.match(f,/contactsRevealed',false/iu);
  assert.match(f,/rankingAllowed',false/iu);
 }
});

test('MVP188: estado positivo es SOLO ensayo, nunca autorización de producción',()=>{
 assert.match(sql,/INSUMOS_LISTOS_PARA_SMOKE_CONTROLADO_NO_PUBLICADOS/);
 assert.match(sql,/NO_GO_REVISAR_INCONSISTENCIAS/);
 assert.match(sql,/authenticated_downloads_possible/);
 assert.doesNotMatch(sql,/URL_FIRMADA|DESCARGAR_ORIGINAL|PUBLICAR_PRODUCCION|ENVIAR_WHATSAPP/iu);
});

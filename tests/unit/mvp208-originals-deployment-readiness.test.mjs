import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const pre=read('supabase/piloto/mvp208_originals_preinstall_readonly.sql');
const post=read('supabase/piloto/mvp208_originals_postinstall_readonly.sql');
const smoke=read('supabase/tests/ci/mvp200-originals-v9-pg17-rollback.sql');
const workflow=read('.github/workflows/cotironda-piloto-originales-mvp200-pg17.yml');
const policy=read('supabase/piloto/mvp178_original_share_consent_private.sql');
const originals=read('supabase/piloto/mvp192_private_originals_catalog_and_context.sql');
const audit=read('supabase/piloto/mvp201_original_download_audit_private.sql');

const executable=text=>text.replace(/^\s*--.*$/gmu,'');
const rejectWrites=query=>{
 const cleaned=executable(query);
 // Non-mutating CTE SELECT only, not a dynamic SQL function or psql meta command.
 assert.match(cleaned,/^\s*WITH\s/u);
 assert.doesNotMatch(cleaned,/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|VACUUM|DO|CALL|COPY|EXECUTE)\b\s+(?:TABLE|INTO|FROM|ON|FUNCTION|ROLE|SCHEMA|INDEX|EXTENSION|\$)/iu);
 assert.doesNotMatch(cleaned,/\b(?:pg_read_file|pg_ls_dir|pg_stat_file|dblink_exec|http_post|net\.http_post|set_config|pg_sleep)\s*\(/iu);
 assert.doesNotMatch(cleaned,/\\ir|\\i\s|\\gexec/iu);
};

test('MVP208: preflight no modifica datos, extensiones, funciones o permisos',()=>{
 rejectWrites(pre);
 rejectWrites(post);
 assert.match(pre,/incompatible_columns/);
 assert.match(pre,/bloqueado_dependencias/);
 assert.match(pre,/bloqueado_instalacion_parcial/);
 assert.match(pre,/listo_para_instalacion_apagada_con_publicalo/);
 assert.match(pre,/package_objects_present=7/);
 assert.match(post,/politica_apagada/);
 assert.match(post,/tablas_con_rls/);
 assert.match(post,/sin_acceso_directo/);
 assert.match(post,/funciones_acl_estricto/);
 assert.match(post,/bloqueado_politica_o_permisos/);
});

test('MVP208: contratos de tablas del PILOTO revisan columnas y tipos usados en MVP191/192',()=>{
 for(const [table,cols] of Object.entries({
  requests:['id','buyer_key','state','created_at','closes_at','closed_at'],
  participants:['key','participant_role','chat_hmac','consent_at','opted_out_at'],
  participant_channels_mvp109:['contact_sha256','authenticated_message_hmac'],
  supplier_media_quotes_mvp098:['message_hmac','source_sha256','received_at'],
  supplier_evidence_mvp138:['verifier_version','ranking_allowed','source_sha256'],
  media_archive_mvp095:['storage_path','content_sha256','size_bytes'],
  offer_versions:['request_id','supplier_key','created_at'],
  invitations:['request_id','state','created_at'],
  whapi_inbox:['message_hmac','participant_key','received_at']
 })){
  for(const col of cols){
   assert.ok(pre.includes("'"+table+"','"+col+"'"),
    table+'.'+col);
  }
 }
 assert.match(pre,/'auth','sessions','not_after','timestamp with time zone'/);
 assert.match(pre,/to_regprocedure\('extensions\.digest\(text,text\)'\)/);
 assert.match(pre,/to_regprocedure\('auth\.uid\(\)'\)/);
 assert.match(pre,/to_regprocedure\('auth\.jwt\(\)'\)/);
});

test('MVP208: todos los componentes de las cuatro migraciones se cuentan antes de instalar',()=>{
 const components=[
  'original_share_policy_mvp178','original_share_consents_mvp178',
  'original_download_audit_mvp201',
  'cotironda_piloto_original_consent_preflight_mvp178',
  'cotironda_piloto_buyer_identity_mvp191',
  'cotironda_piloto_originals_private_mvp192',
  'cotironda_piloto_record_original_download_mvp201'
 ];
 for(const name of components){
  assert.ok(pre.includes(name),name);
 }
 assert.match(pre,/package_objects_present=0/);
 assert.match(pre,/package_objects_present=7/);
 assert.match(policy,/enabled boolean not null default false/);
 assert.match(policy,/activated_at timestamptz/);
 assert.match(originals,/r\.created_at>pol\.activated_at/);
 assert.match(audit,/http_response_prepared/);
});

test('MVP208: postinstall no habilita rol anónimo o autenticado a datos privados',()=>{
 for(const table of ['original_share_policy_mvp178',
  'original_share_consents_mvp178','original_download_audit_mvp201'])
   assert.ok(post.includes("'cotironda_piloto_privado."+table+"'"),table);
 for(const role of ["'anon'","'authenticated'","'service_role'"])
   assert.ok(post.includes('has_table_privilege('+role),role);
 for(const name of ['cotironda_piloto_buyer_identity_mvp191',
  'cotironda_piloto_originals_private_mvp192',
  'cotironda_piloto_record_original_download_mvp201'])
   assert.ok(post.includes(name),name);
 assert.match(post,/disabled_and_unactivated/);
 assert.match(post,/all_rls/);
 assert.match(post,/authorized_only/);
});

test('MVP208: PG17 sintético instala 178→191→192→201 y lee los dos reportes sin escribir al PILOTO',()=>{
 const filenames=[
  'mvp208_originals_preinstall_readonly.sql',
  'mvp178_original_share_consent_private.sql',
  'mvp191_buyer_verified_phone_identity_prospect_only.sql',
  'mvp192_private_originals_catalog_and_context.sql',
  'mvp201_original_download_audit_private.sql',
  'mvp208_originals_postinstall_readonly.sql'
 ];
 for(const file of filenames){
  assert.ok(smoke.includes(file),'smoke '+file);
 }
 const before=smoke.indexOf('mvp208_originals_preinstall_readonly.sql');
 const first=smoke.indexOf('mvp178_original_share_consent_private.sql');
 const last=smoke.indexOf('mvp201_original_download_audit_private.sql');
 const after=smoke.indexOf('mvp208_originals_postinstall_readonly.sql');
 assert.ok(before<first&&first<last&&last<after);
 assert.match(smoke,/originals_acl_broken/);
 assert.match(smoke,/ROLLBACK;/);
 for(const file of ['mvp208_originals_preinstall_readonly.sql',
  'mvp208_originals_postinstall_readonly.sql'])
   assert.ok(workflow.includes(file),'CI trigger '+file);
 assert.match(workflow,/postgres:17-alpine/);
});

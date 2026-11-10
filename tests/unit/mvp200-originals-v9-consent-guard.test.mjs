import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp192_private_originals_catalog_and_context.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/tests/ci/mvp200-originals-v9-pg17-rollback.sql',
 import.meta.url),'utf8');
const executable=sql.replace(/^\s*--.*$/gmu,'');

test('MVP200: catálogo privado exige verifier v9 del mismo request/supplier/hash, no solamente objeto Storage',()=>{
 for(const term of [
  'join cotironda_piloto_privado.supplier_evidence_mvp138 ev',
  'ev.message_hmac=q.message_hmac',
  'ev.request_id=q.request_id',
  'ev.supplier_key=q.supplier_key',
  'ev.source_sha256=q.source_sha256',
  'ev.verifier_version=9',
  "ev.state='verified' and ev.reason='covered'",
  'ev.ranking_allowed=false',
  'm.content_sha256=q.source_sha256',
  "m.state='stored'",
  "m.storage_path=('media/'||q.message_hmac)"
 ])assert.ok(sql.includes(term),term);
 assert.doesNotMatch(executable,/SELECT.*source_sha256.*FROM.*jsonb.*->/i);
});
test('MVP200: invitación cancelada o corrección textual posterior invalida descarga inmediatamente',()=>{
 for(const term of [
  "i.state='prepared'",
  'change_.request_id=q.request_id',
  'change_.supplier_key=q.supplier_key',
  'change_.created_at>=q.received_at',
  'change_.created_at<=r.closes_at',
  'newer.supplier_key=q.supplier_key',
  'newer.received_at>=q.received_at'
 ])assert.ok(sql.includes(term),term);
});
test('MVP200: sigue entregando TODO original consentido sin ranking ni ganar y sólo tras cierre prospectivo',()=>{
 for(const term of [
  'original_share_policy_mvp178',
  'r.created_at>pol.activated_at',
  "r.state='closed'",
  'r.closed_at>=r.closes_at',
  'original_share_consents_mvp178',
  "c.alcance='original_identificable_tras_cierre'",
  'c.revoked_at is null',
  'consent_msg.message_hmac=c.consent_message_hmac',
  "v_total>100 then return null",
  "'authorized_catalog'",
  "'authorized_original'"
 ])assert.ok(sql.includes(term),term);
 assert.doesNotMatch(executable,/ranking_allowed\s*=\s*true|supplier_keys\s*=|finalist_coverage_plans|\bLIMIT\s+2\b/iu);
});
test('MVP200: SQL PRIVADO sin acceso publico, sin URLs directas y sin identidad de proveedor en catálogo',()=>{
 assert.match(sql,/security definer\s*set search_path=''/iu);
 assert.match(sql,/revoke all on function[\s\S]*?originals_private_mvp192\([\s\S]*?from public,anon,authenticated,service_role;/iu);
 assert.match(sql,/grant execute on function[\s\S]*?originals_private_mvp192\([\s\S]*?to service_role;/iu);
 assert.doesNotMatch(executable,/createSignedUrl|publicUrl|net\.http_post|\bgrant\s+.*to\s+anon/iu);
});
test('MVP200: PG17 ejecutable contempla 2 originales, Auth, evidencia vieja, revocaciones y rollback',()=>{
 for(const term of [
  'mvp200-originals-v9-pg17-rollback',
  'v8_source_or_unconsented_original_leaked',
  'all_consenting_suppliers_not_accessible',
  'cancelled_supplier_original_still_visible',
  'modified_original_still_visible',
  'revoked_original_still_visible',
  'wrong_phone_reveals_originals',
  'expired_session_reveals_originals',
  'originals_policy_enabled_by_default',
  'prospective_verified_phone_auth_failed',
  'ROLLBACK;'
 ])if(term!=='mvp200-originals-v9-pg17-rollback')assert.ok(smoke.includes(term),term);
 assert.match(smoke,/\\ir \.\.\/\.\.\/piloto\/mvp178_original_share_consent_private\.sql/u);
 assert.match(smoke,/\\ir \.\.\/\.\.\/piloto\/mvp191_buyer_verified_phone_identity_prospect_only\.sql/u);
 assert.match(smoke,/\\ir \.\.\/\.\.\/piloto\/mvp192_private_originals_catalog_and_context\.sql/u);
});

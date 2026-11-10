import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../../supabase/piloto/mvp310_altas_multiples_admin_roles.sql');
const fixture=read('../../supabase/tests/ci/mvp310-multi-participant-pg17.sql');
const generator=read('../../scripts/piloto/mvp310-generar-fixture-pg17.mjs');
test('MVP310: removes exactly the hardcoded pilot constraints, preserves role',()=>{
 for(const key of ['participants_key_check','participants_check',
   'requests_buyer_key_check'])assert.match(sql,new RegExp('DROP CONSTRAINT '+key+';'));
 assert.match(sql,/participants_role_city_mvp310/u);
 assert.match(sql,/participant_role='buyer' AND delivery_city IS NULL/u);
 assert.match(sql,/participant_role='supplier' AND delivery_city IS NOT NULL/u);
 assert.match(sql,/verify_request_buyer_mvp310/u);
 assert.match(sql,/p.participant_role='buyer'/u);
 assert.match(sql,/p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL/u);
 assert.match(sql,/BEFORE INSERT OR UPDATE OF buyer_key/u);
});
test('MVP310: owner creates several individuals with unique source and no synthetic WhatsApp consent',()=>{
 assert.match(sql,/admin_create_participant_mvp310/u);
 assert.match(sql,/current_user<>'postgres' OR session_user<>'postgres'/u);
 assert.match(sql,/SECURITY INVOKER SET search_path=''/u);
 assert.match(sql,/admin_record_permission_mvp309/u);
 assert.match(sql,/source_reference_conflict/u);
 assert.match(sql,/already_created/u);
 assert.match(sql,/hashtextextended/u);
 assert.match(sql,/admin_auth_source_unique_mvp310/u);
 assert.match(sql,/gen_random_uuid/u);
 assert.match(sql,/whatsapp_linked',false/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado.whapi_inbox/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION\s+cotironda_piloto_privado.admin_create_participant_mvp310/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION\s+cotironda_piloto_privado.admin_create_participant_mvp310/u);
});
test('MVP310: privacy, role immutability and revocation are exercised by PostgreSQL17',()=>{
 assert.match(sql,/reject_role_mutation_mvp310/u);
 assert.match(sql,/BEFORE UPDATE OF key,participant_role/u);
 assert.match(fixture,/mvp310_supplier_impersonated_buyer/u);
 assert.match(fixture,/mvp310_role_migration_was_allowed/u);
 assert.match(fixture,/mvp310_fabricated_chat_consent/u);
 assert.match(fixture,/mvp310_revocation_ignored_by_retry/u);
 assert.match(fixture,/mvp310_buyer_contact_leak/u);
 assert.match(fixture,/mvp310_supplier_without_phone_contactable/u);
 assert.match(fixture,/mvp310_retry_not_idempotent/u);
});
test('MVP310: inherited tests and full transaction rollback',()=>{
 assert.match(generator,/mvp309-generar-fixture-pg17/u);
 assert.match(generator,/mvp310-multi-participant-pg17.sql/u);
 assert.match(generator,/ROLLBACK;/u);
 assert.match(fixture,/mvp310_operator_rpc_exposed/u);
 assert.match(fixture,/participants_key_check/u);
 assert.match(fixture,/requests_buyer_key_check/u);
});

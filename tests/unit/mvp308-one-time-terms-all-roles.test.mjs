import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../../supabase/piloto/mvp308_autorizacion_unica_todos_roles_y_privacidad.sql');
const edge=read('../../supabase/functions/cotironda-piloto-whapi/index.ts');
const operator=read('../../supabase/piloto/mvp073_onboarding_codes_operator.sql');
const fixture=read('../../supabase/tests/ci/mvp308-consent-all-roles-pg17.sql');
test('MVP308: comprador y proveedor dan una aceptación en la MISMA alta',()=>{
 assert.match(edge,/const altaConContacto=/u);
 assert.match(edge,/const altaCompradorConTerminos=/u);
 assert.match(edge,/COTI ALTA \(\[a-f0-9\]\{32\}\) ACEPTO/u);
 assert.match(edge,/COTI ALTA \(\[a-f0-9\]\{32\}\) CONTACTOS SI/u);
 assert.match(edge,/cotironda_piloto_enroll_terms_mvp308/u);
 assert.match(edge,/enrollment_terms_required/u);
 assert.doesNotMatch(edge,/db.rpc\('cotironda_piloto_enroll_whapi_v1'/u);
 assert.match(edge,/p_role:altaConContacto\?'supplier':'buyer'/u);
 assert.match(edge,/enrollment_terms_required/u);
 assert.match(operator,/COTI ALTA '\|\|c.code\|\|' ACEPTO'/u);
 assert.match(operator,/COTI ALTA '\|\|c.code\|\|' CONTACTOS SI'/u);
 assert.match(operator,/condiciones_completas_que_debe_leer_antes_de_aceptar/u);
 assert.match(operator,/enrollment_policies_mvp308/u);
});
test('MVP308: política por rol cubre uso normal, nunca el contacto del arquitecto',()=>{
 assert.match(sql,/CREATE TABLE cotironda_piloto_privado.enrollment_policies_mvp308/u);
 assert.ok(sql.includes("('buyer',1,"));
 assert.ok(sql.includes("('supplier',1,"));
 assert.match(sql,/Mis datos personales y de contacto no se revelarán automáticamente/u);
 assert.match(sql,/mi nombre comercial y número de WhatsApp/u);
 assert.match(sql,/COTI CONTACTOS NO/u);
 assert.match(sql,/INSERT INTO cotironda_piloto_privado.enrollment_terms_proof_mvp308/u);
 assert.match(sql,/sha256\(convert_to\(v_policy,'UTF8'\)\)/u);
 assert.match(sql,/source.plaintext_sha256=proof.original_sha256/u);
 assert.match(sql,/proof.policy_sha256=encode/u);
 assert.match(sql,/BEFORE UPDATE OR DELETE/gu);
});
test('MVP308: alta vinculada al rol real, código de un solo uso y evento firmado',()=>{
 assert.match(sql,/p.participant_role=p_role AND p.chat_hmac IS NULL/u);
 assert.match(sql,/ec.consumed_at IS NULL AND ec.expires_at>clock_timestamp\(\)/u);
 assert.match(sql,/p_plaintext_sha256<>v_expected/u);
 assert.match(sql,/p_role='supplier' THEN/u);
 assert.match(sql,/cotironda_piloto_supplier_enroll_contacts_mvp307/u);
 assert.match(sql,/cotironda_piloto_enroll_whapi_v1/u);
 assert.match(sql,/proof.message_hmac=p_message_hmac/u);
 assert.match(sql,/already_enrolled/u);
 assert.match(sql,/cotironda_piloto_bind_contact_mvp109/u);
 assert.match(sql,/v_status->>'participant' IS DISTINCT FROM v_participant/u);
});
test('MVP308: rol comprador no crea consentimiento de divulgar teléfono',()=>{
 const a=sql.indexOf("IF p_role='supplier' THEN");
 const b=sql.indexOf('INSERT INTO cotironda_piloto_privado.enrollment_terms_proof_mvp308',a);
 assert.ok(a>0&&b>a);
 assert.match(sql.slice(a,b),/cotironda_piloto_bind_contact_mvp109/u);
 assert.doesNotMatch(sql.slice(a,b),/contact_reveal_consents_mvp109/u);
 assert.match(sql,/buyer_contact_private/u);
 assert.match(sql,/replaced_by_all_supplier_reveal/u);
 for(const fn of [
  'cotironda_piloto_finalist_contacts_mvp109',
  'cotironda_piloto_queue_finalists_mvp110',
  'cotironda_piloto_authorize_finalist_whapi_mvp110']){
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+fn+'\\('));
 }
});
test('MVP308: servicio limitado a service_role y pruebas PG17 adversariales',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public.cotironda_piloto_enroll_terms_mvp308/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/TO service_role;/u);
 assert.doesNotMatch(sql,/TO anon;|TO authenticated;/u);
 assert.match(fixture,/mvp308_historical_buyer_falsely_accepted/u);
 assert.match(fixture,/mvp308_role_confusion_mutated_identity/u);
 assert.match(fixture,/mvp308_buyer_contact_permission_leak/u);
 assert.match(fixture,/mvp308_buyer_duplicate_accepted/u);
 assert.match(fixture,/mvp308_supplier_duplicate_accepted/u);
 assert.match(fixture,/mvp308_revoked_supplier_contact_still_visible/u);
 assert.match(fixture,/mvp308_legacy_buyer_disclosure_open/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../../supabase/piloto/mvp307_alta_proveedor_contacto_y_ruteo.sql');
const edge=read('../../supabase/functions/cotironda-piloto-whapi/index.ts');
const operator=read('../../supabase/piloto/mvp073_onboarding_codes_operator.sql');
test('MVP307: alta de proveedor tiene consentimiento explícito en UN mensaje',()=>{
 assert.match(edge,/\^COTI ALTA \(\[a-f0-9\]\{32\}\) CONTACTOS SI\$/u);
 assert.match(edge,/cotironda_piloto_enroll_terms_mvp308/u);
 assert.match(edge,/const altaCompradorConTerminos=/u);
 assert.match(edge,/p_plaintext_sha256:await sha\(body\)/u);
 assert.match(edge,/p_message_hmac:messageHash/u);
 assert.match(edge,/p_source_unix:row.timestamp/u);
 assert.match(edge,/p_contact_ciphertext_b64:vault.ciphertext/u);
 assert.match(edge,/enrollment_terms_required/u);
 assert.match(operator,/COTI ALTA '\|\|c.code\|\|' CONTACTOS SI'/u);
 assert.match(operator,/aviso_que_debe_ver_la_persona_antes_de_enviar/u);
 assert.match(operator,/COTI CONTACTOS NO/u);
});
test('MVP307: no transforma alta anterior o cotización en consentimiento nuevo',()=>{
 const i=edge.indexOf('const altaConContacto='),j=edge.indexOf('const enroll=',i);
 assert.ok(i>0&&j>i);
 assert.doesNotMatch(edge.slice(i,j),/emitirRevisionComprador|sendWhapi|\/messages\/text/u);
 assert.match(edge.slice(j,j+410),/enrollment_terms_required/u);
 assert.match(sql,/p.participant_role='supplier'/u);
 assert.match(sql,/p.chat_hmac IS NULL/u);
 assert.match(sql,/p.opted_out_at IS NULL/u);
 assert.match(sql,/code_hash=encode\(sha256/u);
 assert.match(sql,/p_plaintext_sha256/u);
 assert.match(sql,/v_expected<>p_plaintext_sha256/u);
 assert.match(sql,/v_registered->>'state'<>'enrolled'/u);
});
test('MVP307: consentimiento unificado mantiene fuente cifrada, versión y revocación',()=>{
 assert.match(sql,/supplier_enrollment_contact_proof_mvp307/u);
 assert.match(sql,/BEFORE UPDATE OR DELETE/u);
 assert.match(sql,/consent_policy_version=1/u);
 assert.match(sql,/p_nonce_b64,p_ciphertext_b64,p_plaintext_sha256,p_source_unix/u);
 assert.match(sql,/p_contact_nonce_b64,p_contact_ciphertext_b64/u);
 assert.match(sql,/approved_at IS NOT NULL AND consent.revoked_at IS NULL/u);
 assert.match(sql,/consent.approved_at>=src.received_at/u);
 assert.match(sql,/proof.accepted_text_sha256=src.plaintext_sha256/u);
 assert.match(sql,/ec.consumed_at IS NOT NULL/u);
 assert.match(sql,/COTI CONTACTOS SI/u);
});
test('MVP307: SQL sólo service_role, sin permisos anónimos de consentimiento',()=>{
 for(const fn of ['cotironda_piloto_supplier_enroll_contacts_mvp307',
  'proveedor_contactable_mvp307','proveedores_contactables_mvp306',
  'cotironda_piloto_ia_catalogo_mvp220','cotironda_piloto_all_supplier_contacts_mvp304']){
  assert.match(sql,new RegExp(fn+'\\('));
 }
 assert.match(sql,/GRANT EXECUTE ON FUNCTION\s+public.cotironda_piloto_supplier_enroll_contacts_mvp307\(/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/TO service_role;/gu);
 assert.doesNotMatch(sql,/TO anon|TO authenticated/iu);
});
test('MVP307: IA sólo recibe catálogos de proveedores autorizados cuando se activa',()=>{
 const catalogo=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_catalogo_mvp220'));
 const selector=catalogo.slice(0,catalogo.indexOf('CREATE OR REPLACE FUNCTION',50));
 assert.ok((selector.match(/proveedor_contactable_mvp307\(p.key\)/gu)||[]).length===2);
 assert.match(selector,/NOT EXISTS\(SELECT 1 FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306/u);
 assert.match(selector,/g.enabled AND g.activated_at IS NOT NULL/u);
 assert.match(sql,/WHERE NOT cotironda_piloto_privado.proveedor_contactable_mvp307\(d.supplier_key\)/u);
 assert.match(sql,/HAVING count\(DISTINCT d.supplier_key\)>1/u);
});
test('MVP307: el cierre conserva la identidad del arquitecto oculta y solo muestra contactos tras autorización',()=>{
 const after=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_all_supplier_contacts_mvp304('));
 assert.match(after,/cotironda_piloto_all_suppliers_closed_mvp303/u);
 assert.match(after,/r.state='closed'/u);
 assert.match(after,/t.revoked_at IS NULL/u);
 assert.match(after,/cotironda_piloto_privado.proveedor_contactable_mvp307\(p.key\)/u);
 assert.match(after,/buyer_phone_included',false/u);
 assert.match(after,/contacts_encrypted/u);
 assert.doesNotMatch(after,/SELECT.*buyer.phone/iu);
});

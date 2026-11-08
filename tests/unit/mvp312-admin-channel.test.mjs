import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 sellarCanalAdminMvp312,verificarYRecuperarCanalAdminMvp312
} from '../../src/server/pilot-admin-channel-mvp312.ts';
const sql=readFileSync(new URL('../../supabase/piloto/mvp312_alta_canal_administrada_cifrada.sql',import.meta.url),'utf8');
const fixture=readFileSync(new URL('../../supabase/tests/ci/mvp312-admin-encrypted-channels-pg17.sql',import.meta.url),'utf8');
const generator=readFileSync(new URL('../../scripts/piloto/mvp312-generar-fixture-pg17.mjs',import.meta.url),'utf8');
const keys=()=>({identityHmac:randomBytes(32),contactAes:randomBytes(32)});
test('MVP312: single operator input sealed with identical recipient twice, never plaintext in packet',()=>{
 const creds=keys();
 const entry={channelId:'piloto_2026',number:'5492210000000',numberConfirmation:'5492210000000'};
 const p=sellarCanalAdminMvp312(entry,creds);
 assert.equal(Object.keys(p).length,5);
 assert.match(p.p_chat_hmac,/^[a-f0-9]{64}$/u);
 assert.match(p.p_contact_sha256,/^[a-f0-9]{64}$/u);
 assert.notEqual(p.p_chat_hmac,p.p_contact_sha256);
 assert.match(p.p_nonce_b64,/^[A-Za-z0-9+/]{16}$/u);
 assert.ok(Buffer.from(p.p_ciphertext_b64,'base64').length>20);
 assert.doesNotMatch(JSON.stringify(p),/5492210000000/u);
 assert.equal(verificarYRecuperarCanalAdminMvp312(p,creds),'5492210000000@s.whatsapp.net');
 const second=sellarCanalAdminMvp312(entry,creds);
 assert.equal(second.p_chat_hmac,p.p_chat_hmac);
 assert.equal(second.p_contact_sha256,p.p_contact_sha256);
 assert.notEqual(second.p_nonce_b64,p.p_nonce_b64);
 assert.notEqual(second.p_ciphertext_b64,p.p_ciphertext_b64);
});
test('MVP312: reject mismatched operator double entry and malformed numbers',()=>{
 const cred=keys();
 for(const entry of [
  {channelId:'piloto_2026',number:'5492210000000',numberConfirmation:'5492210000001'},
  {channelId:'piloto_2026',number:'+5492210000000',numberConfirmation:'+5492210000000'},
  {channelId:'piloto_2026',number:'00000',numberConfirmation:'00000'},
  {channelId:'piloto 2026',number:'5492210000000',numberConfirmation:'5492210000000'},
 ]){
  assert.throws(()=>sellarCanalAdminMvp312(entry,cred),/mvp312_channel_invalid/u);
 }
});
test('MVP312: AES-GCM AAD and HMAC reject tampering, swapped channels and wrong key',()=>{
 const k=keys();
 const p=sellarCanalAdminMvp312({channelId:'whapi_pilot_01',
  number:'5492210000000',numberConfirmation:'5492210000000'},k);
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  {...p,p_channel_id:'another_pilot'},k),/mvp312_channel_invalid/u);
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  {...p,p_chat_hmac:'a'.repeat(64)},k),/mvp312_channel_invalid/u);
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  {...p,p_contact_sha256:'c'.repeat(64)},k),/mvp312_channel_invalid/u);
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  p,{identityHmac:randomBytes(32),contactAes:k.contactAes}),/mvp312_channel_invalid/u);
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  p,{identityHmac:k.identityHmac,contactAes:randomBytes(32)}),/mvp312_channel_invalid/u);
 const tampered=Buffer.from(p.p_ciphertext_b64,'base64');tampered[0]^=1;
 assert.throws(()=>verificarYRecuperarCanalAdminMvp312(
  {...p,p_ciphertext_b64:tampered.toString('base64')},k),/mvp312_channel_invalid/u);
 assert.throws(()=>sellarCanalAdminMvp312(
  {channelId:'whapi_pilot_01',number:'5492210000000',numberConfirmation:'5492210000000'},
  {identityHmac:k.identityHmac,contactAes:k.identityHmac}),/mvp312_channel_invalid/u);
});
test('MVP312: original HMAC and AES-GCM contact AAD matches live webhook contract',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/'cotironda\|pilot\|chat\|'\+sec.channel\+'\|'\+row.chat_id/u);
 assert.match(edge,/chatHash\+'\|cotironda-contact-v1'/u);
 assert.match(edge,/AES-GCM/u);
 assert.match(sql,/owner_vouched_phone/u);
 assert.match(sql,/whapi_inbound_proof',false/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado.whapi_inbox/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado.enrollment_terms_proof_mvp308/u);
});
test('MVP312: owner-only SQL, RLS, revocation, buyer privacy and post-close gates',()=>{
 assert.match(sql,/CREATE TABLE cotironda_piloto_privado.admin_channels_mvp312/u);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/BEFORE UPDATE OR DELETE/u);
 assert.match(sql,/current_user<>'postgres' OR session_user<>'postgres'/gu);
 assert.match(sql,/SECURITY INVOKER SET search_path=''/gu);
 assert.match(sql,/admin_authorizations_mvp309/u);
 assert.match(sql,/admin_authorization_revocations_mvp309/u);
 assert.match(sql,/p\.opted_out_at IS NULL/u);
 assert.match(sql,/source_reference=a.source_reference/u);
 assert.match(sql,/proveedor_contactable_mvp307/u);
 assert.match(sql,/cotironda_piloto_all_supplier_contacts_mvp304/u);
 assert.match(sql,/cotironda_piloto_all_suppliers_closed_mvp303/u);
 assert.match(sql,/owner_ch.ciphertext_b64/u);
 assert.match(sql,/buyer_phone_included',false/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION\s+cotironda_piloto_privado.admin_bind_channel_mvp312/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION\s+cotironda_piloto_privado.admin_bind_channel_mvp312/u);
});
test('MVP312: synthetic PG17 rollback tests duplicate phone, role, optout and no fake direct consent',()=>{
 assert.match(generator,/mvp311-generar-fixture-pg17/u);
 assert.match(generator,/mvp312-admin-encrypted-channels-pg17.sql/u);
 assert.match(generator,/ROLLBACK;/u);
 for(const token of ['mvp312_admin_function_exposed','mvp312_fake_buyer_whapi_evidence',
  'mvp312_owner_vouched_supplier_not_eligible','mvp312_duplicate_number_accepted',
  'mvp312_atomic_rollback_failed','mvp312_revoked_supplier_contactable',
  'mvp312_buyer_legacy_disclosure']){
  assert.ok(fixture.includes(token),token);
 }
});

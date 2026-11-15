import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d016_autorizaciones_previas_declaradas_CANDIDATE.sql',
 import.meta.url),'utf8');
const round='665759f0-251b-4a2b-afb4-d763612366f7';

test('D016: alta previa atestiguada por dueño, no WhatsApp inventado ni permiso genérico',()=>{
 assert.ok(sql.includes(round));
 assert.ok(sql.includes("'corralon_ailin'"));
 assert.ok(sql.includes("'corralon_nahuel'"));
 assert.ok(sql.includes('declaracion_responsable_en_conversacion'));
 assert.ok(sql.includes('declaration_sha256'));
 assert.ok(sql.includes('recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()'));
 assert.doesNotMatch(sql,/INSERT INTO[^;]*v2_supplier_original_consents/iu);
 assert.doesNotMatch(sql,/INSERT INTO[^;]*whapi_inbox/iu);
 assert.doesNotMatch(sql,/SET consent_at\s*=/iu);
});
test('D016: mantiene las validaciones exactas de las dos funciones existentes',()=>{
 for(const [name,hash] of [
  ['cotironda_piloto_v2_d016_responders_private','ceec899b38d8df2303407196775d1505'],
  ['cotironda_piloto_v2_d016_original_source_private','3ed5b9407829f2ad53ba321aee096ef5']
 ]){
  assert.ok(sql.includes(name),name);
  assert.ok(sql.includes(hash),name+' drift guard');
 }
 assert.match(sql,/c\.accepted_at<=p_invited_at/u);
 assert.match(sql,/c\.accepted_at>=bp\.activated_at/u);
 assert.match(sql,/AND p\.consent_at<=p_invited_at/u);
 assert.match(sql,/p\.opted_out_at IS NULL/u);
 assert.match(sql,/WHERE revoked\.supplier_key=p_supplier_key AND revoked\.revoked_at IS NOT NULL/u);
 assert.match(sql,/WHERE opt\.supplier_key=p_supplier_key/u);
});
test('D016: toda divulgación depende de sesión, ronda y política explícita',()=>{
 assert.match(sql,/v2_original_share_policy WHERE singleton=true AND enabled=true/u);
 assert.match(sql,/v2_d016_effective_original_consent_private\(supplier\.key,r\.id,supplier\.chat_hmac,inv\.created_at\)/u);
 assert.match(sql,/v2_d016_effective_original_consent_private\(supplier\.key,link\.request_id,supplier\.chat_hmac,inv\.created_at\)/u);
 assert.match(sql,/v2_d016_effective_original_consent_private\(link\.supplier_key,link\.request_id,m\.chat_hmac,inv\.created_at\)/u);
 assert.match(sql,/recorded_at<=clock_timestamp\(\)/u);
});
test('D016: constancia privada, inmutable y revocable',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/REVOKE ALL ON cotironda_piloto_privado\.v2_d016_owner_original_attestations FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION cotironda_piloto_privado\.v2_d016_effective_original_consent_private/u);
 assert.match(sql,/CREATE TRIGGER v2_d016_owner_attestation_immutable/u);
 assert.match(sql,/OLD\.revoked_at IS NOT NULL OR NEW\.revoked_at IS NULL/u);
 assert.match(sql,/SET revoked_at=clock_timestamp\(\)/u);
 assert.doesNotMatch(sql,/GRANT (?:ALL|SELECT) ON cotironda_piloto_privado\.v2_d016_owner_original_attestations TO (?:PUBLIC|anon|authenticated)/u);
});

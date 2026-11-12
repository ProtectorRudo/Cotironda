import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluarDescargaOriginalMvp161} from '../../src/domain/descarga-originales-mvp161.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const policy=readFileSync(resolve(root,'supabase/piloto/mvp362_originales_alta_consentimiento_off.sql'),'utf8');
const catalog=readFileSync(resolve(root,'supabase/piloto/mvp360_originals_from_verified_source_not_parser.sql'),'utf8');
const fixture=readFileSync(resolve(root,'supabase/tests/ci/mvp362-onboarding-consent-pg17.sql'),'utf8');
const start=1780000000000,day=86400000,now=start+10*day;
const rid='11111111-1111-4111-8111-111111111111';
const user='33333333-3333-4333-8333-333333333333';
const base={
 ahoraMs:now,politicaDesdeMs:start-3*day,
 ronda:{id:rid,compradorId:user,empresaId:'buyer_1',
  estado:'closed',creadaMs:start,venceMs:start+5*day,cerradaMs:start+6*day},
 sesion:{autenticada:true,rol:'buyer',usuarioId:user,empresaId:'buyer_1',
  venceMs:now+day,revocadaMs:null},
 invitacion:{rondaId:rid,proveedorId:'supplier_1',enviadaMs:start+day},
 consentimiento:{rondaId:rid,proveedorId:'supplier_1',
  alcance:'original_identificable_tras_cierre',
  version:'cotironda-originales-alta-v1',
  aceptadoMs:start-day,revocadoMs:null},
 archivo:{rondaId:rid,proveedorId:'supplier_1',mensajeHmac:'a'.repeat(64),
  bucket:'cotironda-piloto-originals',ruta:'media/'+'a'.repeat(64),
  mime:'application/pdf',bytes:10000,sha256:'d'.repeat(64),
  recibidoMs:start+2*day,vigente:true,almacenado:true},
 prueba:{rondaId:rid,proveedorId:'supplier_1',sha256:'d'.repeat(64),
  verificada:true,revisionVigente:true}
};
function run(patch={}) {
 return evaluarDescargaOriginalMvp161({
  ...base,...patch,
  consentimiento:{...base.consentimiento,...patch.consentimiento},
  ronda:{...base.ronda,...patch.ronda},
  sesion:{...base.sesion,...patch.sesion},
  archivo:{...base.archivo,...patch.archivo}
 });
}
test('MVP362: consent accepted ONCE before future round can authorize original',()=>{
 assert.deepEqual(run(),{permitido:true,motivo:'autorizado'});
 assert.deepEqual(run({consentimiento:{
  version:'cotironda-originales-v1',aceptadoMs:start+day/2
 }}),{permitido:true,motivo:'autorizado'});
});
test('MVP362: no retroactive consent, no general participation as disclosure',()=>{
 const cases=[
  {consentimiento:{version:'cotironda-originales-v1',aceptadoMs:start-day}},
  {consentimiento:{version:'cotironda-originales-alta-v1',aceptadoMs:start+day/2}},
  {consentimiento:{version:'some_participation_general_version'}},
  {consentimiento:{aceptadoMs:start-4*day}},
  {consentimiento:{aceptadoMs:start+2*day}},
  {consentimiento:{revocadoMs:now-day}},
  {politicaDesdeMs:start+day/2},
  {ronda:{estado:'prepared'}},
  {sesion:{autenticada:false}},
  {archivo:{sourceSha256:'123'}}
 ];
 for(const c of cases) {
  const x=run(c);
  assert.equal(x.permitido,false,JSON.stringify(c));
 }
});
test('MVP362: consent ledger starts OFF, never auto-authorizes old suppliers',()=>{
 assert.match(policy,/enabled boolean NOT NULL DEFAULT false/u);
 assert.doesNotMatch(policy,/INSERT INTO cotironda_piloto_privado\.original_terms_policy_mvp362/iu);
 assert.match(policy,/approved_at IS NOT NULL AND activated_at IS NOT NULL/u);
 assert.match(policy,/terms_sha256 text NOT NULL CHECK/u);
 assert.match(policy,/t\\.terms_sha256=encode\\(extensions\\.digest\\(/u);
 assert.match(policy,/msg\.plaintext_sha256=o\.ack_plaintext_sha256/u);
 assert.match(policy,/o\.recorded_at<=a\.created_at/u);
 assert.match(policy,/o\.accepted_at<a\.created_at/u);
 assert.match(policy,/o\.accepted_at>=a\.policy_activated_at/u);
 assert.match(policy,/msg\.request_id IS NULL/u);
 assert.match(policy,/msg\.kind='text'/u);
 assert.match(policy,/supplier_original_revocations_mvp362/u);
 assert.match(policy,/original_share_consents_mvp178 rev_c/u);
 assert.match(policy,/REVOKE ALL ON FUNCTION\s+cotironda_piloto_privado\.original_effective_consent_mvp362/u);
 assert.match(policy,/TO service_role/u);
});
test('MVP362: same private gate powers preflight and authorized catalog',()=>{
 assert.match(policy,/CREATE OR REPLACE FUNCTION\s+public\.cotironda_piloto_original_consent_preflight_mvp178/u);
 assert.match(policy,/original_effective_consent_mvp362\(\s+p_request_id,p_supplier_key\)/u);
 assert.match(catalog,/join lateral cotironda_piloto_privado\.original_effective_consent_mvp362\(/iu);
 assert.match(catalog,/'version',v_rec\.consent_version/u);
 assert.doesNotMatch(catalog,/join cotironda_piloto_privado\.original_share_consents_mvp178 c/iu);
 assert.match(catalog,/from auth\.users u/iu);
 assert.match(catalog,/m\.content_sha256 AS source_sha256/u);
});
test('MVP362: fixture covers onboarding/legacy, terms hash, revocation and rollback',()=>{
 for(const c of [
  'mvp362_absent_acceptance_opened',
  'mvp362_acl_exposed',
  'mvp362_off_terms_policy_opened',
  'mvp362_valid_onboarding_not_accepted',
  'mvp362_onboarding_catalog_missing',
  'mvp362_onboarding_auth_contract_wrong',
  'mvp362_wrong_terms_sha_opened',
  'mvp362_wrong_affirmative_sha_opened',
  'mvp362_retrospective_recording_opened',
  'mvp362_revoked_onboarding_opened',
  'mvp362_revoked_catalog_opened',
  'mvp362_specific_withdrawal_ignored',
  'ROLLBACK;'
 ])assert(fixture.includes(c),c);
});

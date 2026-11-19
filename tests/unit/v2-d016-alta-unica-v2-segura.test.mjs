import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overlayAltaUnicaWhapiV86,WHAPI_LIVE_V86_BUNDLE_SHA,
 WHAPI_LIVE_V86_FILES,WHAPI_LIVE_V86_INDEX_LENGTH}
 from '../../scripts/piloto/v2-d016-alta-unica-whapi-v86-overlay.mjs';

const src=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const sql=src('supabase/piloto/v2_d016_onboarding_unico_originales_prospectivo_CANDIDATE.sql');
const consent=src('supabase/piloto/v2_d016_reuse_owner_consent_same_buyer_CANDIDATE.sql');
const uix=src('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');
const commercial=src('src/server/v2-d016-resumen-comercial.ts');
const d016=src('apps/portal/lib/piloto-v2-d016-http.ts');
const webhook=src('supabase/functions/cotironda-piloto-whapi/index.ts');

test('Alta V2: una sola aceptación de términos explícitos y prospectivos',()=>{
 assert.match(sql,/v_version smallint:=2/u);
 assert.match(sql,/CONTACTOS SI ORIGINALES SI/u);
 assert.match(webhook,/\^COTI ALTA \(\[a-f0-9\]\{32\}\) CONTACTOS SI\$/u);
 assert.match(sql,/presupuesto ORIGINAL íntegro e identificado/u);
 assert.match(sql,/EXCLUSIVAMENTE al comprador destinatario/u);
 assert.match(sql,/próximas rondas sin pedir confirmación por presupuesto/u);
 assert.match(sql,/NO convierte registros antiguos en permisos nuevos/u);
 assert.match(sql,/enrollment_policies_mvp308_version_check CHECK \(version IN \(1,2\)\)/u);
 assert.match(sql,/enrollment_terms_proof_mvp308_policy_version_check CHECK \(policy_version IN \(1,2\)\)/u);
 assert.match(sql,/role,version,policy_text/u);
 assert.match(sql,/\('buyer',2,/u);
 assert.match(sql,/\('supplier',2,/u);
});
test('Alta V2: consentimiento original sólo en rama proveedor con WhatsApp original y SHA',()=>{
 assert.match(sql,/IF p_role='supplier' THEN/u);
 assert.match(sql,/cotironda_piloto_supplier_enroll_contacts_mvp307/u);
 assert.match(sql,/IF v_status->>'state'<>'enrolled_with_contact'/u);
 assert.match(sql,/INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents/u);
 assert.match(sql,/m\.message_hmac=p_message_hmac/u);
 assert.match(sql,/m\.chat_hmac=p_chat_hmac/u);
 assert.match(sql,/m\.participant_key=v_participant/u);
 assert.match(sql,/m\.plaintext_sha256=v_expected/u);
 assert.match(sql,/m\.received_at/u);
 assert.match(sql,/v_contact_version smallint:=1/u);
 assert.match(sql,/consent_policy_version' IS DISTINCT FROM '2'/u);
 assert.match(sql,/mvp308_v2_original_enrollment_evidence_missing/u);
 assert.match(sql,/enrollment_terms_proof_mvp308/u);
 assert.doesNotMatch(sql,/INSERT INTO cotironda_piloto_privado\.v2_d016_owner_original_attestations/u);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.participants/u);
 assert.doesNotMatch(sql,/GRANT EXECUTE.+(?:anon|authenticated|PUBLIC)/u);
});
test('Los consentimientos antiguos NO autorizan originales de otra empresa ni se retrodata',()=>{
 assert.match(consent,/att_round\.buyer_key=current_round\.buyer_key/u);
 assert.match(consent,/current_round\.created_at>att\.recorded_at/u);
 assert.match(consent,/att\.revoked_at IS NULL/u);
 assert.match(consent,/v2_d016_original_notice_revocations/u);
 assert.match(consent,/v2_d016_supplier_original_optout_events/u);
});
test('La pantalla WhatsApp reutiliza reintento seguro y no pide confirmaciones por presupuesto',()=>{
 assert.match(uix,/seleccionarAnalisisPendientesV2/u);
 assert.match(uix,/registrarIntentosAnalisisV2/u);
 assert.match(uix,/historialAnalisis\.current\.clear\(\)/u);
 assert.doesNotMatch(uix,/startedAnalyses/u);
 assert.match(uix,/credentials:'same-origin'/u);
 assert.doesNotMatch(uix,/confirmarCotizacion|CONTACTOS SI|COTI ORIGINALES SI/u);
 assert.match(d016,/cotironda_piloto_v2_d021_responders_commercial_private/u);
 const overlay=readFileSync(new URL(
  '../../supabase/piloto/v2_d021_texto_comercial_universal_CANDIDATE.sql',
  import.meta.url),'utf8');
 assert.match(overlay,/cotironda_piloto_v2_d016_responders_with_analysis_private/u);
 assert.match(commercial,/totalDeclarado/u);
 assert.match(commercial,/cobertura/u);
});

test('Overlay del webhook v86 conserva paquete LIVE y cambia SOLO alta prospectiva',()=>{
 const old='?/^COTI ALTA ([a-f0-9]{32}) CONTACTOS SI$/u.exec(body):null;';
 const newer='?/^COTI ALTA ([a-f0-9]{32}) CONTACTOS SI ORIGINALES SI$/u.exec(body):null;';
 const required="db.rpc('cotironda_piloto_enroll_terms_mvp308'";
 const ack="if(!['enrolled_with_terms','already_enrolled']";
 const anchor=[old,required,ack].join('\n');
 const source=anchor+'x'.repeat(WHAPI_LIVE_V86_INDEX_LENGTH-anchor.length);
 const ctx={source,bundleSha:WHAPI_LIVE_V86_BUNDLE_SHA,
  files:WHAPI_LIVE_V86_FILES,version:86};
 const patched=overlayAltaUnicaWhapiV86(ctx);
 assert.equal(patched,source.replace(old,newer));
 assert.equal(patched.split(newer).length,2);
 for(const changes of [
  {bundleSha:'f'.repeat(64)},
  {files:70},{version:85},{source:'not-live'},
  {source:source.replace(old,'no matching phrase').padEnd(WHAPI_LIVE_V86_INDEX_LENGTH,'x')}
 ]){
  assert.throws(()=>overlayAltaUnicaWhapiV86({...ctx,...changes}));
 }
});

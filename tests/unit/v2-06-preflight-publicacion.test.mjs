import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {auditarPublicacionV2}
 from '../../scripts/piloto/v2-release-readiness.mjs';

const observed=JSON.parse(readFileSync(new URL(
 '../../scripts/piloto/observaciones/v2-readiness-piloto-20261112.json',import.meta.url
),'utf8'));
const postrelease=JSON.parse(readFileSync(new URL(
 '../../scripts/piloto/observaciones/v2-readiness-piloto-postrelease-20261112.json',import.meta.url
),'utf8'));
const copy=(x)=>structuredClone(x);

test('Preflight: fotografía PILOTO 12/11 realmente BLOQUEADA en ambos niveles',()=>{
 const first=auditarPublicacionV2(observed);
 assert.equal(first.result,'BLOCKED');
 assert.equal(first.can_publish,false);
 const codes=new Set(first.blockers.map(x=>x.code));
 for(const code of ['comprador_auth','sms_otp_validado','consentimiento_prospectivo',
  'asociacion_original_fuerte','politica_original_activa',
  'lector_pdf_privado','variables_preview','build_sha_fijado',
  'sin_produccion','smoke_privacidad']){
   assert.equal(codes.has(code),true,code);
 }
 assert.equal(codes.has('whapi_baseline_preservado'),false);
 assert.equal(codes.has('bucket_original_privado'),false);
 const full=auditarPublicacionV2(observed,'piloto_completo');
 assert.equal(full.result,'BLOCKED');
 assert.ok(full.blockers.length>first.blockers.length);
});
function readySnapshot(){
 const s=copy(observed);
 s.supabase.auth_users=1;
 s.supabase.v2_original_share_policy_enabled=true;
 s.supabase.rpcs=[
  'cotironda_piloto_v2_quoted_id_for_reference',
  'cotironda_piloto_v2_quoted_id_for_media_reference',
  'cotironda_piloto_v2_responders_private',
  'cotironda_piloto_v2_original_source_private',
  'cotironda_piloto_v2_record_download',
  'cotironda_piloto_v2_analysis_claim_private',
  'cotironda_piloto_v2_analysis_finish_private',
  'cotironda_piloto_v2_responders_with_analysis_private',
  'cotironda_piloto_ia_shadow_prepare_mvp221'
 ];
 s.supabase.tables=[
  'v2_original_share_policy','v2_supplier_original_consents',
  'v2_original_download_audit','v2_original_analysis',
  'v2_business_policy','v2_business_calendar','v2_business_holidays'
 ];
 s.consent={suppliers_accepted:2,prospectively_verified:true};
 s.proof={strong_originals:2,originals_verified:true,
  buyer_browser_verified:true,phone_sms_verified:true,
  business_calendar_approved:true,
  deadline_real_verified:true,auto_close_worker_verified:true,
  product_catalog_routing_verified:true,
  two_distinct_supplier_files_verified:true,
  whatsapp_e2e_verified:true,final_analysis_verified:true};
 s.edge.private_pdf_reader={status:'ACTIVE',verify_jwt:false,
  secret_configured_in_both_services:true};
 s.vercel.preview_env_names=[
  'NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL',
  'NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY',
  'COTIRONDA_PILOT_SUPABASE_URL',
  'COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY',
  'COTIRONDA_PILOT_SUPABASE_SECRET_KEY',
  'COTIRONDA_PILOT_V2_RESPONDERS_ENABLED',
  'COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA',
  'COTIRONDA_PILOT_V2_ANALYSIS_ENABLED',
  'COTIRONDA_PILOT_OPENAI_API_KEY',
  'COTIRONDA_PILOT_V2_PDF_ENABLED',
  'COTIRONDA_PILOT_V2_PDF_SHARED_SECRET'
 ];
 s.vercel.git_linked=true;
 s.vercel.git_org='ProtectorRudo';
 s.vercel.git_repo='Cotironda';
 s.vercel.deployment_quota_available=true;
 s.vercel.preview_sha='a'.repeat(40);
 s.vercel.release_sha='a'.repeat(40);
 s.vercel.target='preview';
 return s;
}
test('Postrelease: 9 RPC privadas y 4 tablas realmente instaladas no equivalen a portal V2',()=>{
 const r=auditarPublicacionV2(postrelease);
 assert.equal(r.result,'BLOCKED');
 assert.equal(r.can_publish,false);
 assert.equal(r.checked.filter(x=>x.code.startsWith('rpc_')&&!x.ok).length,0);
 assert.equal(r.checked.filter(x=>x.code.startsWith('table_')&&!x.ok).length,0);
 assert.ok(r.checked.find(x=>x.code==='whapi_baseline_preservado')?.ok);
 assert.ok(r.checked.find(x=>x.code==='portal_preview_protegida')?.ok);
 const blockers=r.blockers.map(x=>x.code);
 for(const code of ['portal_git_correcto','vercel_cuota','comprador_auth',
 'sms_otp_validado','consentimiento_prospectivo','politica_original_activa',
 'lector_pdf_privado','variables_preview','build_sha_fijado']){
  assert.ok(blockers.includes(code),code);
 }
 assert.equal(postrelease.supabase.auth_users,0);
 assert.equal(postrelease.supabase.historical_rounds,7);
 assert.equal(postrelease.proof.eligible_whatsapp_buyers_verified_by_private_rpc,1);
});
test('Vercel no usa otro proyecto enlazado ni salta el límite de Hobby',()=>{
 const a=readySnapshot();
 a.vercel.git_linked=false;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='portal_git_correcto'));
 a.vercel.git_linked=true;
 a.vercel.git_org='ProtectorRudo';
 a.vercel.git_repo='OtroProyecto';
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='portal_git_correcto'));
 a.vercel.git_repo='Cotironda';
 a.vercel.deployment_quota_available=false;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='vercel_cuota'));
});
test('Preflight: Auth user sin SMS real no equivale a portal accesible',()=>{
 const a=readySnapshot();
 a.proof.phone_sms_verified=false;
 const r=auditarPublicacionV2(a);
 assert.equal(r.result,'BLOCKED');
 assert.ok(r.blockers.some(x=>x.code==='sms_otp_validado'));
});
test('Preflight: caso hipotético completo supera el chequeo sin autorizar deploy',()=>{
 const s=readySnapshot();
 const first=auditarPublicacionV2(s);
 assert.deepEqual([first.result,first.passed,first.total,first.can_publish],
  ['PREFLIGHT_PASS_REQUIRES_PUBLICALO',first.total,first.total,false]);
 const full=auditarPublicacionV2(s,'piloto_completo');
 assert.equal(full.result,'PREFLIGHT_PASS_REQUIRES_PUBLICALO');
 assert.equal(full.blockers.length,0);
 assert.equal(full.can_publish,false);
});
test('Preflight: una identidad de empresa o secreto de frontend no se puede inferir',()=>{
 const a=readySnapshot();
 a.supabase.auth_users=0;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='comprador_auth'));
 a.supabase.auth_users=1;
 a.vercel.preview_env_names=a.vercel.preview_env_names.filter(x=>
  x!=='COTIRONDA_PILOT_SUPABASE_SECRET_KEY');
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='variables_preview'));
});
test('Preflight: webhook v77 o SHA distinto bloquea por drift del piloto',()=>{
 const a=readySnapshot();
 a.edge.whapi.version=77;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='whapi_baseline_preservado'));
 a.edge.whapi.version=76;
 a.edge.whapi.sha256='0'.repeat(64);
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='whapi_baseline_preservado'));
});
test('Preflight: build preview y release SHA diferentes bloquean, aun si READY',()=>{
 const a=readySnapshot();
 a.vercel.preview_sha='b'.repeat(40);
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='build_sha_fijado'));
 a.vercel.preview_sha='a'.repeat(40);a.vercel.target='production';
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='sin_produccion'));
});
test('Preflight: un presupuesto histórico con asociación semántica no cuenta',()=>{
 const a=readySnapshot();
 a.proof.strong_originals=0;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='asociacion_original_fuerte'));
 a.proof.strong_originals=1;a.proof.originals_verified=false;
 assert.ok(auditarPublicacionV2(a).blockers.some(x=>x.code==='asociacion_original_fuerte'));
});
test('Preflight: guía en portal no significa cierre 2 hábiles o informe general',()=>{
 const a=readySnapshot();
 a.proof.business_calendar_approved=false;
 a.proof.whatsapp_e2e_verified=false;
 a.proof.final_analysis_verified=false;
 assert.equal(auditarPublicacionV2(a).result,'PREFLIGHT_PASS_REQUIRES_PUBLICALO');
 const full=auditarPublicacionV2(a,'piloto_completo');
 for(const code of ['reloj_dos_dias','whatsapp_real','analisis_general']){
  assert.ok(full.blockers.some(x=>x.code===code));
 }
});
test('Preflight: datos ausentes fallan cerrado, y fase desconocida arroja error',()=>{
 const empty=auditarPublicacionV2({});
 assert.equal(empty.result,'BLOCKED');
 assert.equal(empty.can_publish,false);
 assert.throws(()=>auditarPublicacionV2({},'produccion'),/fase_desconocida/);
});

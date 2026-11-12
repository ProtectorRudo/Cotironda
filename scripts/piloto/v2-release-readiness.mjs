/**
 * Cotironda V2 — RELEASE READINESS AUDIT ONLY.
 * No Supabase/Vercel/WhatsApp/OpenAI network requests, no writes, no secrets.
 * Run on a current, non-PII observation supplied by READ-ONLY connectors.
 * Passing this audit NEVER authorizes deployment or removes E2E requirements.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT='ilggkalaafhtiysyzlmg';
const WHAPI_V76='656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e';
const SHA40=/^[0-9a-f]{40}$/u;
const REQUIRED_RPCS=[
 'cotironda_piloto_v2_quoted_id_for_reference',
 'cotironda_piloto_v2_quoted_id_for_media_reference',
 'cotironda_piloto_v2_responders_private',
 'cotironda_piloto_v2_original_source_private',
 'cotironda_piloto_v2_record_download',
 'cotironda_piloto_v2_analysis_claim_private',
 'cotironda_piloto_v2_analysis_finish_private',
 'cotironda_piloto_v2_responders_with_analysis_private'
];
const REQUIRED_TABLES=[
 'v2_original_share_policy','v2_supplier_original_consents',
 'v2_original_download_audit','v2_original_analysis'
];
const REQUIRED_PREVIEW_ENV=[
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
const REQUIRED_FULL_TABLES=['v2_business_policy',
 'v2_business_calendar','v2_business_holidays'];
const FULL_RPCS=['cotironda_piloto_ia_shadow_prepare_mvp221'];
const check=(code,label,pass)=>Object.freeze({code,label,ok:pass===true});
const isNumber=(n)=>Number.isSafeInteger(n)&&n>=0;
const has=(arr,v)=>Array.isArray(arr)&&arr.includes(v);
const keys=(arr,names)=>Array.isArray(arr)&&names.every(v=>arr.includes(v));
const instance=(v)=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const date=(v)=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u.test(v)&&
 Number.isFinite(Date.parse(v));
const failSafe=(snapshot)=>instance(snapshot);
export function auditarPublicacionV2(input,phase='primer_original'){
 const data=failSafe(input);
 const sup=instance(data.supabase);
 const ver=instance(data.vercel);
 const edge=instance(data.edge);
 const consent=instance(data.consent);
 const proof=instance(data.proof);
 const stages=[];
 const add=(code,label,yes)=>stages.push(check(code,label,yes));
 if(!['primer_original','piloto_completo'].includes(phase))
  throw Error('fase_desconocida');
 add('observacion_con_fecha','Snapshot no anónimo fechado',
  date(data.observed_at));
 add('proyecto_supabase','Proyecto PILOTO correcto',
  sup.project_ref===PROJECT);
 add('postgres_17','PostgreSQL 17 en PILOTO',
  typeof sup.pg_version==='string'&&sup.pg_version.startsWith('17.'));
 add('bucket_original_privado','Bucket original privado y limitado a 8 MiB',
  sup.bucket_private===true&&sup.bucket_limit_bytes===8388608);
 add('comprador_auth','Comprador autenticado realmente registrado',
  isNumber(sup.auth_users)&&sup.auth_users>=1);
 add('consentimiento_prospectivo','Consentimiento V2 real por proveedor',
  isNumber(consent.suppliers_accepted)&&consent.suppliers_accepted>=1&&
  consent.prospectively_verified===true);
 add('asociacion_original_fuerte','Al menos un original vinculado con evidencia fuerte',
  isNumber(proof.strong_originals)&&proof.strong_originals>=1&&
  proof.originals_verified===true);
 add('politica_original_activa','Política V2 consentida y activada (no inferida)',
  sup.v2_original_share_policy_enabled===true);
 for(const name of REQUIRED_RPCS){
  add('rpc_'+name,'Función segura instalada: '+name,has(sup.rpcs,name));
 }
 for(const name of REQUIRED_TABLES){
  add('table_'+name,'Tabla privada instalada: '+name,has(sup.tables,name));
 }
 add('whapi_baseline_preservado','Webhook v76 coincide con base auditada',
  edge.whapi?.version===76&&edge.whapi?.sha256===WHAPI_V76);
 add('lector_pdf_privado','PDF Edge privada activa en PILOTO',
  edge.private_pdf_reader?.status==='ACTIVE'&&
  edge.private_pdf_reader?.verify_jwt===false&&
  edge.private_pdf_reader?.secret_configured_in_both_services===true);
 add('portal_next_unico','Proyecto Vercel Next.js específico',
  ver.project==='cotironda-portal-dev'&&ver.framework==='nextjs');
 add('portal_preview_protegida','Preview Vercel protegida',
  ver.preview_protected===true);
 add('variables_preview','Todas las variables necesarias configuradas (NOMBRES solamente)',
  keys(ver.preview_env_names,REQUIRED_PREVIEW_ENV));
 add('build_sha_fijado','Build Preview listo y vinculado a un único SHA aprobado',
  ver.preview_state==='READY'&&
  typeof ver.preview_sha==='string'&&SHA40.test(ver.preview_sha)&&
  ver.preview_sha===ver.release_sha);
 add('sin_produccion','El objetivo es sólo PREVIEW PILOTO',
  ver.target==='preview');
 add('smoke_privacidad','Prueba real navegador de acceso/aislamiento autorizada',
  proof.buyer_browser_verified===true);
 if(phase==='piloto_completo'){
  for(const name of REQUIRED_FULL_TABLES){
   add('full_table_'+name,'Tabla del reloj: '+name,has(sup.tables,name));
  }
  for(const name of FULL_RPCS){
   add('full_rpc_'+name,'Preparador SQL de rondas identificado',
    has(sup.rpcs,name));
  }
  add('reloj_dos_dias','Cierre 2 días hábiles comprobado para la zona',
   proof.business_calendar_approved===true&&
   proof.deadline_real_verified===true&&
   proof.auto_close_worker_verified===true);
  add('ruteo_d013','Ruteo por productos, no por rubros, E2E real',
   proof.product_catalog_routing_verified===true);
  add('dos_originales','Dos presupuestos de proveedores distintos verificables',
   isNumber(proof.strong_originals)&&proof.strong_originals>=2&&
   isNumber(consent.suppliers_accepted)&&consent.suppliers_accepted>=2&&
   proof.two_distinct_supplier_files_verified===true);
  add('whatsapp_real','Recorrido WhatsApp real confirmado, sin envíos duplicados',
   proof.whatsapp_e2e_verified===true);
  add('analisis_general','Informe general posterior a cierre real comprobado',
   proof.final_analysis_verified===true);
 }
 const blockers=Object.freeze(stages.filter(x=>!x.ok));
 return Object.freeze({
  project:PROJECT,phase,
  result:blockers.length?'BLOCKED':'PREFLIGHT_PASS_REQUIRES_PUBLICALO',
  passed:stages.length-blockers.length,total:stages.length,
  blockers,checked:Object.freeze(stages),
  can_publish:false,
  note:'Esta herramienta solo lee una observación; nunca despliega ni concede permisos.'
 });
}

function cli(){
 const argv=process.argv.slice(2);
 if(argv.length<1||argv.length>2||argv.some(x=>x.startsWith('--')))
  throw Error('uso: node scripts/piloto/v2-release-readiness.mjs <snapshot.json> [primer_original|piloto_completo]');
 const snapshot=JSON.parse(readFileSync(resolve(argv[0]),'utf8'));
 const report=auditarPublicacionV2(snapshot,argv[1]??'primer_original');
 const print={
  phase:report.phase,result:report.result,
  passed:report.passed,total:report.total,
  blockers:report.blockers.map(x=>({code:x.code,label:x.label})),
  can_publish:false
 };
 process.stdout.write(JSON.stringify(print,null,2)+'\n');
 if(report.blockers.length)process.exitCode=2;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli()}catch(e){
  process.stderr.write(String(e instanceof Error?e.message:e)+'\n');
  process.exitCode=2;
 }
}

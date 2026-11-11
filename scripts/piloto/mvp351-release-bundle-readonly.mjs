/**
 * MVP351 — offline, fail-closed release manifest for the EXISTING Cotironda
 * pilot, never a deployer. No network, database access or WhatsApp sends.
 *
 * A green CI only proves that the checked-out sources agree; publication
 * additionally requires explicit approval and live Edge/SQL verification.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepararMvp336Overlay} from './mvp336-whapi-overlay-candidate.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const FILES_MVP351=Object.freeze({
 correlator:'supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts',
 identityHint:'supabase/functions/cotironda-piloto-whapi/supplier-material-identity-hint-mvp352.ts',
 worker:'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts',
 material:'supabase/functions/cotironda-piloto-whapi/supplier-material-fidelity-mvp348.ts',
 archived:'supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts',
 revision:'supabase/functions/cotironda-piloto-whapi/supplier-economic-revision-mvp346.ts',
 publication:'supabase/functions/cotironda-piloto-whapi/supplier-economic-publication-mvp347.ts',
 entry:'supabase/functions/cotironda-piloto-auto-recovery/index.ts',
 auth:'supabase/functions/cotironda-piloto-auto-recovery/internal-auth-mvp294.ts',
 sql:'supabase/piloto/mvp351_reintento_fidelidad_y_rivales_historicos.sql',
 semanticSql:'supabase/piloto/mvp352_reevaluacion_semantica_unica.sql'
});
const PINNED_CORRELATOR='b5ea8c2b64ba7fe07409943b9c810d7a6e270b84';
const PINNED_HINT='58ee374e77793c092b3b65b2cf1ffa3a1ad880e9';
function gitBlob(s){
 const bytes=Buffer.from(s,'utf8');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function requireAll(name,code,need){
 if(typeof code!=='string'||code.length<150)throw Error('MVP351_MISSING_'+name);
 for(const item of need)if(!code.includes(item))
  throw Error('MVP351_INCOMPATIBLE_'+name);
}
/**
 * Source-only safety assertions. Pure function intentionally accepts sources
 * for mutation testing, while the CLI always reads the pinned repository.
 * No remote version is inferred from a local file.
 */
export function validarBundleMvp351(files){
 for(const [key] of Object.entries(FILES_MVP351)){
  if(typeof files?.[key]!=='string')throw Error('MVP351_MISSING_'+key);
 }
 if(gitBlob(files.correlator)!==PINNED_CORRELATOR)
  throw Error('MVP351_CORRELATOR_PIN_DRIFT');
 if(gitBlob(files.identityHint)!==PINNED_HINT)
  throw Error('MVP352_MATERIAL_HINT_PIN_DRIFT');
 requireAll('correlator',files.correlator,[
  "if(best.candidate.bind_allowed===false)",
  "'historical_round_best_fit'",
  "retryReviewedOnce",
  "cotironda_piloto_auto_correlation_bind_mvp291",
  "pistasMaterialesMvp352(input.quote)",
  "material_identity_hints:"
 ]);
 requireAll('identityHint',files.identityHint,[
  "pistaIdentidadMaterialMvp352",
  "pistasMaterialesMvp352",
  "material_identity_hint"
 ]);
 requireAll('worker',files.worker,[
  "supplier-auto-correlation-mvp336.ts",
  "supplier-material-fidelity-mvp348.ts",
  "evaluarMaterialesRecuperadosMvp348(",
  "cotironda_piloto_claim_reviewed_auto_recovery_mvp336",
  "cotironda_piloto_claim_semantic_reassessment_mvp352",
  "retryReviewedOnce:claimed.retry_reviewed===true",
  "archive_quote_economic_or_source_review_required",
  "cotironda_piloto_finish_auto_recovery_mvp292"
 ]);
 requireAll('material',files.material,[
  "archived_material_description_mismatch",
  "archived_quantity_mismatch",
  "archived_unit_mismatch",
  "material_scope_unique_reorder"
 ]);
 requireAll('archived',files.archived,[
  "registrarRevisionEconomicaPrivadaMvp346(",
  "publicarRevisionEconomicaVerificadaMvp347(",
  "cotironda_piloto_audit_supplier_amounts_mvp103",
  "cotironda_piloto_record_supplier_source_check_mvp106",
  "cotironda_piloto_publish_source_text_mvp107"
 ]);
 requireAll('revision',files.revision,[
  "auditCandidateAmountsMvp346",
  "checkSupplierPdfSource",
  "source_sha_mismatch",
  "cotironda_piloto_store_revision_candidate_mvp346"
 ]);
 requireAll('publication',files.publication,[
  "auditCandidateAmountsMvp346(args.candidate)",
  "checkSupplierPdfSource",
  "revision_sha_mismatch",
  "cotironda_piloto_publish_revision_mvp347"
 ]);
 requireAll('entry',files.entry,[
  "authorizeRecoveryMvp294({",
  "req.method!=='POST'",
  "COTIRONDA_PILOT_AUTO_RECOVERY_SECRET",
  "COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED",
  "COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED",
  "procesarPendienteAutomaticoMvp292("
 ]);
 requireAll('auth',files.auth,[
  "authorizeRecoveryMvp294",
  "privateHeader",
  "apikeyHeader",
  "authorizationHeader"
 ]);
 requireAll('sql',files.sql,[
  "ai_supplier_recovery_second_attempt_mvp351",
  "previous_reason='archived_materials_disagree'",
  "r.state IN('prepared','closed')",
  "r.closed_at>v_source.received_at",
  "'bind_allowed',(v_request.state='prepared')",
  "IF v_active<1 THEN RETURN",
  "REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336()"
 ]);
 requireAll('semanticSql',files.semanticSql,[
  "ai_supplier_semantic_reassessment_mvp352",
  "claim_semantic_reassessment_mvp352",
  "a.mime='application/pdf'",
  "r.state IN('prepared','closed')",
  "previous_recovery_reason",
  "previous_correlation_reason",
  "REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_semantic_reassessment_mvp352()",
  "third.source_sha256=v_source.content_sha256"
 ]);
 if(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+cotironda_piloto_privado\.(?:whapi_outbox|anonymous_supplier_docs_mvp107)/iu.test(files.sql))
  throw Error('MVP351_UNAUTHORIZED_SEND_OR_OFFER');
 if(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+cotironda_piloto_privado\.(?:whapi_outbox|anonymous_supplier_docs_mvp107)/iu.test(files.semanticSql))
  throw Error('MVP352_UNAUTHORIZED_SEND_OR_OFFER');
 return Object.freeze({
  state:'local_sources_compatible',
  historical_source_pinned:true,
  semantic_material_hints_only:true,
  worker_material_fidelity_included:true,
  source_and_amount_gates_included:true,
  previous_reason_audited:true,
  historical_round_not_bindable:true,
  no_new_communication:true
 });
}
export function inspeccionarCandidatoMvp351({root=ROOT}={}){
 const local={};
 for(const [key,path] of Object.entries(FILES_MVP351)){
  local[key]=readFileSync(resolve(root,path),'utf8');
 }
 const compatible=validarBundleMvp351(local);
 const overlay=prepararMvp336Overlay({root});
 if(overlay.added_file_git_sha!==PINNED_CORRELATOR||
    overlay.dependency_added_file!==FILES_MVP351.identityHint||
    !overlay.original_manifest_preserved||
    overlay.db_mutated!==false||
    overlay.outbound_whatsapp_messages!==0)
  throw Error('MVP351_WEBHOOK_MANIFEST_DRIFT');
 return Object.freeze({
  ...compatible,
  state:'offline_candidate_checked',
  pilot_sql_installed:null,
  live_edge_worker_matches:null,
  live_webhook_matches:null,
  verified_backup:false,
  economic_original_verified:false,
  ready_to_publish:false,
  ready_for_e2e:false,
  deployed:false,
  whapi_sends:0,
  requires_order:Object.freeze([
   'confirmar_base_y_resguardo',
   'verificar_SQL_mvp351_instalado',
   'instalar_SQL_mvp352_solo_piloto',
   'desplegar_worker_con_mvp352_y_modulo_pistas',
   'desplegar_webhook_compatible_si_se_actualiza',
   'probar_un_solo_documento_SHA_y_estado_economico',
   'verificar_tracking_y_cierre_sin_reenviar_pedidos'
  ])
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length>3||!['--check','--json'].includes(process.argv[2]??'--check'))
   throw Error('MVP351_INVALID_MODE');
  console.log(JSON.stringify(inspeccionarCandidatoMvp351()));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}

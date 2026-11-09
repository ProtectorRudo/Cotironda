/**
 * MVP320 — deterministic, no-network checker for exact, sanitized SQL witness.
 * No credentials, no database writes and no automatic live enablement.
 * The Whapi Sandbox screenshot and GitHub CI cannot prove real E2E.
 */
const FIELDS=[
  'audited_at_utc','execution','postgres17',
  'mvp309_installed','mvp310_installed','mvp312_installed',
  'mvp313_installed','mvp314_installed','mvp315_installed',
  'auto_release_enabled','legacy_dispatch_enabled','inbound_enabled',
  'outbound_enabled','auto_released_rounds','original_files',
  'external_whapi_transport_verified','real_e2e_certified'
];
const BOOLS=FIELDS.slice(2,13).concat(FIELDS.slice(15));
const MISSING={
  mvp309_installed:'mvp309_admin_authorizations_not_installed',
  mvp310_installed:'mvp310_multiple_participants_not_installed',
  mvp312_installed:'mvp312_encrypted_channels_not_installed',
  mvp313_installed:'mvp313_dynamic_recipients_not_installed',
  mvp314_installed:'mvp314_batch_worker_not_installed',
  mvp315_installed:'mvp315_buyer_notice_not_installed'
};
const hasOnlyFields=(v)=>typeof v==='object'&&v!==null&&
 !Array.isArray(v)&&Object.keys(v).length===FIELDS.length&&
 FIELDS.every(k=>Object.hasOwn(v,k));
/** Output deliberately excludes keys, phones, hashes, tokens and request IDs. */
export function evaluarPreflightMvp320(input){
 if(!hasOnlyFields(input)||
   input.execution!=='MVP320_READ_ONLY_NO_OUTBOUND'||
   typeof input.audited_at_utc!=='string'||
   !/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(input.audited_at_utc)||
   BOOLS.some(k=>typeof input[k]!=='boolean')||
   !Number.isSafeInteger(input.auto_released_rounds)||
   input.auto_released_rounds<0||input.auto_released_rounds>1000000||
   !Number.isSafeInteger(input.original_files)||
   input.original_files<0||input.original_files>1000000||
   input.external_whapi_transport_verified!==false||
   input.real_e2e_certified!==false)
  return null;
 const blocked=[];
 if(!input.postgres17)blocked.push('postgres17_not_confirmed');
 for(const [field,reason] of Object.entries(MISSING))
  if(!input[field])blocked.push(reason);
 if(!input.auto_release_enabled)
  blocked.push('automatic_release_without_buyer_confirmation_off');
 if(!input.inbound_enabled)blocked.push('whatsapp_inbound_off');
 if(!input.outbound_enabled)blocked.push('whatsapp_outbound_off');
 if(input.original_files<7)blocked.push('original_documents_below_known_baseline');
 // These are intentionally NOT inferred from database presence or API status:
 // MVP311 needs byte-accurate comparison, Whapi needs an actual live test,
 // Sandbox active chats require individual reconciliation and the exposed
 // credential should be rotated before any outbound traffic.
 const external=[
  'mvp311_live_rpc_hash_validation',
  'sandbox_chat_participants_and_limits_validation',
  'whapi_credential_rotation_required',
  'real_whatsapp_and_browser_e2e_not_observed',
  'recoverable_backup_not_verified'
 ];
 return Object.freeze({
  state:blocked.length?'pilot_code_not_deployed':'pilot_deployment_requires_external_checks',
  database_blockers:Object.freeze(blocked),
  external_checks:Object.freeze(external),
  observations:Object.freeze({
    legacy_dispatch_enabled:input.legacy_dispatch_enabled,
    auto_released_rounds:input.auto_released_rounds,
    original_files:input.original_files
  }),
  real_e2e_certified:false,
  eligible_for_real_outbound:false,
  evidence_scope:'live_database_read_only'
 });
}

/** MVP300 — deterministic, no-network E2E readiness gate for the pilot.
 * Input is the sanitized, aggregate, read-only SQL witness from
 * scripts/piloto/mvp300-e2e-readonly-witness.sql.
 * Never invent that a round was tested externally. No API requests.
 */
const int=(x,max=500)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const keys=[
 'audited_at_utc','execution',
 'central_enabled','dispatch_enabled','whatsapp_inbound_enabled',
 'whatsapp_outbound_enabled','trial_enabled',
 'eligible_latest_rounds','round_state','before_deadline',
 'dispatch_jobs','dispatch_with_whapi_id',
 'suppliers_replied_after_dispatch','verified_supplier_quotes',
 'reviewed_supplier_quotes','buyer_rubros_state',
 'buyer_verified_offers','buyer_pending_state','buyer_pending_responses',
 'external_browser_test_observed',
 'verified_real_whatsapp_roundtrip_observed',
 'final_contact_release_observed','full_e2e_certified'
];
export function evaluarCircuitoPilotoMvp300(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).length!==keys.length||
  keys.some(k=>!Object.hasOwn(value,k))||
  value.execution!=='MVP300_READ_ONLY_NO_OUTBOUND'||
  typeof value.audited_at_utc!=='string'||
  !/^20[0-9]{2}-[0-9]{2}-[0-9]{2} /u.test(value.audited_at_utc)||
  !['prepared','closed',null].includes(value.round_state)||
  !['rubros_por_articulo','not_found',null].includes(value.buyer_rubros_state)||
  !['respuestas_pendientes_por_rubro','not_found',null].includes(value.buyer_pending_state)||
  ![true,false,null].includes(value.before_deadline)||
  ['central_enabled','dispatch_enabled','whatsapp_inbound_enabled',
   'whatsapp_outbound_enabled','trial_enabled'].some(k=>
    typeof value[k]!=='boolean')||
  ['external_browser_test_observed',
   'verified_real_whatsapp_roundtrip_observed',
   'final_contact_release_observed','full_e2e_certified'].some(k=>
    value[k]!==false)||
  ['eligible_latest_rounds','dispatch_jobs','dispatch_with_whapi_id',
   'suppliers_replied_after_dispatch','verified_supplier_quotes',
   'reviewed_supplier_quotes','buyer_verified_offers',
   'buyer_pending_responses'].some(k=>!int(value[k]))||
  value.eligible_latest_rounds>1||
  value.dispatch_with_whapi_id>value.dispatch_jobs||
  value.suppliers_replied_after_dispatch>value.dispatch_with_whapi_id||
  value.verified_supplier_quotes>value.dispatch_with_whapi_id||
  value.buyer_verified_offers>value.verified_supplier_quotes)
  return null;
 const numeric={
  dispatch_jobs:value.dispatch_jobs,
  dispatch_accepted:value.dispatch_with_whapi_id,
  suppliers_replied:value.suppliers_replied_after_dispatch,
  quotes_verified:value.verified_supplier_quotes,
  quotes_review:value.reviewed_supplier_quotes,
  offers_visible:value.buyer_verified_offers,
  pending_visible:value.buyer_pending_responses
 };
 let stage='needs_real_e2e_proof';
 if(!value.central_enabled||!value.dispatch_enabled||
    !value.whatsapp_inbound_enabled||!value.whatsapp_outbound_enabled||
    !value.trial_enabled)stage='pilot_gates_closed';
 else if(value.eligible_latest_rounds===0)stage='no_confirmed_round';
 else if(value.dispatch_jobs<2||value.dispatch_with_whapi_id<2)
   stage='supplier_dispatch_incomplete';
 else if(value.suppliers_replied_after_dispatch<2)
   stage='awaiting_second_supplier_reply';
 else if(value.verified_supplier_quotes<2)
   stage='commercial_verification_incomplete';
 else if(value.buyer_rubros_state!=='rubros_por_articulo'||
   value.buyer_verified_offers<2)
   stage='buyer_projection_incomplete';
 else if(value.round_state!=='closed')
   stage='awaiting_round_close';
 // A read-only witness cannot prove actual HTTP browser observation
 // or the external WhatsApp contact release. Keep certified false.
 return Object.freeze({
  state:stage,metrics:Object.freeze(numeric),
  full_e2e_certified:false,
  evidence_scope:'database_only',
  missing_external_proofs:Object.freeze([
   'buyer_browser_http','real_whatsapp_roundtrip',
   'authorized_final_contact_release'
  ])
 });
}

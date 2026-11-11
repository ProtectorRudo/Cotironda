import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluarCircuitoPilotoMvp300} from
 '../../scripts/piloto/mvp300-gate-report.mjs';

const witness={
 audited_at_utc:'2026-11-07 22:16:52.053755+00',
 execution:'MVP300_READ_ONLY_NO_OUTBOUND',
 central_enabled:true,dispatch_enabled:true,
 whatsapp_inbound_enabled:true,whatsapp_outbound_enabled:true,
 trial_enabled:true,eligible_latest_rounds:1,round_state:'prepared',
 before_deadline:true,dispatch_jobs:2,dispatch_with_whapi_id:2,
 suppliers_replied_after_dispatch:1,verified_supplier_quotes:0,
 reviewed_supplier_quotes:1,buyer_rubros_state:'rubros_por_articulo',
 buyer_verified_offers:0,buyer_pending_state:'respuestas_pendientes_por_rubro',
 buyer_pending_responses:0,
 external_browser_test_observed:false,
 verified_real_whatsapp_roundtrip_observed:false,
 final_contact_release_observed:false,full_e2e_certified:false
};
const copy=()=>structuredClone(witness);
test('MVP300: baseline real sin datos personales identifica segunda respuesta faltante',()=>{
 const s=evaluarCircuitoPilotoMvp300(copy());
 assert.equal(s.state,'awaiting_second_supplier_reply');
 assert.equal(s.metrics.dispatch_accepted,2);
 assert.equal(s.metrics.suppliers_replied,1);
 assert.equal(s.full_e2e_certified,false);
 assert.equal(s.evidence_scope,'database_only');
 assert.deepEqual(s.missing_external_proofs,
  ['buyer_browser_http','real_whatsapp_roundtrip',
   'authorized_final_contact_release']);
 assert.doesNotMatch(JSON.stringify(s),/supplier_key|token_hash|message_hmac|phone/i);
});
test('MVP350: ronda cerrada sin ofertas no espera respuestas imposibles',()=>{
 const old={...copy(),round_state:'closed',before_deadline:false};
 const r=evaluarCircuitoPilotoMvp300(old);
 assert.equal(r.state,'closed_round_incomplete_new_trial_needed');
 assert.equal(r.metrics.dispatch_accepted,2);
 assert.equal(r.metrics.suppliers_replied,1);
 assert.equal(r.full_e2e_certified,false);
 assert.equal(r.evidence_scope,'database_only');
 assert.equal(r.missing_external_proofs.length,3);
});
test('MVP350: una ronda cerrada completa todavía requiere validación externa',()=>{
 const s={...copy(),round_state:'closed',before_deadline:false,
  suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
  reviewed_supplier_quotes:0,buyer_verified_offers:2};
 const r=evaluarCircuitoPilotoMvp300(s);
 assert.equal(r.state,'needs_real_e2e_proof');
 assert.equal(r.full_e2e_certified,false);
});
test('MVP300: no habilitar estado completo sin prueba externa real',()=>{
 for(const changes of [
  {suppliers_replied_after_dispatch:2,verified_supplier_quotes:1,
   reviewed_supplier_quotes:1},
  {suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
   buyer_verified_offers:0},
  {suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
   buyer_verified_offers:2},
  {suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
   buyer_verified_offers:2,round_state:'closed'}
 ]){
  const value={...copy(),...changes};
  const r=evaluarCircuitoPilotoMvp300(value);
  assert.ok(r);
  assert.equal(r.full_e2e_certified,false);
  assert.notEqual(r.state,'certified');
 }
});
test('MVP300: identificar claramente despacho y condiciones comerciales pendientes',()=>{
 for(const [edit,stage] of [
  [{dispatch_with_whapi_id:1},'supplier_dispatch_incomplete'],
  [{dispatch_jobs:1,dispatch_with_whapi_id:1},'supplier_dispatch_incomplete'],
  [{suppliers_replied_after_dispatch:2,verified_supplier_quotes:1},'commercial_verification_incomplete'],
  [{suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
    buyer_verified_offers:1},'buyer_projection_incomplete'],
  [{suppliers_replied_after_dispatch:2,verified_supplier_quotes:2,
    buyer_verified_offers:2},'awaiting_round_close'],
  [{central_enabled:false},'pilot_gates_closed'],
  [{eligible_latest_rounds:0,round_state:null,before_deadline:null,
    dispatch_jobs:0,dispatch_with_whapi_id:0,
    suppliers_replied_after_dispatch:0,verified_supplier_quotes:0,
    reviewed_supplier_quotes:0,buyer_rubros_state:null,
    buyer_pending_state:null,buyer_verified_offers:0,
    buyer_pending_responses:0},'no_confirmed_round']
 ]){
  const r=evaluarCircuitoPilotoMvp300({...copy(),...edit});
  assert.equal(r?.state,stage,JSON.stringify(edit));
 }
});
test('MVP300: rechazar reportes adulterados, números imposibles y falsos E2E',()=>{
 const edits=[
  {full_e2e_certified:true},
  {external_browser_test_observed:true},
  {verified_real_whatsapp_roundtrip_observed:true},
  {final_contact_release_observed:true},
  {dispatch_with_whapi_id:3},
  {suppliers_replied_after_dispatch:3},
  {verified_supplier_quotes:3},
  {buyer_verified_offers:1},
  {dispatch_jobs:-1},
  {dispatch_jobs:1.5},
  {buyer_rubros_state:'private_supplier_details'},
  {execution:'MVP300_OUTBOUND_ENABLED'},
  {participant_phone:'private'},
  {token_hash:'f'.repeat(64)}
 ];
 for(const patch of edits)
  assert.equal(evaluarCircuitoPilotoMvp300({...copy(),...patch}),null,
   JSON.stringify(patch));
});
test('MVP300: SQL testigo no puede alterar datos ni disparar WhatsApp o IA',()=>{
 const sql=readFileSync(new URL('../../scripts/piloto/mvp300-e2e-readonly-witness.sql',
  import.meta.url),'utf8');
 const uncommented=sql.replace(/^--.*$/gm,'');
 assert.match(uncommented,/WITH current_round AS/u);
 assert.match(uncommented,/public\.cotironda_piloto_ia_buyer_rubros_mvp227/u);
 assert.match(uncommented,/public\.cotironda_piloto_ia_pending_coverage_mvp299/u);
 assert.match(uncommented,/false AS full_e2e_certified/u);
 assert.match(uncommented,/false AS external_browser_test_observed/u);
 assert.doesNotMatch(uncommented,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|CALL|DO|COMMIT|BEGIN|PERFORM|COPY|NOTIFY)\b/iu);
 assert.doesNotMatch(uncommented,/\b(?:pg_net|http_post|pg_read_file|dblink|exec|curl)\b/iu);
 assert.doesNotMatch(uncommented,/\b(?:\bAS\s+phone|\bAS\s+token_hash|\bAS\s+supplier_key|\bAS\s+message_hmac)\b/iu);
 assert.doesNotMatch(uncommented,/^\s*SELECT\s+\*/gmiu);
});

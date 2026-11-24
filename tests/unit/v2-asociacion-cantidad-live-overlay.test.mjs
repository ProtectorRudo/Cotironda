import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parcheCantidadRecuperadorV2,RECOVERY_QUANTITY_V2} from
 '../../scripts/piloto/v2-asociacion-cantidad-live-overlay.mjs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_asociacion_cantidad_reintento_unico_CANDIDATE.sql',
 import.meta.url),'utf8');
test('Parche sólo cambia reclamo de tercer intento y pasa su bandera al motor',()=>{
 const prefix="claimed=await db('cotironda_piloto_claim_reviewed_text_v2');";
 const fake="foo".repeat((RECOVERY_QUANTITY_V2.length-225)/3|0);
 const source=(" ".repeat(150)+
  "from './supplier-auto-correlation-contextual-v2.ts';\n"+
  prefix+"\n  if(claimed.state!=='claimed')\n"+
  "    retryReviewedOnce:claimed.retry_reviewed===true,").padEnd(
    RECOVERY_QUANTITY_V2.length,' ');
 const candidate=parcheCantidadRecuperadorV2({
  version:26,bundle:RECOVERY_QUANTITY_V2.bundle,source
 });
 assert.match(candidate.source,/cotironda_piloto_claim_quantity_review_v2/u);
 assert.match(candidate.source,/retryQuantityAfterReview:claimed\.retry_quantity===true/u);
 assert.equal(candidate.outboundMessages,0);
 assert.notEqual(candidate.originalSha256,candidate.sha256);
 assert.equal(candidate.state,'candidate_only_not_deployed');
});
test('No aplica parche si cambió la versión del bundle o el código',()=>{
 assert.throws(()=>parcheCantidadRecuperadorV2({version:27,
  bundle:RECOVERY_QUANTITY_V2.bundle,source:''}),/source_drift/u);
});
test('La migración conserva original, auditoría de una vez y accesos privados',()=>{
 for(const x of [
  'ai_supplier_quantity_review_v2','source_hmac text PRIMARY KEY',
  "previous_correlation_reason","previous_recovery_reason",
  "rec.state='review'","rec.reason_code='multiple_indistinguishable_rounds'",
  "rec.finished_at IS NOT NULL","u.resolved_request_id IS NULL",
  "m.nonce_b64 IS NOT NULL","m.ciphertext_b64 IS NOT NULL",
  "supplier.consent_at IS NOT NULL","seller.consent_at IS NOT NULL",
  "buyer.consent_at IS NOT NULL","d.state='api_accepted'",
  "o.state='api_accepted'","r.state IN('prepared','closed')",
  "v_request.state='prepared'","FOR UPDATE OF u,m",
  "quantity_review_claim_race","v2_quantity_retry_race",
  "ENABLE ROW LEVEL SECURITY","REVOKE ALL ON FUNCTION",
  "GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_quantity_review_v2() TO service_role"
 ])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/iu);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_claim_reviewed_text_v2\(/u);
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./gu)||[]).length,2);
});

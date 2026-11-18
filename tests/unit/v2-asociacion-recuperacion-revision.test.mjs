import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRevisionRecoveryV2,PIN,LINKER_REVISION} from
 '../../scripts/piloto/v2-asociacion-recuperacion-revision-overlay.mjs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_asociacion_recuperacion_revision_CANDIDATE.sql',
 import.meta.url),'utf8');

test('Revisión nueva sólo crea una prueba acotada preservando todas las anteriores',()=>{
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./gu)||[]).length,2);
 assert.match(sql,/DEFAULT 'v2_initial'/u);
 assert.match(sql,/PRIMARY KEY \(source_hmac,revision\)/u);
 assert.match(sql,/revision='v2_initial'/u);
 assert.match(sql,/audit\.revision=p_revision/u);
 assert.match(sql,/audit\.source_hmac=m\.message_hmac\)<3/u);
 assert.match(sql,/p_revision !~ '\^\[a-f0-9\]\{40\}\$'/u);
 assert.match(sql,/ON CONFLICT DO NOTHING/u);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/iu);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.ai_supplier_quantity_review_v2\b/iu);
});
test('Respeta consentimientos, despacho y aislamiento del original',()=>{
 for(const x of [
  'seller.consent_at IS NOT NULL',
  'seller.opted_out_at IS NULL',
  'buyer.consent_at IS NOT NULL',
  'buyer.opted_out_at IS NULL',
  "m.nonce_b64 IS NOT NULL",
  "m.ciphertext_b64 IS NOT NULL",
  "m.request_id IS NULL",
  "u.resolved_request_id IS NULL",
  "rec.state='review'",
  "rec.reason_code='multiple_indistinguishable_rounds'",
  "d.state='api_accepted'",
  "o.state='api_accepted'",
  "r.state='prepared'",
  "r.closes_at>clock_timestamp()",
  "FOR UPDATE OF u,m SKIP LOCKED",
  "revision.recorded_at>clock_timestamp()-interval '2 minutes'",
  "revision_review_claim_race",
  'REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_revision_review_v2(text) FROM PUBLIC,anon,authenticated',
  'GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_revision_review_v2(text) TO service_role'
 ])assert.ok(sql.includes(x),x);
});
test('No se amplía la cuota diaria de presupuestos comunes por agregar revisiones',()=>{
 assert.match(sql,/retry_daily_quota/u);
 assert.match(sql,/recorded_at>clock_timestamp\(\)-interval '24 hours'\)>=2/u);
 assert.match(sql,/AND NOT EXISTS\(SELECT 1 FROM cotironda_piloto_privado\.ai_supplier_quantity_review_v2 revision/u);
 assert.match(sql,/revision\.revision ~ '\^\[a-f0-9\]\{40\}\$'/u);
});
test('Overlay sólo modifica la entrada de recuperación de la versión probada',()=>{
 assert.equal(PIN.version,27);
 assert.match(LINKER_REVISION,/^[a-f0-9]{40}$/u);
 const source=("claimed=await db('cotironda_piloto_claim_quantity_review_v2');\n"+
  "    retryQuantityAfterReview:claimed.retry_quantity===true,\n"+
  "  if(claimed.state!=='claimed')").padEnd(PIN.length,' ');
 const patched=buildRevisionRecoveryV2(source,{version:27,bundle:PIN.bundle});
 assert.equal(patched.state,'candidate_only');
 assert.equal(patched.outboundMessages,0);
 assert.equal(patched.sqlMutated,false);
 assert.match(patched.content,/cotironda_piloto_claim_revision_review_v2/u);
 assert.match(patched.content,/p_revision:'7e87a32e2838a2fe9386db68b6c9f2a5c2647e44'/u);
 assert.notEqual(patched.content,source);
 assert.throws(()=>buildRevisionRecoveryV2(source,{version:28,bundle:PIN.bundle}),/live_drift/u);
 assert.throws(()=>buildRevisionRecoveryV2(source+'x',{version:27,bundle:PIN.bundle}),/live_drift/u);
});

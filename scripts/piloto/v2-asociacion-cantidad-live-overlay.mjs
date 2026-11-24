/**
 * Cotironda V2 · audited one-shot quantity review for EXISTING recovery v26.
 * This emits a candidate bundle only. No deployment, cron, WhatsApp or SQL.
 * Reject changed live sources, preserve all existing imports and branches.
 */
import {createHash} from 'node:crypto';
export const RECOVERY_QUANTITY_V2=Object.freeze({
 slug:'cotironda-piloto-auto-recovery',
 version:26,
 bundle:'371e83afd6008d75effdf5356e051d9449401884d92aa4dec8bf2effe074af54',
 file:'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts',
 length:10804
});
const digest=(s)=>createHash('sha256').update(s).digest('hex');
const oldClaim="  if(claimed.state!=='claimed')";
const newClaim="  if(claimed.state==='empty')\n   claimed=await db('cotironda_piloto_claim_quantity_review_v2');\n"+oldClaim;
const oldParam="    retryReviewedOnce:claimed.retry_reviewed===true,";
const newParam=oldParam+"\n    retryQuantityAfterReview:claimed.retry_quantity===true,";
export function parcheCantidadRecuperadorV2(live){
 if(!live||live.version!==RECOVERY_QUANTITY_V2.version||
  live.bundle!==RECOVERY_QUANTITY_V2.bundle||
  typeof live.source!=='string'||live.source.length!==RECOVERY_QUANTITY_V2.length)
  throw Error('v2_quantity_recovery_source_drift');
 let source=live.source;
 if(!source.includes("from './supplier-auto-correlation-contextual-v2.ts';")||
  !source.includes("claimed=await db('cotironda_piloto_claim_reviewed_text_v2')"))
  throw Error('v2_quantity_recovery_not_on_v26');
 for(const [a,b] of [[oldClaim,newClaim],[oldParam,newParam]]){
  if(source.split(a).length!==2||source.includes(b))
   throw Error('v2_quantity_recovery_anchor_drift');
  source=source.replace(a,b);
 }
 return Object.freeze({
  state:'candidate_only_not_deployed',
  file:RECOVERY_QUANTITY_V2.file,
  source,sha256:digest(source),originalSha256:digest(live.source),
  sqlMigration:'supabase/piloto/v2_asociacion_cantidad_reintento_unico_CANDIDATE.sql',
  requiresPublication:true,mutatedDatabase:false,
  outboundMessages:0
 });
}

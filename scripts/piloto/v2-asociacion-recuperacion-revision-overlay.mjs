/** Candidate only. Patch the exact existing v27 recovery; no deploy here. */
import {createHash} from 'node:crypto';
export const LINKER_REVISION='7e87a32e2838a2fe9386db68b6c9f2a5c2647e44';
export const PIN={
 version:27,
 bundle:'b01e4b1ba8cdfdd9b4b8da2835b9759f682721c716d7bf7120a90163e5a4552a',
 path:'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts',
 length:10960
};
export function buildRevisionRecoveryV2(src,observed){
 if(typeof src!=='string'||src.length!==PIN.length||
   !observed||observed.version!==PIN.version||observed.bundle!==PIN.bundle)
  throw Error('revision_recovery_live_drift');
 const anchor="  if(claimed.state!=='claimed')";
 if(src.split(anchor).length!==2||
  !src.includes("claimed=await db('cotironda_piloto_claim_quantity_review_v2')")||
  !src.includes('retryQuantityAfterReview:claimed.retry_quantity===true'))
  throw Error('revision_recovery_source_drift');
 const next="  if(claimed.state==='empty')\n"+
  "   claimed=await db('cotironda_piloto_claim_revision_review_v2',"+
  "{p_revision:'"+LINKER_REVISION+"'});\n"+anchor;
 const content=src.replace(anchor,()=>next);
 return Object.freeze({state:'candidate_only',file:PIN.path,content,
  sha256:createHash('sha256').update(content).digest('hex'),
  previouslyReviewedSourcePreserved:true,sqlMutated:false,outboundMessages:0});
}

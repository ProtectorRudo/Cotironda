/** Candidate only: exact v28 pilot recovery worker; never deploy here. */
import {createHash} from 'node:crypto';
// One new, LAST allowed versioned review of the original archived source.
export const LINKER_REVISION='8c3def51cf74ebb0940e3ba97802675c0799c01d';
export const PIN={
 version:28,
 bundle:'f97db9f77f519e8a39a24e9cd6df574bb1af05e855d5eaa3c73da42b786149d0',
 path:'supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts',
 length:11112
};
export function buildRevisionRecoveryV2(src,observed){
 if(typeof src!=='string'||src.length!==PIN.length||
   !observed||observed.version!==PIN.version||observed.bundle!==PIN.bundle)
  throw Error('revision_recovery_live_drift');
 const old="claimed=await db('cotironda_piloto_claim_revision_review_v2',"+
  "{p_revision:'7e87a32e2838a2fe9386db68b6c9f2a5c2647e44'});";
 if(src.split(old).length!==2||
  !src.includes("claimed=await db('cotironda_piloto_claim_quantity_review_v2')")||
  !src.includes('retryQuantityAfterReview:claimed.retry_quantity===true'))
  throw Error('revision_recovery_source_drift');
 const next="claimed=await db('cotironda_piloto_claim_revision_review_v2',"+
  "{p_revision:'"+LINKER_REVISION+"'});";
 const content=src.replace(old,()=>next);
 return Object.freeze({state:'candidate_only',file:PIN.path,content,
  sha256:createHash('sha256').update(content).digest('hex'),
  previouslyReviewedSourcePreserved:true,sqlMutated:false,outboundMessages:0});
}

/**
 * MVP346 — A PRIVATE candidate for a corrected reading of the SAME SHA-verified
 * supplier PDF. Never publish, mutate the original archive, change a line
 * mirror, guess an effective unit price, or request another WhatsApp.
 *
 * The second reading already exists in MVP292; NO extra model call here.
 * Its amounts must balance deterministically AND have exact independent
 * coverage from the original PDF before being stored as an immutable candidate.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {SourceCheckResult} from './supplier-source-text.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Check=(f:DownloadedMedia,d:DocumentDraft)=>Promise<SourceCheckResult>;
export type RevisionResultMvp346=Readonly<{
 state:'not_applicable'|'source_review_required'|'candidate_stored'|
  'reconciliation_required';
 reason:string;published:false;outboundMessages:0;
}>;
const result=(state:RevisionResultMvp346['state'],reason:string):
 RevisionResultMvp346=>Object.freeze({
 state,reason,published:false,outboundMessages:0
});
const HASH=/^[a-f0-9]{64}$/u;

function parseCents(raw:string|null):bigint|null{
 if(typeof raw!=='string'||raw.length>60||
   !/^-?\$\s*\d[\d.,]*$/u.test(raw.trim()))return null;
 let v=raw.trim().replace(/[$\s]/gu,'');
 const sign=v.startsWith('-')?-1n:1n;
 if(v.startsWith('-'))v=v.slice(1);
 let normal:string;
 if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(v))
  normal=v.replace(',','.');
 else if(/^[1-9]\d{0,2}(?:\.\d{3})+,\d{1,2}$/u.test(v))
  normal=v.replace(/\./gu,'').replace(',','.');
 else if(/^[1-9]\d{0,2}(?:,\d{3})+\.\d{1,2}$/u.test(v))
  normal=v.replace(/,/gu,'');
 else return null;
 const [whole,fraction='']=normal.split('.');
 if(whole.length>9||BigInt(whole)>999999999n)return null;
 return sign*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
}
function parseQuantityMilli(raw:string|null):bigint|null{
 if(typeof raw!=='string'||!/^[0-9]{1,6}(?:[.,][0-9]{1,3})?$/u.test(raw))
  return null;
 const [a,b='']=raw.replace(',','.').split('.');
 const millis=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));
 return millis>0n&&millis<=1000000000n?millis:null;
}
/** Mirrors the relevant MVP103 arithmetic without floating point or rounding. */
export function auditCandidateAmountsMvp346(d:DocumentDraft):boolean{
 if(d.kind!=='supplier_quote'||d.status!=='review_required'||
    !Array.isArray(d.lines)||d.lines.length<1||d.lines.length>25||
    !Array.isArray(d.unanswered)||d.unanswered.length!==0)return false;
 const declared=parseCents(d.total_declared);
 if(declared===null)return false;
 let sum=0n;
 for(const line of d.lines){
  if(typeof line.original_description!=='string'||
     line.original_description.length<2||line.original_description.length>250||
     !line.evidence_location?.trim()||line.evidence_location.length>200||
     (line.ambiguity!==null&&line.ambiguity?.trim()!=='')||
     line.quantity!==null&&line.quantity.length>50||
     line.unit!==null&&line.unit.length>70||
     line.unit_price!==null&&line.unit_price.length>100||
     line.line_total!==null&&line.line_total.length>120)return false;
  const amount=parseCents(line.line_total);
  if(amount===null)return false;
  if(/descuento|bonificaci[oó]n|rebaja/iu.test(line.original_description)&&
    amount>=0n)return false;
  if(line.unit_price!==null){
   const unit=parseCents(line.unit_price),q=parseQuantityMilli(line.quantity);
   if(unit===null||q===null||unit*q!==amount*1000n)return false;
  }
  sum+=amount;
 }
 return sum===declared;
}
function sameMaterialScope(first:DocumentDraft,second:DocumentDraft):boolean{
 return first.lines.length===second.lines.length&&
  first.lines.every((l,i)=>{
   const r=second.lines[i];
   return r!==undefined&&l.original_description===r.original_description&&
    l.quantity===r.quantity&&l.unit===r.unit;
  });
}
function changedEconomicsOrTerms(first:DocumentDraft,second:DocumentDraft):boolean{
 return first.total_declared!==second.total_declared||
  first.requested_delivery_note!==second.requested_delivery_note||
  first.lines.some((l,i)=>l.unit_price!==second.lines[i].unit_price||
   l.line_total!==second.lines[i].line_total);
}
async function bytesMatch(file:DownloadedMedia,sha:string):Promise<boolean>{
 const actual=new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(file.bytes).buffer));
 return [...actual].map(v=>v.toString(16).padStart(2,'0')).join('')===sha;
}
export async function registrarRevisionEconomicaPrivadaMvp346(args:{
 sourceHmac:string;sourceSha256:string;file:DownloadedMedia;
 original:DocumentDraft;second:DocumentDraft;rpc:Rpc;
 // Fake source reader ONLY for synthetic tests, never a production bypass.
 sourceCheck?:Check;
}):Promise<RevisionResultMvp346>{
 if(!args||!HASH.test(args.sourceHmac)||!HASH.test(args.sourceSha256)||
  args.file?.mime!=='application/pdf'||
  args.file.sha256!==args.sourceSha256||
  !(args.file.bytes instanceof Uint8Array)||
  typeof args.rpc!=='function')return result('source_review_required','source_identity_invalid');
 if(!args.original||!args.second||
    args.original.kind!=='supplier_quote'||args.second.kind!=='supplier_quote'||
    !Array.isArray(args.original.lines)||!Array.isArray(args.second.lines)||
    !sameMaterialScope(args.original,args.second))
  return result('source_review_required','material_readings_disagree');
 if(!changedEconomicsOrTerms(args.original,args.second))
  return result('not_applicable','no_corrected_economic_fields');
 if(!auditCandidateAmountsMvp346(args.second))
  return result('source_review_required','candidate_amounts_unbalanced');
 try{
  if(!await bytesMatch(args.file,args.sourceSha256))
   return result('source_review_required','source_sha_mismatch');
  const check=await (args.sourceCheck??checkSupplierPdfSource)(args.file,args.second);
  if(check.state!=='source_text_covered'||check.reason!=='covered'||
    check.sourceSha256!==args.sourceSha256||
    check.lines!==args.second.lines.length)
   return result('source_review_required','candidate_not_covered_by_original');
  const response=await args.rpc('cotironda_piloto_store_revision_candidate_mvp346',{
   p_message_hmac:args.sourceHmac,p_source_sha256:args.sourceSha256,
   p_candidate:args.second
  });
  if(response.error||!response.data||typeof response.data!=='object'||
     !('state' in response.data))
   return result('reconciliation_required','candidate_persistence_uncertain');
  const state=(response.data as {state:unknown}).state;
  if(state==='candidate_stored')
   return result('candidate_stored','economic_revision_private_only');
  if(state==='not_permitted'||state==='invalid'||state==='source_mismatch'||
     state==='material_scope_mismatch'||state==='no_changes')
   return result('source_review_required','candidate_sql_guard_rejected');
  return result('reconciliation_required','candidate_persistence_uncertain');
 }catch{
  return result('reconciliation_required','candidate_persistence_uncertain');
 }
}

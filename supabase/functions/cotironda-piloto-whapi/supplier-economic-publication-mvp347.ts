/** MVP347: project a previously archived, independently PDF-verified
 * PRIVATE economic revision, never the unverified first AI reading.
 * No additional model calls, no WhatsApp, no bypass of source/amount checks.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {SourceCheckResult} from './supplier-source-text.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {auditCandidateAmountsMvp346} from './supplier-economic-revision-mvp346.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type SourceCheck=(file:DownloadedMedia,draft:DocumentDraft)=>
 Promise<SourceCheckResult>;
const HEX=/^[0-9a-f]{64}$/u;
export type PublishRevisionResultMvp347=Readonly<{
 state:'published_private'|'review_required'|'reconciliation_required';
 reason:string;outboundMessages:0;
}>;
const done=(state:PublishRevisionResultMvp347['state'],reason:string):
 PublishRevisionResultMvp347=>Object.freeze({state,reason,outboundMessages:0});

export async function publicarRevisionEconomicaVerificadaMvp347(args:{
 sourceHmac:string;sha256:string;originalFile:DownloadedMedia;
 candidate:DocumentDraft;rpc:Rpc;
 // Supplied only by synthetic tests, never by the production entrypoint.
 sourceCheck?:SourceCheck;
}):Promise<PublishRevisionResultMvp347>{
 if(!args||!HEX.test(args.sourceHmac)||!HEX.test(args.sha256)||
  args.originalFile?.sha256!==args.sha256||
  args.originalFile.mime!=='application/pdf'||
  !(args.originalFile.bytes instanceof Uint8Array)||
  typeof args.rpc!=='function'||
  !auditCandidateAmountsMvp346(args.candidate))
  return done('review_required','revision_invalid_or_unbalanced');
 try{
  // The worker already loaded the bytes from private Storage but we never
  // trust the file object's advertised sha256. Verify actual bytes again.
  const actual=new Uint8Array(await crypto.subtle.digest(
   'SHA-256',Uint8Array.from(args.originalFile.bytes).buffer));
  const sourceHash=Array.from(actual,n=>n.toString(16).padStart(2,'0')).join('');
  if(sourceHash!==args.sha256)
   return done('review_required','revision_sha_mismatch');
  // Source check is independent of AI: every monetary token and every
  // commercial condition on all PDF pages must have been accounted for.
  const check=await (args.sourceCheck??checkSupplierPdfSource)(
   args.originalFile,args.candidate);
  if(check.state!=='source_text_covered'||check.reason!=='covered'||
    check.sourceSha256!==args.sha256||
    check.lines!==args.candidate.lines.length)
   return done('review_required','revision_source_not_covered');
  const out=await args.rpc('cotironda_piloto_publish_revision_mvp347',{
   p_message_hmac:args.sourceHmac,p_source_sha256:args.sha256
  });
  if(out.error||!out.data||typeof out.data!=='object'||
   !('state' in out.data))
   return done('reconciliation_required','revision_publication_uncertain');
  const state=(out.data as {state:unknown}).state;
  if(state==='published_anonymous'||state==='already_published')
   return done('published_private','revision_source_verified');
  if(state==='invalid'||state==='not_permitted'||
   state==='already_verified_elsewhere'||state==='privacy_or_quality_review')
   return done('review_required','revision_sql_guard_rejected');
  return done('reconciliation_required','revision_publication_uncertain');
 }catch{
  return done('reconciliation_required','revision_publication_uncertain');
 }
}

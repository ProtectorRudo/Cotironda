/**
 * MVP134: one PRIVATE, independent source probe for an already-saved quote.
 * No AI, WhatsApp or publication. Existing reading/amount gates are immutable.
 * Never return original text, file bytes, prices or identifiers to the caller.
 */
import {checkSupplierPdfSource} from '../cotironda-piloto-whapi/supplier-source-pdf.ts';
import type {DocumentDraft} from '../cotironda-piloto-whapi/document-ai-draft.ts';
import type {DownloadedMedia} from '../cotironda-piloto-whapi/whapi-media-archive.ts';
import type {SourceCheckResult} from '../cotironda-piloto-whapi/supplier-source-text.ts';

type Result={data:unknown;error:unknown};
type PrivateIO={
 lookup:()=>Promise<Result>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 record:(p:Record<string,unknown>)=>Promise<Result>;
};
const HEX=/^[a-f0-9]{64}$/u;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
type SourceReader=(f:DownloadedMedia,p:DocumentDraft)=>Promise<SourceCheckResult>;

export async function diagnoseOneStoredQuote(
 io:PrivateIO,checker:SourceReader=checkSupplierPdfSource
):Promise<'none'|'diagnosed_private'|'failed'>{
 let h:string|null=null,sha:string|null=null,n=0,qCount=0;
 let state:'needs_review'|'source_candidate'='needs_review';
 let reason='invalid_proposal';
 try{
  const r=await io.lookup();
  if(r.error||!obj(r.data))return 'failed';
  if(r.data.state==='none')return 'none';
  if(r.data.state!=='candidate'||typeof r.data.message_hmac!=='string'||
    !HEX.test(r.data.message_hmac)||typeof r.data.source_sha256!=='string'||
    !HEX.test(r.data.source_sha256)||!Number.isInteger(r.data.size_bytes)||
    Number(r.data.size_bytes)<120||Number(r.data.size_bytes)>8388608||
    !Number.isInteger(r.data.line_count)||
    Number(r.data.line_count)<1||Number(r.data.line_count)>25)
   return 'failed';
  h=r.data.message_hmac;sha=r.data.source_sha256;n=Number(r.data.line_count);
  const p=r.data.proposal;
  if(!obj(p)||p.kind!=='supplier_quote'||!Array.isArray(p.lines)||
     p.lines.length!==n||!Array.isArray(p.unanswered)||
     p.unanswered.length>15||p.unanswered.some(v=>typeof v!=='string')||
     p.lines.some(v=>!obj(v)||typeof v.original_description!=='string'||
      typeof v.evidence_location!=='string'))
   return await persist();
  qCount=p.unanswered.length;
  const stored=await io.download('media/'+h);
  if(stored.error||!stored.data||stored.data.size!==Number(r.data.size_bytes)){
   reason='source_unavailable';return await persist();
  }
  const bytes=new Uint8Array(await stored.data.arrayBuffer());
  if(bytes.byteLength!==Number(r.data.size_bytes)){
   reason='source_mismatch';return await persist();
  }
  const digest=Array.from(new Uint8Array(
   await crypto.subtle.digest('SHA-256',bytes)),
   x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==sha){reason='source_mismatch';return await persist()}
  const f:DownloadedMedia={bytes,mime:'application/pdf',sha256:sha};
  // For *diagnosis only*, check PDF line/price evidence even when the model
  // listed questions. The original doubts remain attached and block approval.
  // This probe CANNOT modify source checks, dual readings, offers or ranking.
  const diagnostic:DocumentDraft={...(p as unknown as DocumentDraft),
    unanswered:[]};
  const result=await checker(f,diagnostic);
  if(result.state==='source_text_covered'&&qCount===0){
   state='source_candidate';reason='covered';
  }else if(result.state==='source_text_covered'){
   reason='unresolved_questions';
  }else{
   reason=result.reason;
  }
  return await persist();
 }catch{
  if(h&&sha&&n){
   reason='unsupported_layout';
   try{return await persist()}catch{return 'failed'}
  }
  return 'failed';
 }
 async function persist():Promise<'failed'|'diagnosed_private'>{
  if(!h||!sha||n<1)return 'failed';
  const r=await io.record({p_message_hmac:h,p_source_sha256:sha,
   p_state:state,p_reason:reason,p_question_count:qCount,p_line_count:n});
  if(r.error||!obj(r.data)||
    !['recorded','already_recorded'].includes(String(r.data.state)))
   return 'failed';
  return 'diagnosed_private';
 }
}

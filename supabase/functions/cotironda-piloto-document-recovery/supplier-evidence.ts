/**
 * MVP138: one safe source-backed quote assessment per recovered archived file.
 * The model draft is never authoritative. The SHA is verified from private
 * Storage and literal fields must independently exist on the original.
 */
import {verifySupplierEvidence} from '../cotironda-piloto-whapi/supplier-evidence-mvp138.ts';
import type {DocumentDraft} from '../cotironda-piloto-whapi/document-ai-draft.ts';
import type {DownloadedMedia} from '../cotironda-piloto-whapi/whapi-media-archive.ts';
type Result={data:unknown;error:unknown};
type IO={
 lookup:()=>Promise<Result>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 record:(params:{p_message_hmac:string;p_source_sha256:string;
  p_state:string;p_reason:string;p_line_count:number})=>Promise<Result>;
};
const HEX=/^[a-f0-9]{64}$/u;
const OBJ=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==='object'&&!Array.isArray(x);
export async function auditStoredSupplierQuote(io:IO,validator=verifySupplierEvidence):
 Promise<'none'|'verified_anonymous'|'needs_source_review'|'failed'>{
 try{
  const r=await io.lookup();
  if(r.error||!OBJ(r.data))return 'failed';
  const c=r.data;if(c.state==='none')return 'none';
  if(c.state!=='candidate'||typeof c.message_hmac!=='string'||
   !HEX.test(c.message_hmac)||typeof c.source_sha256!=='string'||
   !HEX.test(c.source_sha256)||typeof c.mime!=='string'||
   typeof c.size_bytes!=='number'||!Number.isSafeInteger(c.size_bytes)||
   c.size_bytes<120||c.size_bytes>8388608||
   typeof c.line_count!=='number'||!Number.isInteger(c.line_count)||
   c.line_count<1||c.line_count>25||!OBJ(c.proposal)||
   c.proposal.kind!=='supplier_quote'||!Array.isArray(c.proposal.lines)||
   c.proposal.lines.length!==c.line_count)return 'failed';
  const stored=await io.download('media/'+c.message_hmac);
  if(stored.error||!stored.data||stored.data.size!==c.size_bytes)
   return 'failed';
  const bytes=new Uint8Array(await stored.data.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==c.source_sha256)return 'failed';
  const file:DownloadedMedia={bytes,mime:c.mime,sha256:hash};
  const evidence=await validator(file,c.proposal as DocumentDraft);
  const saved=await io.record({
   p_message_hmac:c.message_hmac,p_source_sha256:hash,
   p_state:evidence.state,p_reason:evidence.reason,
   p_line_count:c.line_count
  });
  if(saved.error||!OBJ(saved.data)||
    !['verified','needs_source_review','already_checked'].includes(String(saved.data.state)))
   return 'failed';
  if(saved.data.state==='verified')return 'verified_anonymous';
  return 'needs_source_review';
 }catch{return 'failed'}
}

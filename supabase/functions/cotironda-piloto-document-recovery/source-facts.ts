/**
 * Private, Vault-authorized scheduled work: one source-facts row, no model,
 * no messages. Preserve original archive and buyer projections unchanged.
 */
import {extractLiteralFactsMvp163} from
 '../cotironda-piloto-whapi/supplier-source-facts-mvp163.ts';
import {leerOriginalPrivadoMvp168,MIME_ECONOMICOS_MVP168} from './source-rows-mvp168.ts';
import type {DocumentDraft} from
 '../cotironda-piloto-whapi/document-ai-draft.ts';
type R={data:unknown;error:unknown};
type IO={
 lookup:()=>Promise<R>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 record:(x:{p_message_hmac:string;p_source_sha256:string;
  p_state:'source_checked'|'unreadable';p_facts:unknown})=>Promise<R>;
};
const HEX=/^[a-f0-9]{64}$/u;
const obj=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==='object'&&!Array.isArray(x);
export async function auditStoredSourceFactsMvp163(io:IO):
 Promise<'none'|'facts_recorded'|'failed'>{
 try{
  const result=await io.lookup();
  if(result.error||!obj(result.data))return 'failed';
  const d=result.data;
  if(d.state==='none')return 'none';
  if(d.state!=='candidate'||typeof d.message_hmac!=='string'||
   !HEX.test(d.message_hmac)||typeof d.source_sha256!=='string'||
   !HEX.test(d.source_sha256)||typeof d.mime!=='string'||
   !MIME_ECONOMICOS_MVP168.has(d.mime)||!Number.isSafeInteger(d.size_bytes)||
   (d.size_bytes as number)<120||(d.size_bytes as number)>8388608||
   !Number.isSafeInteger(d.line_count)||(d.line_count as number)<1||
   (d.line_count as number)>25||!obj(d.proposal)||
   d.proposal.kind!=='supplier_quote'||!Array.isArray(d.proposal.lines)||
   d.proposal.lines.length!==d.line_count)return 'failed';
  const media=await io.download('media/'+d.message_hmac);
  if(media.error||!media.data)return 'failed';
  const source=await leerOriginalPrivadoMvp168(media.data,{
   mime:d.mime as string,sizeBytes:d.size_bytes as number,
   sourceSha256:d.source_sha256 as string
  });
  if(source.estado==='source_mismatch')return 'failed';
  const facts=extractLiteralFactsMvp163(d.proposal as DocumentDraft,source.rows);
  const saved=await io.record({
   p_message_hmac:d.message_hmac,p_source_sha256:source.hash,
   p_state:facts.state,p_facts:{
    lines:facts.lines,terms:facts.terms,
    rankingAllowed:false,sourceImmutabilityPreserved:true
   }
  });
  if(saved.error||!obj(saved.data)||
   !['recorded','already_checked'].includes(String(saved.data.state)))
   return 'failed';
  return 'facts_recorded';
 }catch{return 'failed'}
}

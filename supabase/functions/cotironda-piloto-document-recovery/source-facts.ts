/**
 * Private, Vault-authorized scheduled work: one source-facts row, no model,
 * no messages. Preserve original archive and buyer projections unchanged.
 */
import {extractLiteralFactsMvp163,type FactRow} from
 '../cotironda-piloto-whapi/supplier-source-facts-mvp163.ts';
import {readPdfPositioned} from
 '../cotironda-piloto-whapi/supplier-source-pdf-general.ts';
import {readOfficeVisibleRows} from
 '../cotironda-piloto-whapi/supplier-source-office.ts';
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
const supported=new Set([
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','text/csv'
]);
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
   !supported.has(d.mime)||!Number.isSafeInteger(d.size_bytes)||
   (d.size_bytes as number)<120||(d.size_bytes as number)>8388608||
   !Number.isSafeInteger(d.line_count)||(d.line_count as number)<1||
   (d.line_count as number)>25||!obj(d.proposal)||
   d.proposal.kind!=='supplier_quote'||!Array.isArray(d.proposal.lines)||
   d.proposal.lines.length!==d.line_count)return 'failed';
  const media=await io.download('media/'+d.message_hmac);
  if(media.error||!media.data||media.data.size!==d.size_bytes)return 'failed';
  const bytes=new Uint8Array(await media.data.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
   b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==d.source_sha256)return 'failed';
  let rows:FactRow[]=[];
  try{
   if(d.mime==='application/pdf'){
    const x=await readPdfPositioned(bytes);
    if(!x.scanned)rows=x.rows.map((r,i)=>({
     page:r.page,row:i+1,text:r.text
    }));
   }else if(d.mime.includes('openxmlformats-officedocument')){
    const xs=await readOfficeVisibleRows({
     bytes,mime:d.mime,sha256:hash
    });
    rows=xs.map((text,i)=>({page:1,row:i+1,text}));
   }else{
    const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    rows=content.split(/\r?\n/gu).map((text,i)=>({
     page:1,row:i+1,text
    })).filter(r=>r.text.trim()!=='');
   }
  }catch{
   // Unreadable is explicitly stored, not guessed. No repeated AI calls.
   rows=[];
  }
  const facts=extractLiteralFactsMvp163(d.proposal as DocumentDraft,rows);
  const saved=await io.record({
   p_message_hmac:d.message_hmac,p_source_sha256:hash,
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

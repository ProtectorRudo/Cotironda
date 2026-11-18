/**
 * V2: one commercial reading per supplier original. The first AI extraction
 * is already archived; do not interpret the same PDF a second time merely
 * to let the buyer see its independently consented original.
 *
 * The private source-only replay verifies storage bytes against SHA256 and
 * records a one-shot audit through the EXISTING MVP292 lease. Economic
 * extraction/analysis is optional and independent: never invent a price,
 * adjudicate a sale, or grant buyer access from this worker.
 */
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Download=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
const HASH=/^[a-f0-9]{64}$/u;
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
export type LinkedDocumentResultV2=Readonly<{
 state:'disabled'|'empty'|'original_private'|'review_private'|
  'reconciliation_required';
 processed:0|1;outboundMessages:0
}>;
const done=(state:LinkedDocumentResultV2['state'],processed:0|1):
 LinkedDocumentResultV2=>Object.freeze({state,processed,outboundMessages:0});
async function matchesOriginalSha(blob:Blob,sha:string,size:number):Promise<boolean>{
 if(blob.size!==size||size<8||size>8388608)return false;
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const digest=new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer));
 return Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('')===sha;
}
export async function procesarArchivoVinculadoV2(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 apiKey:string;model:Modelo;documentSemanticEnabled:boolean;
 rpc:Rpc;download:Download;
}):Promise<LinkedDocumentResultV2>{
 if(!args?.enabled||!args.trustedInternalWorker||
  typeof args.rpc!=='function'||typeof args.download!=='function')
  return done('disabled',0);
 const db=async(name:string,params:Record<string,unknown>)=>{
  const out=await args.rpc(name,params);
  if(out.error||!object(out.data)||typeof out.data.state!=='string')
   throw Error('private_rpc_uncertain');
  return out.data;
 };
 let selected:Record<string,unknown>;
 try{selected=await db('cotironda_piloto_next_linked_supplier_document_v2',{})}
 catch{return done('reconciliation_required',0)}
 if(selected.state==='empty')return done('empty',0);
 if(selected.state==='disabled')return done('disabled',0);
 if(selected.state!=='eligible'||typeof selected.source_hmac!=='string'||
  typeof selected.chat_hmac!=='string'||
  !HASH.test(selected.source_hmac)||!HASH.test(selected.chat_hmac))
  return done('reconciliation_required',0);

 const source=selected.source_hmac;
 let reserved=false;
 try{
  // The atomic one-shot lease rejects concurrent workers and duplicate
  // originals. All supplier / buyer / request / SHA checks remain in SQL.
  const claim=await db('cotironda_piloto_reserve_archive_replay_mvp292',{
   p_source_hmac:source,p_chat_hmac:selected.chat_hmac
  });
  if(claim.state!=='reserved')return done('review_private',0);
  reserved=true;
  const expected=claim.sha256;
  const size=claim.size_bytes;
  if(typeof expected!=='string'||!HASH.test(expected)||
   !Number.isSafeInteger(size)||size<8||size>8388608)
   throw Error('invalid_archived_original');
  const fetched=await args.download('media/'+source);
  if(fetched.error||!fetched.data||
   !await matchesOriginalSha(fetched.data,expected,size))
   throw Error('original_sha_mismatch');

  // The sole commercial reading is the immutable first proposal recorded
  // at WhatsApp receipt, never a fresh LLM reparse. Its monetary accuracy
  // is NOT attested by this SHA check; analysis remains independent.
  const draft=claim.draft;
  if(!object(draft)||draft.kind!=='supplier_quote'||
   draft.status!=='review_required'||!Array.isArray(draft.lines)||
   draft.lines.length<1||draft.lines.length>25)
   throw Error('archived_draft_invalid');
  const finished=await db('cotironda_piloto_finish_archive_replay_mvp292',{
   p_source_hmac:source,p_state:'review',
   p_reason:'original_sha_verified_analysis_pending'
  });
  if(finished.state!=='recorded')
   return done('reconciliation_required',1);
  reserved=false;
  return done('original_private',1);
 }catch{
  if(reserved){
   try{
    const finished=await db('cotironda_piloto_finish_archive_replay_mvp292',{
     p_source_hmac:source,p_state:'uncertain',
     p_reason:'source_integrity_review'
    });
    if(finished.state!=='recorded')return done('reconciliation_required',1);
   }catch{return done('reconciliation_required',1)}
  }
  return done('review_private',1);
 }
}

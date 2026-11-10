/** MVP292 — one historical unresolved source per authenticated INTERNAL tick.
 * Zero inbound/outbound Whapi actions. No buyer or supplier participation.
 * A stored PDF or encrypted text is checked against its original SHA before
 * any extra OpenAI work; a unique SQL lease prevents duplicate charges.
 */
import {correlacionAutomaticaMvp291} from './supplier-auto-correlation-mvp291.ts';
import {extraerMaterialesTextoMvp292} from './supplier-text-materials-mvp292.ts';
import {reprocesarOriginalHistoricoMvp292} from './supplier-archive-replay-mvp292.ts';
import {proposeDocumentAI,type DocumentDraft} from './document-ai-draft.ts';
import {promoteVerifiedSupplierQuote} from './supplier-role-hint.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {MediaManifest} from './media-intake.ts';
import {procesarPresupuestoCentralMvp227} from './ai-central-supplier-mvp227.ts';

type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Download=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
type Decrypt=(nonce:string,ciphertext:string,aad:string)=>Promise<string>;
const HEX=/^[a-f0-9]{64}$/u;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const draft=(x:unknown):x is DocumentDraft=>obj(x)&&
 x.kind==='supplier_quote'&&x.status==='review_required'&&
 Array.isArray(x.lines)&&x.lines.length>=1&&x.lines.length<=25&&
 Array.isArray(x.unanswered);
export type WorkerResultMvp292=Readonly<{state:
 'disabled'|'empty'|'linked_private'|'review_required'|'reconciliation_required';
 reason:string;outboundMessages:0;processed:0|1}>;
const done=(state:WorkerResultMvp292['state'],reason:string,processed:0|1):
 WorkerResultMvp292=>Object.freeze({state,reason,outboundMessages:0,processed});
const sameMaterials=(a:DocumentDraft,b:DocumentDraft)=>a.lines.length===b.lines.length&&
 a.lines.every((v,i)=>v.original_description===b.lines[i]?.original_description&&
  v.quantity===b.lines[i]?.quantity&&v.unit===b.lines[i]?.unit);
async function verifyBytes(bytes:Uint8Array,expected:string):Promise<boolean>{
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer)),
  b=>b.toString(16).padStart(2,'0')).join('');
 return actual===expected;
}
export async function procesarPendienteAutomaticoMvp292(args:{
 enabled:boolean;trustedWorker:boolean;rpc:Rpc;download:Download;
 decrypt:Decrypt;shaText:(text:string)=>Promise<string>;
 apiKey:string;model:Modelo;
 documentSemanticEnabled:boolean;textCommercialEnabled:boolean;
 // Optional tests use fake model and internal services, never live sends.
 extract?:typeof extraerMaterialesTextoMvp292;
 correlate?:typeof correlacionAutomaticaMvp291;
 readDocument?:typeof proposeDocumentAI;
 replay?:typeof reprocesarOriginalHistoricoMvp292;
 analyzeText?:typeof procesarPresupuestoCentralMvp227;
}):Promise<WorkerResultMvp292>{
 if(!args?.enabled)return done('disabled','flag_off',0);
 if(!args.trustedWorker||typeof args.rpc!=='function'||
   typeof args.download!=='function'||typeof args.decrypt!=='function'||
   typeof args.shaText!=='function'||typeof args.apiKey!=='string'||
   args.apiKey.length<18)return done('disabled','invalid_worker_credentials',0);
 const db=async(name:string,params:Record<string,unknown>={})=>{
  const r=await args.rpc(name,params);
  if(r.error||!obj(r.data)||typeof r.data.state!=='string')
   throw Error('db_outcome_uncertain');
  return r.data;
 };
 let src:string|null=null,finish:'linked'|'review'|'uncertain'='uncertain';
 let code='source_recovery_unavailable';
 let state:WorkerResultMvp292['state']='reconciliation_required';
 try{
  // Prefer never-attempted sources. Only when the queue is empty, consider
  // one previously reviewed DOCUMENT through a separate, bounded SQL lease.
  let claimed=await db('cotironda_piloto_claim_auto_recovery_mvp292');
  if(claimed.state==='empty')
   claimed=await db('cotironda_piloto_claim_reviewed_auto_recovery_mvp336');
  if(claimed.state!=='claimed')
   return done(claimed.state==='empty'?'empty':'review_required',
    String(claimed.state),0);
  const source=claimed.source_hmac,chat=claimed.chat_hmac,
   hash=claimed.source_sha256,kind=claimed.kind;
  if(!HEX.test(String(source))||!HEX.test(String(chat))||
     !HEX.test(String(hash))||!['text','document','image'].includes(String(kind)))
   return done('reconciliation_required','invalid_claim_data',1);
  src=source as string;
  let observations:readonly {line_no:number;description:string;
    quantity:string|null;unit:string|null}[]|undefined;
  let verifiedSecond:DocumentDraft|undefined;
  if(kind==='text'){
   if(typeof claimed.nonce!=='string'||typeof claimed.ciphertext!=='string')
    throw Error('missing_encrypted_original');
   const text=await args.decrypt(claimed.nonce,claimed.ciphertext,
     String(chat)+'|'+String(source)+'|text');
   if(typeof text!=='string'||text.length<5||text.length>4000||
     await args.shaText(text)!==hash)throw Error('archived_text_sha_invalid');
   const items=await (args.extract??extraerMaterialesTextoMvp292)({
    source:text,apiKey:args.apiKey,model:args.model
   });
   if(!items){finish='review';code='text_materials_not_corrob';state='review_required'}
   else observations=items;
  }else{
   if(typeof claimed.mime!=='string'||
      !['application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain','text/csv'].includes(claimed.mime)||
      !Number.isSafeInteger(claimed.size_bytes)||
      Number(claimed.size_bytes)<8||Number(claimed.size_bytes)>8388608||
      !draft(claimed.draft))throw Error('archived_document_metadata_invalid');
   const download=await args.download('media/'+String(source));
   if(download.error||!download.data||
      download.data.size!==claimed.size_bytes)throw Error('archived_document_missing');
   const bytes=new Uint8Array(await download.data.arrayBuffer());
   if(!await verifyBytes(bytes,String(hash)))throw Error('archived_document_sha_invalid');
   const file:DownloadedMedia={bytes,mime:claimed.mime as string,sha256:hash as string};
   const manifest:MediaManifest={version:1,origin:'whapi',
    kind:kind as 'document'|'image',media_id:'archive-mvp292',
    mime:claimed.mime as string,size:bytes.length,
    filename:null,caption:null,providerSha256:null,
    state:'awaiting_secure_download'};
   const reread=await (args.readDocument??proposeDocumentAI)({
    manifest,file,apiKey:args.apiKey,enabled:true,verifiedSupplier:true,
    perspective:'corroboration'
   });
   const second=promoteVerifiedSupplierQuote(reread,true);
   if(!draft(second)||!sameMaterials(claimed.draft as DocumentDraft,second)){
    finish='review';code='archived_materials_disagree';state='review_required';
   }else verifiedSecond=second;
  }
  if(observations||verifiedSecond){
   const correlated=await (args.correlate??correlacionAutomaticaMvp291)({
    enabled:true,webhookAuthenticated:true,sourceHmac:source as string,
    chatHmac:chat as string,
    ...(observations?{textQuote:observations,textSha256:hash as string}:{}),
    retryReviewedOnce:claimed.retry_reviewed===true,
    apiKey:args.apiKey,model:args.model,rpc:args.rpc
   });
   if(correlated.state==='linked_private'){
    finish='linked';code='archive_bound_to_unique_round';state='linked_private';
    if(kind==='text'&&args.textCommercialEnabled){
     const original=await (args.analyzeText??procesarPresupuestoCentralMvp227)({
      habilitado:true,webhookAutenticado:true,
      messageHmac:source as string,chatHmac:chat as string,
      apiKey:args.apiKey,model:args.model,rpc:args.rpc,
      decrypt:async(nonce,ciphertext)=>args.decrypt(nonce,ciphertext,
       String(chat)+'|'+String(source)+'|text'),
      shaText:args.shaText
     });
     if(original.estado==='conciliacion_requerida')
      code='private_text_quote_needs_reconciliation';
    }
    if(kind!=='text'&&verifiedSecond){
     const replayed=await (args.replay??reprocesarOriginalHistoricoMvp292)({
      enabled:true,trustedInternalWorker:true,
      sourceHmac:source as string,chatHmac:chat as string,
      apiKey:args.apiKey,model:args.model,rpc:args.rpc,
      download:args.download,
      documentSemanticEnabled:args.documentSemanticEnabled,
      corroboration:verifiedSecond,corroborationSha256:hash as string
     });
     if(replayed.state==='reconciliation_required')
      code='archive_quote_replay_needs_reconciliation';
    }
   }else if(correlated.state==='unresolved_private'||
      correlated.state==='not_eligible'){
    finish='review';code='multiple_indistinguishable_rounds';state='review_required';
   }else throw Error('auto_attribution_commit_uncertain');
  }
 }catch{
  // Never log byte content, source contact, ciphertext or model output.
  finish='uncertain';code='archive_recovery_uncertain';state='reconciliation_required';
 }
 if(src){
  try{
   const committed=await db('cotironda_piloto_finish_auto_recovery_mvp292',{
    p_source_hmac:src,p_state:finish,p_reason:code
   });
   if(committed.state!=='recorded')
    return done('reconciliation_required','recovery_ledger_unconfirmed',1);
  }catch{return done('reconciliation_required','recovery_ledger_unconfirmed',1)}
 }
 return done(state,code,src?1:0);
}

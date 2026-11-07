/** MVP290: process an already private, SHA-verified supplier source after
 * the supplier selects its round. Never download from Whapi, replay outbound
 * invitations, or assume a draft proves prices.
 */
import {proposeDocumentAI} from './document-ai-draft.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {MediaManifest} from './media-intake.ts';
import {promoteVerifiedSupplierQuote} from './supplier-role-hint.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {checkSupplierImageSourceMvp251} from './supplier-source-image-mvp251.ts';
import {checkSupplierOfficeSource} from './supplier-source-office.ts';
import {checkSupplierTextSource} from './supplier-source-text.ts';
import {procesarDocumentoCentralMvp245} from './ai-central-document-mvp245.ts';
const HEX=/^[a-f0-9]{64}$/u;
const MIMES=new Set([
 'application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain','text/csv'
]);
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const draft=(x:unknown):x is DocumentDraft=>obj(x)&&
 x.kind==='supplier_quote'&&x.status==='review_required'&&
 Array.isArray(x.lines)&&x.lines.length>=1&&x.lines.length<=25&&
 Array.isArray(x.unanswered);
type Rpc=(fn:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Downloader=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
export type ReplayResultMvp290=Readonly<{state:
 'disabled'|'not_eligible'|'published_private'|'review_required'|
 'reconciliation_required';reason:string;outboundMessages:0}>;
const done=(state:ReplayResultMvp290['state'],reason:string):ReplayResultMvp290=>
 Object.freeze({state,reason,outboundMessages:0});
export async function procesarFuenteArchivadaMvp290(args:{
 enabled:boolean;authenticatedSupplier:boolean;sourceHmac:string;
 chatHmac:string;rpc:Rpc;download:Downloader;
 apiKey:string;model:'gpt-6-luna'|'gpt-6.1-sol';
 allowOneCorroboration:boolean;documentQuoteEnabled:boolean;
 read?:typeof proposeDocumentAI;
 checkPdf?:typeof checkSupplierPdfSource;
}):Promise<ReplayResultMvp290>{
 if(!args?.enabled)return done('disabled','replay_off');
 if(!args.authenticatedSupplier||!HEX.test(args.sourceHmac)||
   !HEX.test(args.chatHmac)||typeof args.rpc!=='function'||
   typeof args.download!=='function')
  return done('not_eligible','invalid_context');
 const db=async(name:string,params:Record<string,unknown>)=>{
  const result=await args.rpc(name,params);
  if(result.error||!obj(result.data)||typeof result.data.state!=='string')
   throw Error('rpc_unavailable');
  return result.data;
 };
 let reserved=false;
 let outcome:'published'|'review'|'uncertain'='uncertain';
 let reason='processing_unavailable';
 let state:ReplayResultMvp290['state']='reconciliation_required';
 try{
  const snapshot=await db('cotironda_piloto_reserve_supplier_replay_mvp290',{
   p_message_hmac:args.sourceHmac,p_chat_hmac:args.chatHmac
  });
  if(snapshot.state!=='reserved')return done('not_eligible',String(snapshot.state));
  reserved=true;
  if(!HEX.test(String(snapshot.sha256))||typeof snapshot.mime!=='string'||
    !MIMES.has(snapshot.mime)||!Number.isInteger(snapshot.size_bytes)||
    (snapshot.size_bytes as number)<8||(snapshot.size_bytes as number)>8388608||
    !draft(snapshot.draft))
   throw Error('invalid_snapshot');
  const expected=snapshot.sha256 as string;
  const mime=snapshot.mime;
  const stored=await args.download('media/'+args.sourceHmac);
  if(stored.error||!stored.data||stored.data.size!==snapshot.size_bytes)
   throw Error('source_download_unavailable');
  const bytes=new Uint8Array(await stored.data.arrayBuffer());
  const actual=Array.from(new Uint8Array(
   await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('source_sha_mismatch');
  const file:DownloadedMedia={bytes,mime,sha256:expected};
  let second:DocumentDraft|null=draft(snapshot.second)?snapshot.second:null;
  if(second===null&&args.allowOneCorroboration&&typeof args.apiKey==='string'&&
    args.apiKey.length>12){
   // The SQL replay lease is unique per source and capped. A duplicate
   // WhatsApp answer cannot purchase another document interpretation.
   const ext=mime==='application/pdf'?'pdf':mime.startsWith('image/')?'jpg':
    mime.includes('spreadsheetml')?'xlsx':mime.includes('wordprocessingml')?'docx':
    mime==='text/plain'?'txt':'csv';
   const manifest:MediaManifest={
    version:1,origin:'whapi',kind:mime.startsWith('image/')?'image':'document',
    media_id:'stored-archived',mime,size:bytes.length,filename:'original.'+ext,
    caption:null,providerSha256:null,state:'awaiting_secure_download'
   };
   const inferred=await (args.read??proposeDocumentAI)({
    manifest,file,apiKey:args.apiKey,enabled:true,verifiedSupplier:true,
    perspective:'corroboration'
   });
   const promoted=promoteVerifiedSupplierQuote(inferred,true);
   if(draft(promoted))second=promoted;
  }
  const copy=snapshot.draft as DocumentDraft;
  const received=await db('cotironda_piloto_record_supplier_media_mvp098',{
    p_message_hmac:args.sourceHmac
  });
  if(received.state!=='stored_unverified'){
   outcome='review';reason='source_already_handled';state='review_required';
  }else if(second===null){
   outcome='review';reason='corroboration_missing';state='review_required';
  }else{
   const compared=await db('cotironda_piloto_compare_supplier_readings_mvp102',{
    p_message_hmac:args.sourceHmac,p_second_proposal:second
   });
   if(compared.state!=='model_readings_match'){
    outcome='review';reason='corroboration_disagreement';state='review_required';
   }else{
    const money=await db('cotironda_piloto_audit_supplier_amounts_mvp103',{
     p_message_hmac:args.sourceHmac
    });
    if(!['balanced','difference','needs_review'].includes(String(money.state)))
     throw Error('amounts_unavailable');
    const checked=mime==='application/pdf'?
     await (args.checkPdf??checkSupplierPdfSource)(file,copy):
     mime.startsWith('image/')?
      await checkSupplierImageSourceMvp251(file,copy,second):
     mime.includes('openxmlformats-officedocument')?
      await checkSupplierOfficeSource(file,copy):
      checkSupplierTextSource(file,copy);
    const sourceResult=await db('cotironda_piloto_record_supplier_source_check_mvp106',{
     p_message_hmac:args.sourceHmac,p_source_sha256:expected,
     p_state:checked.state,p_reason:checked.reason,
     p_line_count:copy.lines.length
    });
    if(sourceResult.state==='source_text_covered'&&money.state==='balanced'){
     const published=await db('cotironda_piloto_publish_source_text_mvp107',{
      p_message_hmac:args.sourceHmac
     });
     if(['published_anonymous','already_published'].includes(String(published.state))){
      outcome='published';reason='source_audited_anonymous';state='published_private';
      // Semantic AI is an additional private stage. Its failure cannot
      // fabricate a public price or roll back an already committed source.
      if(args.documentQuoteEnabled){
       const sem=await procesarDocumentoCentralMvp245({
        habilitado:true,webhookAutenticado:true,
        messageHmac:args.sourceHmac,chatHmac:args.chatHmac,
        sha256:expected,mime,draft:copy,comprobacion:checked,
        apiKey:args.apiKey,model:args.model,rpc:args.rpc
       });
       if(sem.estado==='conciliacion_requerida'){
        outcome='review';reason='semantic_reconciliation_required';
        state='reconciliation_required';
       }
      }
     }else{
      outcome='review';reason='publish_policy_not_permitted';state='review_required';
     }
    }else{
     outcome='review';reason='source_or_amounts_not_covered';state='review_required';
    }
   }
  }
 }catch{/* Never log bytes, proposal, price or customer details. */}
 if(reserved){
  try{
   const end=await db('cotironda_piloto_finish_supplier_replay_mvp290',{
    p_message_hmac:args.sourceHmac,p_state:outcome,p_reason:reason
   });
   if(end.state!=='recorded')return done('reconciliation_required','ledger_not_committed');
  }catch{return done('reconciliation_required','ledger_unconfirmed')}
 }
 return done(state,reason);
}

/** MVP292 — read an archived, securely bound original ONCE.
 * The original bytes are loaded from private Supabase Storage, never Whapi.
 * No buyer/supplier messages or new invitations can originate here.
 */
import {proposeDocumentAI,type DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {MediaManifest} from './media-intake.ts';
import {promoteVerifiedSupplierQuote} from './supplier-role-hint.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {checkSupplierImageSourceMvp251} from './supplier-source-image-mvp251.ts';
import {checkSupplierOfficeSource} from './supplier-source-office.ts';
import {checkSupplierTextSource,type SourceCheckResult} from './supplier-source-text.ts';
import {procesarDocumentoCentralMvp245} from './ai-central-document-mvp245.ts';
import {registrarRevisionEconomicaPrivadaMvp346} from './supplier-economic-revision-mvp346.ts';
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Download=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
const HASH=/^[a-f0-9]{64}$/u;
const MIMES=new Set(['application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain','text/csv']);
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const validDraft=(x:unknown):x is DocumentDraft=>obj(x)&&
 x.kind==='supplier_quote'&&x.status==='review_required'&&
 Array.isArray(x.lines)&&x.lines.length>0&&x.lines.length<=25&&
 Array.isArray(x.unanswered)&&typeof x.total_declared==='string';
export type ReplayResultMvp292=Readonly<{
 state:'disabled'|'not_eligible'|'published_private'|'review_required'|
 'reconciliation_required';reason:string;outboundMessages:0
}>;
const done=(state:ReplayResultMvp292['state'],reason:string):
 ReplayResultMvp292=>Object.freeze({state,reason,outboundMessages:0});
async function verifyBytes(bytes:Uint8Array,sha:string):Promise<boolean>{
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer)),
  b=>b.toString(16).padStart(2,'0')).join('');
 return actual===sha;
}
export async function reprocesarOriginalHistoricoMvp292(args:{
 enabled:boolean;trustedInternalWorker:boolean;sourceHmac:string;chatHmac:string;
 rpc:Rpc;download:Download;apiKey:string;model:Modelo;
 documentSemanticEnabled:boolean;
 // A second reading from the same verified binary may have already been
 // computed by the authenticated recovery worker before attribution.
 corroboration?:DocumentDraft;corroborationSha256?:string;
 // Test-only overridable reading/check, no HTTP calls in synthetic tests.
 read?:typeof proposeDocumentAI;
 sourceCheck?:(f:DownloadedMedia,first:DocumentDraft,second:DocumentDraft)=>Promise<SourceCheckResult>;
 revisionSourceCheck?:(f:DownloadedMedia,revision:DocumentDraft)=>Promise<SourceCheckResult>;
}):Promise<ReplayResultMvp292>{
 if(!args?.enabled)return done('disabled','flag_off');
 if(!args.trustedInternalWorker||!HASH.test(args.sourceHmac)||
  !HASH.test(args.chatHmac)||typeof args.rpc!=='function'||
  typeof args.download!=='function')
  return done('not_eligible','unauthorized_source');
 const db=async(name:string,params:Record<string,unknown>)=>{
  const r=await args.rpc(name,params);
  if(r.error||!obj(r.data)||typeof r.data.state!=='string')
   throw Error('rpc_state_unknown');
  return r.data;
 };
 let reserved=false;
 let state:ReplayResultMvp292['state']='review_required',reason='source_review_required';
 let finishState:'published'|'review'|'uncertain'='review';
 try{
  const snapshot=await db('cotironda_piloto_reserve_archive_replay_mvp292',{
   p_source_hmac:args.sourceHmac,p_chat_hmac:args.chatHmac
  });
  if(snapshot.state!=='reserved')return done('not_eligible',String(snapshot.state));
  reserved=true;
  if(!HASH.test(String(snapshot.sha256))||typeof snapshot.mime!=='string'||
   !MIMES.has(snapshot.mime)||!Number.isSafeInteger(snapshot.size_bytes)||
   (snapshot.size_bytes as number)<8||(snapshot.size_bytes as number)>8388608||
   !validDraft(snapshot.draft))throw Error('archive_snapshot_invalid');
  const sha=snapshot.sha256 as string,mime=snapshot.mime as string;
  const original=await args.download('media/'+args.sourceHmac);
  if(original.error||!original.data||original.data.size!==snapshot.size_bytes)
   throw Error('archive_blob_missing');
  const bytes=new Uint8Array(await original.data.arrayBuffer());
  if(!await verifyBytes(bytes,sha))throw Error('archive_sha_mismatch');
  const file:DownloadedMedia={bytes,mime,sha256:sha};
  const manifest:MediaManifest={version:1,origin:'whapi',
   kind:mime.startsWith('image/')?'image':'document',
   media_id:'archived-mvp292-original',mime,size:bytes.length,
   filename:null,caption:null,providerSha256:null,
   state:'awaiting_secure_download'};
  // One independent corroboration of the already saved first draft.
  const alreadyChecked=args.corroboration&&
   args.corroborationSha256===sha&&validDraft(args.corroboration);
  const reread=alreadyChecked?args.corroboration!:
   await (args.read??proposeDocumentAI)({
    manifest,file,apiKey:args.apiKey,enabled:true,
    perspective:'corroboration',verifiedSupplier:true
   });
  const second=promoteVerifiedSupplierQuote(reread,true);
  if(!validDraft(second))throw Error('secondary_document_invalid');
  const first=snapshot.draft as DocumentDraft;
  const captured=await db('cotironda_piloto_record_supplier_media_mvp098',{
   p_message_hmac:args.sourceHmac
  });
  if(captured.state!=='stored_unverified'){
   reason='source_already_consumed';
  }else{
   // A changed second reading does NOT replace the immutable first reading.
   // It may become a PRIVATE, nonpublishable candidate only after exact
   // arithmetic, SHA and independent full-PDF source coverage all succeed.
   let privateRevisionRecorded=false;
   if(mime==='application/pdf'){
    const revision=await registrarRevisionEconomicaPrivadaMvp346({
     sourceHmac:args.sourceHmac,sourceSha256:sha,file,
     original:first,second,rpc:args.rpc,
     sourceCheck:args.revisionSourceCheck
    });
    if(revision.state==='reconciliation_required')
     throw Error('economic_revision_persistence_uncertain');
    privateRevisionRecorded=revision.state==='candidate_stored';
   }
   const compared=await db('cotironda_piloto_compare_supplier_readings_mvp102',{
    p_message_hmac:args.sourceHmac,p_second_proposal:second
   });
   if(compared.state!=='model_readings_match'){
    reason=privateRevisionRecorded?'economic_revision_candidate_private':
     'independent_readings_differ';
   }else{
    const sums=await db('cotironda_piloto_audit_supplier_amounts_mvp103',{
     p_message_hmac:args.sourceHmac
    });
    let check:SourceCheckResult;
    if(args.sourceCheck){
     check=await args.sourceCheck(file,first,second);
    }else if(mime==='application/pdf'){
     check=await checkSupplierPdfSource(file,first);
    }else if(mime.startsWith('image/')){
     check=await checkSupplierImageSourceMvp251(file,first,second);
    }else if(mime.includes('openxmlformats-officedocument')){
     check=await checkSupplierOfficeSource(file,first);
    }else{
     check=checkSupplierTextSource(file,first);
    }
    const checked=await db('cotironda_piloto_record_supplier_source_check_mvp106',{
     p_message_hmac:args.sourceHmac,p_source_sha256:sha,
     p_state:check.state,p_reason:check.reason,p_line_count:first.lines.length
    });
    if(checked.state==='source_text_covered'&&sums.state==='balanced'){
     const published=await db('cotironda_piloto_publish_source_text_mvp107',{
      p_message_hmac:args.sourceHmac
     });
     if(['published_anonymous','already_published'].includes(String(published.state))){
      finishState='published';state='published_private';reason='independent_source_verified';
      if(args.documentSemanticEnabled){
       const analyzed=await procesarDocumentoCentralMvp245({
        habilitado:true,webhookAutenticado:true,
        messageHmac:args.sourceHmac,chatHmac:args.chatHmac,
        sha256:sha,mime,draft:first,comprobacion:check,
        apiKey:args.apiKey,model:args.model,rpc:args.rpc
       });
       if(analyzed.estado==='conciliacion_requerida')
        reason='semantic_followup_review';
      }
     }else reason='public_projection_not_authorized';
    }else if(sums.reason==='line_multiplication_mismatch'){
      // The supplier's literal unit price and extended line amount conflict.
      // Neither guess an implied price nor call this a discount; only the
      // SHA-verified ORIGINAL can resolve the columns and conditions.
      // Source/amount gates above remain mandatory before any publication.
      reason='unit_price_source_recheck_required';
    }else reason='source_or_amounts_unverified';
   }
  }
 }catch{
  // Missing binary, AI failure, SQL uncertainty: one persisted review,
  // NEVER retry/republish and NEVER reveal a price.
  reason='archive_recovery_uncertain';
  finishState='uncertain';state='reconciliation_required';
 }
 if(reserved){
  try{
   const stored=await db('cotironda_piloto_finish_archive_replay_mvp292',{
    p_source_hmac:args.sourceHmac,p_state:finishState,p_reason:reason
   });
   if(stored.state!=='recorded')
    return done('reconciliation_required','replay_ledger_not_confirmed');
  }catch{return done('reconciliation_required','replay_ledger_not_confirmed')}
 }
 return done(state,reason);
}

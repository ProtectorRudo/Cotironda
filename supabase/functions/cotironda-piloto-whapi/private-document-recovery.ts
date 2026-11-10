/**
 * MVP128: re-read the original, already-private, SHA256-matched file.
 * A verified Whapi event may trigger at most one due recovery in background.
 * No user content is logged, no file is publicly served, no new invitations.
 */
import {proposeDocumentAI,documentFailureCode} from './document-ai-draft.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {checkSupplierImageSourceMvp251} from './supplier-source-image-mvp251.ts';
import {checkSupplierOfficeSource} from './supplier-source-office.ts';
import {checkSupplierTextSource} from './supplier-source-text.ts';
import {auditarFuenteVisualOCRMvp252} from './supplier-visual-ocr-audit-mvp252.ts';
import type {MediaManifest} from './media-intake.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';

type Result={data:unknown;error:unknown};
export type RecoveryIO={
 rpc:(name:string,args:Record<string,unknown>)=>Promise<Result>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
};
const HEX=/^[a-f0-9]{64}$/u,MAX=8*1024*1024;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const data=(r:Result):Record<string,unknown>|null=>!r.error&&obj(r.data)?r.data:null;
const isPdf=(v:string)=>v==='application/pdf';
const goodMime=new Set([
 'application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','text/csv',
 'application/msword','application/vnd.ms-excel'
]);
function manifest(mime:string,size:number):MediaManifest{
 const kind=mime.startsWith('image/')?'image':'document';
 const extension=mime==='application/pdf'?'pdf':
  mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?'docx':
  mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?'xlsx':
  mime==='application/msword'?'doc':mime==='application/vnd.ms-excel'?'xls':
  mime==='text/csv'?'csv':mime==='text/plain'?'txt':mime.split('/').at(-1)??'bin';
 return {version:1,origin:'whapi',kind,media_id:'stored-archived',
  mime,size,filename:'original.'+extension,caption:null,
  providerSha256:null,state:'awaiting_secure_download'};
}
const fail=async(io:RecoveryIO,h:string,code:string)=>{
 const reason=documentFailureCode(Error(code));
 await io.rpc('cotironda_piloto_note_document_failure_mvp127',{
   p_message_hmac:h,p_reason_code:reason,p_phase:'retry'
 }).catch(()=>null);
};
export async function recoverOneStoredDocument(args:{
 io:RecoveryIO;triggerChatHmac:string;apiKey:string;
 enabled:boolean;read?:typeof proposeDocumentAI;
 onSupplierReceipt?:(messageHmac:string)=>Promise<void>;
 visualOcr?:{
  enabled:boolean;externalConsent:boolean;serviceAccountJson:string;
  fetchImpl?:typeof fetch;
 }
}):Promise<'none'|'recovered_private'|'failed'>{
 const {io,triggerChatHmac,apiKey}=args;
 if(!args.enabled||!HEX.test(triggerChatHmac))return 'none';
 let h:string|null=null;
 try{
  const found=data(await io.rpc('cotironda_piloto_next_document_retry_mvp128',{
   p_trigger_chat_hmac:triggerChatHmac
  }));
  if(found?.state!=='candidate'||typeof found.message_hmac!=='string'||
     !HEX.test(found.message_hmac))return 'none';
  h=found.message_hmac;
  const reserved=data(await io.rpc('cotironda_piloto_reserve_document_retry_mvp127',{
   p_message_hmac:h
  }));
  if(reserved?.state!=='reserved')return 'none';
  const mime=reserved.mime,sha=reserved.source_sha256,size=reserved.size_bytes;
  if(typeof mime!=='string'||!goodMime.has(mime)||
     typeof sha!=='string'||!HEX.test(sha)||
     !Number.isSafeInteger(size)||typeof size!=='number'||size<8||size>MAX)
    throw Error('doc_ai_input_invalid');
  const stored=await io.download('media/'+h);
  if(stored.error||!stored.data)throw Error('doc_ai_transport_unavailable');
  if(stored.data.size!==size||stored.data.size>MAX)
    throw Error('doc_ai_input_invalid');
  const bytes=new Uint8Array(await stored.data.arrayBuffer());
  if(bytes.length!==size)throw Error('doc_ai_input_invalid');
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
   b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==sha)throw Error('doc_ai_input_invalid');
  const file:DownloadedMedia={bytes,mime,sha256:actual};
  const m=manifest(mime,size);
  const read=args.read??proposeDocumentAI;
  const readings=await Promise.allSettled([
   read({manifest:m,file,apiKey,enabled:true,perspective:'primary'}),
   read({manifest:m,file,apiKey,enabled:true,perspective:'corroboration'})
  ]);
  const first=readings[0].status==='fulfilled'?readings[0].value:null;
  const second=readings[1].status==='fulfilled'?readings[1].value:null;
  const proposal=first??second;
  if(!proposal)throw readings[0].status==='rejected'?readings[0].reason:
   Error('doc_ai_response_incomplete');
  const saved=await io.rpc('cotironda_piloto_note_media_proposal_mvp095',{
   p_message_hmac:h,p_proposal:proposal
  });
  if(saved.error||saved.data!==true)throw Error('draft_persistence_failed');
  await io.rpc('cotironda_piloto_note_document_draft_mvp127',{
   p_message_hmac:h,p_needs_corrob:!first||!second
  });
  if(proposal.kind!=='supplier_quote')return 'recovered_private';
  // Everything below is private. All RPCs independently recheck ownership,
  // consent, original content hash, active invitation and round deadline.
  const received=data(await io.rpc('cotironda_piloto_record_supplier_media_mvp098',{
   p_message_hmac:h
  }));
  if(received?.state!=='stored_unverified'&&received?.state!=='duplicate')
   return 'recovered_private';
  // This is a genuinely NEW supplier-media receipt, already private and
  // durably bound to its source. Async thank-you is an independent option;
  // duplicate revisions and failed sender transports never retry.
  // Process the document while the independent thank-you is in flight.
  // A slow Whapi response must never delay source checking. The finalizer
  // still awaits ACK reconciliation before releasing the background lease.
  const receiptHmac=h;
  const ackTask=received.state==='stored_unverified'&&args.onSupplierReceipt
   ?Promise.resolve().then(()=>args.onSupplierReceipt!(receiptHmac!))
     .catch(()=>{})
   :null;
  try{
  const compared=data(await io.rpc('cotironda_piloto_compare_supplier_readings_mvp102',{
   p_message_hmac:h,p_second_proposal:first&&second?second:null
  }));
  if(compared?.state!=='model_readings_match')return 'recovered_private';
  const audited=data(await io.rpc('cotironda_piloto_audit_supplier_amounts_mvp103',{
   p_message_hmac:h
  }));
  if(!audited||!['balanced','difference','needs_review'].includes(String(audited.state)))
   return 'recovered_private';
  const source=isPdf(mime)?await checkSupplierPdfSource(file,proposal):
   mime.startsWith('image/')?
    await checkSupplierImageSourceMvp251(file,proposal,second):
   mime.includes('openxmlformats-officedocument')?
    await checkSupplierOfficeSource(file,proposal):
    checkSupplierTextSource(file,proposal);
  // OCR independiente se ejecuta SOLO en recuperación, nunca dentro del
  // webhook crítico de WhatsApp, con dos autorizaciones y cuotas previas.
  // El resultado NO cambia source.state ni se usa para publicar precios:
  // el SQL MVP106 todavía prohíbe imágenes sin fuente acreditada.
  if(source.state!=='source_text_covered'&&
     (mime.startsWith('image/')||mime==='application/pdf')&&
     args.visualOcr?.enabled===true&&args.visualOcr.externalConsent===true){
    // Tercer gate: consentimiento EXTERNO de comprador y proveedor,
    // presupuesto mensual y lease único por SHA en SQL MVP253.
    // Con la política OFF por defecto jamás se envía un original.
    const permission=data(await io.rpc('cotironda_piloto_visual_ocr_permission_mvp252',{
      p_message_hmac:h,p_source_sha256:actual
    }).catch(()=>({data:null,error:true})));
    const lease=permission?.reservation_token;
    if(permission?.state==='approved_for_private_processing'&&
       permission.source_sha256===actual&&
       typeof lease==='string'&&
       /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(lease)){
      // El OCR es un intento facturable, aunque falle el proveedor.
      // El ledger queda reservado; ningún retry vuelve a transmitirlo.
      const visual=await auditarFuenteVisualOCRMvp252({
        source:file,primary:proposal,secondary:second,
        enabled:true,externalConsent:true,
        serviceAccountJson:args.visualOcr.serviceAccountJson,
        fetchImpl:args.visualOcr.fetchImpl
      });
      const positive=visual.state==='source_ocr_covered_private';
      const persisted=data(await io.rpc('cotironda_piloto_visual_ocr_finish_mvp253',{
        p_message_hmac:h,p_source_sha256:actual,p_reservation_token:lease,
        p_state:positive?'covered_private':'needs_review',
        p_reason:visual.reason,p_pages:visual.pages??0,
        p_min_confidence_milli:positive?visual.minConfidenceMilli:null,
        p_ocr_text_sha256:positive?visual.ocrTextSha256:null
      }));
      if(persisted?.state!=='saved_private')
       throw Error('visual_ocr_private_ledger_reconciliation_required');
      // Telemetría sin precios, archivo, participante ni huella HMAC.
      console.info('cotironda_visual_ocr_'+visual.state);
    }
  }
  const sourceResult=data(await io.rpc('cotironda_piloto_record_supplier_source_check_mvp106',{
   p_message_hmac:h,p_source_sha256:actual,p_state:source.state,
   p_reason:source.reason,p_line_count:proposal.lines.length
  }));
  if(sourceResult?.state==='source_text_covered'&&audited.state==='balanced'){
   await io.rpc('cotironda_piloto_publish_source_text_mvp107',{
    p_message_hmac:h
   });
  }
  return 'recovered_private';
  }finally{
   if(ackTask)await ackTask;
  }
 }catch(err){
  if(h)await fail(io,h,err instanceof Error?err.message:'internal_error');
  return 'failed';
 }
}

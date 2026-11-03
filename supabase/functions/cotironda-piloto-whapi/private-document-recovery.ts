/**
 * MVP128: re-read the original, already-private, SHA256-matched file.
 * A verified Whapi event may trigger at most one due recovery in background.
 * No user content is logged, no file is publicly served, no new invitations.
 */
import {proposeDocumentAI,documentFailureCode} from './document-ai-draft.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {checkSupplierOfficeSource} from './supplier-source-office.ts';
import {checkSupplierTextSource} from './supplier-source-text.ts';
import type {MediaManifest} from './media-intake.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';

type Result={data:unknown;error:unknown};
export type RecoveryIO={
 rpc:(name:string,args:Record<string,unknown>)=>Promise<Result>;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
};
const HEX=/^[a-f0-9]{64}$/u,MAX=3145728;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const data=(r:Result):Record<string,unknown>|null=>!r.error&&obj(r.data)?r.data:null;
const isPdf=(v:string)=>v==='application/pdf';
const goodMime=new Set([
 'application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','text/csv'
]);
function manifest(mime:string,size:number):MediaManifest{
 const kind=mime.startsWith('image/')?'image':'document';
 const extension=mime==='application/pdf'?'pdf':
  mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?'docx':
  mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?'xlsx':
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
 enabled:boolean;read?:typeof proposeDocumentAI
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
   mime.includes('openxmlformats-officedocument')?
    await checkSupplierOfficeSource(file,proposal):
    checkSupplierTextSource(file,proposal);
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
 }catch(err){
  if(h)await fail(io,h,err instanceof Error?err.message:'internal_error');
  return 'failed';
 }
}

/**
 * B5d — restricted, versioned intake of 2 archived B2 PDF candidates plus
 * independently linked PDF/XLSX originals. PRIVATE ONLY, no quote publication.
 * Each source is chosen by a service_role SQL claim, never by a request body.
 * A historical candidate is rechecked WITHOUT calling OpenAI again.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {auditarComercialPrivadoB5} from './auditoria-comercial-b5.ts';
import {comprobarRenglonesPdfOriginalB5,type EvidenceReaderB5}
 from './evidencia-pdf-original-b5.ts';
import {leerPresupuestoSombraV2,type ShadowReadResultV2}
 from './lector-sombra.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}};
type Read=(args:Parameters<typeof leerPresupuestoSombraV2>[0])=>
 Promise<ShadowReadResultV2>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type State='disabled'|'empty'|'candidate_private'|'review_required'|
 'reconciliation_required';
export type PrivateReviewOutcomeB5d=Readonly<{
 state:State;reason:string;processed:0|1;
 publishedOffers:0;outboundMessages:0;sourceVerified:false;
}>;
const HEX=/^[a-f0-9]{64}$/u;
const PDF='application/pdf';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const VERSION='v2_b5d_20261110';
const MAX_BYTES=8*1024*1024;
const isObject=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const result=(state:State,reason:string,processed:0|1):
 PrivateReviewOutcomeB5d=>Object.freeze({
  state,reason,processed,publishedOffers:0,outboundMessages:0,sourceVerified:false
 });
async function safeRpc(rpc:Rpc,name:string,p:Record<string,unknown>={}):
 Promise<Record<string,unknown>>{
 const {data,error}=await rpc(name,p);
 if(error||!isObject(data)||typeof data.state!=='string')
  throw Error('private_rpc_uncertain');
 return data;
}
async function sha256(bytes:Uint8Array):Promise<string>{
 const h=new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer));
 return Array.from(h,v=>v.toString(16).padStart(2,'0')).join('');
}

export async function revisarArchivosVersionadosB5d(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 rpc:Rpc;storage:Storage;apiKey:string;model:Model;
 readPdfEvidence?:EvidenceReaderB5;read?:Read;
}):Promise<PrivateReviewOutcomeB5d>{
 if(!args?.enabled)return result('disabled','flag_off',0);
 if(!args.trustedInternalWorker||typeof args.rpc!=='function'||
    !args.storage||typeof args.storage.from!=='function'||
    typeof args.apiKey!=='string'||args.apiKey.length<18)
  return result('disabled','invalid_worker',0);
 let claim:Record<string,unknown>;
 try{claim=await safeRpc(args.rpc,'cotironda_piloto_claim_v2_review_b5d')}
 catch{return result('reconciliation_required','claim_uncertain',0)}
 if(claim.state==='empty')return result('empty','queue_empty',0);
 if(claim.state==='disabled'||claim.state==='quota')
  return result('disabled',claim.state==='quota'?'quota':'flag_off',0);
 if(claim.state!=='claimed')
  return result('reconciliation_required','claim_unexpected',0);
 const source=claim.source_hmac,sha=claim.source_sha256,
  size=claim.size_bytes,mime=claim.mime,mode=claim.source_mode;
 if(typeof source!=='string'||!HEX.test(source)||
    typeof sha!=='string'||!HEX.test(sha)||
    typeof size!=='number'||!Number.isSafeInteger(size)||
    size<120||size>MAX_BYTES||
    (mime!==PDF&&mime!==XLSX)||
    (mode!=='historical_pdf'&&mode!=='linked_quote')||
    (mode==='historical_pdf'&&mime!==PDF)||
    claim.processor_version!==VERSION||
    (mode==='linked_quote'&&claim.historic_candidate!==null)||
    (mode==='historical_pdf'&&!isObject(claim.historic_candidate)))
  return result('reconciliation_required','claim_metadata_invalid',1);
 let state:'candidate_private'|'review'|'uncertain'='uncertain';
 let code='b5d_source_unavailable';
 let candidate:unknown=null,diagnostics:unknown=null;
 try{
  const download=await args.storage.from('cotironda-piloto-originals')
   .download('media/'+source);
  if(download.error||!(download.data instanceof Blob)||
    download.data.size!==size)throw Error('storage_unavailable');
  const original=new Uint8Array(await download.data.arrayBuffer());
  if(original.length!==size||await sha256(original)!==sha){
   state='review';code='b5d_sha_mismatch';
  }else{
   let raw:unknown;
   if(mode==='historical_pdf')raw=claim.historic_candidate;
   else{
    const response=await (args.read??leerPresupuestoSombraV2)({
     enabled:true,trustedInternalWorker:true,bytes:original,
     sha256:sha,mime: String(mime),apiKey:args.apiKey,
     model:args.model
    });
    if(!isObject(response)||response.source_sha256!==sha||
       response.always_private!==true||response.can_publish!==false||
       response.can_rank!==false||response.outbound_messages!==0)
     throw Error('private_reader_contract');
    if(response.state==='private_extraction_unverified'&&
       ['candidate_only','incomplete_source',
        'spreadsheet_requires_cell_audit'].includes(response.code))
     raw=response.document;
   }
   const checked=revisarContratoProveedorV2(raw);
   if(checked.state!=='private_extract'||!checked.document||
      checked.document.lines.length<1){
    state='review';code='b5d_bad_candidate';
   }else{
    const doc=checked.document;
    const commercial=auditarComercialPrivadoB5(doc);
    const proof=mime===PDF&&args.readPdfEvidence
     ?await comprobarRenglonesPdfOriginalB5({
      originalBytes:original,sourceSha256:sha,candidate:doc,
      readPdf:args.readPdfEvidence})
     :null;
    const lineChecks=checked.line_diagnostics.map((d,i)=>({
      ...d,source_b5:proof?.lines[i]?.state??'source_not_checked',
      source_reason_b5:proof?.reason??(mime===XLSX
       ?'spreadsheet_requires_cell_audit':'reader_unavailable'),
      arithmetic_b5:commercial.lines[i]?.result??'insufficient_numeric_data',
      source_verified:false,can_publish:false
    }));
    // SQL protects the private table from uncontrolled model payloads.
    if(JSON.stringify(doc).length>240000||
       JSON.stringify(lineChecks).length>48000){
     state='review';code='b5d_payload_limits';
    }else{
     state='candidate_private';
     candidate=doc;diagnostics=lineChecks;
     code=mime===XLSX?'b5d_cell_audit_pending':
      proof?.state==='source_rows_correspond_private'
       ?'b5d_rows_match_not_complete':'b5d_pdf_review_pending';
    }
   }
  }
 }catch{
  // No original text, archive key, contact, URL or model error in response.
  state='uncertain';code='b5d_read_uncertain';
  candidate=null;diagnostics=null;
 }
 try{
  const finished=await safeRpc(args.rpc,'cotironda_piloto_finish_v2_review_b5d',{
   p_source_hmac:source,p_source_sha256:sha,p_state:state,
   p_reason_code:code,p_candidate:candidate,p_diagnostics:diagnostics
  });
  if(finished.state!=='recorded')
   return result('reconciliation_required','finish_unconfirmed',1);
 }catch{return result('reconciliation_required','finish_unconfirmed',1)}
 return result(state==='candidate_private'?'candidate_private':
  state==='review'?'review_required':'reconciliation_required',code,1);
}

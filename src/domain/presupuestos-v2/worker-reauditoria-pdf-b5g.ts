/**
 * B5g — recheck the 2 already archived B5d historical PDF candidates.
 * Independent original PDF.js reading, same exact SHA, never a model call.
 * Writes diagnostic codes to a NEW versioned private ledger only.
 * Absolutely no quote publication, WhatsApp, ranking or contact reveal.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {auditarComercialPrivadoB5} from './auditoria-comercial-b5.ts';
import {comprobarRenglonesPdfOriginalB5,type EvidenceReaderB5}
 from './evidencia-pdf-original-b5.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}};
type State='disabled'|'empty'|'private_source_observed'|
 'review_required'|'reconciliation_required';
export type PdfReauditOutcomeB5g=Readonly<{
 state:State;reason:string;processed:0|1;
 publishedOffers:0;outboundMessages:0;
 sourceVerified:false;canRank:false;canRevealContacts:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const VERSION='v2_b5g_20261111';
const objective=(state:State,reason:string,processed:0|1):
 PdfReauditOutcomeB5g=>Object.freeze({
  state,reason,processed,publishedOffers:0,outboundMessages:0,
  sourceVerified:false,canRank:false,canRevealContacts:false
 });
const isObject=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
async function call(rpc:Rpc,name:string,
 args:Record<string,unknown>={}):Promise<Record<string,unknown>>{
 const {data,error}=await rpc(name,args);
 if(error||!isObject(data)||typeof data.state!=='string')
  throw Error('rpc_uncertain');
 return data;
}
async function sha256(bytes:Uint8Array):Promise<string>{
 const a=new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer));
 return Array.from(a,n=>n.toString(16).padStart(2,'0')).join('');
}
/**
 * One source/tick chosen by SQL. No input to choose supplier or round;
 * no OpenAI key argument; originals stay in storage. One-off version:
 * never re-run B5d, alter its candidate or clear a historical lease.
 */
export async function reauditarPdfHistoricoB5g(args:{
 enabled:boolean;trustedInternalWorker:boolean;rpc:Rpc;
 storage:Storage;readPdfEvidence?:EvidenceReaderB5;
}):Promise<PdfReauditOutcomeB5g>{
 if(args?.enabled!==true)return objective('disabled','flag_off',0);
 if(args.trustedInternalWorker!==true||
    typeof args.rpc!=='function'||typeof args.storage?.from!=='function')
  return objective('disabled','invalid_worker',0);
 let claimed:Record<string,unknown>;
 try{claimed=await call(args.rpc,'cotironda_piloto_claim_v2_pdf_b5g')}
 catch{return objective('reconciliation_required','claim_uncertain',0)}
 if(claimed.state==='empty')return objective('empty','empty',0);
 if(claimed.state==='quota'||claimed.state==='disabled')
  return objective('disabled','flag_or_quota',0);
 if(claimed.state!=='claimed')
  return objective('reconciliation_required','claim_unknown',0);
 const src=claimed.source_hmac,sha=claimed.source_sha256,
  size=claimed.size_bytes;
 if(typeof src!=='string'||!HASH.test(src)||
    typeof sha!=='string'||!HASH.test(sha)||
    claimed.processor_version!==VERSION||
    typeof size!=='number'||!Number.isSafeInteger(size)||
    size<120||size>8388608||!isObject(claimed.historic_candidate))
  return objective('reconciliation_required','claim_invalid',1);
 let state:'private_source_observed'|'review'|'uncertain'='uncertain';
 let code='b5g_source_unavailable';
 let diagnostics:unknown=null;
 try{
  const d=await args.storage.from('cotironda-piloto-originals')
   .download('media/'+src);
  if(d.error||!(d.data instanceof Blob)||d.data.size!==size)
   throw Error('archive_unavailable');
  const original=new Uint8Array(await d.data.arrayBuffer());
  if(original.length!==size||await sha256(original)!==sha){
   state='review';code='b5g_sha_mismatch';
  }else{
   const parsed=revisarContratoProveedorV2(claimed.historic_candidate);
   if(parsed.state!=='private_extract'||!parsed.document||
      parsed.document.lines.length<1){
    state='review';code='b5g_candidate_not_valid';
   }else if(typeof args.readPdfEvidence!=='function'){
    state='review';code='b5g_reader_unavailable';
   }else{
    const proof=await comprobarRenglonesPdfOriginalB5({
     originalBytes:original,sourceSha256:sha,
     candidate:parsed.document,readPdf:args.readPdfEvidence});
    const discounts=proof.sha_verified&&proof.source_sha256===sha
     ?proof.lines.flatMap(row=>row.state==='source_line_corresponds'&&
        row.discount_evidence
        ?[{ordinal:row.ordinal,...row.discount_evidence}]:[])
     :[];
    const arith=auditarComercialPrivadoB5(parsed.document,[],discounts);
    const lines=parsed.line_diagnostics.map((row,i)=>({
     ...row,source_b5:proof.lines[i]?.state??'source_not_located',
     source_reason_b5:proof.reason,
     source_total_b5:proof.total_state??'source_total_unverified',
     source_discount_b5:proof.lines[i]?.discount_evidence?.origin??
      'source_discount_unverified',
     arithmetic_b5:arith.lines[i]?.result??'insufficient_numeric_data',
     source_verified:false,can_publish:false,can_rank:false
    }));
    if(JSON.stringify(lines).length>48000){
     state='review';code='b5g_payload_limit';
    }else{
     diagnostics=lines;
     state=proof.state==='source_rows_correspond_private'
      ?'private_source_observed':'review';
     code=state==='private_source_observed'?
      'b5g_pdf_source_private':'b5g_source_review_required';
    }
   }
  }
 }catch{
  state='uncertain';code='b5g_read_uncertain';diagnostics=null;
 }
 try{
  const saved=await call(args.rpc,'cotironda_piloto_finish_v2_pdf_b5g',{
   p_source_hmac:src,p_source_sha256:sha,p_state:state,
   p_reason_code:code,p_diagnostics:diagnostics
  });
  if(saved.state!=='recorded')
   return objective('reconciliation_required','finish_unconfirmed',1);
 }catch{return objective('reconciliation_required','finish_unconfirmed',1)}
 return objective(
  state==='private_source_observed'?'private_source_observed':
   state==='review'?'review_required':'reconciliation_required',code,1);
}

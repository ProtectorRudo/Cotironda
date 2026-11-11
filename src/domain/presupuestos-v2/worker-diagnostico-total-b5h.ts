/**
 * B5h — a NEW, private, versioned diagnosis of the two historical PDFs.
 * One source per tick. No LLM, no old-ledger changes, no public projections.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {comprobarRenglonesPdfOriginalB5,type EvidenceReaderB5}
  from './evidencia-pdf-original-b5.ts';
import {diagnosticarTotalPdfB5h} from './diagnostico-total-pdf-b5h.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
  Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
  Promise<{data:Blob|null;error:unknown}>}};
type State='disabled'|'empty'|'private_diagnosed'|'review_required'|
  'reconciliation_required';
export type TotalOutcomeB5h=Readonly<{
  state:State;reason:string;processed:0|1;
  publishedOffers:0;outboundMessages:0;
  sourceVerified:false;canRank:false;canRevealContacts:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const VERSION='v2_b5h_20261111';
const outcome=(state:State,reason:string,processed:0|1):TotalOutcomeB5h=>
 Object.freeze({state,reason,processed,publishedOffers:0,outboundMessages:0,
  sourceVerified:false,canRank:false,canRevealContacts:false});
const isObject=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
async function rpcResult(rpc:Rpc,name:string,args:Record<string,unknown>={}):
  Promise<Record<string,unknown>>{
 const {data,error}=await rpc(name,args);
 if(error||!isObject(data)||typeof data.state!=='string')
   throw Error('rpc_unconfirmed');
 return data;
}
async function digest(bytes:Uint8Array):Promise<string>{
 const d=new Uint8Array(await crypto.subtle.digest('SHA-256',
   Uint8Array.from(bytes).buffer));
 return Array.from(d,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function diagnosticarPdfHistoricoB5h(args:{
 enabled:boolean;trustedInternalWorker:boolean;rpc:Rpc;
 storage:Storage;readPdfEvidence?:EvidenceReaderB5;
}):Promise<TotalOutcomeB5h>{
 if(args?.enabled!==true)return outcome('disabled','flag_off',0);
 if(args.trustedInternalWorker!==true||typeof args.rpc!=='function'||
    typeof args.storage?.from!=='function')
   return outcome('disabled','invalid_worker',0);
 let claim:Record<string,unknown>;
 try{claim=await rpcResult(args.rpc,'cotironda_piloto_claim_v2_total_b5h')}
 catch{return outcome('reconciliation_required','claim_unconfirmed',0)}
 if(claim.state==='empty')return outcome('empty','queue_empty',0);
 if(claim.state==='disabled'||claim.state==='quota')
   return outcome('disabled','mode_or_quota',0);
 if(claim.state!=='claimed')
   return outcome('reconciliation_required','claim_invalid_state',0);
 const src=claim.source_hmac,sha=claim.source_sha256;
 const size=claim.size_bytes;
 if(typeof src!=='string'||!HASH.test(src)||
    typeof sha!=='string'||!HASH.test(sha)||
    !Number.isSafeInteger(size)||typeof size!=='number'||
    size<120||size>8388608||claim.processor_version!==VERSION||
    !isObject(claim.historic_candidate))
   return outcome('reconciliation_required','claim_invalid',1);
 let state:'private_diagnosed'|'review'|'uncertain'='uncertain';
 let reason='b5h_source_unavailable';
 let diagnostic:unknown=null;
 try{
   const file=await args.storage.from('cotironda-piloto-originals')
     .download('media/'+src);
   if(file.error||!(file.data instanceof Blob)||file.data.size!==size)
     throw Error('archive_unavailable');
   const bytes=new Uint8Array(await file.data.arrayBuffer());
   if(bytes.length!==size||await digest(bytes)!==sha){
     state='review';reason='b5h_sha_mismatch';
   }else{
     const parsed=revisarContratoProveedorV2(claim.historic_candidate);
     if(parsed.state!=='private_extract'||!parsed.document||
       parsed.document.lines.length<1){
       state='review';reason='b5h_bad_candidate';
     }else if(typeof args.readPdfEvidence!=='function'){
       state='review';reason='b5h_reader_unavailable';
     }else{
       // PDF.js is run once and the exact rows are reused for the B5 proof.
       const raw=await args.readPdfEvidence(bytes);
       const proof=await comprobarRenglonesPdfOriginalB5({
         originalBytes:bytes,sourceSha256:sha,
         candidate:parsed.document,readPdf:async()=>raw
       });
       if(!proof.sha_verified||proof.source_sha256!==sha||
          raw.scanned||raw.pages<1||raw.pages>12||
          !Array.isArray(raw.rows)||raw.rows.length<1||
          proof.lines.length!==parsed.document.lines.length||
          proof.lines.some(x=>x.state!=='source_line_corresponds')){
         state='review';reason='b5h_original_not_verified';
       }else{
         const total=diagnosticarTotalPdfB5h(
           raw.rows,parsed.document.total_declared_raw);
         diagnostic={
           ...total,proof_reason:proof.reason,
           matched_lines:proof.lines.filter(
             x=>x.state==='source_line_corresponds').length,
           expected_lines:parsed.document.lines.length
         };
         state='private_diagnosed';reason='b5h_private_total_diagnosis';
       }
     }
   }
 }catch{
   state='uncertain';reason='b5h_read_uncertain';diagnostic=null;
 }
 try{
   const saved=await rpcResult(args.rpc,'cotironda_piloto_finish_v2_total_b5h',{
     p_source_hmac:src,p_source_sha256:sha,p_state:state,
     p_reason_code:reason,p_diagnostics:diagnostic
   });
   if(saved.state!=='recorded')
     return outcome('reconciliation_required','finish_unconfirmed',1);
 }catch{return outcome('reconciliation_required','finish_unconfirmed',1)}
 return outcome(state==='private_diagnosed'?'private_diagnosed':
   state==='review'?'review_required':'reconciliation_required',reason,1);
}

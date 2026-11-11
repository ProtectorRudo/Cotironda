/**
 * B5i — versioned PRIVATE investigation of two B5h historical PDF totals.
 * One original SHA-checked PDF per tick, no model, no publish, no fallthrough.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {comprobarRenglonesPdfOriginalB5,type EvidenceReaderB5}
 from './evidencia-pdf-original-b5.ts';
import {diagnosticarGeometriaTotalB5i} from './diagnostico-geometria-total-b5i.ts';
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}};
export type GeometryOutcomeB5i=Readonly<{
 state:'disabled'|'empty'|'private_diagnosed'|'review_required'|
  'reconciliation_required';
 reason:string;processed:0|1;
 outboundMessages:0;publishedOffers:0;
 sourceVerified:false;canRank:false;canRevealContacts:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const VERSION='v2_b5i_20261111';
const result=(state:GeometryOutcomeB5i['state'],reason:string,
 processed:0|1):GeometryOutcomeB5i=>Object.freeze({
 state,reason,processed,outboundMessages:0,publishedOffers:0,
 sourceVerified:false,canRank:false,canRevealContacts:false
});
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
async function rpc(r:Rpc,name:string,args:Record<string,unknown>={}):
 Promise<Record<string,unknown>>{
 const {data,error}=await r(name,args);
 if(error||!obj(data)||typeof data.state!=='string')
  throw Error('rpc_unconfirmed');
 return data;
}
async function digest(bytes:Uint8Array):Promise<string>{
 const raw=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer);
 return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,'0'))
  .join('');
}
export async function diagnosticarGeometriaHistoricaB5i(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 rpc:Rpc;storage:Storage;readPdfEvidence?:EvidenceReaderB5;
}):Promise<GeometryOutcomeB5i>{
 if(args?.enabled!==true)return result('disabled','flag_off',0);
 if(args.trustedInternalWorker!==true||typeof args.rpc!=='function'||
    typeof args.storage?.from!=='function')
   return result('disabled','invalid_worker',0);
 let claim:Record<string,unknown>;
 try{claim=await rpc(args.rpc,'cotironda_piloto_claim_v2_geometry_b5i');}
 catch{return result('reconciliation_required','claim_unconfirmed',0);}
 if(claim.state==='empty')return result('empty','queue_empty',0);
 if(claim.state==='disabled'||claim.state==='quota')
  return result('disabled','mode_or_quota',0);
 if(claim.state!=='claimed')
  return result('reconciliation_required','claim_state_unknown',0);
 const src=claim.source_hmac,sha=claim.source_sha256,size=claim.size_bytes;
 if(typeof src!=='string'||!HASH.test(src)||typeof sha!=='string'||
    !HASH.test(sha)||typeof size!=='number'||
    !Number.isSafeInteger(size)||size<120||size>8388608||
    claim.processor_version!==VERSION||!obj(claim.historic_candidate))
  return result('reconciliation_required','claim_invalid',1);
 let state:'private_diagnosed'|'review'|'uncertain'='uncertain';
 let reason='b5i_source_unavailable';
 let diagnostic:unknown=null;
 try{
  const downloaded=await args.storage.from('cotironda-piloto-originals')
   .download('media/'+src);
  if(downloaded.error||!(downloaded.data instanceof Blob)||
      downloaded.data.size!==size)throw Error('source_missing');
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
  if(bytes.length!==size||await digest(bytes)!==sha){
   state='review';reason='b5i_sha_mismatch';
  }else{
   const parsed=revisarContratoProveedorV2(claim.historic_candidate);
   if(parsed.state!=='private_extract'||!parsed.document||
      parsed.document.lines.length<1){
    state='review';reason='b5i_candidate_invalid';
   }else if(typeof args.readPdfEvidence!=='function'){
    state='review';reason='b5i_reader_unavailable';
   }else{
    const geometry=await args.readPdfEvidence(bytes);
    const proof=await comprobarRenglonesPdfOriginalB5({
      originalBytes:bytes,sourceSha256:sha,
      candidate:parsed.document,readPdf:async()=>geometry
    });
    if(!proof.sha_verified||proof.source_sha256!==sha||
        geometry.scanned||geometry.pages<1||geometry.pages>12||
        !Array.isArray(geometry.rows)||geometry.rows.length<1||
        proof.lines.length!==parsed.document.lines.length||
        proof.lines.some(x=>x.state!=='source_line_corresponds')){
      state='review';reason='b5i_line_proof_unconfirmed';
    }else{
      const check=diagnosticarGeometriaTotalB5i({
        rows:geometry.rows,declaredTotal:parsed.document.total_declared_raw,
        lines:parsed.document.lines
      });
      diagnostic={
        ...check,proof_reason:proof.reason,
        matched_lines:proof.lines.filter(x=>
         x.state==='source_line_corresponds').length,
        expected_lines:parsed.document.lines.length
      };
      state='private_diagnosed';reason='b5i_private_geometry_diagnosis';
    }
   }
  }
 }catch{
  state='uncertain';reason='b5i_read_uncertain';diagnostic=null;
 }
 try{
   const saved=await rpc(args.rpc,'cotironda_piloto_finish_v2_geometry_b5i',{
    p_source_hmac:src,p_source_sha256:sha,p_state:state,
    p_reason_code:reason,p_diagnostics:diagnostic
   });
   if(saved.state!=='recorded')
    return result('reconciliation_required','finish_unconfirmed',1);
 }catch{return result('reconciliation_required','finish_unconfirmed',1);}
 return result(state==='private_diagnosed'?'private_diagnosed':
   state==='review'?'review_required':'reconciliation_required',reason,1);
}

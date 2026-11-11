/**
 * B5k: one original archived supplier PDF per tick, SHA checked, no LLM.
 * Reuse B5 proof, B5i geometry and B5k deterministic arithmetic.
 * Versioned, private ledger only; NEVER alters prior evidence or offers.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {comprobarRenglonesPdfOriginalB5,type EvidenceReaderB5}
 from './evidencia-pdf-original-b5.ts';
import {diagnosticarGeometriaTotalB5i} from './diagnostico-geometria-total-b5i.ts';
import {reconciliarEconomiaTotalB5j} from './reconciliacion-economica-b5j.ts';
import {cotejarMonedaOriginalB5k} from './cotejo-moneda-original-b5k.ts';
import {auditarCoberturaPdfOriginalB5l} from './auditoria-cobertura-original-b5l.ts';
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}};
export type CurrencyOutcomeB5k=Readonly<{
 state:'disabled'|'empty'|'private_diagnosed'|'review_required'|
  'reconciliation_required';
 reason:string;processed:0|1;outboundMessages:0;publishedOffers:0;
 sourceVerified:false;canRank:false;canRevealContacts:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const VERSION='v2_b5k_20261111';
const result=(state:CurrencyOutcomeB5k['state'],reason:string,
 processed:0|1):CurrencyOutcomeB5k=>Object.freeze({
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
export async function cotejarPdfMonedaHistoricaB5k(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 rpc:Rpc;storage:Storage;readPdfEvidence?:EvidenceReaderB5;
}):Promise<CurrencyOutcomeB5k>{
 if(args?.enabled!==true)return result('disabled','flag_off',0);
 if(args.trustedInternalWorker!==true||typeof args.rpc!=='function'||
    typeof args.storage?.from!=='function')
   return result('disabled','invalid_worker',0);
 let claim:Record<string,unknown>;
 try{claim=await rpc(args.rpc,'cotironda_piloto_claim_v2_currency_b5k');}
 catch{return result('reconciliation_required','claim_unconfirmed',0);}
 if(claim.state==='empty')return result('empty','queue_empty',0);
 if(claim.state==='disabled'||claim.state==='quota')
  return result('disabled','mode_or_quota',0);
 if(claim.state!=='claimed')
  return result('reconciliation_required','claim_state_unknown',0);
 const src=claim.source_hmac,sha=claim.source_sha256,size=claim.size_bytes;
 if(typeof src!=='string'||!HASH.test(src)||typeof sha!=='string'||
    !HASH.test(sha)||typeof size!=='number'||!Number.isSafeInteger(size)||
    size<120||size>8388608||claim.processor_version!==VERSION||
    !obj(claim.historic_candidate))
  return result('reconciliation_required','claim_invalid',1);
 let state:'private_diagnosed'|'review'|'uncertain'='uncertain';
 let reason='b5k_source_unavailable';let diagnostics:unknown=null;
 try{
  const file=await args.storage.from('cotironda-piloto-originals')
   .download('media/'+src);
  if(file.error||!(file.data instanceof Blob)||file.data.size!==size)
   throw Error('source_missing');
  const bytes=new Uint8Array(await file.data.arrayBuffer());
  if(bytes.length!==size||await digest(bytes)!==sha){
   state='review';reason='b5k_sha_mismatch';
  }else{
   const parsed=revisarContratoProveedorV2(claim.historic_candidate);
   if(parsed.state!=='private_extract'||!parsed.document||
      parsed.document.lines.length<1){
    state='review';reason='b5k_candidate_invalid';
   }else if(typeof args.readPdfEvidence!=='function'){
    state='review';reason='b5k_reader_unavailable';
   }else{
    const reading=await args.readPdfEvidence(bytes);
    const proof=await comprobarRenglonesPdfOriginalB5({
     originalBytes:bytes,sourceSha256:sha,
     candidate:parsed.document,readPdf:async()=>reading
    });
    if(!proof.sha_verified||proof.source_sha256!==sha||
       reading.scanned||reading.pages<1||reading.pages>12||
       !Array.isArray(reading.rows)||reading.rows.length<1||
       proof.lines.length!==parsed.document.lines.length||
       proof.lines.some(x=>x.state!=='source_line_corresponds')){
     state='review';reason='b5k_line_proof_unconfirmed';
    }else{
     const geometry=diagnosticarGeometriaTotalB5i({
       rows:reading.rows,declaredTotal:parsed.document.total_declared_raw,
       lines:parsed.document.lines
     });
     const currency=cotejarMonedaOriginalB5k({
       candidate:parsed.document,source:proof,geometry,rows:reading.rows
     });
     const economic=reconciliarEconomiaTotalB5j({
       candidate:parsed.document,source:proof,geometry,rows:reading.rows,
       currencyEvidence:currency
     });
     const coverage=auditarCoberturaPdfOriginalB5l({
       candidate:parsed.document,source:proof,geometry,
       rows:reading.rows,pages:reading.pages,scanned:reading.scanned
     });
     diagnostics={
       currency_code:currency.code,
       iso_verified:currency.currency_iso_verified,
       currency_material_count:currency.material_count,
       currency_lines_with_symbol:currency.material_lines_with_symbol,
       currency_units_with_symbol:currency.unit_prices_with_symbol,
       currency_footer_with_symbol:currency.footer_with_symbol,
       economic_code:economic.code,
       economic_material_count:economic.material_count,
       economic_material_matches:economic.material_arithmetic_matches,
       economic_conditions_count:economic.source_condition_count,
       economic_conditions_matches:economic.conditions_corroborated,
       economic_total_balances:economic.material_total_matches_declared,
       coverage_code:coverage.code,
       coverage_source_rows:coverage.source_rows,
       coverage_attributed_rows:coverage.attributed_rows,
       coverage_unattributed_rows:coverage.unattributed_rows,
       coverage_lines:coverage.source_lines,
       coverage_lines_matched:coverage.attributed_lines,
       coverage_conditions:coverage.commercial_conditions,
       coverage_conditions_matched:coverage.corroborated_conditions,
       coverage_pages:coverage.page_count,
       proof_reason:proof.reason,
       matched_lines:proof.lines.filter(x=>
        x.state==='source_line_corresponds').length,
       expected_lines:parsed.document.lines.length,
       source_verified:false,full_document_covered:false,
       can_publish:false,can_rank:false,can_reveal_contacts:false
     };
     state='private_diagnosed';reason='b5k_private_currency_diagnosis';
    }
   }
  }
 }catch{
  state='uncertain';reason='b5k_read_uncertain';diagnostics=null;
 }
 try{
  const saved=await rpc(args.rpc,'cotironda_piloto_finish_v2_currency_b5k',{
   p_source_hmac:src,p_source_sha256:sha,p_state:state,
   p_reason_code:reason,p_diagnostics:diagnostics
  });
  if(saved.state!=='recorded')
   return result('reconciliation_required','finish_unconfirmed',1);
 }catch{return result('reconciliation_required','finish_unconfirmed',1);}
 return result(state==='private_diagnosed'?'private_diagnosed':
   state==='review'?'review_required':'reconciliation_required',reason,1);
}

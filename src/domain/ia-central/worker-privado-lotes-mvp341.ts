/**
 * MVP341 — INTERNAL ONLY, no HTTP route, no cron, no Whapi messages.
 * Read one original from the private bucket, prove SHA and metadata,
 * reserve durable processing (MVP340), then call 2 isolated IA reads
 * per lot (MVP339). Never publish prices or contact data.
 *
 * The caller MUST enforce its own authentication before setting
 * trustedInternal=true. All dependencies are injected to avoid imports
 * of Deno-only libraries into the Next.js domain.
 */
import {
 procesarLotesIAInternosMvp339,
 type SolicitudLectorMvp339,type LecturaLoteMvp339
} from './procesador-ia-lotes-mvp339.ts';
import {crearReservaSqlMvp340} from './puente-reserva-sql-mvp340.ts';
import type {ResultadoBinarioMvp338,OriginalPrivadoMvp338} from
 './fuente-binaria-privada-mvp338.ts';

type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Download=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
type Reader=(original:OriginalPrivadoMvp338)=>Promise<ResultadoBinarioMvp338>;
type Interpreter=(req:SolicitudLectorMvp339)=>Promise<LecturaLoteMvp339>;
const HEX=/^[a-f0-9]{64}$/u;
const KEY=/^[a-z][a-z0-9_-]{2,90}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MIME=new Set([
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain','text/csv'
]);
const MAX=8388608;
const record=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
type Source=Readonly<{
 state:'candidate';messageHmac:string;chatHmac:string;
 supplierKey:string;roundId:string;sourceSha256:string;
 mime:OriginalPrivadoMvp338['mime'];sizeBytes:number;storagePath:string;
}>;
export type ResultadoWorkerMvp341=Readonly<{
 state:'disabled'|'not_eligible'|'already_processed'|'review_required'|
  'reconciliation_required'|'analysis_ready_private'|'budget_limited';
 reason:string;rows:number;modelCalls:number;whatsappMessages:0;
 economicPublicationAllowed:false;quotesPublished:0;
}>;
const done=(state:ResultadoWorkerMvp341['state'],reason:string,
 rows=0,modelCalls=0):ResultadoWorkerMvp341=>Object.freeze({
 state,reason,rows,modelCalls,whatsappMessages:0,
 economicPublicationAllowed:false,quotesPublished:0
});
function candidate(x:unknown,source:string):x is Source{
 if(!record(x)||x.state!=='candidate')return false;
 const k=['state','messageHmac','chatHmac','supplierKey','roundId',
  'sourceSha256','mime','sizeBytes','storagePath'];
 return Object.keys(x).length===k.length&&
  x.messageHmac===source&&HEX.test(String(x.chatHmac))&&
  HEX.test(String(x.sourceSha256))&&KEY.test(String(x.supplierKey))&&
  UUID.test(String(x.roundId))&&MIME.has(String(x.mime))&&
  Number.isSafeInteger(x.sizeBytes)&&Number(x.sizeBytes)>=8&&
  Number(x.sizeBytes)<=MAX&&x.storagePath==='media/'+source;
}
/**
 * Not eligible or uncertain source is never read from Storage; invalid
 * source cannot trigger remote paid models. Caller must supply an internal
 * interpreter with its own configured, audited credential/cost limit.
 */
export async function procesarOriginalPrivadoMvp341(args:{
 enabled:boolean;trustedInternal:boolean;sourceHmac:string;
 maxModelCalls:number;rpc:Rpc;download:Download;
 readBinary:Reader;interpret:Interpreter;
}):Promise<ResultadoWorkerMvp341>{
 if(args?.enabled!==true)return done('disabled','flag_off');
 if(args?.trustedInternal!==true||!HEX.test(args?.sourceHmac??'')||
    typeof args.rpc!=='function'||typeof args.download!=='function'||
    typeof args.readBinary!=='function'||typeof args.interpret!=='function'||
    !Number.isSafeInteger(args.maxModelCalls)||
    args.maxModelCalls<2||args.maxModelCalls>12)
  return done('disabled','internal_authorization_or_budget_invalid');
 const db=async(name:string,params:Record<string,unknown>)=>{
  const response=await args.rpc(name,params);
  if(response?.error!==null&&response?.error!==undefined||
     !record(response?.data)||typeof response.data.state!=='string')
   throw Error('mvp341_db_response_uncertain');
  return response.data;
 };
 let raw:Record<string,unknown>;
 try{
  raw=await db('cotironda_piloto_source_for_lots_mvp341',{
   p_message_hmac:args.sourceHmac
  });
 }catch{return done('reconciliation_required','source_lookup_uncertain')}
 if(raw.state==='already_processed')
  return done('already_processed','source_already_leased');
 if(raw.state==='not_eligible')
  return done('not_eligible','source_unavailable');
 if(!candidate(raw,args.sourceHmac))
  return done('reconciliation_required','source_metadata_unverifiable');
 const source=raw;
 let bytes:Uint8Array;
 try{
  // Exact private path selected by SQL, never by supplier filename or URL.
  const response=await args.download('media/'+args.sourceHmac);
  if(response?.error!==null&&response?.error!==undefined||
     !(response?.data instanceof Blob)||
     response.data.size!==source.sizeBytes)return done(
      'review_required','original_missing_or_size_mismatch');
  bytes=new Uint8Array(await response.data.arrayBuffer());
  if(bytes.length!==source.sizeBytes||bytes.length>MAX)
   return done('review_required','original_missing_or_size_mismatch');
 }catch{return done('review_required','original_download_unavailable')}
 let evidence:ResultadoBinarioMvp338;
 try{
  evidence=await args.readBinary({
   mime:source.mime,bytes,sha256:source.sourceSha256
  });
 }catch{return done('review_required','private_source_parser_unavailable')}
 if(evidence?.state!=='evidence_planned_private'||!evidence.plan||
    evidence.sourceSha256!==source.sourceSha256||
    evidence.economicPublicationAllowed!==false||
    evidence.whatsappMessages!==0)
  return done('review_required','source_evidence_requires_review');
 const plan=evidence.plan;
 if(plan.state!=='planned'||plan.sourceSha256!==source.sourceSha256||
    !Array.isArray(plan.lots)||plan.lots.length===0||
    plan.lots.length>60||plan.totalRows<1||
    plan.totalRows!==evidence.rows)
  return done('review_required','source_plan_unverifiable');
 const needed=plan.lots.length*2;
 if(needed>args.maxModelCalls)
  return done('budget_limited','worker_per_tick_model_budget',plan.totalRows);
 try{
  const scope={
   roundId:source.roundId,supplierKey:source.supplierKey,
   messageHmac:source.messageHmac,chatHmac:source.chatHmac
  };
  const bridge=await crearReservaSqlMvp340({scope,plan,rpc:args.rpc});
  const analyzed=await procesarLotesIAInternosMvp339({
   scope,plan,budget:bridge.budget,reserve:bridge.reserve,
   finish:bridge.finish,interpret:args.interpret
  });
  if(analyzed.state==='ready_for_independent_source_audit')
   return done('analysis_ready_private','independent_economic_audit_pending',
    analyzed.agreedRows,analyzed.modelCalls);
  if(analyzed.state==='already_processed')
   return done('already_processed','source_already_leased',plan.totalRows);
  if(analyzed.state==='not_eligible')
   return done('not_eligible','source_not_eligible_after_read',plan.totalRows);
  if(analyzed.state==='budget_limited')
   return done('budget_limited','budget_preflight_rejected',plan.totalRows);
  if(analyzed.state==='reconciliation_required')
   return done('reconciliation_required','durable_ledger_reconciliation_required',
    plan.totalRows,analyzed.modelCalls);
  return done('review_required','double_reading_not_corrob',
   plan.totalRows,analyzed.modelCalls);
 }catch{
  // Never retry automatically. A previous AI call or SQL commit may have
  // succeeded and its response may have been lost. Operators reconcile.
  return done('reconciliation_required','private_worker_uncertain',
   plan.totalRows);
 }
}

/**
 * MVP342 — metered extension of the private MVP341 worker.
 *
 * Every paid call: SQL BEGIN (unique), model, AES-GCM encrypt in memory,
 * SQL FINISH with observed provider usage. Unknown usage blocks future
 * calls. No plaintext in SQL. No inferred monetary costs. No WhatsApp.
 *
 * Only a trusted Edge composition root can inject the server-only key and
 * service_role-only RPC. This module creates NO endpoint or cron.
 */
import {procesarOriginalPrivadoMvp341,type ResultadoWorkerMvp341} from
 './worker-privado-lotes-mvp341.ts';
import {prepararClaveLotesMvp342,cifrarLecturaMvp342} from
 './cifrado-lectura-lotes-mvp342.ts';
import type {SolicitudLectorMvp339,LecturaLoteMvp339} from
 './procesador-ia-lotes-mvp339.ts';
import type {ResultadoBinarioMvp338,OriginalPrivadoMvp338} from
 './fuente-binaria-privada-mvp338.ts';
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Medida=Readonly<{
 inputTokens:number;outputTokens:number;totalTokens:number;
 responseId:string
}>;
export type RespuestaMedidaMvp342=Readonly<{
 reading:LecturaLoteMvp339;usage:Medida
}>;
const SHA=/^[a-f0-9]{64}$/u,RECEIPT=/^[a-f0-9]{32}$/u;
const REPLY=/^resp_[A-Za-z0-9_-]{8,160}$/u;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);
const allowed=new Set(['gpt-6-luna','gpt-6.1-sol']);
const hex=(a:Uint8Array)=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
function validUsage(u:unknown):u is Medida{
 if(!obj(u)||!REPLY.test(String(u.responseId))||
    ![u.inputTokens,u.outputTokens,u.totalTokens].every(v=>
      Number.isSafeInteger(v)&&typeof v==='number'&&v>=0&&v<=600000))
  return false;
 return (u.inputTokens as number)<=300000&&
  (u.outputTokens as number)<=300000&&
  u.totalTokens===(u.inputTokens as number)+(u.outputTokens as number);
}
export async function procesarOriginalMedidoMvp342(args:{
 enabled:boolean;trustedInternal:boolean;sourceHmac:string;
 maxModelCalls:number;model:'gpt-6-luna'|'gpt-6.1-sol';
 encryptionHex:string;rpc:Rpc;
 download:(path:string)=>Promise<{data:Blob|null;error:unknown}>;
 readBinary:(file:OriginalPrivadoMvp338)=>Promise<ResultadoBinarioMvp338>;
 readModel:(req:SolicitudLectorMvp339)=>Promise<RespuestaMedidaMvp342>;
}):Promise<ResultadoWorkerMvp341>{
 // Never run even a lookup with missing encryption or model credentials.
 if(args?.enabled!==true||args?.trustedInternal!==true)
  return Object.freeze({state:'disabled',reason:'flag_or_trust_off',rows:0,
   modelCalls:0,whatsappMessages:0,economicPublicationAllowed:false,quotesPublished:0});
 if(!allowed.has(args.model)||typeof args.readModel!=='function')
  return Object.freeze({state:'disabled',reason:'model_unconfigured',rows:0,
   modelCalls:0,whatsappMessages:0,economicPublicationAllowed:false,quotesPublished:0});
 let key:CryptoKey;
 try{key=await prepararClaveLotesMvp342(args.encryptionHex)}
 catch{
  return Object.freeze({state:'disabled',reason:'encryption_unconfigured',
   rows:0,modelCalls:0,whatsappMessages:0,
   economicPublicationAllowed:false,quotesPublished:0});
 }
 const baseRpc=args.rpc;
 const rpc=async(name:string,params:Record<string,unknown>)=>{
  const x=await baseRpc(name,params);
  if(x?.error!==null&&x?.error!==undefined||!obj(x?.data)||
    typeof x.data.state!=='string')
   throw Error('mvp342_private_db_unknown');
  return x.data;
 };
 let receipt:string|null=null,planSha:string|null=null;
 let scope:Readonly<{sourceSha:string;sourceHmac:string;chatHmac:string;
   roundId:string;supplierKey:string}>|null=null;
 const proxiedRpc:Rpc=async(name,params)=>{
  if(name==='cotironda_piloto_finish_supplier_lots_mvp340'&&
     params.p_state==='analysis_ready_private'){
   if(!scope||!receipt||!planSha)
    throw Error('mvp342_missing_audit_scope');
   const audit=await rpc('cotironda_piloto_observed_lots_mvp342',{
    p_message_hmac:scope.sourceHmac,p_receipt:receipt,
    p_plan_sha256:planSha
   });
   if(audit.state!=='observed_complete')
    throw Error('mvp342_usage_not_fully_observed');
  }
  const response=await baseRpc(name,params);
  if(name==='cotironda_piloto_reserve_supplier_lots_mvp340'&&
     obj(response?.data)&&response.data.state==='reserved'){
   const d=response.data;
   if(!RECEIPT.test(String(d.receipt))||
      d.sourceSha256!==params.p_source_sha256||
      d.messageHmac!==params.p_message_hmac||
      d.chatHmac!==params.p_chat_hmac||
      d.roundId!==params.p_round_id||
      d.supplierKey!==params.p_supplier_key||
      !SHA.test(String(params.p_plan_sha256)))
    throw Error('mvp342_reservation_identity_mismatch');
   receipt=d.receipt as string;planSha=params.p_plan_sha256 as string;
   scope={
    sourceSha:d.sourceSha256 as string,
    sourceHmac:d.messageHmac as string,
    chatHmac:d.chatHmac as string,
    roundId:d.roundId as string,supplierKey:d.supplierKey as string
   };
  }
  return response;
 };
 const interpret=async(req:SolicitudLectorMvp339):Promise<LecturaLoteMvp339>=>{
  const activeScope=scope,activeReceipt=receipt,activePlan=planSha;
  if(!activeScope||!activeReceipt||!activePlan||
     req.sourceSha256!==activeScope.sourceSha)
   throw Error('mvp342_no_durable_reservation');
  const fields={
   p_message_hmac:activeScope.sourceHmac,p_receipt:activeReceipt,
   p_plan_sha256:activePlan,p_lot_number:req.lotNumber,
   p_perspective:req.perspective,p_lot_digest:req.lotDigest,
   p_model:args.model
  };
  const begin=await rpc('cotironda_piloto_begin_lot_call_mvp342',fields);
  if(begin.state!=='reserved')throw Error('mvp342_budget_or_duplicate_blocked');
  const unmetered=async(reason:'network_uncertain'|'http_failure'|
   'response_read_failed'|'usage_missing'|'invalid_usage')=>{
   const finish=await rpc('cotironda_piloto_finish_lot_call_mvp342',{
    ...fields,p_state:'unmetered',p_reason:reason,
    p_nonce_b64:null,p_ciphertext_b64:null,
    p_cleartext_sha256:null,p_response_id_sha256:null,
    p_input_tokens:null,p_output_tokens:null,p_total_tokens:null
   });
   if(finish.state!=='recorded')throw Error('mvp342_usage_unconfirmed');
  };
  let measured:RespuestaMedidaMvp342;
  try{measured=await args.readModel(req)}
  catch{
   try{await unmetered('network_uncertain')}catch{}
   throw Error('mvp342_model_or_transport_uncertain');
  }
  if(!validUsage(measured?.usage)){
   try{await unmetered('invalid_usage')}catch{}
   throw Error('mvp342_usage_invalid');
  }
  try{
   const reading=measured.reading;
   const ctx={
    sourceSha256:activeScope.sourceSha,
    sourceHmac:activeScope.sourceHmac,
    chatHmac:activeScope.chatHmac,roundId:activeScope.roundId,
    supplierKey:activeScope.supplierKey,planSha256:activePlan,
    receipt:activeReceipt,lotNumber:req.lotNumber,
    lotDigest:req.lotDigest,perspective:req.perspective,model:args.model
   };
   const encrypted=await cifrarLecturaMvp342({key,context:ctx,reading});
   const responseHash=hex(new Uint8Array(await crypto.subtle.digest(
    'SHA-256',new TextEncoder().encode(measured.usage.responseId))));
   const finish=await rpc('cotironda_piloto_finish_lot_call_mvp342',{
    ...fields,p_state:'observed',p_reason:null,
    p_nonce_b64:encrypted.ivB64,p_ciphertext_b64:encrypted.ciphertextB64,
    p_cleartext_sha256:encrypted.sha256,
    p_response_id_sha256:responseHash,
    p_input_tokens:measured.usage.inputTokens,
    p_output_tokens:measured.usage.outputTokens,
    p_total_tokens:measured.usage.totalTokens
   });
   if(finish.state!=='recorded')throw Error('mvp342_persist_uncertain');
   return reading;
  }catch{
   // If the observed finish was committed but its HTTP reply was lost,
   // do not overwrite or rerun; the parent ledger goes to reconciliation.
   throw Error('mvp342_encrypted_evidence_unconfirmed');
  }
 };
 return procesarOriginalPrivadoMvp341({
  enabled:args.enabled,trustedInternal:args.trustedInternal,
  sourceHmac:args.sourceHmac,maxModelCalls:args.maxModelCalls,
  rpc:proxiedRpc,download:args.download,
  readBinary:args.readBinary,interpret
 });
}

/**
 * MVP328 — INTERNAL library only; no HTTP route, cron, DB credentials,
 * OpenAI, Whapi, buyer view or automatic economic approval.
 *
 * A trusted caller must independently authenticate an operator, enforce
 * company/request scope, hold a non-exportable AES key and supply a
 * service_role-scoped RPC. These prerequisites are NOT implemented here.
 * The source is decrypted in-memory, SHA audited by MVP327 and never returned.
 */
import {
 cotejarOriginalTextualMvp327,
 type PropuestaInternaMvp327
} from './conciliacion-original-textual-mvp327.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Snapshot=Record<string,unknown>;
export type ResultadoCustodiaMvp328=Readonly<{
 estado:'deshabilitado'|'no_elegible'|'custodia_incompleta'|
  'registrado_privado'|'ya_registrado'|'conciliacion_incierta';
 resultadoComercial:'requiere_evidencia'|
  'candidato_para_auditoria_independiente'|null;
 publicacionPermitida:false;
 revisionOriginalModificada:false;
 mensajesEnviados:0;
 llamadasIA:0;
}>;
const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha=/^[a-f0-9]{64}$/u;
const noncePattern=/^[A-Za-z0-9+/]{16}$/u;
const ciphertextPattern=/^[A-Za-z0-9+/=]{24,20000}$/u;
const state=(estado:ResultadoCustodiaMvp328['estado'],
 resultadoComercial:ResultadoCustodiaMvp328['resultadoComercial']=null):
 ResultadoCustodiaMvp328=>Object.freeze({
 estado,resultadoComercial,publicacionPermitida:false,
 revisionOriginalModificada:false,mensajesEnviados:0,llamadasIA:0
});
const obj=(v:unknown):v is Snapshot=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Snapshot,keys:readonly string[]):boolean=>
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const summaryFields=[
 'state','request_id','message_hmac','chat_hmac','source_sha256',
 'latest_message_hmac','latest_source_sha256','finished_at','format',
 'nonce','ciphertext','items'
] as const;
const itemFields=['id','descripcion','cantidad','unidad','rubro'] as const;
async function digest(text:string):Promise<string>{
 const bytes=new TextEncoder().encode(text);
 const d=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function validateSnapshot(
 v:unknown,requestId:string,messageHmac:string,chatHmac:string
):v is Snapshot{
 if(!obj(v)||!exact(v,summaryFields)||v.state!=='eligible_encrypted'||
    v.request_id!==requestId||v.message_hmac!==messageHmac||
    v.latest_message_hmac!==messageHmac||v.chat_hmac!==chatHmac||
    !sha.test(String(v.source_sha256))||
    v.source_sha256!==v.latest_source_sha256||
    v.format!=='text'||typeof v.finished_at!=='string'||
    !Number.isFinite(Date.parse(v.finished_at))||
    !noncePattern.test(String(v.nonce))||
    !ciphertextPattern.test(String(v.ciphertext))||
    !Array.isArray(v.items)||v.items.length<1||v.items.length>25)
  return false;
 return v.items.every((line:unknown)=>{
  if(!obj(line)||!exact(line,itemFields))return false;
  return /^item_[1-9][0-9]{0,2}$/u.test(String(line.id))&&
   typeof line.descripcion==='string'&&line.descripcion.length<=500&&
   typeof line.cantidad==='string'&&
   typeof line.unidad==='string'&&
   typeof line.rubro==='string';
 });
}
function validateItems(proposal:PropuestaInternaMvp327,raw:unknown[]):boolean{
 if(!Array.isArray(proposal.pedido)||
   proposal.pedido.length!==raw.length)return false;
 const byId=new Map<string,unknown>();
 for(const row of raw){
  if(!obj(row)||byId.has(String(row.id)))return false;
  byId.set(String(row.id),row);
 }
 for(const item of proposal.pedido){
  const match=byId.get(item.id);
  if(!obj(match)||!exact(match,itemFields)||
    Object.keys(item).length!==itemFields.length||
    item.descripcion!==match.descripcion||item.cantidad!==match.cantidad||
    item.unidad!==match.unidad||item.rubro!==match.rubro)return false;
 }
 return true;
}
function b64(s:string):Uint8Array{
 const bytes=atob(s);
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
}
async function openAesGcm(
 aesKey:CryptoKey,nonce:string,ciphertext:string,aad:string
):Promise<string>{
 const iv=b64(nonce),bytes=b64(ciphertext);
 if(iv.length!==12||bytes.length<17||bytes.length>10000)
  throw Error('mvp328_invalid_envelope');
 const original=await crypto.subtle.decrypt({
  name:'AES-GCM',iv:new Uint8Array(iv).buffer,
  additionalData:new TextEncoder().encode(aad),tagLength:128
 },aesKey,new Uint8Array(bytes).buffer);
 const result=new TextDecoder('utf-8',{fatal:true}).decode(original);
 if(result.length<5||result.length>4000)throw Error('mvp328_source_length');
 return result;
}
export async function cotejarYRegistrarPrivadoMvp328(args:{
 enabled:boolean;
 trustedInternalWorker:boolean;
 operatorIdentityVerified:boolean;
 actorSubjectSha256:string;
 requestId:string;
 messageHmac:string;
 chatHmac:string;
 aesKey:CryptoKey;
 rpc:Rpc;
 propuesta:PropuestaInternaMvp327;
}):Promise<ResultadoCustodiaMvp328>{
 if(args?.enabled!==true)return state('deshabilitado');
 if(args.trustedInternalWorker!==true||
    args.operatorIdentityVerified!==true||
    !sha.test(String(args.actorSubjectSha256))||
    !id.test(String(args.requestId))||
    !sha.test(String(args.messageHmac))||
    !sha.test(String(args.chatHmac))||
    typeof args.rpc!=='function'||!args.propuesta||
    !args.aesKey||args.aesKey.type!=='secret'||
    args.aesKey.extractable!==false||
    args.aesKey.algorithm.name!=='AES-GCM'||
    !args.aesKey.usages.includes('decrypt'))return state('deshabilitado');
 let raw:unknown;
 try{
  const res=await args.rpc('cotironda_piloto_read_reconciliation_envelope_mvp328',{
   p_request_id:args.requestId,
   p_message_hmac:args.messageHmac,
   p_chat_hmac:args.chatHmac
  });
  if(res.error)return state('conciliacion_incierta');
  raw=res.data;
 }catch{return state('conciliacion_incierta')}
 if(obj(raw)&&raw.state==='not_found')return state('no_elegible');
 if(!validateSnapshot(raw,args.requestId,args.messageHmac,args.chatHmac))
  return state('custodia_incompleta');
 if(!validateItems(args.propuesta,raw.items as unknown[])||
    args.propuesta.requestId!==args.requestId)
   return state('custodia_incompleta');

 let source:string;
 try{
  source=await openAesGcm(args.aesKey,raw.nonce as string,
   raw.ciphertext as string,args.chatHmac+'|'+args.messageHmac+'|text');
  if(await digest(source)!==raw.source_sha256)
   return state('custodia_incompleta');
 }catch{return state('custodia_incompleta')}
 const decision=await cotejarOriginalTextualMvp327({
  requestId:args.requestId,
  mensajeHmac:args.messageHmac,
  mensajeMasRecienteHmac:raw.latest_message_hmac as string,
  fuenteSha256:raw.source_sha256 as string,
  fuenteMasRecienteSha256:raw.latest_source_sha256 as string,
  estadoRevision:'review',
  finalizadaEn:raw.finished_at as string,
  formato:'text',textoOriginal:source
 },args.propuesta);
 // This audit hash commits to the proposed line mapping and outcome.
 // No original, quote, supplier, contact or price is persisted in the ledger.
 let evidenceHash:string,idempotencyKey:string;
 try{
  const evidence=JSON.stringify({
   request_id:args.requestId,message_hmac:args.messageHmac,
   source_sha256:raw.source_sha256,
   requested:args.propuesta.pedido,
   quote_lines:args.propuesta.oferta.lineas,
   quote_links:args.propuesta.oferta.vinculos,
   conditions:{
    currency:args.propuesta.oferta.moneda,iva:args.propuesta.oferta.iva,
    freight:args.propuesta.oferta.flete,payment:args.propuesta.oferta.pago
   },
   state:decision.state,reasons:decision.motivos
  });
  if(evidence.length>50000)return state('custodia_incompleta');
  evidenceHash=await digest(evidence);
  idempotencyKey=await digest(
   'mvp328|'+args.actorSubjectSha256+'|'+args.requestId+'|'+
   args.messageHmac+'|'+evidenceHash
  );
 }catch{return state('custodia_incompleta')}

 // A failed/lost SQL ack never retries a paid model or releases a quote.
 // A second human request can re-check the idempotency key in the ledger.
 try{
  const res=await args.rpc('cotironda_piloto_record_reconciliation_attempt_mvp328',{
   p_request_id:args.requestId,p_message_hmac:args.messageHmac,
   p_source_sha256:raw.source_sha256,
   p_idempotency_key:idempotencyKey,
   p_evidence_sha256:evidenceHash,
   p_actor_subject_sha256:args.actorSubjectSha256,
   p_result_state:decision.state==='candidato_para_auditoria_independiente'
    ?'candidate_only':'requires_evidence',
   p_reason_codes:decision.motivos
  });
  if(res.error||!obj(res.data))return state('conciliacion_incierta');
  if(res.data.state==='recorded_private')
   return state('registrado_privado',decision.state);
  if(res.data.state==='already_recorded')
   return state('ya_registrado',decision.state);
  if(res.data.state==='not_eligible')
   return state('no_elegible');
  return state('conciliacion_incierta');
 }catch{return state('conciliacion_incierta')}
}

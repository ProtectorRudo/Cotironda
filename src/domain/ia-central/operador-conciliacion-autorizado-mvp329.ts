/**
 * MVP329 / INTERNAL ONLY: consume a SINGLE-USE proof issued from a signed
 * Supabase Auth AAL2 session + operator account + per-buyer, per-round grant.
 * This is NOT an HTTP endpoint, never responds with source or economic data.
 * Caller must be an isolated server worker holding service_role and AES key.
 *
 * No actor id or "operator verified" flag is accepted from request payloads.
 * The actor comes only from the verified claim RPC after ticket consumption.
 */
import {
 cotejarYRegistrarPrivadoMvp328,
 type ResultadoCustodiaMvp328
} from './custodia-conciliacion-interna-mvp328.ts';
import type {PropuestaInternaMvp327} from
 './conciliacion-original-textual-mvp327.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type ResultadoMvp329=Readonly<{
 estado:'deshabilitado'|'no_autorizado'|'conciliacion_incierta'|
 'registrado_privado'|'ya_registrado'|'custodia_incompleta'|'no_elegible';
 resultadoComercial:'requiere_evidencia'|
  'candidato_para_auditoria_independiente'|null;
 publicacionPermitida:false;
 originalModificado:false;
 whatsappEnviados:0;
 llamadasIA:0;
}>;
const HEX=/^[a-f0-9]{64}$/u;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&
 typeof v==='object'&&!Array.isArray(v);
const validClaim=(v:unknown,r:string,m:string,c:string):v is
 Record<string,unknown>=>obj(v)&&Object.keys(v).length===5&&
 v.state==='claimed_internal'&&v.request_id===r&&v.message_hmac===m&&
 v.chat_hmac===c&&typeof v.actor_subject_sha256==='string'&&
 HEX.test(v.actor_subject_sha256);
const result=(estado:ResultadoMvp329['estado'],
 resultadoComercial:ResultadoMvp329['resultadoComercial']=null):
 ResultadoMvp329=>Object.freeze({
 estado,resultadoComercial,publicacionPermitida:false,
 originalModificado:false,whatsappEnviados:0,llamadasIA:0
});
export async function cotejarConTicketOperadorMvp329(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 ticket:string;requestId:string;messageHmac:string;chatHmac:string;
 aesKey:CryptoKey;
 rpcService:Rpc;
 propuesta:PropuestaInternaMvp327;
}):Promise<ResultadoMvp329>{
 if(args?.enabled!==true||args.trustedInternalWorker!==true||
 !HEX.test(String(args.ticket))||!ID.test(String(args.requestId))||
 !HEX.test(String(args.messageHmac))||!HEX.test(String(args.chatHmac))||
 !args.propuesta||args.propuesta.requestId!==args.requestId||
 typeof args.rpcService!=='function'||!args.aesKey||
 args.aesKey.type!=='secret'||args.aesKey.extractable!==false||
 args.aesKey.algorithm.name!=='AES-GCM'||
 !args.aesKey.usages.includes('decrypt'))
 return result('deshabilitado');
 let proof:unknown;
 try{
  const {data,error}=await args.rpcService(
   'cotironda_piloto_claim_reconciliation_mvp329',{
    p_ticket:args.ticket,p_request_id:args.requestId,
    p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac
   });
  if(error)return result('conciliacion_incierta');
  proof=data;
 }catch{return result('conciliacion_incierta')}
 if(obj(proof)&&proof.state==='not_authorized')
 return result('no_autorizado');
 if(!validClaim(proof,args.requestId,args.messageHmac,args.chatHmac))
 return result('conciliacion_incierta');
 // Only a SQL-backed one-use, in-scope, live-session proof reaches MVP328.
 // The custody call itself independently rechecks latest source + AES AAD.
 const audited:ResultadoCustodiaMvp328=await cotejarYRegistrarPrivadoMvp328({
  enabled:true,trustedInternalWorker:true,operatorIdentityVerified:true,
  actorSubjectSha256:proof.actor_subject_sha256 as string,
  requestId:args.requestId,messageHmac:args.messageHmac,
  chatHmac:args.chatHmac,aesKey:args.aesKey,
  rpc:args.rpcService,propuesta:args.propuesta
 });
 return result(audited.estado,audited.resultadoComercial);
}

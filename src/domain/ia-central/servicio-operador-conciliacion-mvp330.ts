/**
 * MVP330: private orchestration only. Not an HTTP handler, cron or buyer API.
 *
 * Trusted server dependencies must:
 * - verify the bearer with Supabase Auth getUser(jwt), not local JWT decoding;
 * - call the issue RPC with THIS JWT and publishable/anon key (never service_role);
 * - call claim/read/record via a separate server-only service_role client;
 * - load an independently prepared proposal, never from a request body;
 * - hold a non-extractable AES-GCM key in the isolated worker.
 *
 * The SQL MVP267/MVP329 layer checks live session, AAL2 and buyer-specific grant.
 * No operator registration, quote promotion, message or paid model invocation.
 */
import {
 cotejarConTicketOperadorMvp329
} from './operador-conciliacion-autorizado-mvp329.ts';
import type {PropuestaInternaMvp327} from
 './conciliacion-original-textual-mvp327.ts';

type RpcResult={data:unknown;error:unknown};
type PrivateRpc=(name:string,params:Record<string,unknown>)=>
 Promise<RpcResult>;
type ActorResult={data?:{user?:unknown}|null;error?:unknown};
type Estado='deshabilitado'|'no_autorizado'|'conciliacion_incierta'|
 'no_elegible'|'custodia_incompleta'|'registrado_privado'|'ya_registrado';
type Resultado=Readonly<{
 estado:Estado;
 resultadoComercial:'requiere_evidencia'|
  'candidato_para_auditoria_independiente'|null;
 publicacionPermitida:false;
 originalModificado:false;
 whatsappEnviados:0;
 llamadasIA:0;
}>;

export type EntradaPrivadaMvp330=Readonly<{
 jwt:string;
 requestId:string;
 messageHmac:string;
 chatHmac:string;
}>;
export type DependenciasServidorMvp330=Readonly<{
 enabled:boolean;
 trustedInternalWorker:boolean;
 /** Must execute Supabase Auth getUser(jwt) via the network. */
 getUser:(jwt:string)=>Promise<ActorResult>;
 /** Must run ONLY with authenticated JWT, never with the service role. */
 rpcAutenticada:(jwt:string,name:string,params:Record<string,unknown>)=>
  Promise<RpcResult>;
 /** Only the trusted server constructs this client, using service_role. */
 rpcPrivada:PrivateRpc;
 /** Server-side audited source of a proposed line mapping, not the caller. */
 cargarPropuesta:(args:{requestId:string;messageHmac:string;
  chatHmac:string})=>Promise<PropuestaInternaMvp327|null>;
 aesKey:CryptoKey;
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX=/^[0-9a-f]{64}$/u;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const own=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const result=(estado:Estado,
 resultadoComercial:Resultado['resultadoComercial']=null):Resultado=>
 Object.freeze({estado,resultadoComercial,publicacionPermitida:false,
  originalModificado:false,whatsappEnviados:0,llamadasIA:0});

export async function ejecutarConciliacionOperadorMvp330(
 input:EntradaPrivadaMvp330,server:DependenciasServidorMvp330
):Promise<Resultado>{
 // These four fields are the entire operator input. No proposal, actor UUID,
 // role, buyer, "approved" flag, user_metadata or ticket may be injected.
 if(!own(input)||!exact(input,['jwt','requestId','messageHmac','chatHmac'])||
    typeof input.jwt!=='string'||input.jwt.length>8192||
    !JWT.test(input.jwt)||!UUID.test(String(input.requestId))||
    !HEX.test(String(input.messageHmac))||
    !HEX.test(String(input.chatHmac)))return result('no_autorizado');
 if(!server||server.enabled!==true||
    server.trustedInternalWorker!==true||
    typeof server.getUser!=='function'||
    typeof server.rpcAutenticada!=='function'||
    typeof server.rpcPrivada!=='function'||
    typeof server.cargarPropuesta!=='function'||
    !server.aesKey||server.aesKey.type!=='secret'||
    server.aesKey.extractable!==false||
    server.aesKey.algorithm?.name!=='AES-GCM'||
    !server.aesKey.usages.includes('decrypt'))
  return result('deshabilitado');

 // Independent online signature/user validation, before any SQL/service call.
 // The authenticated SQL issuing RPC independently enforces LIVE AAL2,
 // operator status, session, exact company, request and original.
 try{
  const identity=await server.getUser(input.jwt);
  const user=own(identity?.data)&&identity.data.user;
  if(identity?.error||!own(user)||!UUID.test(String(user.id))||
     user.is_anonymous===true||user.deleted_at!=null)
    return result('no_autorizado');
 }catch{return result('no_autorizado')}

 let ticket:string;
 try{
  const issued=await server.rpcAutenticada(input.jwt,
   'cotironda_piloto_operator_issue_reconciliation_mvp329',{
    p_request_id:input.requestId,
    p_message_hmac:input.messageHmac,
    p_chat_hmac:input.chatHmac
   });
  if(issued.error)return result('conciliacion_incierta');
  if(!own(issued.data)||!exact(issued.data,
    ['state','ticket','expires_in_seconds'])||
     issued.data.state!=='issued'||
     !HEX.test(String(issued.data.ticket))||
     issued.data.expires_in_seconds!==90)
   return result('no_autorizado');
  ticket=issued.data.ticket as string;
 }catch{return result('conciliacion_incierta')}

 // An operator must NEVER supply proposal or economic fields via HTTP.
 // Loading is server-only and happens after buyer-scoped issuance.
 let propuesta:PropuestaInternaMvp327|null;
 try{
  propuesta=await server.cargarPropuesta({
   requestId:input.requestId,messageHmac:input.messageHmac,
   chatHmac:input.chatHmac
  });
  if(!propuesta||propuesta.requestId!==input.requestId)
   return result('no_elegible');
 }catch{return result('conciliacion_incierta')}

 try{
  // The one-use claim is run with service_role exclusively by the worker.
  // The authorized actor hash is derived by SQL from the Auth session.
  const audited=await cotejarConTicketOperadorMvp329({
   enabled:true,trustedInternalWorker:true,ticket,
   requestId:input.requestId,messageHmac:input.messageHmac,
   chatHmac:input.chatHmac,aesKey:server.aesKey,
   rpcService:server.rpcPrivada,propuesta
  });
  return result(audited.estado,audited.resultadoComercial);
 }catch{return result('conciliacion_incierta')}
}

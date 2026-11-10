/** Cotironda IA Central — cadena REAL de un mensaje YA archivado.
 * El broker coordina una sola vez y registra cada decisión en SQL.
 * NO envía Whapi: el despachador mvp223 tiene su propio lease y gate.
 */
import {
 planificarMensajeAutenticadoMvp220,type PlanMvp220
} from '../../../src/domain/ia-central/planificador-piloto-mvp220.ts';
import {instrumentoOpenAiMvp264} from './ai-central-usage-mvp264.ts';
import {
 armarPreparacionSombraMvp221,guardarRondaSombraMvp221
} from '../../../src/domain/ia-central/puente-sql-rondas-mvp221.ts';
const HMAC=/^[0-9a-f]{64}$/u;
// MVP286: fixed, non-personal categories. Never persist raw model output.
const SAFE_REVIEW_CODES=new Set([
 'ai_timeout','ai_upstream_unavailable','ai_upstream_failure',
 'ai_credentials_rejected','ai_rate_limited','ai_request_rejected',
 'ai_upstream_rejected','ai_response_too_large',
 'response_shape','response_not_completed','response_no_message',
 'response_bad_text','response_bad_json','ai_response_read_failed',
 'bad_first','modelo_no_disponible_o_salida_invalida',
 'entrada_o_credenciales_invalidas','citas_no_corresponden_al_original',
 'lecturas_incompletas_o_divergentes','lecturas_discrepan_en_articulo',
 'articulo_sin_evidencia_verificable','catalogo_rpc_indisponible',
 'catalogo_rpc_no_conciliado','sin_catalogos_consentidos',
 'lecturas_divergentes','ningun_proveedor_para_la_lista',
 'sin_articulos','esquema_invalido','campos_inseguros',
 'segunda_lectura_invalida','entrada_invalida','sin_catalogo_confirmado',
 'catalogo_invalido','ia_error_de_lectura'
]);
export function codigoRevisionSemanticaMvp286(reason:unknown):string{
 return typeof reason==='string'&&SAFE_REVIEW_CODES.has(reason)
  &&/^[a-z_]{3,64}$/u.test(reason)?reason:'semantic_review_required';
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type RpcResponse={data:unknown;error:unknown};
type Rpc=(name:string,params:Record<string,unknown>)=>Promise<RpcResponse>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
export type ResultadoCompradorMvp226=Readonly<{
 estado:'desactivado'|'repetido'|'presupuesto_excedido'|'no_autorizado'|
 'requiere_zona'|'requiere_revision'|'ronda_en_sombra'|
 'ronda_publicada'|'conciliacion_requerida';
 codigo:string;
 requestId:string|null;
 seguimientoHabilitado:boolean;
 whatsappEnviado:false;
}>;
export type ArgsCompradorMvp226=Readonly<{
 habilitado:boolean;publicar:boolean;autenticadoPorWebhook:boolean;
 chatHmac:string;messageHmac:string;
 fuente:string;sourceSha256:string;
 apiKey:string;model:Model;rpc:Rpc;
 planificar?:typeof planificarMensajeAutenticadoMvp220;
 usageTraceEnabled?:boolean;
 usageFetchImpl?:typeof fetch;
}>;
const done=(estado:ResultadoCompradorMvp226['estado'],
 codigo:string,requestId:string|null=null):ResultadoCompradorMvp226=>({
 estado,codigo,requestId,seguimientoHabilitado:estado==='ronda_publicada',
 whatsappEnviado:false
});
const read=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==='object'&&!Array.isArray(v)?
 v as Record<string,unknown>:null;
async function call(rpc:Rpc,name:string,params:Record<string,unknown>){
 const r=await rpc(name,params);
 if(r.error!==null&&r.error!==undefined)throw Error('rpc_failed');
 const data=read(r.data);
 if(!data||typeof data.state!=='string')throw Error('rpc_response_invalid');
 return data;
}
export async function procesarCompradorCentralMvp226(
 args:ArgsCompradorMvp226
):Promise<ResultadoCompradorMvp226>{
 if(!args?.habilitado)return done('desactivado','disabled');
 if(args.autenticadoPorWebhook!==true||!HMAC.test(args.chatHmac)||
    !HMAC.test(args.messageHmac)||!HMAC.test(args.sourceSha256)||
    typeof args.fuente!=='string'||args.fuente.length<10||
    args.fuente.length>4000||!['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  return done('no_autorizado','origin_or_limit_invalid');
 let reserved=false;
 const db=args.rpc;
 const fields={p_chat_hmac:args.chatHmac,
  p_message_hmac:args.messageHmac};
 const finish=async(state:'staged'|'prepared'|'needs_zone'|'review'|'failed',
  reason:string|null=null)=>{
  const r=await call(db,'cotironda_piloto_ia_finish_buyer_mvp226',{
   ...fields,p_state:state,p_reason:reason
  });
  if(r.state!=='finished')throw Error('finish_not_persisted');
 };
 try{
  const r=await call(db,'cotironda_piloto_ia_reserve_buyer_mvp226',{
   ...fields,p_source_sha256:args.sourceSha256
  });
  if(r.state==='disabled')return done('desactivado','sql_disabled');
  if(r.state==='already_reserved')return done('repetido','message_already_reserved');
  if(r.state==='quota_exceeded')return done('presupuesto_excedido','ai_daily_quota');
  if(r.state!=='reserved')return done('no_autorizado','sql_identity_not_authorized');
  reserved=true;
  const p=await (args.planificar??planificarMensajeAutenticadoMvp220)({
   chatHmac:args.chatHmac,messageHmac:args.messageHmac,
   textoOriginal:args.fuente,autenticadoPorWebhook:true,
   apiKey:args.apiKey,model:args.model,
   fetchImpl:args.usageTraceEnabled===true?instrumentoOpenAiMvp264({
    messageHmac:args.messageHmac,chatHmac:args.chatHmac,
    role:'buyer',model:args.model,rpc:args.rpc,
    fetchImpl:args.usageFetchImpl
   }):undefined,
   rpc:async(name,params)=>db(name,params)
  });
  if(p.estado==='requiere_aclaracion'&&
     (/zona|localidad|entrega|falta_localidad/iu.test(p.motivo))){
    await finish('needs_zone','delivery_city_missing');
    return done('requiere_zona','delivery_city_missing');
  }
  if(p.estado!=='plan_validado_sin_envio'){
   const code=codigoRevisionSemanticaMvp286(p.motivo);
   await finish('review',code);
   return done('requiere_revision',code);
  }
  const prepared=armarPreparacionSombraMvp221({
   chatHmac:args.chatHmac,messageHmac:args.messageHmac,
   textoOriginal:args.fuente,autenticadoPorWebhook:true,plan:p
  });
  if(prepared.estado!=='plan_sql_listo'){
   await finish('review','plan_not_verifiable');
   return done('requiere_revision','plan_not_verifiable');
  }
  const written=await guardarRondaSombraMvp221(prepared,
   async(name,params)=>db(name,params));
  if(written.estado!=='guardado'){
   // Puede haber rollback o un registro parcial anterior. No reintentar
   // mientras la identidad y el estado de la fuente no se concilien.
   throw Error('staging_requires_reconciliation');
  }
  const looked=await call(db,'cotironda_piloto_ia_lookup_round_mvp226',fields);
  if(looked.state!=='linked'||typeof looked.request_id!=='string'||
     !UUID.test(looked.request_id))throw Error('round_lookup_inconsistent');
  const requestId=looked.request_id;
  if(!args.publicar){
   await finish('staged');
   return done('ronda_en_sombra','publish_flag_disabled',requestId);
  }
  const publication=await call(db,'cotironda_piloto_ia_publish_mvp222',{
   p_request:requestId
  });
  if(publication.state==='dispatch_disabled'||publication.state==='transport_disabled'){
   await finish('staged');
   return done('ronda_en_sombra','sql_dispatch_disabled',requestId);
  }
  if(publication.state!=='ready_for_delivery'&&
     publication.state!=='already_published'){
   await finish('staged');
   return done('ronda_en_sombra','needs_publication_review',requestId);
  }
  await finish('prepared');
  return done('ronda_publicada','ready_for_supplier_dispatch',requestId);
 }catch{
  // No reintentar un mensaje firmado: quizás el SQL llegó a escribir
  // la ronda y el error fue una respuesta de red perdida.
  if(reserved){
   try{await finish('failed','processing_unavailable')}catch{/** conciliación manual */}
  }
  return done('conciliacion_requerida','manual_reconciliation_needed');
 }
}

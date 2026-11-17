/** Recuperación D013, solo operador servidor. No se integra al webhook.
 * Preserva el intento original review y NO publica ni envía WhatsApp.
 * Fuente: UN único inbox cifrado validado por RPC service_role.
 */
import {planificarMensajeAutenticadoMvp220} from './planificador-piloto-v2-d013.ts';
import {armarPreparacionSombraMvp221} from './puente-sql-rondas-v2-d013.ts';
const HEX=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
type Rpc=(name:string,params:Readonly<Record<string,unknown>>)=>
 Promise<{data:unknown;error:unknown}>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
/** Taxonomía fija. Estos códigos JAMÁS incluyen contenido de pedido,
 * identidad comercial, HMAC, credenciales, respuestas ni errores externos. */
export type DiagnosticoRecuperacionD013=
 |'rpc_not_configured'|'source_lookup_error'|'source_lookup_exception'
 |'source_not_found'|'source_ambiguous'|'source_invalid_reply'
 |'source_integrity_failed'|'ai_credentials_invalid'
 |'ai_credentials_rejected'|'ai_rate_limited'|'ai_request_rejected'
 |'ai_upstream_unavailable'|'ai_timeout'|'ai_invalid_response'
 |'ai_evidence_mismatch'|'ai_interpretation_rejected'
 |'source_input_invalid'|'source_schema_invalid'|'source_not_a_quote'
 |'source_without_items'|'source_unsafe_fields'
 |'source_second_reader_invalid'|'source_item_evidence_invalid'
 |'source_quantity_not_evidenced'|'source_overlapping_evidence'
 |'source_readings_disagree'|'source_missing_items'
 |'source_quantity_unreadable_magnitude'
 |'source_quantity_ai_citation_unparseable'
 |'source_quantity_ai_citation_missing'
 |'source_quantity_ai_unit_conflict'
 |'source_quantity_purchase_not_explicit'
 |'source_quantity_evidence_container_unclear'
 |'source_quantity_evidence_multiple_physical'
 |'source_quantity_evidence_nonleading_measure'
 |'source_quantity_evidence_no_measure'
 |'source_second_reader_unanchored'|'source_no_confirmed_item'
 |'source_missing_city'|'source_invalid_review_indices'
 |'source_invalid_partial_indices'
 |'plan_clarification_required'|'catalog_rpc_error'|'catalog_no_suppliers'
 |'catalog_invalid'|'catalog_no_destinations'
 |'plan_other_rejected'|'bridge_source_invalid'|'bridge_units_invalid'
 |'bridge_destination_invalid'|'bridge_other_rejected'
 |'stage_rpc_error'|'stage_result_invalid'|'stage_denied'
 |'stage_inconsistent'|'recovery_exception';
const PLAN_DIAGNOSTICOS_D013:Readonly<Record<string,DiagnosticoRecuperacionD013>>={
 'entrada_o_credenciales_invalidas':'ai_credentials_invalid',
 'ai_credentials_rejected':'ai_credentials_rejected',
 'ai_rate_limited':'ai_rate_limited',
 'ai_request_rejected':'ai_request_rejected',
 'ai_timeout':'ai_timeout',
 'ai_upstream_unavailable':'ai_upstream_unavailable',
 'ai_upstream_failure':'ai_upstream_unavailable',
 'ai_upstream_rejected':'ai_upstream_unavailable',
 'ai_response_too_large':'ai_invalid_response',
 'response_shape':'ai_invalid_response',
 'response_not_completed':'ai_invalid_response',
 'response_no_message':'ai_invalid_response',
 'response_bad_text':'ai_invalid_response',
 'response_bad_json':'ai_invalid_response',
 'ai_response_read_failed':'ai_invalid_response',
 'bad_first':'ai_invalid_response',
 'modelo_no_disponible_o_salida_invalida':'ai_invalid_response',
 'citas_no_corresponden_al_original':'ai_evidence_mismatch',
 'origen_no_autorizado':'ai_interpretation_rejected',
 // Todos los rechazos literales del contrato V2 (sin enviar material falso).
 'entrada_invalida':'source_input_invalid',
 'esquema_invalido':'source_schema_invalid',
 'intencion_no_comercial':'source_not_a_quote',
 'sin_articulos':'source_without_items',
 'campos_inseguros':'source_unsafe_fields',
 'segunda_lectura_invalida':'source_second_reader_invalid',
 'articulo_sin_evidencia_verificable':'source_item_evidence_invalid',
 'cantidad_sin_respaldo_en_fuente':'source_quantity_not_evidenced',
 'evidencias_superpuestas':'source_overlapping_evidence',
 'lecturas_incompletas_o_divergentes':'source_readings_disagree',
 'posibles_articulos_no_representados':'source_missing_items',
 'segundo_lector_identifica_articulo_sin_fuente':'source_second_reader_unanchored',
 'ningun_articulo_conciliado':'source_no_confirmed_item',
 'zona_de_entrega_faltante':'source_missing_city',
 'falta_localidad':'source_missing_city',
 'indices_revision_no_verificables':'source_invalid_review_indices',
 'indice_parcial_no_verificable':'source_invalid_partial_indices',
 'ningun_articulo_con_fuente_conciliada':'source_no_confirmed_item',
 'catalogo_rpc_indisponible':'catalog_rpc_error',
 'catalogo_rpc_no_conciliado':'catalog_invalid',
 'sin_catalogos_consentidos':'catalog_no_suppliers',
 'ningun_proveedor_para_la_lista':'catalog_no_destinations'
};
/** Sólo devuelve valores compilados; motivos arbitrarios jamás llegan a logs.
 * Incluye los rechazos de contrato, interpretación y planificador presentes.
 */
export function diagnosticoPlanD013(motivo:unknown):DiagnosticoRecuperacionD013{
 return typeof motivo==='string'&&
   Object.hasOwn(PLAN_DIAGNOSTICOS_D013,motivo)
  ?PLAN_DIAGNOSTICOS_D013[motivo]:'plan_other_rejected';
}
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const decode=(s:string):Uint8Array=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=(arr:Uint8Array):string=>
 Array.from(arr,v=>v.toString(16).padStart(2,'0')).join('');
async function abrirTextoArchivado(aesHex:string,row:Record<string,unknown>):Promise<string|null>{
 if(!HEX.test(aesHex)||!HEX.test(String(row.chat_hmac))||
  !HEX.test(String(row.message_hmac))||!HEX.test(String(row.source_sha256))||
  typeof row.nonce_b64!=='string'||typeof row.ciphertext_b64!=='string'||
  !/^[A-Za-z0-9+/]{16}$/u.test(row.nonce_b64)||
  !/^[A-Za-z0-9+/=]{24,20000}$/u.test(row.ciphertext_b64))return null;
 try{
  const iv=decode(row.nonce_b64),data=decode(row.ciphertext_b64);
  if(iv.length!==12||data.length<17||data.length>10000)return null;
  const key=await crypto.subtle.importKey('raw',
   Uint8Array.from(aesHex.match(/.{2}/gu)!,v=>parseInt(v,16)).buffer as ArrayBuffer,
   'AES-GCM',false,['decrypt']);
  const aad=new TextEncoder().encode(
   String(row.chat_hmac)+'|'+String(row.message_hmac)+'|text');
  const bytes=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv:iv.buffer as ArrayBuffer,
    additionalData:aad.buffer as ArrayBuffer,tagLength:128},key,
   data.buffer as ArrayBuffer);
  const original=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(original.length<10||original.length>4000)return null;
  const digest=await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(original));
  return hex(new Uint8Array(digest))===row.source_sha256?original:null;
 }catch{return null}
}
export type ResultadoRecuperacionD013=Readonly<{
 estado:'disabled'|'no_candidate'|'needs_operator_review'|
 'source_verified'|'staged_no_send';
 requestId:string|null;
 outboundSent:false;
}>;
const result=(estado:ResultadoRecuperacionD013['estado'],
 requestId:string|null=null):ResultadoRecuperacionD013=>({
  estado,requestId,outboundSent:false
 });
/** ejecutar=false verifica integridad local y NO llama a IA ni muta SQL.
 * ejecutar=true es exclusivamente para una orden de despliegue aprobada:
 * el RPC atómico conserva la auditoría y solo crea un borrador.
 */
export async function recuperarBuyerReviewD013(args:{
 ejecutar:boolean;habilitado:boolean;apiKey:string;
 aesKeyHex:string;model:Model;rpc:Rpc;
 onDiagnostic?:(code:DiagnosticoRecuperacionD013)=>void;
 planificar?:typeof planificarMensajeAutenticadoMvp220;
 preparar?:typeof armarPreparacionSombraMvp221;
}):Promise<ResultadoRecuperacionD013>{
 if(args?.habilitado!==true)return result('disabled');
 const review=(code:DiagnosticoRecuperacionD013):ResultadoRecuperacionD013=>{
  // La observabilidad es secundaria: si falla, no desbloquea una acción.
  try{args.onDiagnostic?.(code)}catch{/* No filtrar errores de callback */}
  return result('needs_operator_review');
 };
 if(typeof args.rpc!=='function'||!HEX.test(args.aesKeyHex))
  return review('rpc_not_configured');
 let raw:unknown;
 try{
  const response=await args.rpc(
   'cotironda_piloto_v2_d013_review_source_private',{});
  if(response.error!=null)return review('source_lookup_error');
  raw=response.data;
 }catch{return review('source_lookup_exception')}
 if(!obj(raw)||raw.state!=='ready'){
  if(obj(raw)&&raw.state==='empty')return result('no_candidate');
  return review(obj(raw)&&raw.state==='ambiguous'
   ?'source_ambiguous':'source_invalid_reply');
 }
 const original=await abrirTextoArchivado(args.aesKeyHex,raw);
 if(!original)return review('source_integrity_failed');
 if(args.ejecutar!==true)return result('source_verified');
 if(typeof args.apiKey!=='string'||!/^sk-[A-Za-z0-9_-]{16,}$/u.test(args.apiKey)||
  !['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  return review('ai_credentials_invalid');
 try{
  // Identidad autenticada por el webhook en el inbox original y nuevamente
  // verificada por la RPC; nunca se crea ni reinyecta un evento artificial.
  const plan=await (args.planificar??planificarMensajeAutenticadoMvp220)({
   chatHmac:String(raw.chat_hmac),messageHmac:String(raw.message_hmac),
   textoOriginal:original,autenticadoPorWebhook:true,
   apiKey:args.apiKey,model:args.model,
   rpc:async(n,p)=>args.rpc(n,p),
   onQuantityDiagnostic:code=>{
    try{args.onDiagnostic?.(code)}catch{/* No interferir */}
   }
  });
  if(plan.estado!=='plan_validado_sin_envio'){
   // También discriminar la aclaración: no confundir una zona ausente con
   // falta de evidencia de materiales, sin revelar el mensaje al operador.
   const mapped=diagnosticoPlanD013(plan.motivo);
   return review(plan.estado==='requiere_aclaracion'&&
    mapped==='plan_other_rejected'?'plan_clarification_required':mapped);
  }
  const prepared=(args.preparar??armarPreparacionSombraMvp221)({
   chatHmac:String(raw.chat_hmac),messageHmac:String(raw.message_hmac),
   textoOriginal:original,autenticadoPorWebhook:true,plan
  });
  if(prepared.estado!=='plan_sql_listo'||!prepared.params)
   return review(prepared.motivo==='presentacion_fuente_no_representable'
    ?'bridge_source_invalid':
     prepared.motivo==='cantidad_unidad_no_representable_en_sql'
    ?'bridge_units_invalid':
     prepared.motivo==='sin_destinos'?'bridge_destination_invalid':
    'bridge_other_rejected');
  const expectedItems=prepared.params.p_items.length;
  const expectedMatches=prepared.params.p_destinos.reduce(
   (n,x)=>n+x.correspondencias.length,0);
  // Esta RPC privada exige p_chat_hmac; el puente D013 de preparación
  // general utiliza p_buyer_chat_hmac. PostgREST coteja nombres exactos:
  // nunca enviar campos extra ni renombrar la RPC histórica.
  const {p_buyer_chat_hmac,...stageParams}=prepared.params;
  const staged=await args.rpc(
   'cotironda_piloto_v2_d013_recovery_stage_private',{
    ...stageParams,p_chat_hmac:p_buyer_chat_hmac,
    p_source_sha256:raw.source_sha256
   });
  if(staged.error!=null)return review('stage_rpc_error');
  if(!obj(staged.data))return review('stage_result_invalid');
  if(staged.data.state!=='staged')return review('stage_denied');
  if(!UUID.test(String(staged.data.request_id))||
     staged.data.items_staged!==expectedItems||
     staged.data.matches_staged!==expectedMatches||
     staged.data.invitations_sent!==0||staged.data.outbox_sent!==0)
   return review('stage_inconsistent');
  return result('staged_no_send',String(staged.data.request_id));
 }catch{
  // Tras red incierta no se reintenta automáticamente. Conciliación por
  // inbox.source_hmac y sidecar append-only; nunca enviar ni repetir.
  return review('recovery_exception');
 }
}

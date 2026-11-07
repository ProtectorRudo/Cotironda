/** Lectura y persistencia de cotización textual de proveedor ya vinculado.
 * No determina el dueño de la ronda. No emite WhatsApp.
 * El original está en inbox AES-GCM, con SHA cotejado antes de la IA.
 */
import {
 interpretarPresupuestoConIAMvp225,
 type LecturaOfertaMvp225
} from '../../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';
import {
 RUBROS_MVP216,type RubroMvp216
} from '../../../src/domain/rubros-comprador-mvp216.ts';
import {validarMemoriaProveedorMvp260} from './ai-central-memory-mvp260.ts';
import {instrumentoOpenAiMvp264} from './ai-central-usage-mvp264.ts';
import {diagnosticoPermitidoMvp297} from
 '../../../src/domain/ia-central/diagnostico-fuente-mvp297.ts';
const HASH=/^[a-f0-9]{64}$/u;
const OBJECT=(o:unknown):o is Record<string,unknown>=>
 o!==null&&typeof o==='object'&&!Array.isArray(o);
const ID=/^item_[1-9][0-9]{0,2}$/u;
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
export type EstadoProveedorMvp227=Readonly<{
 estado:'apagado'|'no_aplica'|'ya_procesado'|'requiere_revision'|
 'verificado_privado'|'conciliacion_requerida';
 codigo:string;whatsappEnviado:false;
}>;
const done=(estado:EstadoProveedorMvp227['estado'],codigo:string):
 EstadoProveedorMvp227=>({estado,codigo,whatsappEnviado:false});
const read=(v:unknown):Record<string,unknown>|null=>OBJECT(v)?v:null;
/** Proyección económica anónima de IA Central, compartida por fuente de
 * texto y archivo. Nunca copiar fuente, WhatsApp, contacto ni SHA al panel.
 */
export function resumenPrivadoMvp245(
 reading:LecturaOfertaMvp225
):Record<string,unknown>|null{
 if(reading?.estado!=='interpretada_para_revision'||!reading.oferta||
    !reading.cobertura||reading.cobertura.ofertas.length!==1)return null;
 const result=reading.cobertura.ofertas[0];
 // MVP299: this flag ONLY authorizes a separate, count-only buyer
 // projection of an independently source-checked response.
 // Bad mappings, unsupported IVA/freight evidence, mismatched source
 // amounts or invalid request lines must NEVER become buyer coverage.
 const nonComparableReasons=new Set([
  'moneda_no_informada','importe_sin_conciliacion',
  'cargos_adicionales_sin_comparacion','sin_precios_comparables'
 ]);
 const pendingCoverage=result.estado==='requiere_revision'&&
  result.motivos.length>0&&
  result.motivos.every(m=>nonComparableReasons.has(m))&&
  result.rubros.some(r=>r.respondidos>0);
 const summary={
  estado:result.estado,
  cobertura_pendiente_mvp299:pendingCoverage,
  moneda:reading.oferta.moneda,iva:reading.oferta.iva,
  flete:reading.oferta.flete,pago:reading.oferta.pago,
  rubros:result.rubros.map(x=>({
   rubro:x.rubro,solicitados:x.solicitados,
   respondidos:x.respondidos,cobertura:x.cobertura
  })),
  precios:result.precios.map(x=>({
   pedidoId:x.pedidoId,centavos:x.centavos.toString(),
   cantidad:x.cantidad,unidad:x.unidad
  })),
  // Comparabilidad física NOMINAL, separada de los precios comparables.
  // Nunca convierte una alternativa semántica en oferta ganadora.
  presentaciones:(result.presentaciones??[]).map(x=>({
   pedidoId:x.pedidoId,numeroOferta:x.numeroOferta,estado:x.estado,
   unidadBase:x.unidadBase,pedidoBaseMil:x.pedidoBaseMil,
   ofertaBaseMil:x.ofertaBaseMil,comparableTecnico:false,
   comparableEconomico:false
  }))
 };
 return summary;
}
export async function procesarPresupuestoCentralMvp227(args:{
 habilitado:boolean;webhookAutenticado:boolean;
 messageHmac:string;chatHmac:string;
 apiKey:string;model:Modelo;
 rpc:Rpc;
 decrypt:(nonce:string,ciphertext:string)=>Promise<string>;
 shaText:(source:string)=>Promise<string>;
 interpretar?:typeof interpretarPresupuestoConIAMvp225;
 commercialMemoryEnabled?:boolean;
 quoteVersioningEnabled?:boolean;
 usageTraceEnabled?:boolean;
 usageFetchImpl?:typeof fetch;
}):Promise<EstadoProveedorMvp227>{
 if(!args?.habilitado)return done('apagado','flag_disabled');
 if(args.webhookAutenticado!==true||
    !HASH.test(args.messageHmac)||!HASH.test(args.chatHmac)||
    typeof args.rpc!=='function'||typeof args.decrypt!=='function'||
    typeof args.shaText!=='function')
  return done('no_aplica','sender_invalid');
 const db=async(name:string,params:Record<string,unknown>)=>{
  const out=await args.rpc(name,params);
  if(out.error!==null&&out.error!==undefined)throw Error('rpc_unavailable');
  const data=read(out.data);
  if(!data||typeof data.state!=='string')throw Error('response_invalid');
  return data;
 };
 let reserved=false;
 const finish=async(state:'verified'|'review',reason:string,
  summary:Record<string,unknown>|null)=>{
  const r=await db('cotironda_piloto_ia_finish_quote_mvp227',{
   p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac,
   p_state:state,p_reason:reason,p_summary:summary
  });
  if(r.state!=='saved_private')throw Error('finish_not_stored');
 };
 try{
  const source=await db('cotironda_piloto_ia_reserve_quote_mvp227',{
   p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac
  });
  if(source.state==='already_reserved')return done('ya_procesado','existing_analysis');
  if(source.state==='quota_exceeded')return done('no_aplica','quota_exceeded');
  if(source.state!=='reserved')return done('no_aplica','source_not_linked');
  reserved=true;
  if(typeof source.nonce!=='string'||typeof source.ciphertext!=='string'||
     !HASH.test(String(source.source_sha256))||
     !Array.isArray(source.items)||source.items.length<1||
     source.items.length>25)throw Error('encrypted_source_invalid');
  const requested=source.items.map(item=>{
   if(!OBJECT(item)||typeof item.id!=='string'||!ID.test(item.id)||
      typeof item.descripcion!=='string'||
      item.descripcion.length<3||item.descripcion.length>500||
      typeof item.cantidad!=='string'||item.cantidad.length>40||
      typeof item.unidad!=='string'||item.unidad.length>20||
      typeof item.rubro!=='string'||
      !Object.hasOwn(RUBROS_MVP216,item.rubro))
    throw Error('requested_item_invalid');
   return {id:item.id,descripcion:item.descripcion,
    cantidad:item.cantidad,unidad:item.unidad,
    rubro:item.rubro as RubroMvp216};
  });
  const original=await args.decrypt(source.nonce,source.ciphertext);
  if(typeof original!=='string'||original.length<5||original.length>4000||
     await args.shaText(original)!==source.source_sha256)
   throw Error('source_sha_mismatch');
  if(args.commercialMemoryEnabled===true){
   // A SQL RPC resolves the ONLY associated request. Its snapshot must
   // match the exact lines already reserved by the same supplier/source.
   // Never pass memory to the model: the original is the sole price source.
   const scope=await db('cotironda_piloto_memory_quote_context_mvp260',{
    p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac,
    p_source_sha256:source.source_sha256
   });
   if(!validarMemoriaProveedorMvp260(scope,requested)){
    await finish('review','memory_scope_conflict',null);
    return done('requiere_revision','memory_scope_conflict');
   }
  }
  const reading=await (args.interpretar??interpretarPresupuestoConIAMvp225)({
   fuente:original,pedido:requested,etiquetaAnonima:'Presupuesto privado',
   apiKey:args.apiKey,model:args.model,
   fetchImpl:args.usageTraceEnabled===true?instrumentoOpenAiMvp264({
    messageHmac:args.messageHmac,chatHmac:args.chatHmac,
    role:'supplier',model:args.model,rpc:args.rpc,
    fetchImpl:args.usageFetchImpl
   }):undefined
  });
  if(reading.estado!=='interpretada_para_revision'||!reading.oferta||
     !reading.cobertura||reading.cobertura.ofertas.length!==1){
   // MVP297: persist ONLY an allowlisted, private diagnostic code from
   // the failed evidence gate. Historical messages retain their old,
   // irrecoverable generic reason: NEVER re-call billable IA to guess it.
   // This changes observability, NOT the evidence gate or buyer ranking.
   const reason=diagnosticoPermitidoMvp297(reading.diagnostico)?
    reading.diagnostico:'semantic_review_required';
   await finish('review',reason,null);
   return done('requiere_revision','source_kept_private');
  }
  const result=reading.cobertura.ofertas[0];
  // Construcción por ALLOWLIST. Nunca guardar el texto del proveedor ni
  // datos de contacto en la proyección que podría ver el comprador.
  const summary=resumenPrivadoMvp245(reading);
  if(!summary)throw Error('private_summary_invalid');
  const verified=result.estado==='verificada_para_comparacion'&&
   ['ARS','USD'].includes(String(summary.moneda));
  await finish(verified?'verified':'review',
   verified?'source_and_math_checked':'conditions_need_review',summary);
  if(args.quoteVersioningEnabled===true){
   // Register a new immutable source version; never add older missing
   // items or prices to a partial correction. A lost SQL response is
   // reconciled, not retried by re-running the LLM or sending WhatsApp.
   try{
    const revision=await db('cotironda_piloto_record_source_version_mvp261',{
     p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac,
     p_source_sha256:source.source_sha256
    });
    if(!['version_recorded','already_versioned'].includes(
      String(revision.state)))
     return done('conciliacion_requerida','version_sync_unconfirmed');
   }catch{return done('conciliacion_requerida','version_sync_unconfirmed')}
  }
  if(verified&&args.commercialMemoryEnabled===true){
   // SQL refuses a memory pointer until the independent verified quote
   // has actually been committed. A missing acknowledgment is uncertain,
   // NOT a reason to reinterpret the source or resend anything.
   try{
    const stored=await db('cotironda_piloto_memory_sync_quote_mvp260',{
     p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac,
     p_source_sha256:source.source_sha256
    });
    if(!['remembered_private','already_remembered'].includes(
      String(stored.state)))
     return done('conciliacion_requerida','memory_sync_unconfirmed');
   }catch{return done('conciliacion_requerida','memory_sync_unconfirmed')}
  }
  return done(verified?'verificado_privado':'requiere_revision',
   verified?'comparable_by_rubro':'conditions_need_review');
 }catch{
  if(reserved){
   try{await finish('review','processing_unavailable',null)}
   catch{/* No reintento automático: la operación puede haberse guardado. */}
  }
  return done('conciliacion_requerida','manual_source_reconciliation');
 }
}

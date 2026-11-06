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
 const summary={
  estado:result.estado,
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
  const reading=await (args.interpretar??interpretarPresupuestoConIAMvp225)({
   fuente:original,pedido:requested,etiquetaAnonima:'Presupuesto privado',
   apiKey:args.apiKey,model:args.model
  });
  if(reading.estado!=='interpretada_para_revision'||!reading.oferta||
     !reading.cobertura||reading.cobertura.ofertas.length!==1){
   await finish('review','semantic_review_required',null);
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

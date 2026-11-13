/** V2-23: continuar LA MISMA solicitud en RPC V2 independiente después de una localidad.
 * El SQL privado ya enlazó respuesta firmada con una única fuente previa.
 * Planificar con contexto; persistir SOLO original SHA verificado.
 * Jamás invocar el preparador M221 histórico ni publicar sin autorización.
 */
import {planificarMensajeAutenticadoMvp220} from '../../../src/domain/ia-central/planificador-piloto-v2-d013.ts';
import {armarPreparacionSombraMvp221,guardarRondaSombraMvp221} from
 '../../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';
const HEX=/^[0-9a-f]{64}$/u;
const CITY=/^[\p{L}\s()'.,-]{3,80}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Result=Readonly<{
 estado:'ronda_publicada'|'ronda_en_sombra'|'requiere_revision'|
 'conciliacion_requerida'|'origen_invalido';
 sourceHmac:string|null;requestId:string|null;
}>;
const result=(estado:Result['estado'],h:string|null=null,id:string|null=null):Result=>
 ({estado,sourceHmac:h,requestId:id});
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .trim().toLocaleLowerCase('es');
export async function continuarZonaCentralMvp233(args:{
 autenticadoPorWebhook:boolean;chatHmac:string;sourceHmac:string;
 originalSha256:string;ciudadConfirmada:string;
 nonce:string;ciphertext:string;
 apiKey:string;model:Model;publicar:boolean;
 decrypt:(nonce:string,ciphertext:string)=>Promise<string>;
 shaText:(text:string)=>Promise<string>;
 rpc:Rpc;planificar?:typeof planificarMensajeAutenticadoMvp220;
}):Promise<Result>{
 if(args?.autenticadoPorWebhook!==true||!HEX.test(args.chatHmac)||
   !HEX.test(args.sourceHmac)||!HEX.test(args.originalSha256)||
   typeof args.nonce!=='string'||typeof args.ciphertext!=='string'||
   typeof args.decrypt!=='function'||typeof args.shaText!=='function'||
   typeof args.rpc!=='function'||!CITY.test(args.ciudadConfirmada)||
   !['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  return result('origen_invalido');
 const params={p_message_hmac:args.sourceHmac,p_chat_hmac:args.chatHmac};
 const db=async(name:string,p:Record<string,unknown>)=>{
  const r=await args.rpc(name,p);
  if(r.error!==null&&r.error!==undefined||!r.data||
     typeof r.data!=='object'||Array.isArray(r.data))throw Error('db_invalid');
  return r.data as Record<string,unknown>;
 };
 const finish=async(state:'prepared'|'staged'|'review',reason:string|null=null)=>{
  const r=await db('cotironda_piloto_ia_finish_buyer_mvp226',{
   ...params,p_state:state,p_reason:reason
  });
  if(r.state!=='finished')throw Error('finish_unconfirmed');
 };
 let wroteRound=false;
 try{
  const original=await args.decrypt(args.nonce,args.ciphertext);
  if(original.length<10||original.length>3900||
     await args.shaText(original)!==args.originalSha256)
   throw Error('sha_mismatch');
  // La localidad es el ÚNICO contexto externo. Todas las citas de material
  // deben existir literalmente en original, corroboradas de nuevo por SQL.
  const context=original+'\nLocalidad de entrega: '+args.ciudadConfirmada;
  if(context.length>4000)throw Error('context_too_long');
  const plan=await (args.planificar??planificarMensajeAutenticadoMvp220)({
   chatHmac:args.chatHmac,messageHmac:args.sourceHmac,
   textoOriginal:context,autenticadoPorWebhook:true,
   apiKey:args.apiKey,model:args.model,
   rpc:async(name,p)=>args.rpc(name,p)
  });
  if(plan.estado!=='plan_validado_sin_envio'||!plan.pedido||
     !plan.pedido.zona_entrega||
     fold(plan.pedido.zona_entrega)!==fold(args.ciudadConfirmada)){
   await finish('review','zone_continuation_review');
   return result('requiere_revision');
  }
  // La segunda lectura vio localidad agregada al contexto, pero los
  // MATERIALES sólo pueden citar el texto de origen sin agregados.
  // Esta comprobación anticipada no sustituye el control SHA+evidencia SQL.
  if(plan.pedido.articulos.some(line=>
     typeof line.evidencia!=='string'||!original.includes(line.evidencia))){
    await finish('review','zone_evidence_not_verified');
    return result('requiere_revision');
  }
  const prepared=armarPreparacionSombraMvp221({
   chatHmac:args.chatHmac,messageHmac:args.sourceHmac,
   textoOriginal:original,autenticadoPorWebhook:true,plan
  });
  if(prepared.estado!=='plan_sql_listo'){
   await finish('review','zone_evidence_not_verified');
   return result('requiere_revision');
  }
  const written=await guardarRondaSombraMvp221(prepared,
   async(name,p)=>args.rpc(name,p));
  if(written.estado!=='guardado')throw Error('staging_unconfirmed');
  wroteRound=true;
  const linked=await db('cotironda_piloto_ia_lookup_round_mvp226',params);
  if(linked.state!=='linked'||typeof linked.request_id!=='string'||
     !UUID.test(linked.request_id))throw Error('round_missing');
  if(!args.publicar){
   await finish('staged');
   return result('ronda_en_sombra',args.sourceHmac,linked.request_id);
  }
  const published=await db('cotironda_piloto_ia_publish_mvp222',{
   p_request:linked.request_id
  });
  if(!['ready_for_delivery','already_published'].includes(String(published.state))){
   await finish('staged');
   return result('ronda_en_sombra',args.sourceHmac,linked.request_id);
  }
  await finish('prepared');
  return result('ronda_publicada',args.sourceHmac,linked.request_id);
 }catch{
  if(!wroteRound){
   try{await finish('review','zone_continuation_failed')}
   catch{/* SQL puede haber confirmado el estado: no reintentar */}
  }
  return result('conciliacion_requerida');
 }
}

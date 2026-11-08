/** MVP306 — Sin CONFIRMAR COTI. Sólo Whapi autenticado y SQL versionado.
 * Una reserva en BD autoriza como máximo una publicación; nunca envía por
 * WhatsApp ni calcula materiales. La migración deja el gate apagado.
 */
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const H=/^[a-f0-9]{64}$/u;
const U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
type State='apagado'|'no_autorizado'|'no_elegible'|'publicado'|'conciliacion_requerida';
export type ResultadoAutoMvp306=Readonly<{estado:State;requestId:string|null}>;
const result=(estado:State,requestId:string|null=null):ResultadoAutoMvp306=>
 Object.freeze({estado,requestId});
export async function liberarPedidoAutomaticoMvp306(args:{
 enabled:boolean;webhookAutenticado:boolean;compradorVerificado:boolean;
 chatHmac:string;sourceHmac:string;rpc:Rpc
}):Promise<ResultadoAutoMvp306>{
 if(args?.enabled!==true)return result('apagado');
 if(!args.webhookAutenticado||!args.compradorVerificado||
  !H.test(args.chatHmac)||!H.test(args.sourceHmac)||
  typeof args.rpc!=='function')return result('no_autorizado');
 let issued;
 try{
  issued=await args.rpc('cotironda_piloto_ia_auto_release_mvp306',{
   p_chat_hmac:args.chatHmac,p_source_hmac:args.sourceHmac
  });
 }catch{return result('conciliacion_requerida')}
 if(issued.error!==null&&issued.error!==undefined||
  !issued.data||typeof issued.data!=='object')
  return result('conciliacion_requerida');
 const state=(issued.data as Record<string,unknown>).state;
 if(state!=='approved'&&state!=='already_approved')
  return result('no_elegible');
 const requestId=(issued.data as Record<string,unknown>).request_id;
 if(typeof requestId!=='string'||!U.test(requestId))
  return result('conciliacion_requerida');
 let released;
 try{released=await args.rpc('cotironda_piloto_ia_publish_mvp222',{
   p_request:requestId
  });}catch{return result('conciliacion_requerida')}
 if(released.error!==null&&released.error!==undefined||
  !released.data||typeof released.data!=='object')
  return result('conciliacion_requerida');
 const status=(released.data as Record<string,unknown>).state;
 if(status==='ready_for_delivery'||status==='already_published')
  return result('publicado',requestId);
 return result('no_elegible');
}

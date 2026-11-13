/** Cotironda V2-24: liberación SIN confirmación desde UN RPC transaccional.
 * La Edge no calcula el calendario, no aprueba productos ni escribe outbox.
 * Solamente el servidor SQL puede abrir la ronda cuando TODOS los gates ON.
 */
type Rpc=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type State='apagado'|'no_autorizado'|'no_elegible'|'publicado'|'conciliacion_requerida';
export type ResultadoAutoV2=Readonly<{estado:State;requestId:string|null}>;
const HASH=/^[0-9a-f]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const result=(estado:State,requestId:string|null=null):ResultadoAutoV2=>
 Object.freeze({estado,requestId});
export async function liberarPedidoAutomaticoV2D013(args:{
 enabled:boolean;webhookAutenticado:boolean;compradorVerificado:boolean;
 chatHmac:string;sourceHmac:string;rpc:Rpc;
}):Promise<ResultadoAutoV2>{
 if(args?.enabled!==true)return result('apagado');
 if(!args.webhookAutenticado||!args.compradorVerificado||
    !HASH.test(args.chatHmac)||!HASH.test(args.sourceHmac)||
    typeof args.rpc!=='function')return result('no_autorizado');
 let release;
 try{
  release=await args.rpc('cotironda_piloto_v2_auto_release_d013',{
   p_chat_hmac:args.chatHmac,p_source_hmac:args.sourceHmac
  });
 }catch{return result('conciliacion_requerida')}
 if(release.error!==null&&release.error!==undefined||
    !release.data||typeof release.data!=='object'||
    Array.isArray(release.data))
  return result('conciliacion_requerida');
 const body=release.data as Record<string,unknown>;
 if(body.state==='ready_for_delivery'||body.state==='already_published'){
  if(typeof body.request_id!=='string'||!UUID.test(body.request_id))
   return result('conciliacion_requerida');
  return result('publicado',body.request_id);
 }
 // Un rechazo conocido de SQL no es permiso para reintentar la fuente.
 if(['invalid','disabled','calendar_not_installed','calendar_disabled',
  'source_not_eligible','v2_timing_invalid','deadline_not_verified',
  'calendar_revision_invalid','auto_release_not_authorized'
 ].includes(String(body.state)))
  return result('no_elegible');
 return result('conciliacion_requerida');
}

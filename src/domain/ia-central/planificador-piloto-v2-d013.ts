/** D013 V2-only: planner no rubro-gate; preserving locked M220. */
/** IA Central — orquestador semántico en SOMBRA (sin escrituras ni envíos).
 * Primer puente real Supabase→IA→catalogos→ruteo:
 * 1) interpreta libremente el mensaje Whapi YA verificado,
 * 2) lee un catálogo real SOLO vía RPC privado de service_role,
 * 3) clasifica rubros comerciales sin diccionario de nombres,
 * 4) propone proveedores y valida cada línea contra la lista fuente.
 *
 * La fase de preparación económica/WhatsApp será otra transacción SQL.
 * NO introducir fetch Whapi en este archivo.
 */
import {interpretarConIaCentralV1} from './cliente-openai-v1.ts';
import {categorizarCatalogosConIAMvp220,
 validarSnapshotCatalogosMvp220} from './catalogo-supabase-mvp220.ts';
import {proponerRuteoCatalogoConIAV2} from './ruteador-catalogos-v2-d013.ts';
import type {PropuestaPedido} from './contrato-v1.ts';
import type {ResultadoCatalogoV2} from './ruteador-catalogos-v2-d013.ts';
import type {ProveedorCatalogoV2} from './ruteador-catalogos-v2-d013.ts';

type Rpc= (name:string,params:Readonly<Record<string,string>>)=>
 Promise<{data:unknown;error:unknown}>;
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
export type PlanMvp220=Readonly<{
 estado:'plan_validado_sin_envio'|'sin_catalogo_confirmado'|
 'requiere_aclaracion'|'rechazado';
 motivo:string;
 pedido:PropuestaPedido|null;
 ruteo:ResultadoCatalogoV2|null;
 /** Fuente del catálogo únicamente para el broker server-side. NO serializar al comprador. */
 catalogos:readonly ProveedorCatalogoV2[]|null;
 whatsappEnviado:false;
 baseModificada:false;
}>;
const KEY=/^[a-f0-9]{64}$/u;
const deny=(estado:PlanMvp220['estado'],motivo:string):PlanMvp220=>({
 estado,motivo,pedido:null,ruteo:null,catalogos:null,whatsappEnviado:false,baseModificada:false
});
const matchCity=(a:string,b:string):boolean=>
 a.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase()===
 b.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLowerCase();
export async function planificarMensajeAutenticadoMvp220(args:{
 chatHmac:string;messageHmac:string;
 textoOriginal:string;
 autenticadoPorWebhook:boolean;
 apiKey:string;model:Modelo;
 rpc:Rpc;fetchImpl?:typeof fetch;
}):Promise<PlanMvp220>{
 if(!args||args.autenticadoPorWebhook!==true||
    !KEY.test(args.chatHmac)||!KEY.test(args.messageHmac)||
    typeof args.textoOriginal!=='string'||args.textoOriginal.length<10||
    args.textoOriginal.length>12000||typeof args.rpc!=='function')
  return deny('rechazado','origen_no_autorizado');
 // IMPORTANT: el webhook real aplica identidad/HMAC, persiste la fuente
 // y reserva su cuota ANTES de habilitar este worker. El booleano no
 // es autorización real; el RPC verifica identidad nuevamente.
 const interpreted=await interpretarConIaCentralV1({
  fuente:args.textoOriginal,apiKey:args.apiKey,
  model:args.model,fetchImpl:args.fetchImpl
 });
 if(interpreted.estado==='requiere_aclaracion')
  return deny('requiere_aclaracion',interpreted.motivo);
 if(interpreted.estado!=='listo_para_preparar'||!interpreted.pedido)
  return deny('rechazado',interpreted.motivo);
 const pedido=interpreted.pedido;
 const city=pedido.zona_entrega;
 if(!city)return deny('requiere_aclaracion','falta_localidad');
 let raw:unknown;
 try{
  const r=await args.rpc('cotironda_piloto_ia_catalogo_mvp220',{
   p_buyer_chat_hmac:args.chatHmac,p_delivery_city:city
  });
  if(r.error!==null&&r.error!==undefined)
   return deny('rechazado','catalogo_rpc_indisponible');
  raw=r.data;
 }catch{return deny('rechazado','catalogo_rpc_indisponible')}
 const catalog=validarSnapshotCatalogosMvp220(raw);
 if(!catalog||!matchCity(catalog.localidad,city))
  return deny('rechazado','catalogo_rpc_no_conciliado');
 if(catalog.proveedores.length===0)
  return deny('rechazado','sin_catalogos_consentidos');
 const classified=await categorizarCatalogosConIAMvp220({
  snapshot:catalog,apiKey:args.apiKey,
  model:args.model,fetchImpl:args.fetchImpl
 });
 if(classified.estado==='catalogo_invalido')
  return deny('rechazado',classified.motivo);
 const route=await proponerRuteoCatalogoConIAV2({
  pedido,proveedores:classified.proveedores,
  apiKey:args.apiKey,model:args.model,fetchImpl:args.fetchImpl
 });
 if(route.estado!=='ruteo_valido_para_preparacion')
  return deny('rechazado',route.motivo);
 if(route.propuestas.length===0)
  return deny('requiere_aclaracion','ningun_proveedor_para_la_lista');
 return {
  estado:'plan_validado_sin_envio',
  motivo:classified.estado==='catalogo_sin_confirmar'?
   'ruteo_sobre_catalogos_registrados_sin_confirmacion_formal':'ruteo_semantico_valido',
  pedido,ruteo:route,catalogos:classified.proveedores,whatsappEnviado:false,baseModificada:false
 };
}

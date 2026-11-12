/** Cotironda V2 — IA Central as the SINGLE orchestrator of catalog + clock.
 * This is a preview-safe coordinator, NOT a delivery/SQL API. The caller
 * must have already authenticated buyer identity and sourced real catalogs.
 * All downstream side effects remain exclusively in private, authorized RPCs.
 */
import {proponerRuteoCatalogoConIAV2,
 type ProveedorCatalogoV2,type ResultadoCatalogoV2}
 from '../domain/ia-central/ruteador-catalogos-v2-d013.ts';
import type {PropuestaPedido} from '../domain/ia-central/contrato-v1.ts';
import {decidirVencimientoCentralV2,
 type FuenteAnualV2,type FuentesAnoCalendarioV2,
 type DecisionCalendarioCentralV2}
 from '../domain/ia-central/calendario-conciliado-automatico-v2.ts';
import {consultarFuenteFeriadosV2}
 from './v2-ia-central-fuentes-feriados.ts';

type Locales=FuentesAnoCalendarioV2['locales'];
type SourceConfig=Readonly<{
 gobiernoURL:string;contrasteURL:string;locales:Locales;
}>;
export type PropuestaCentralV2=Readonly<{
 estado:'propuesta_verificada_sin_envio'|'revision_interna';
 codigo:string;
 cierre:DecisionCalendarioCentralV2|null;
 ruteo:ResultadoCatalogoV2|null;
 whatsappEnviado:false;baseModificada:false;
}>;
export type CoordinadorCentralV2Args=Readonly<{
 autenticadoPorWebhook:true;
 fechaCreacionISO:string;localidad:string;
 pedido:PropuestaPedido;
 catalogos:readonly ProveedorCatalogoV2[];
 fuentes:Readonly<{actual:SourceConfig;siguiente?:SourceConfig}>;
 feriadosOptativos:'contar_como_habiles'|'excluir_solo_si_adheridos';
 adhesionOptativosConfirmada:boolean;
 apiKey:string;
 model:'gpt-6-luna'|'gpt-6.1-sol';
 consultar?:typeof consultarFuenteFeriadosV2;
 proponer?:typeof proponerRuteoCatalogoConIAV2;
 fetchImpl?:typeof fetch;
}>;
const review=(codigo:string,cierre:DecisionCalendarioCentralV2|null=null,
 ruteo:ResultadoCatalogoV2|null=null):PropuestaCentralV2=>Object.freeze({
 estado:'revision_interna',codigo,cierre,ruteo,
 whatsappEnviado:false,baseModificada:false
});
function localize(date:Date){
 const p=new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Argentina/Buenos_Aires',year:'numeric',
  month:'2-digit',day:'2-digit'
 }).formatToParts(date);
 const get=(type:string)=>p.find(x=>x.type===type)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
/** IA Central delegates data acquisition and mathematical operations to
 * verified components; buyer/supplier never approve holidays individually.
 * A missing/mismatching source triggers internal retry/review only.
 */
export async function prepararPedidoCentralV2(
 args:CoordinadorCentralV2Args
):Promise<PropuestaCentralV2>{
 if(!args||args.autenticadoPorWebhook!==true||
  typeof args.localidad!=='string'||args.localidad.length<3||
  !args.pedido||args.pedido.zona_entrega!==args.localidad||
  !Array.isArray(args.catalogos)||args.catalogos.length===0||
  typeof args.fechaCreacionISO!=='string'||
  !Number.isFinite(Date.parse(args.fechaCreacionISO))||
  !args.fuentes?.actual)return review('origen_o_parametros_invalidos');
 const year=Number(localize(new Date(args.fechaCreacionISO)).slice(0,4));
 if(!Number.isSafeInteger(year)||year<2026||year>2099)
  return review('anio_no_admitido');
 const reader=args.consultar??consultarFuenteFeriadosV2;
 const read=async (config:SourceConfig,yr:number):
 Promise<{gobierno:FuenteAnualV2;contraste:FuenteAnualV2;locales:Locales}|null>=>{
  const [gobierno,contraste]=await Promise.all([
   reader({role:'gobierno',url:config.gobiernoURL,anio:yr},
    args.fetchImpl),
   reader({role:'contraste',url:config.contrasteURL,anio:yr},
    args.fetchImpl)
  ]);
  if(!gobierno||!contraste)return null;
  return {gobierno,contraste,locales:config.locales};
 };
 let current:Awaited<ReturnType<typeof read>>;
 let following:Awaited<ReturnType<typeof read>>=null;
 try{
  current=await read(args.fuentes.actual,year);
  if(!current)return review('feriados_fuente_incompleta');
  const localDate=localize(new Date(args.fechaCreacionISO));
  const dec=localDate.slice(5,7)==='12';
  if(dec){
   if(!args.fuentes.siguiente)return review('feriados_siguiente_anio_no_configurados');
   following=await read(args.fuentes.siguiente,year+1);
   if(!following)return review('feriados_siguiente_anio_no_confirmados');
  }
 }catch{return review('feriados_lectura_fallida')}
 const closure=decidirVencimientoCentralV2({
  fechaCreacionISO:args.fechaCreacionISO,localidad:args.localidad,
  anio:year,...current,
  ...(following?{siguienteAnio:following}:{}),
  reglaOptativos:args.feriadosOptativos,
  adhesionOptativosConfirmada:args.adhesionOptativosConfirmada
 });
 if(closure.estado!=='vencimiento_verificable')
  return review(closure.codigo,closure);
 // Saving model tokens: only AFTER calendar passes, invoke semantic product AI.
 try{
  const route=await (args.proponer??proponerRuteoCatalogoConIAV2)({
   pedido:args.pedido,proveedores:args.catalogos,
   apiKey:args.apiKey,model:args.model
  });
  if(route.estado!=='ruteo_valido_para_preparacion'||
   route.propuestas.length===0)return review(route.motivo,closure,route);
  return Object.freeze({
   estado:'propuesta_verificada_sin_envio',
   codigo:route.revisionTecnica.length>0?
    'envio_parcial_verificado':'pedido_y_calendario_verificados',
   cierre:closure,ruteo:route,
   whatsappEnviado:false,baseModificada:false
  });
 }catch{return review('ia_ruteo_interno_no_disponible',closure)}
}

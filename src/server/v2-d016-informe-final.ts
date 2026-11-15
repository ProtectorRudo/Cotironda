/** V2 D016: informe comparativo DETERMINISTA al cerrar dos días hábiles.
 * No suma totales, no decide ganadores, no confunde cobertura con precio,
 * no deduce IVA/flete ausente. Sólo reproduce guías respaldadas por evidencia.
 * Las autorizaciones y fecha de cierre provienen EXCLUSIVAMENTE de SQL.
 */
import type {CatalogoRespuestasV2,PuntoVisibleV2}
 from './v2-03-catalogo-respondedores.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const AREAS=['iva','flete','forma_pago','plazo','disponibilidad'] as const;
const CONTACT=/(?:\+?\d[\s().-]?){9,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\//iu;
type Area=typeof AREAS[number];
type Evidencia=Readonly<{
 categoria:string;evidencia:string;observacion:string;
 documentoId:string;
}>;
type ResumenComercio=Readonly<{
 comercio:string;documentos:number;analizados:number;
 evidencias:readonly Evidencia[];
 condiciones:Readonly<Record<Area,'citado_en_guia'|'no_identificado_en_guia'>>;
}>;
export type InformeFinalD016=Readonly<{
 estado:'informe_final_disponible';
 cierreMs:number;documentos:number;comercios:number;
 analizados:number;sinAnalisis:number;
 resumen:string;observaciones:readonly string[];
 comparacion:readonly ResumenComercio[];
 mensaje:string;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
export function componerInformeFinalD016(
 state:unknown,catalog:CatalogoRespuestasV2,nowMs:number
):InformeFinalD016|null{
 if(!obj(state)||state.state!=='closed_verified_business_two_days'||
  typeof state.requestId!=='string'||!UUID.test(state.requestId)||
  typeof state.closedAtMs!=='number'||!Number.isSafeInteger(state.closedAtMs)||
  state.closedAtMs<1577836800000||state.closedAtMs>nowMs||
  !Number.isSafeInteger(nowMs)||!catalog||
  catalog.estado!=='cotizaciones_recibidas'||
  !Array.isArray(catalog.respuestas)||catalog.respuestas.length>100)
  return null;
 const byBusiness=new Map<string,{docs:number;analizados:number;
  items:Evidencia[];areas:Set<Area>}>();
 const seen=new Set<string>();
 let analysed=0;
 for(const quote of catalog.respuestas){
  if(!quote||typeof quote.documentoId!=='string'||
   !UUID.test(quote.documentoId)||seen.has(quote.documentoId)||
   typeof quote.comercio!=='string'||quote.comercio.length<3||
   quote.comercio.length>100||!Array.isArray(quote.puntos)||
   quote.puntos.length>4)return null;
  seen.add(quote.documentoId);
  let business=byBusiness.get(quote.comercio);
  if(!business){
   business={docs:0,analizados:0,items:[],areas:new Set()};
   byBusiness.set(quote.comercio,business);
  }
  business.docs++;
  if(quote.puntos.length>0){
   analysed++;business.analizados++;
  }
  for(const evidence of quote.puntos){
   if(!evidence||typeof evidence.categoria!=='string'||
    typeof evidence.evidencia!=='string'||typeof evidence.observacion!=='string'||
    evidence.evidencia.length<6||evidence.evidencia.length>180||
    evidence.observacion.length<12||evidence.observacion.length>240||
    CONTACT.test(evidence.evidencia)||CONTACT.test(evidence.observacion))
    return null;
   business.items.push({...evidence,documentoId:quote.documentoId});
   if((AREAS as readonly string[]).includes(evidence.categoria))
    business.areas.add(evidence.categoria as Area);
  }
 }
 const sorted=[...byBusiness].sort(([a],[b])=>a.localeCompare(b,'es-AR'));
 const comparison=sorted.map(([comercio,info])=>{
  const condiciones={} as Record<Area,'citado_en_guia'|'no_identificado_en_guia'>;
  for(const area of AREAS)
   condiciones[area]=info.areas.has(area)?
    'citado_en_guia':'no_identificado_en_guia';
  return Object.freeze({
   comercio,documentos:info.docs,analizados:info.analizados,
   evidencias:Object.freeze(info.items.slice(0,12).map(v=>Object.freeze(v))),
   condiciones:Object.freeze(condiciones)
  });
 });
 const total=catalog.respuestas.length;
 const note=[
  'Compará solamente artículos equivalentes en unidades, cantidades, presentación y especificaciones.',
  'La ausencia de una mención en la guía NO demuestra que esa condición falte en el original.',
  'No se ordenan ofertas por precio total, ni se declaran ganadores: los originales prevalecen.'
 ];
 const resumen=total===0?'La ronda cerró sin presupuestos habilitados para mostrar.':
  `Se recibieron ${total} documentos de ${sorted.length} comercios identificados por nombre. `+
  `${analysed} tienen guía verificada y ${total-analysed} requieren lectura directa del original.`;
 return Object.freeze({
  estado:'informe_final_disponible',cierreMs:state.closedAtMs,
  documentos:total,comercios:sorted.length,analizados:analysed,
  sinAnalisis:total-analysed,resumen,
  observaciones:Object.freeze(note),
  comparacion:Object.freeze(comparison),
  mensaje:'Informe de cierre orientativo. Se mantienen disponibles los originales sujetos a consentimiento.'
 });
}

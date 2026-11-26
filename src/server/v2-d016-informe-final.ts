/** V2 D016: informe comparativo DETERMINISTA al cerrar dos días hábiles.
 * No suma entre proveedores ni decide ganadores; preserva separada la suma
 * verificable de renglones de cada oferta y no confunde cobertura con precio,
 * no deduce IVA/flete ausente. Sólo reproduce guías respaldadas por evidencia.
 * Las autorizaciones y fecha de cierre provienen EXCLUSIVAMENTE de SQL.
 */
import type {CatalogoRespuestasV2,PuntoVisibleV2}
 from './v2-03-catalogo-respondedores.ts';
import {importeVisiblePesosV2} from './v2-d016-resumen-comercial.ts';
import type {LineaCompraV2} from './v2-d016-resumen-comercial.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const AREAS=['iva','flete','forma_pago','disponibilidad'] as const;
const CONTACT=/(?:\+?\d[\s().-]?){9,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\//iu;
type Area=typeof AREAS[number];
type Evidencia=Readonly<{
 categoria:string;evidencia:string;observacion:string;
 documentoId:string;
}>;
type DetalleOferta=Readonly<{
 documentoId:string;
 importe:string|null;
 tipoImporte:string;
 cobertura:Readonly<{identificados:number;solicitados:number;porVerificar:readonly string[]}>|null;
 articulosCotizados:number|null;articulosEnviados:number|null;
 pago:string;iva:string;flete:string;
}>;
export type ComparacionMaterialFinalV2=Readonly<{
 linea:number;material:string;
 comercios:readonly Readonly<{
  comercio:string;
  estado:'coincidencia_automatica'|'por_verificar'|'sin_datos';
  cotizado:string|null;
 }>[];
}>;
type ResumenComercio=Readonly<{
 comercio:string;documentos:number;analizados:number;
 ofertas:readonly DetalleOferta[];
 evidencias:readonly Evidencia[];
 condiciones:Readonly<Record<Area,'citado_en_guia'|'no_identificado_en_guia'>>;
}>;
export type InformeFinalD016=Readonly<{
 estado:'informe_final_disponible';
 requestId:string;
 cierreMs:number;documentos:number;presupuestos:number;comercios:number;
 analizados:number;sinAnalisis:number;
 resumen:string;conclusion:string;
 observacionesIA:readonly Readonly<{comercio:string;observacion:string}>[];
 observaciones:readonly string[];
 recomendaciones:readonly string[];
 materiales:readonly ComparacionMaterialFinalV2[];
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
  items:Evidencia[];areas:Set<Area>;ofertas:DetalleOferta[]}>();
 const seen=new Set<string>();
 let analysed=0;
 for(const quote of catalog.respuestas){
  if(!quote||typeof quote.documentoId!=='string'||
   !UUID.test(quote.documentoId)||seen.has(quote.documentoId)||
   typeof quote.comercio!=='string'||quote.comercio.length<3||
   quote.comercio.length>100||!Array.isArray(quote.puntos)||
   quote.puntos.length>8)return null;
  const originals=quote.originalesAgrupados??[quote.documentoId];
  if(!Array.isArray(originals)||originals.length<1||originals.length>60||
   !originals.includes(quote.documentoId)||originals.some(id=>typeof id!=='string'||!UUID.test(id)||seen.has(id))||
   new Set(originals).size!==originals.length)return null;
  for(const id of originals)seen.add(id);
  if(seen.size>100)return null;
  let business=byBusiness.get(quote.comercio);
  if(!business){
   business={docs:0,analizados:0,items:[],areas:new Set(),ofertas:[]};
   byBusiness.set(quote.comercio,business);
  }
  business.docs+=originals.length;
  const cv=quote.resumen?.cobertura;
  business.ofertas.push(Object.freeze({
   documentoId:quote.documentoId,
   importe:importeVisiblePesosV2(quote.resumen?.totalDeclarado??quote.resumen?.sumaCalculada??null),
   tipoImporte:quote.resumen?.totalDeclarado?quote.resumen.tipoImporte:
    quote.resumen?.sumaCalculada?'Suma de artículos cotizados':'Importe no informado',
   cobertura:cv?Object.freeze({
    identificados:cv.identificados,solicitados:cv.solicitados,
    porVerificar:Object.freeze([...cv.porVerificar])
   }):null,
   articulosCotizados:quote.resumen?.articulosCotizados??null,
   articulosEnviados:quote.resumen?.articulosEnviados??null,
   pago:quote.resumen?.condiciones.pago??'No informado',
   iva:quote.resumen?.condiciones.iva??'No informado',
   flete:quote.resumen?.condiciones.flete??'No informado'
  }));
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
   // Plazos de entrega quedan íntegros en el PDF original, no en el informe.
   if(evidence.categoria==='plazo'||/plazo de entrega|0 dias/i.test(evidence.observacion))
    continue;
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
   ofertas:Object.freeze(info.ofertas),
   evidencias:Object.freeze(info.items.slice(0,12).map(v=>Object.freeze(v))),
   condiciones:Object.freeze(condiciones)
  });
 });
 // Matriz sólo al cierre SQL. Nunca combinamos listas de pedido discrepantes:
 // un parser incompleto no autoriza atribuir artículos a otra ronda.
 const withRequest=catalog.respuestas.filter(q=>q.resumen?.solicitado?.length);
 const requested:readonly LineaCompraV2[]=withRequest[0]?.resumen?.solicitado??[];
 const matchingRequest=withRequest.every(q=>{
  const r:readonly LineaCompraV2[]=q.resumen.solicitado;
  return r.length===requested.length&&r.every((item:LineaCompraV2,i:number)=>
   item.line===requested[i].line&&
   item.description===requested[i].description&&
   item.quantity===requested[i].quantity&&item.unit===requested[i].unit);
 });
 const materiales:ComparacionMaterialFinalV2[]=[];
 if(matchingRequest&&requested.length>0){
  for(const req of requested){
   const comercios=sorted.map(([comercio])=>{
    const docs=catalog.respuestas.filter(q=>q.comercio===comercio);
    const lines=docs.flatMap(q=>q.resumen?.cobertura?.detalle??[])
     .filter(row=>row.linea===req.line&&row.solicitado===req.description);
    const confirmed=lines.find(row=>row.estado==='coincidencia_automatica');
    const alternative=lines.find(row=>row.estado==='por_verificar'&&row.cotizado);
    return Object.freeze({
     comercio,
     estado:confirmed?'coincidencia_automatica' as const:
      lines.length?'por_verificar' as const:'sin_datos' as const,
     cotizado:confirmed?.cotizado??alternative?.cotizado??null
    });
   });
   materiales.push(Object.freeze({linea:req.line,material:req.description,
    comercios:Object.freeze(comercios)}));
  }
 }
 const total=catalog.respuestas.length;
 const note=[
  'Compará solamente artículos equivalentes en unidades, cantidades, presentación y especificaciones.',
  'La ausencia de una mención en la guía NO demuestra que esa condición falte en el original.',
  'No se ordenan ofertas por precio total, ni se declaran ganadores: los originales prevalecen.'
 ];
 const recomendaciones:string[]=[];
 if(!matchingRequest&&withRequest.length>1)
  recomendaciones.push('Las listas de materiales extraídas no coinciden: verificá los originales antes de comparar por artículo.');
 if(materiales.some(row=>row.comercios.some(c=>c.estado!=='coincidencia_automatica')))
  recomendaciones.push('La comparación por material señala correspondencias automáticas, no faltantes de stock ni equivalencias certificadas.');
 if(comparison.some(c=>c.ofertas.some(o=>!o.cobertura||
  o.cobertura.identificados<o.cobertura.solicitados||
  o.cobertura.porVerificar.length>0)))
  recomendaciones.push('Revisá los materiales y presentaciones sin equivalencia técnica confirmada antes de comparar presupuestos.');
 if(comparison.some(c=>c.ofertas.some(o=>o.importe&&o.tipoImporte!=='Total informado')))
  recomendaciones.push('Hay importes que no están confirmados como total final. No los compares como precios completos.');
 if(comparison.some(c=>c.ofertas.some(o=>
  [o.pago,o.iva,o.flete].some(x=>x==='No informado'||x==='No verificado'))))
  recomendaciones.push('Consultá las condiciones no informadas o sin verificar en cada PDF; no se consideran incluidas por defecto.');
 // El resumen visible se compone de hechos respaldados por proyecciones
 // privadas; no se comparan subtotales ni sumas como precios finales.
 const ofertas=sorted.flatMap(([,info])=>info.ofertas);
 const montosNoFinales=ofertas.some(o=>o.importe&&o.tipoImporte!=='Total informado');
 const faltanMontos=ofertas.some(o=>!o.importe);
 const equivalenciasPendientes=ofertas.some(o=>!o.cobertura||
  o.cobertura.identificados<o.cobertura.solicitados||
  o.cobertura.porVerificar.length>0);
 const tipos=new Set(ofertas.map(o=>o.tipoImporte));
 const sumasYSubtotales=tipos.has('Subtotal informado')&&
  tipos.has('Suma de artículos cotizados');
 const dosProveedores=sorted.length===2&&ofertas.length===2;
 const cantidad=dosProveedores&&ofertas[0].articulosCotizados!==null&&
  ofertas[0].articulosCotizados===ofertas[1].articulosCotizados?
  ofertas[0].articulosCotizados:null;
 const proveedoresPorVerificar=sorted.filter(([,info])=>
  info.ofertas.some(o=>!o.cobertura||
   o.cobertura.identificados<o.cobertura.solicitados||
   o.cobertura.porVerificar.length>0)).map(([comercio])=>comercio);
 const conclusion=total===0?'No se recibieron presupuestos disponibles para comparar.':
  [
   cantidad!==null&&cantidad>0?
    'Ambos proveedores cotizaron '+cantidad+' artículos cada uno.':null,
   sumasYSubtotales?
    'El subtotal y la suma calculada no son precios finales directamente comparables.':
    montosNoFinales?
     'Hay importes que son subtotales o sumas de artículos, no precios finales.':
     faltanMontos?'No todos los presupuestos tienen un importe informado.':
     'Los totales declarados requieren revisar IVA y flete en los originales.',
   equivalenciasPendientes?
    proveedoresPorVerificar.length===1?
     'En '+proveedoresPorVerificar[0]+' hay equivalencias por verificar.':
     'Hay equivalencias de materiales por verificar.':null
  ].filter(Boolean).join(' ');
 // Reutilizar observaciones YA elaboradas por IA, aceptadas por su evidencia
 // del original y filtradas por el catálogo privado; no hacer otra lectura.
 const observacionesIA=sorted.flatMap(([comercio,info])=>
  info.items.filter(p=>['material','presentacion','disponibilidad',
   'aclaracion','cobertura'].includes(p.categoria)&&
   !/\$|\b(?:precio|subtotal|total|iva|flete|pago|descuento)\b/iu.test(p.observacion))
  .slice(0,1).map(p=>Object.freeze({comercio,observacion:p.observacion}))
 ).slice(0,2);
 const resumen=total===0?'La ronda cerró sin presupuestos habilitados para mostrar.':
  `Se recibieron ${total} presupuestos de ${sorted.length} comercios, con ${seen.size} originales conservados. `+
  `${analysed} tienen guía verificada y ${total-analysed} requieren lectura directa del original.`;
 return Object.freeze({
  estado:'informe_final_disponible',requestId:state.requestId,
  cierreMs:state.closedAtMs,
  documentos:seen.size,presupuestos:total,comercios:sorted.length,analizados:analysed,
  sinAnalisis:total-analysed,resumen,conclusion,
  observacionesIA:Object.freeze(observacionesIA),
  observaciones:Object.freeze(note),
  recomendaciones:Object.freeze(recomendaciones),
  materiales:Object.freeze(materiales),
  comparacion:Object.freeze(comparison),
  mensaje:'Informe de cierre orientativo. Se mantienen disponibles los originales sujetos a consentimiento.'
 });
}

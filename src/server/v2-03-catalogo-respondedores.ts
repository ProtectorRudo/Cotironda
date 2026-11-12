/** Cotironda V2-03a: proyeccion segura SOLO de comercios que respondieron.
 * Ningun nombre, invitacion, precio, ruta, hash o token se toma del navegador.
 * El origen es la RPC privada, invocada DESPUES de verificar getUser+JWT.
 */
export type PuntoVisibleV2=Readonly<{
 categoria:string;evidencia:string;observacion:string;
}>;
export type RespuestaV2=Readonly<{
 documentoId:string;comercio:string;formato:string;recibidoMs:number;
 analisis:string;
 puntos:readonly PuntoVisibleV2[];
}>;
export type CatalogoRespuestasV2=Readonly<{
 estado:'cotizaciones_recibidas';
 mensaje:'Todavía no recibimos cotizaciones'|'Cotizaciones recibidas';
 respuestas:readonly RespuestaV2[];
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/iu;
const FORMATS:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'PDF',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'Excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'Word',
 'application/msword':'Word',
 'application/vnd.ms-excel':'Excel',
 'image/jpeg':'Imagen JPEG','image/png':'Imagen PNG',
 'image/webp':'Imagen WebP','text/csv':'CSV','text/plain':'Texto'
});
const CATS=new Set([
 'cobertura','precio','iva','flete','forma_pago','plazo',
 'disponibilidad','material','presentacion','aclaracion'
]);
function safeAnalysis(value:unknown):readonly PuntoVisibleV2[]{
 if(!obj(value)||value.state!=='ready'||!Array.isArray(value.points)||
  value.points.length<2||value.points.length>4)return [];
 const points:PuntoVisibleV2[]=[];
 for(const part of value.points){
  if(!obj(part)||typeof part.categoria!=='string'||
   !CATS.has(part.categoria)||typeof part.evidencia!=='string'||
   part.evidencia.length<6||part.evidencia.length>180||
   typeof part.observacion!=='string'||part.observacion.length<12||
   part.observacion.length>240||
   /[<>\\u0000-\\u001f]/u.test(part.evidencia+part.observacion)||
   /(?:\\+?\\d[\\s().-]?){9,}/u.test(part.observacion)||
   /[\\w.+-]+@[\\w.-]+\\.\\w+/u.test(part.observacion))
    return [];
  points.push(Object.freeze({
   categoria:part.categoria,evidencia:part.evidencia,
   observacion:part.observacion
  }));
 }
 return Object.freeze(points);
}
function obj(x:unknown):x is Record<string,unknown>{
 return !!x&&typeof x==='object'&&!Array.isArray(x);
}
export function proyectarRespuestasV2(raw:unknown):CatalogoRespuestasV2|null{
 if(!obj(raw)||raw.state!=='authorized_responders_v2'||
    typeof raw.buyerKey!=='string'||!(/^[a-z0-9_-]{3,100}$/u).test(raw.buyerKey)||
    !Array.isArray(raw.originals)||raw.originals.length>100||
    raw.total!==raw.originals.length)return null;
 const found=new Set<string>();
 const res:RespuestaV2[]=[];
 for(const it of raw.originals){
  if(!obj(it)||typeof it.documentId!=='string'||!UUID.test(it.documentId)||
     found.has(it.documentId)||typeof it.supplierName!=='string'||
     it.supplierName.trim()!==it.supplierName||
     it.supplierName.length<3||it.supplierName.length>100||
     /[\u0000-\u001f\u007f<>]/u.test(it.supplierName)||
     /(?:\+?\d[\s.-]?){8,}/u.test(it.supplierName)||
     it.supplierName.includes('@')||
     typeof it.mime!=='string'||!Object.hasOwn(FORMATS,it.mime)||
     !['document','image'].includes(String(it.kind))||
     typeof it.receivedAt!=='number'||!Number.isSafeInteger(it.receivedAt)||
     it.receivedAt<1577836800000||
     it.receivedAt>Date.now()+60_000)return null;
  found.add(it.documentId);
  const points=safeAnalysis(it.analysis);
  res.push(Object.freeze({
   documentoId:it.documentId,comercio:it.supplierName,
   formato:FORMATS[it.mime],recibidoMs:it.receivedAt,
   analisis:points.length?'Lo importante de este presupuesto':
    'Análisis en preparación',
   puntos:points
  }));
 }
 return Object.freeze({
  estado:'cotizaciones_recibidas' as const,
  mensaje:res.length===0?'Todavía no recibimos cotizaciones' as const:
   'Cotizaciones recibidas' as const,
  respuestas:Object.freeze(res)
 });
}

/** Cotironda V2-03a: proyeccion segura SOLO de comercios que respondieron.
 * Ningun nombre, invitacion, precio, ruta, hash o token se toma del navegador.
 * El origen es la RPC privada, invocada DESPUES de verificar getUser+JWT.
 */
import {resumirOfertaComercialV2,type ResumenComercialV2}
 from './v2-d016-resumen-comercial.ts';

export type PuntoVisibleV2=Readonly<{
 categoria:string;evidencia:string;observacion:string;
}>;
export type RespuestaV2=Readonly<{
 documentoId:string;comercio:string;formato:string;recibidoMs:number;
 originalesAgrupados?:readonly string[];
 analisis:string;
 puntos:readonly PuntoVisibleV2[];
 resumen:ResumenComercialV2;
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
  value.points.length<2||value.points.length>8)return [];
 const points:PuntoVisibleV2[]=[];
 for(const part of value.points){
  if(!obj(part)||typeof part.categoria!=='string'||
   !CATS.has(part.categoria)||typeof part.evidencia!=='string'||
   part.evidencia.length<6||part.evidencia.length>180||
   typeof part.observacion!=='string'||part.observacion.length<12||
   part.observacion.length>240||
   /[<>\u0000-\u001f]/u.test(part.evidencia+part.observacion)||
   /(?:\+?\d[\s().-]?){9,}/u.test(part.observacion)||
   /[\w.+-]+@[\w.-]+\.\w+/u.test(part.observacion))
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
 const groups=new Map<string,{ids:string[];raw:Record<string,unknown>}>();
 for(const it of raw.originals){
  if(!obj(it)||typeof it.documentId!=='string'||!UUID.test(it.documentId)||
     found.has(it.documentId)||typeof it.supplierName!=='string'||
     it.supplierName.trim()!==it.supplierName||
     it.supplierName.length<3||it.supplierName.length>100||
     /[\u0000-\u001f\u007f<>]/u.test(it.supplierName)||
     /(?:\+?\d[\s.-]?){8,}/u.test(it.supplierName)||
     it.supplierName.includes('@')||
     typeof it.mime!=='string'||!Object.hasOwn(FORMATS,it.mime)||
     !(['document','image'].includes(String(it.kind))||
       (it.kind==='text'&&it.mime==='text/plain'))||
     typeof it.receivedAt!=='number'||!Number.isSafeInteger(it.receivedAt)||
     it.receivedAt<1577836800000||
     it.receivedAt>Date.now()+60_000)return null;
  found.add(it.documentId);
  if(it.quoteGroup!==undefined){
   const g=it.quoteGroup;
   if(!obj(g)||it.kind!=='text'||typeof g.anchorId!=='string'||!UUID.test(g.anchorId)||
    !Array.isArray(g.documentIds)||g.documentIds.length<2||g.documentIds.length>60||
    g.documentIds.some(id=>typeof id!=='string'||!UUID.test(id))||
    new Set(g.documentIds).size!==g.documentIds.length||!g.documentIds.includes(g.anchorId)||!g.documentIds.includes(it.documentId))return null;
   const existing=groups.get(g.anchorId);
   if(existing&&JSON.stringify(existing.raw)!==JSON.stringify(g))return null;
   groups.set(g.anchorId,{ids:g.documentIds,raw:g});
  }
  const points=safeAnalysis(it.analysis);
  res.push(Object.freeze({
   documentoId:it.documentId,comercio:it.supplierName,
   formato:it.kind==='text'?'WhatsApp (texto)':FORMATS[it.mime],
   recibidoMs:it.receivedAt,
   analisis:points.length?'Lo importante de este presupuesto':
    'Análisis en preparación',
   puntos:points,
   resumen:resumirOfertaComercialV2(it.commercial,points)
  }));
 }
 // Cada ID debe pertenecer al mismo catálogo autorizado y al mismo comercio.
 // Agrupar solo manifiestos recíprocos; jamás ocultar una fuente no acreditada.
 const omitted=new Set<string>(),merged=new Map<string,RespuestaV2>();
 const count=(x:unknown):number|null=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=25?x:null;
 for(const [anchor,g] of groups){
  const members=res.filter(r=>g.ids.includes(r.documentoId));
  const base=members.find(r=>r.documentoId===anchor);
  if(!base||members.length!==g.ids.length||members.some(r=>r.comercio!==base.comercio||r.formato!=='WhatsApp (texto)'||omitted.has(r.documentoId)))return null;
  for(const id of g.ids){
   const rawItem=raw.originals.find(x=>obj(x)&&x.documentId===id);
   if(!obj(rawItem)||!obj(rawItem.quoteGroup)||rawItem.quoteGroup.anchorId!==anchor)return null;
   omitted.add(id);
  }
  const q=count(g.raw.quotedCount),a=count(g.raw.assignedCount);
  const valid=q!==null&&a!==null&&a>0&&q<=a;
  const iva=g.raw.iva==='incluido_explicito'?'Incluido':g.raw.iva==='sin_iva_explicito'?'Sin IVA (informado)':'No informado';
  const flete=g.raw.flete==='incluido_explicito'?'Incluido':g.raw.flete==='excluido_explicito'?'No incluido':g.raw.flete==='a_convenir'?'A convenir':'No informado';
  const pago=g.raw.pago==='contado'?'Contado':g.raw.pago==='transferencia'?'Transferencia':g.raw.pago==='credito'?'Crédito':'No informado';
  const blank=resumirOfertaComercialV2(null,[]);
  merged.set(anchor,Object.freeze({...base,originalesAgrupados:Object.freeze([...g.ids]),
   analisis:valid?'Análisis conjunto de los mensajes':'Revisá los mensajes originales',puntos:Object.freeze([]),
   resumen:Object.freeze({...blank,articulosCotizados:valid?q:null,articulosEnviados:valid?a:null,
    condiciones:Object.freeze({...blank.condiciones,iva,flete,pago})})}));
 }
 const grouped=res.flatMap(r=>merged.has(r.documentoId)?[merged.get(r.documentoId)!]:omitted.has(r.documentoId)?[]:[r]);
 return Object.freeze({
  estado:'cotizaciones_recibidas' as const,
  mensaje:grouped.length===0?'Todavía no recibimos cotizaciones' as const:
   'Cotizaciones recibidas' as const,
  respuestas:Object.freeze(grouped)
 });
}

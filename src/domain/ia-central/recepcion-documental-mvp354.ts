/**
 * MVP354 — proyección estrictamente documental para el comprador.
 * El SQL privado verifica token y evidencias de invitación/archivo.
 * Esta función NO autoriza archivos, identidad, precios ni descargas.
 */
export type RecepcionDocumentalMvp354=Readonly<{
 state:'recepcion_documental_anonima_mvp354';
 invitados:number;archivos_recibidos:number;pendientes:number;
 precios_validados:false;originales_disponibles:false;
 identidades_reveladas:false;comparacion_permitida:false;
}>;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=25;
const keys=['state','invitados','archivos_recibidos','pendientes',
 'precios_validados','originales_disponibles','identidades_reveladas',
 'comparacion_permitida'] as const;
export function recepcionDocumentalMvp354(
 raw:unknown,buyerTracking:unknown
):RecepcionDocumentalMvp354|null{
 if(!obj(buyerTracking)||!['waiting','closed'].includes(String(buyerTracking.state))||
    !obj(raw)||Object.keys(raw).length!==keys.length||
    keys.some(k=>!Object.hasOwn(raw,k))||
    raw.state!=='recepcion_documental_anonima_mvp354'||
    !integer(raw.invitados)||!integer(raw.archivos_recibidos)||
    !integer(raw.pendientes)||raw.archivos_recibidos>raw.invitados||
    raw.pendientes!==raw.invitados-raw.archivos_recibidos||
    raw.precios_validados!==false||raw.originales_disponibles!==false||
    raw.identidades_reveladas!==false||raw.comparacion_permitida!==false)
   return null;
 return Object.freeze({
  state:'recepcion_documental_anonima_mvp354',
  invitados:raw.invitados,archivos_recibidos:raw.archivos_recibidos,
  pendientes:raw.pendientes,precios_validados:false,
  originales_disponibles:false,identidades_reveladas:false,
  comparacion_permitida:false
 });
}

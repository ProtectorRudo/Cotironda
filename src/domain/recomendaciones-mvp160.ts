import {
 compararCotizacionesOffline,
 type PedidoComparable,
 type OfertaComparable,
 type ResultadoComparacion,
 type OpcionComparacion
} from './comparacion-ofertas.ts';

/**
 * MVP160 — seleccion explicable sobre el comparador monetario YA AUDITADO.
 * SIN fuente real, permisos, contactos, WhatsApp, archivos o adjudicacion.
 *
 * Si difieren moneda/pago/plazo NO hay un ranking economico comun.
 * Un empate entre >2 candidatos NO se rompe artificialmente.
 * La mejor opcion puede ser un par complementario (dos proveedores).
 * No promete que un original pueda descargarse: eso requiere permiso aparte.
 */
export type EstadoRecomendacion =
  |'sin_opcion_completa'
  |'condiciones_no_comparables'
  |'empate_sin_desempate_justificado'
  |'alternativas_comparables';

export type ResultadoRecomendaciones = Readonly<{
  estado:EstadoRecomendacion;
  recomendadosAnonimos:readonly string[];
  opcionPrincipal:OpcionComparacion|null;
  segundaAlternativa:OpcionComparacion|null;
  empateSinOrden:boolean;
  cobertura:ResultadoComparacion['cobertura'];
  opcionesCompletas:ResultadoComparacion['opcionesCompletas'];
  gruposComparables:ResultadoComparacion['gruposComparables'];
  alcance:'comparacion_offline_no_integrada_a_rondas_reales';
  adjudicacion:false;
  compraObligatoria:false;
  contactosRevelados:false;
}>;

function output(estado:EstadoRecomendacion,
 base:ResultadoComparacion,ids:readonly string[],
 principal:OpcionComparacion|null,segunda:OpcionComparacion|null,
 empate:boolean):ResultadoRecomendaciones{
 return Object.freeze({
  estado,recomendadosAnonimos:Object.freeze([...ids]),
  opcionPrincipal:principal,segundaAlternativa:segunda,empateSinOrden:empate,
  cobertura:base.cobertura,opcionesCompletas:base.opcionesCompletas,
  gruposComparables:base.gruposComparables,
  alcance:'comparacion_offline_no_integrada_a_rondas_reales' as const,
  adjudicacion:false as const,compraObligatoria:false as const,
  contactosRevelados:false as const
 });
}

/**
 * Nunca selecciona un proveedor porque el subtotal de SU PARTE sea menor.
 * Llama al comparador exacto que exige cobertura total, unidad y
 * equivalencia, IVA/flete/minimos declarados y condiciones comparables.
 *
 * No califica comercialmente a los excluidos: TODOS los candidatos se
 * mantienen en cobertura para que el portal de cierre pueda mostrarlos.
 * Un solo grupo de condiciones es requisito para emitir un orden de costo.
 */
export function recomendarHastaDosOffline(
 pedido:PedidoComparable,
 ofertas:readonly OfertaComparable[]
):ResultadoRecomendaciones{
 const base=compararCotizacionesOffline(pedido,ofertas);
 const all=base.opcionesCompletas;
 if(all.length===0)
  return output('sin_opcion_completa',base,[],null,null,false);
 if(base.gruposComparables!==1)
  return output('condiciones_no_comparables',base,[],null,null,false);
 const cheapest=all[0];
 // Price formatting is canonical in the comparison engine (decimal cents).
 const equal=all.filter(x=>x.totalFinal===cheapest.totalFinal);
 if(equal.length>1){
  const ids=[...new Set(equal.flatMap(x=>x.proveedoresAnonimos))].sort();
  if(ids.length>2)
   return output('empate_sin_desempate_justificado',base,[],null,null,true);
  // Two alternatives with identical complete-basket cost are a true TIE,
  // not an invented first and second ranking.
  return output('alternativas_comparables',base,ids,cheapest,
   equal.find(x=>x!==cheapest)??null,true);
 }
 const selected=[...cheapest.proveedoresAnonimos];
 // If best basket already uses two suppliers, no extra recommended party:
 // an "alternative" naming others would silently disclose 3+ providers.
 if(selected.length===2)
  return output('alternativas_comparables',base,selected,cheapest,null,false);
 // For the second recommendation consider only another COMPLETE-basket
 // option that adds ONE provider, not a cheap partial quote.
 const second=all.slice(1).find(option=>{
  const union=new Set([...selected,...option.proveedoresAnonimos]);
  return union.size===2&&option.proveedoresAnonimos.some(id=>!selected.includes(id));
 })??null;
 if(second){
  for(const id of second.proveedoresAnonimos)
   if(!selected.includes(id))selected.push(id);
 }
 return output('alternativas_comparables',base,selected,cheapest,second,false);
}

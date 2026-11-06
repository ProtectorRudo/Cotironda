/**
 * MVP254 — etapa 4, propuesta PRIVADA de cobertura por rubro con hasta 2
 * presupuestos anónimos. No hace rankings, adjudicaciones ni sumas de canastas
 * incompatibles. SOLO recibe los contratos ya cotejados de MVP225.
 *
 * Se separan explícitamente:
 * - artículos a los que un proveedor RESPONDIÓ (cobertura comercial);
 * - artículos cuyo PRECIO está respaldado por el documento;
 * - comparabilidad económica SOLO por artículo, de MVP225.
 *
 * La proyección al navegador requiere autorización RPC/token adicional.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {compararPorRubroMvp225,
 type PedidoLineaMvp225,type OfertaVerificadaMvp225,
 type ComparacionMvp225} from './calificador-cotizaciones-mvp225.ts';

type Opcion=Readonly<{
 ofertasAnonimas:readonly string[];
 articulosCotizados:readonly string[];
 articulosConPrecioComprobado:readonly string[];
 articulosSinPrecioComprobado:readonly string[];
 articulosFaltantes:readonly string[];
 cobertura:'completa'|'parcial';
 condicionesHomogeneas:boolean;
 comparacionEconomica:'solo_por_articulo'|'condiciones_no_homogeneas';
 totalGlobalComparable:false;
}>;
export type CoberturaComparadaMvp254=Readonly<{
 estado:'analisis_privado_por_rubro_sin_ranking';
 rubros:readonly Readonly<{
  rubro:RubroMvp216;solicitados:number;
  opciones:readonly Opcion[];
  ofertasEnRevision:readonly string[];
 }>[];
 comparacionPorArticulo:ComparacionMvp225['comparables'];
 rankingGlobalPermitido:false;
 adjudicacionAutomatica:false;
 contactosRevelados:false;
}>;
const anon=/^(?:Oferta [A-Z0-9]{1,3}|Presupuesto [1-9][0-9]{0,2})$/u;
const id=/^[a-zA-Z0-9_-]{2,80}$/u;

function compatibilidad(a:OfertaVerificadaMvp225,b:OfertaVerificadaMvp225){
 return a.moneda===b.moneda&&a.iva===b.iva&&
  a.flete===b.flete&&a.pago===b.pago;
}

/** Núcleo compartido MVP254/MVP255: parejas solo si aumentan cobertura.
 * Recibe identificadores acreditados, no precios ni datos personales.
 * El orden es informativo: más cobertura y menos participantes, NO precio. */
export function gruposCoberturaMvp254(
 conjuntos:readonly (readonly string[])[]
):readonly (readonly number[])[]{
 if(!Array.isArray(conjuntos)||conjuntos.length>50||
    conjuntos.some(x=>!Array.isArray(x)||x.length>200||
      x.some(id=>typeof id!=='string'||!/^item_[1-9][0-9]{0,2}$|^[a-z][a-z0-9_-]{1,79}$/u.test(id))||
      new Set(x).size!==x.length))
  throw new TypeError('mvp254_cobertura_invalida');
 const result:{indexes:number[];count:number}[]=[];
 for(let i=0;i<conjuntos.length;i++){
  if(conjuntos[i].length===0)continue;
  result.push({indexes:[i],count:conjuntos[i].length});
  for(let j=i+1;j<conjuntos.length;j++){
   const union=new Set([...conjuntos[i],...conjuntos[j]]);
   if(union.size>Math.max(conjuntos[i].length,conjuntos[j].length))
    result.push({indexes:[i,j],count:union.size});
  }
 }
 result.sort((a,b)=>b.count-a.count||
  a.indexes.length-b.indexes.length||
  a.indexes.join(',').localeCompare(b.indexes.join(',')));
 return Object.freeze(result.map(x=>Object.freeze(x.indexes)));
}

export function opcionesPorRubroMvp254(
 pedido:readonly PedidoLineaMvp225[],
 presupuestos:readonly OfertaVerificadaMvp225[]
):CoberturaComparadaMvp254{
 if(!Array.isArray(pedido)||pedido.length<1||pedido.length>200||
    !Array.isArray(presupuestos)||presupuestos.length>50)
  throw new TypeError('mvp254_entrada_invalida');
 const ids=new Set<string>();
 for(const x of pedido){
  if(!x||!id.test(x.id)||ids.has(x.id)||
     !Object.hasOwn(RUBROS_MVP216,x.rubro))
   throw new TypeError('mvp254_pedido_invalido');
  ids.add(x.id);
 }
 const labels=new Set<string>();
 for(const q of presupuestos){
  if(!q||!anon.test(q.etiquetaAnonima)||labels.has(q.etiquetaAnonima))
   throw new TypeError('mvp254_etiqueta_no_anonima_o_duplicada');
  labels.add(q.etiquetaAnonima);
 }
 const comparison=compararPorRubroMvp225(pedido,presupuestos);
 const rubros=(Object.keys(RUBROS_MVP216) as RubroMvp216[])
  .filter(rubro=>pedido.some(x=>x.rubro===rubro))
  .map(rubro=>{
   const asked=pedido.filter(x=>x.rubro===rubro).map(x=>x.id);
   const eligible=presupuestos.map((q,index)=>{
    const result=comparison.ofertas[index];
    const summary=result.rubros.find(x=>x.rubro===rubro);
    const replied=summary
     ?asked.filter(item=>!summary.faltantes.includes(item)):[];
    const priced=result.precios
     .filter(x=>asked.includes(x.pedidoId)).map(x=>x.pedidoId);
    if(priced.some(x=>!replied.includes(x)))
     throw new TypeError('mvp254_inconsistencia_cobertura');
    return {q,result,replied,priced};
   });
   // Sólo alternativas con importes corroborados para el comparador.
   // Otras ofertas se conservan como "en revisión", no se descartan.
   const verified=eligible.filter(x=>
    x.result.estado==='verificada_para_comparacion'&&x.replied.length>0);
   const review=eligible.filter(x=>
    x.result.estado==='requiere_revision'&&x.replied.length>0)
    .map(x=>x.q.etiquetaAnonima);
   const choices:Opcion[]=[];
   function add(group:typeof verified){
    const included=new Set(group.flatMap(x=>x.replied));
    const priced=new Set(group.flatMap(x=>x.priced));
    const cotizados=asked.filter(x=>included.has(x));
    const conPrecio=asked.filter(x=>priced.has(x));
    const homog=group.length===1||
      group.every(x=>compatibilidad(group[0].q,x.q));
    choices.push(Object.freeze({
     ofertasAnonimas:Object.freeze(group.map(x=>x.q.etiquetaAnonima)),
     articulosCotizados:Object.freeze(cotizados),
     articulosConPrecioComprobado:Object.freeze(conPrecio),
     articulosSinPrecioComprobado:Object.freeze(
      cotizados.filter(x=>!priced.has(x))),
     articulosFaltantes:Object.freeze(asked.filter(x=>!included.has(x))),
     cobertura:cotizados.length===asked.length?'completa':'parcial',
     condicionesHomogeneas:homog,
     comparacionEconomica:homog?'solo_por_articulo':
       'condiciones_no_homogeneas',
     totalGlobalComparable:false
    }));
   }
   for(const indexes of gruposCoberturaMvp254(verified.map(x=>x.replied)))
    add(indexes.map(i=>verified[i]));
   // Orden por COBERTURA, nunca menor subtotal de presupuestos parciales.
   // No se truncan opciones; el consumidor futuro debe paginarlas.
   choices.sort((a,b)=>{
    const difference=b.articulosCotizados.length-a.articulosCotizados.length;
    return difference||a.ofertasAnonimas.length-b.ofertasAnonimas.length||
     a.ofertasAnonimas.join('|').localeCompare(b.ofertasAnonimas.join('|'));
   });
   return Object.freeze({
    rubro,solicitados:asked.length,
    opciones:Object.freeze(choices),
    ofertasEnRevision:Object.freeze(review)
   });
  });
 return Object.freeze({
  estado:'analisis_privado_por_rubro_sin_ranking',
  rubros:Object.freeze(rubros),
  comparacionPorArticulo:comparison.comparables,
  rankingGlobalPermitido:false,
  adjudicacionAutomatica:false,
  contactosRevelados:false
 });
}

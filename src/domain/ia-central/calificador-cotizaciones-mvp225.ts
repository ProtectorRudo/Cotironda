/** IA Central MVP225: IA propone correspondencias semánticas; el comparador
 * solo compara importes ya conciliados con el original, por artículo y rubro.
 * Ninguna posición por suma de ofertas parciales. Sin acceso a datos privados.
 * NUNCA publicar un presupuesto a partir solo de este módulo.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {monedaFuenteMvp241} from './evidencia-moneda-mvp241.ts';
import {condicionFuenteMvp242} from './evidencia-condiciones-mvp242.ts';
import {importesOriginalesRepresentadosMvp244} from './fidelidad-importes-fuente-mvp244.ts';
import {diagnosticarPresentacionMvp243,
 type DiagnosticoPresentacionMvp243
} from './diagnostico-presentaciones-mvp243.ts';

export type PedidoLineaMvp225=Readonly<{
 id:string;descripcion:string;rubro:RubroMvp216;
 cantidad:string;unidad:string;
}>;
export type OfertaLineaMvp225=Readonly<{
 numero:number;
 textoOriginal:string;
 descripcion:string;
 cantidad:string|null;unidad:string|null;
 precioUnitarioLiteral:string|null;
 totalLineaLiteral:string|null;
 tipo:'material'|'cargo_adicional'|'aclaracion';
}>;
export type VinculoSemanticoMvp225=Readonly<{
 lineaOferta:number;articuloPedido:string;
 equivalencia:'misma_presentacion'|'alternativa_razonable'|'requiere_verificacion';
 explicacion:string;
}>;
export type OfertaVerificadaMvp225=Readonly<{
 etiquetaAnonima:string;
 moneda:'ARS'|'USD'|'no_informada';
 iva:'incluido_explicito'|'sin_iva_explicito'|'no_informado';
 flete:'incluido_explicito'|'excluido_explicito'|'a_convenir'|'no_informado';
 pago:'contado'|'transferencia'|'credito'|'no_informado';
 fuente:string;
 lineas:readonly OfertaLineaMvp225[];
 vinculos:readonly VinculoSemanticoMvp225[];
}>;
type RubroResumenMvp225=Readonly<{
 rubro:RubroMvp216;
 solicitados:number;respondidos:number;precioComprobado:number;
 cobertura:'completa'|'parcial'|'sin_cobertura';
 faltantes:readonly string[];
}>;
type EvidenciaPrecioMvp225=Readonly<{
 pedidoId:string;numeroOferta:number;cantidad:string;unidad:string;
 centavos:bigint;
}>;
export type OfertaEvaluadaMvp225=Readonly<{
 etiquetaAnonima:string;
 estado:'verificada_para_comparacion'|'requiere_revision';
 motivos:readonly string[];
 rubros:readonly RubroResumenMvp225[];
 extras:readonly Readonly<{numero:number;textoOriginal:string}>[];
 precios:readonly EvidenciaPrecioMvp225[];
 /** Solo evidencia física nominal de alternativas, NUNCA habilita ranking. */
 presentaciones?:readonly DiagnosticoPresentacionMvp243[];
}>;
export type ComparacionMvp225=Readonly<{
 estado:'analisis_por_rubro_sin_adjudicacion';
 ofertas:readonly OfertaEvaluadaMvp225[];
 comparables:readonly Readonly<{
  rubro:RubroMvp216;pedidoId:string;
  alternativas:readonly Readonly<{
   oferta:string;centavos:bigint;
  }>[];
  situacion:'importe_linea_comparable'|'sin_base_suficiente';
 }>[];
 rankingGlobalPermitido:false;
 adjudicacionAutomatica:false;
 contactosRevelados:false;
}>;
const ID=/^[a-zA-Z0-9_-]{2,80}$/u;
const QTY=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,3})?$/u;
// Reconocer literal monetario completo AR$/US$/U$S, ARS o USD.
const CENTS=/^(?:(?:AR\$|US\$|U\$S|\$)\s*|(?:ARS|USD)\s+)?(?:0|[1-9]\d{0,8})(?:,\d{1,2})?$/iu;
const GROUPED=/^(?:(?:AR\$|US\$|U\$S|\$)\s*|(?:ARS|USD)\s+)?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/iu;
const TEXT=(s:unknown,max:number):s is string=>typeof s==='string'&&
 s.trim().length>0&&s.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s);
const unit=/^(bag|unit|box|kg|g|l|ml|m|m2|m3|roll|pack)$/u;
export function cantidadMil(raw:string):bigint|null{
 if(typeof raw!=='string'||!QTY.test(raw))return null;
 const parts=raw.split('.');
 const n=BigInt(parts[0])*1000n+BigInt((parts[1]??'').padEnd(3,'0'));
 return n>0n&&n<=100000000000n?n:null;
}
export function dineroCentavosLiteral(raw:string):bigint|null{
 if(typeof raw!=='string')return null;
 const trimmed=raw.trim();
 if(!CENTS.test(trimmed)&&!GROUPED.test(trimmed))return null;
 const normalized=trimmed.replace(/^(?:(?:AR\$|US\$|U\$S|\$)\s*|(?:ARS|USD)\s+)/iu,'')
  .replace(/[\s.]/gu,'');
 const [integer,decimal='']=normalized.split(',');
 if(!/^\d+$/u.test(integer))return null;
 const result=BigInt(integer)*100n+BigInt(decimal.padEnd(2,'0'));
 return result>=0n&&result<=100000000000000n?result:null;
}
/** El valor unitario debe aparecer literalmente en la fuente.
 * Si el proveedor NO declaró un total, el backend puede calcularlo,
 * exclusivamente con una cantidad visible en esa MISMA línea.
 * Si sí declaró total, debe reconciliar al centavo; nunca reemplazarlo.
 */
function precioConfirmado(line:OfertaLineaMvp225):bigint|null{
 if(!TEXT(line.textoOriginal,1500)||
    !TEXT(line.cantidad,40)||!TEXT(line.unidad,30)||
    !unit.test(line.unidad)||!TEXT(line.precioUnitarioLiteral,80)||
    !line.textoOriginal.includes(line.precioUnitarioLiteral))
  return null;
 const q=cantidadMil(line.cantidad);
 const unitPrice=dineroCentavosLiteral(line.precioUnitarioLiteral);
 if(q===null||unitPrice===null)return null;
 // El total correcto NO acredita una cantidad inventada por IA:
 // también debe constar literalmente en la misma línea, fuera de
 // las citas del precio unitario y el total.
 const withoutAmounts=line.textoOriginal
  .replace(line.precioUnitarioLiteral,' ')
  .replace(line.totalLineaLiteral??'',' ');
 const visibleNumbers=withoutAmounts.match(/\d+(?:[.,]\d+)*/gu)??[];
 if(!visibleNumbers.some(token=>
   cantidadMil(token.replace(',','.'))===q))return null;
 const product=unitPrice*q;
 if(product%1000n!==0n)return null;
 const total=product/1000n;
 if(line.totalLineaLiteral!==null){
  if(!TEXT(line.totalLineaLiteral,80)||
     !line.textoOriginal.includes(line.totalLineaLiteral))
   return null;
  const declared=dineroCentavosLiteral(line.totalLineaLiteral);
  return declared!==null&&total===declared?total:null;
 }
 // La cantidad ya se acreditó antes de esta multiplicación.
 // No equiparar un importe aislado con valor por unidad.
 // El proveedor debe explicitar precio unitario con vocabulario libre.
 if(!/(?:c\/u|p\/u|unitari[oa]s?|cada\s+(?:una?|bolsa|bols[oó]n|unidad)|por\s+(?:unidad|bolsa|bols[oó]n|litro|kg|metro|m3|m²|m³)|\bx\s*\$)/iu.test(line.textoOriginal))
  return null;
 // Si el proveedor sí escribió "total" o un segundo importe monetario,
 // NO descartarlo para favorecer un subtotal deducido.
 if(/\b(?:total|subtotal|importe)\s*[:=]?\s*\$?\s*\d/iu.test(line.textoOriginal))
  return null;
 if(([...line.textoOriginal.matchAll(/\$\s*\d[\d.,]*/gu)].length)>1)
  return null;
 return total;
}
export function evaluarCotizacionMvp225(
 pedido:readonly PedidoLineaMvp225[],oferta:OfertaVerificadaMvp225
):OfertaEvaluadaMvp225{
 const motivos:string[]=[];
 const missing=(why:string)=>{if(!motivos.includes(why))motivos.push(why)};
 if(!Array.isArray(pedido)||pedido.length<1||pedido.length>200||
    !oferta||!TEXT(oferta.etiquetaAnonima,80)||
    !Array.isArray(oferta.lineas)||oferta.lineas.length>200||
    !Array.isArray(oferta.vinculos)||!TEXT(oferta.fuente,150000))
  return {etiquetaAnonima:'Oferta pendiente',estado:'requiere_revision',
   motivos:['entrada_invalida'],rubros:[],extras:[],precios:[]};
 const requested=new Map<string,PedidoLineaMvp225>();
 for(const item of pedido){
  if(!item||!ID.test(item.id)||requested.has(item.id)||
     !TEXT(item.descripcion,500)||!Object.hasOwn(RUBROS_MVP216,item.rubro)||
     cantidadMil(item.cantidad)===null||!unit.test(item.unidad)){
   missing('pedido_invalido');
  }else requested.set(item.id,item);
 }
 const byLine=new Map<number,OfertaLineaMvp225>();
 for(const line of oferta.lineas){
  if(!line||!Number.isSafeInteger(line.numero)||line.numero<1||
     line.numero>200||byLine.has(line.numero)||
     !TEXT(line.textoOriginal,1500)||!TEXT(line.descripcion,500)||
     !oferta.fuente.includes(line.textoOriginal)||
     !['material','cargo_adicional','aclaracion'].includes(line.tipo))
    missing('oferta_sin_evidencia_original');
  else byLine.set(line.numero,line);
 }
 // Aun en una invocación directa, una cifra monetaria omitida del
 // documento original bloquea verificación económica de toda la oferta.
 if(!importesOriginalesRepresentadosMvp244(oferta.fuente,oferta.lineas))
  missing('importe_de_fuente_sin_renglon');
 const matched=new Map<string,{line:OfertaLineaMvp225;equivalencia:string}>();
 const seenLine=new Set<number>();
 for(const link of oferta.vinculos){
  const item=requested.get(link?.articuloPedido);
  const line=byLine.get(link?.lineaOferta);
  if(!item||!line||line.tipo!=='material'||seenLine.has(line.numero)||
     matched.has(item.id)||!TEXT(link.explicacion,250)||
     !['misma_presentacion','alternativa_razonable','requiere_verificacion'].includes(link.equivalencia)){
   missing('correspondencia_inconsistente');continue;
  }
  seenLine.add(line.numero);
  matched.set(item.id,{line,equivalencia:link.equivalencia});
 }
 const extras=oferta.lineas.filter(x=>x&&
  (x.tipo!=='material'||!seenLine.has(x.numero)))
  .map(x=>({numero:x.numero,textoOriginal:x.textoOriginal}));
 const rubros:RubroResumenMvp225[]=[];
 const prices:EvidenciaPrecioMvp225[]=[];
 const presentaciones:DiagnosticoPresentacionMvp243[]=[];
 for(const rubro of Object.keys(RUBROS_MVP216) as RubroMvp216[]){
  const all=pedido.filter(x=>x.rubro===rubro);
  if(all.length===0)continue;
  let replied=0,priced=0;
  const faltantes:string[]=[];
  for(const item of all){
   const match=matched.get(item.id);
   if(!match){faltantes.push(item.id);continue;}
   replied++;
   const {line,equivalencia}=match;
   if(equivalencia==='alternativa_razonable')
     presentaciones.push(diagnosticarPresentacionMvp243(item,line));
   const total=precioConfirmado(line);
   if(equivalencia==='misma_presentacion'&&total!==null&&
      line.cantidad!==null&&line.unidad!==null&&
      cantidadMil(line.cantidad)===cantidadMil(item.cantidad)&&
      line.unidad===item.unidad){
    prices.push({pedidoId:item.id,numeroOferta:line.numero,
     cantidad:item.cantidad,unidad:item.unidad,centavos:total});
    priced++;
   }else if(equivalencia==='requiere_verificacion'){
    missing('equivalencia_no_acreditada');
   }else if(total===null){
    missing('importe_sin_conciliacion');
   }else if(equivalencia==='misma_presentacion'&&(
     line.cantidad===null||line.unidad===null||
     cantidadMil(line.cantidad)!==cantidadMil(item.cantidad)||
     line.unidad!==item.unidad)){
    missing('cantidad_o_unidad_no_comparable');
   }
  }
  rubros.push({rubro,solicitados:all.length,respondidos:replied,
   precioComprobado:priced,
   cobertura:replied===all.length?'completa':
    replied===0?'sin_cobertura':'parcial',faltantes});
 }
 if(oferta.moneda==='no_informada')missing('moneda_no_informada');
 if(!monedaFuenteMvp241(oferta.fuente,oferta.moneda))
  missing('moneda_sin_evidencia_explicita');
 if(!['ARS','USD','no_informada'].includes(oferta.moneda)||
    !['incluido_explicito','sin_iva_explicito','no_informado'].includes(oferta.iva)||
    !['incluido_explicito','excluido_explicito','a_convenir','no_informado'].includes(oferta.flete)||
    !['contado','transferencia','credito','no_informado'].includes(oferta.pago))
  missing('condiciones_invalidas');
 // El cotejo directo también debe rechazar condiciones ajenas al
 // original: dos lecturas de IA no son evidencia comercial suficiente.
 for(const key of ['iva','flete','pago'] as const){
  if(!condicionFuenteMvp242(oferta.fuente,key,oferta[key]))
    missing('condicion_'+key+'_sin_evidencia');
 }
 if(extras.some(x=>byLine.get(x.numero)?.tipo==='cargo_adicional'))
  missing('cargos_adicionales_sin_comparacion');
 // Una oferta solo de alternativas no puede quedar marcada como
 // económicamente verificada cuando NO tiene ningún precio cotejable.
 if(prices.length===0)missing('sin_precios_comparables');
 return {etiquetaAnonima:oferta.etiquetaAnonima,
  estado:motivos.length?'requiere_revision':'verificada_para_comparacion',
  motivos,rubros,extras,precios:prices,
  ...(presentaciones.length?{presentaciones}: {})};
}
/** Comparar SOLO el mismo artículo, unidad, cantidad, moneda, IVA,
 * flete y condición de pago. No se comparan totales de dos coberturas
 * distintas. La recomendación permite hasta dos proveedores pero no
 * decide una adjudicación ni revela sus datos. */
export function compararPorRubroMvp225(
 pedido:readonly PedidoLineaMvp225[],quotes:readonly OfertaVerificadaMvp225[]
):ComparacionMvp225{
 if(!Array.isArray(quotes)||quotes.length>50)
  throw new TypeError('cotironda_quotes_limit');
 const ofertas=quotes.map(q=>evaluarCotizacionMvp225(pedido,q));
 const comparables:ComparacionMvp225['comparables'][number][]=[];
 for(const article of pedido){
  const candidates=ofertas.flatMap((result,i)=>{
   const offer=quotes[i];
   if(result.estado!=='verificada_para_comparacion'||
      offer.moneda==='no_informada')return [];
   const price=result.precios.find(p=>p.pedidoId===article.id);
   return price?[{result,offer,price}]:[];
  });
  if(candidates.length<2){
   comparables.push({rubro:article.rubro,pedidoId:article.id,
    alternativas:[],situacion:'sin_base_suficiente'});continue;
  }
  const comparableGroups=new Map<string,typeof candidates>();
  for(const candidate of candidates){
   const key=[candidate.offer.moneda,candidate.offer.iva,
     candidate.offer.flete,candidate.offer.pago].join('|');
   const bucket=comparableGroups.get(key)??[];
   bucket.push(candidate);comparableGroups.set(key,bucket);
  }
  const available=[...comparableGroups.values()]
   .filter(group=>group.length>=2)
   .sort((a,b)=>b.length-a.length)[0];
  if(!available){
   comparables.push({rubro:article.rubro,pedidoId:article.id,
    alternativas:[],situacion:'sin_base_suficiente'});continue;
  }
  comparables.push({rubro:article.rubro,pedidoId:article.id,
   alternativas:available.map(c=>({oferta:c.result.etiquetaAnonima,
    centavos:c.price.centavos})).sort((a,b)=>
     a.centavos<b.centavos?-1:a.centavos>b.centavos?1:0),
   situacion:'importe_linea_comparable'});
 }
 return {estado:'analisis_por_rubro_sin_adjudicacion',
  ofertas,comparables,rankingGlobalPermitido:false,
  adjudicacionAutomatica:false,contactosRevelados:false};
}

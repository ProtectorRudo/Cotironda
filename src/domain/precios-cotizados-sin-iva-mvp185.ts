/**
 * MVP185 — comparación PRELIMINAR de importes de materiales cotizados.
 * Regla comercial local: silencio sobre IVA => tratar precio publicado como
 * SIN IVA solo para ordenar importes fuente, sin inventar alícuota ni base
 * fiscal acreditada. NO es total final, adjudicación ni permiso de contactos.
 *
 * Llamador PRIVADO: debe obtener documentos y hechos del mismo original v9,
 * revisión vigente, SHA y ledger económico de fuente. No usar JSON del modelo.
 */
import {elegirParExacto25} from './comparacion-pares-exacta.ts';
import {interpretarBolsonAridosMvp164} from './aridos-bolson-mvp164.ts';
import {cotejarPresentacionObraMvp174} from './cotejo-presentaciones-mvp174.ts';
import {centavosFuenteMvp162,cantidadFuenteMvp162,
 type DocumentoFuente,type CorrelacionFuente,type HechosPresentacionMvp170,
 type PruebaBolsonMvp165
} from './adaptador-documental-mvp162.ts';
import type {PedidoComparable,MonedaCotizada,UnidadCotizada} from './comparacion-ofertas.ts';
import type {AuditoriaDescuentosMvp166} from './auditoria-descuentos-mvp166.ts';
import type {ResultadoCondicionesMvp167,EstadoIvaMvp167} from './auditoria-condiciones-mvp167.ts';

export type EstadoComercialIvaMvp185=
 'sin_iva_por_convencion'|'sin_iva_declarado'|'iva_incluido_sin_base_homogenea'|
 'iva_no_determinable';
/** Proof from the private buyer request, not a text supplied by the bidder.
 * This is NEVER enough by itself: both the v9 source and economic ledger
 * must independently corroborate the matching supplier line. */
export type PruebaEnvaseObraMvp195=Readonly<{
 itemId:string;lineNo:number;sourceSha256:string;
 pedidoDescripcionLiteral:string;
 familia:'cemento_gris_obra'|'hidrofugo';
}>;
export type EntradaOfertaMvp185=Readonly<{
 doc:DocumentoFuente;
 fuente:HechosPresentacionMvp170;
 economia:Readonly<{
  state:'source_checked';sourceSha256:string;rankingAllowed:false;
  descuentos:AuditoriaDescuentosMvp166;
  condiciones:ResultadoCondicionesMvp167;
 }>;
 correlaciones:readonly CorrelacionFuente[];
 /** Only from the PRIVATE buyer request and the same verified supplier line.
  * A conventional BIG BAG is nominal 1m³, NOT a stock or fiscal proof. */
 pruebasBolson?:readonly PruebaBolsonMvp165[];
 /** Only source-verified pack sizes from a buyer-matched v9 document. */
 pruebasEnvasesObra?:readonly PruebaEnvaseObraMvp195[];
 /** Corroborada fuera del modelo por el servicio privado. Nunca por defecto. */
 moneda:MonedaCotizada|null;
}>;
export type OpcionCotizadaMvp185=Readonly<{
 proveedoresAnonimos:readonly string[];
 /** Nunca ordenar ARS y USD en el mismo grupo. */
 moneda:MonedaCotizada;
 asignacion:readonly Readonly<{itemId:string;oferta:string}>[];
 subtotalMaterialesCotizadoSinIva:string;
 ordenPorPrecioCotizado:number;
 advertencias:readonly ('iva_no_informado'|'flete_no_incluido_en_comparacion'|
  'stock_no_corroborado'|'minimos_y_pago_no_evaluados'|
  'bolson_1m3_nominal_sin_stock'|
  'presentacion_envase_diferente_misma_cantidad_sin_stock')[];
}>;
export type ResultadoPreciosCotizadosMvp185=Readonly<{
 estado:'proyeccion_informativa'|'insumos_invalidos';
 ofertas:readonly Readonly<{
  oferta:string;lineasConPrecioBaseComparable:number;articulosSolicitados:number;
  interpretacionIva:EstadoComercialIvaMvp185;
  motivoExclusion:string|null;
 }>[];
 opcionesCotizadas:readonly OpcionCotizadaMvp185[];
 ivaNoInformadoTratadoComo:'sin_iva_solo_para_comparacion';
 impuestosCalculados:false;fleteCalculado:false;stockConfirmado:false;
 rankingFinalHabilitado:false;adjudicacion:false;contactosRevelados:false;
 whatsappEnviado:false;originalesDescargables:false;
}>;

const HASH=/^[a-f0-9]{64}$/u;
const ID=/^[a-z][a-z0-9_]{2,49}$/u;
const UNIDADES=new Set<UnidadCotizada>([
 'unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'
]);
const MONEY_MAX=1000000000000n;
const format=(c:bigint)=>String(c/100n)+'.'+String(c%100n).padStart(2,'0');
const milli=(x:string):bigint=>{
 const [w,f='']=x.split('.');
 return BigInt(w)*1000n+BigInt(f.padEnd(3,'0')||'0');
};
const unit=(text:string|null):UnidadCotizada|null=>{
 if(typeof text!=='string')return null;
 const s=text.toLocaleLowerCase('es-AR').normalize('NFD')
  .replace(/[\u0300-\u036f]/gu,'').trim().replace(/\s+/gu,' ');
 const aliases:Readonly<Record<string,UnidadCotizada>>={
  u:'unit',un:'unit',unidad:'unit',unidades:'unit',unit:'unit',
  bolsa:'bag',bolsas:'bag',saco:'bag',sacos:'bag',
  caja:'box',cajas:'box',kg:'kg',kilo:'kg',kilos:'kg',
  g:'g',gramo:'g',gramos:'g',l:'l',lt:'l',litro:'l',litros:'l',
  ml:'ml',m:'m',metro:'m',metros:'m',
  m2:'m2','m²':'m2',m3:'m3','m³':'m3',
  roll:'roll',rollo:'roll',rollos:'roll',pack:'pack',paquete:'pack'
 };
 return aliases[s]??null;
};
export function interpretarSilencioIvaMvp185(
 estado:EstadoIvaMvp167
):EstadoComercialIvaMvp185{
 if(estado==='no_informado')return 'sin_iva_por_convencion';
 if(estado==='no_incluido')return 'sin_iva_declarado';
 if(estado==='incluido')return 'iva_incluido_sin_base_homogenea';
 return 'iva_no_determinable';
}
type ValidOffer={
 label:string;interpretacion:EstadoComercialIvaMvp185;
 moneda:MonedaCotizada|null;
 prices:Map<string,bigint>;nominalBigBagItems:Set<string>;
 envaseObraItems:Set<string>;usable:boolean;motivo:string|null
};
const invalid=():ResultadoPreciosCotizadosMvp185=>Object.freeze({
 estado:'insumos_invalidos' as const,ofertas:[],opcionesCotizadas:[],
 ivaNoInformadoTratadoComo:'sin_iva_solo_para_comparacion' as const,
 impuestosCalculados:false as const,fleteCalculado:false as const,
 stockConfirmado:false as const,rankingFinalHabilitado:false as const,
 adjudicacion:false as const,contactosRevelados:false as const,
 whatsappEnviado:false as const,originalesDescargables:false as const
});
const isValidDoc=(doc:DocumentoFuente):boolean=>{
 const p=doc?.prueba;
 if(!doc||!p||!HASH.test(doc.sourceSha256)||!HASH.test(doc.messageHmac)||
   p.sourceSha256!==doc.sourceSha256||p.messageHmac!==doc.messageHmac||
   p.requestId!==doc.requestId||p.version!==9||
   p.state!=='verified'||p.reason!=='covered'||p.rankingAllowed!==false||
   p.revisionVigente!==true||p.cotizacionVigente!==true||
   !Array.isArray(doc.lineas)||doc.lineas.length<1||doc.lineas.length>25||
   p.lineCount!==doc.lineas.length||
   !/^[0-9]{1,15}$/u.test(p.sumLineCents??'')||
   p.sumLineCents!==p.declaredTotalCents)return false;
 const total=centavosFuenteMvp162(doc.declaredTotalLiteral);
 if(total===null||total!==BigInt(p.sumLineCents!))return false;
 let sum=0n;const lines=new Set<number>();
 for(const line of doc.lineas){
  if(!line||!Number.isSafeInteger(line.lineNo)||line.lineNo<1||
    line.lineNo>25||lines.has(line.lineNo)||
    typeof line.descriptionLiteral!=='string'||!line.descriptionLiteral.trim())
    return false;
  lines.add(line.lineNo);
  const cents=centavosFuenteMvp162(line.lineTotalLiteral);
  if(cents===null)return false;
  sum+=cents;
 }
 return sum===total;
};
/** Source-backed currency: consistent, explicit markers on ALL v9 monetary
 * literals (unit price, line total, declared total), never on bare '$'.
 * Source revision, SHA and reconciled totals are checked before use. */
const currencyMarker=(literal:string|null):MonedaCotizada|null=>{
 if(typeof literal!=='string')return null;
 const value=literal.trim();
 if(/^AR\$\s*/iu.test(value))return 'ARS';
 if(/^(?:US\$|U\$S|USD)\s*/iu.test(value))return 'USD';
 return null;
};
const sourceCurrencyMarkers=(doc:DocumentoFuente)=>([
 doc.declaredTotalLiteral,
 ...doc.lineas.flatMap(l=>[l.unitPriceLiteral,l.lineTotalLiteral])
]).map(currencyMarker);
/** Returns null if any source amount lacks a qualifier or denominations mix.
 * An explicit contradiction is separately detected even if an external
 * attestation happens to be present. */
export function monedaExplicitaFuenteMvp205(
 doc:DocumentoFuente
):MonedaCotizada|null{
 if(!isValidDoc(doc))return null;
 const markers=sourceCurrencyMarkers(doc);
 return markers.length>0&&markers.every(x=>x!==null&&x===markers[0])
  ?markers[0]:null;
}
function verifyOffer(pedido:PedidoComparable,entry:EntradaOfertaMvp185,
 index:number,requestId:string):ValidOffer{
 const label='oferta_'+String(index+1).padStart(3,'0');
 const iva=entry?.economia?.condiciones?.iva?.estado as EstadoIvaMvp167;
 const interpretacion=interpretarSilencioIvaMvp185(iva);
 const blocked=(motivo:string):ValidOffer=>({
  label,interpretacion,moneda:null,prices:new Map(),
  nominalBigBagItems:new Set(),envaseObraItems:new Set(),
  usable:false,motivo
 });
 const {doc,fuente,economia}=entry;
 if(!isValidDoc(doc)||doc.requestId!==requestId||
   !fuente||fuente.requestId!==doc.requestId||
   fuente.messageHmac!==doc.messageHmac||
   fuente.sourceSha256!==doc.sourceSha256||
   fuente.state!=='source_checked'||fuente.rankingAllowed!==false||
   fuente.sourceImmutabilityPreserved!==true||
   !Array.isArray(fuente.lines)||fuente.lines.length!==doc.lineas.length||
   !economia||economia.state!=='source_checked'||
   economia.rankingAllowed!==false||
   economia.sourceSha256!==doc.sourceSha256||
   economia.descuentos?.estado!=='descuentos_conciliados_sin_iva'||
   economia.descuentos.rankingHabilitado!==false||
   !Array.isArray(economia.descuentos.precios)||
   economia.descuentos.precios.length!==doc.lineas.length||
   economia.condiciones?.estado!=='fuente_leida'||
   economia.condiciones.rankingHabilitado!==false||
   !Array.isArray(entry.correlaciones))
  return blocked('fuente_no_acreditada');
 if(interpretacion==='iva_incluido_sin_base_homogenea')
  return blocked('iva_incluido_no_normalizado');
 if(interpretacion==='iva_no_determinable')
  return blocked('tratamiento_iva_ambiguo');
 if(iva==='no_informado'&&
   (economia.condiciones.iva.tasa!==null||
    economia.condiciones.iva.ubicaciones.length!==0))
  return blocked('iva_silencioso_inconsistente');
 // A separate server attestation may supply currency. Do not overrule
 // contradicting explicit original values or assume ARS from '$'.
 const markers=sourceCurrencyMarkers(doc);
 const stated=[...new Set(markers.filter((x):x is MonedaCotizada=>x!==null))];
 if(stated.length>1)return blocked('moneda_contradictoria_en_original');
 const sourceCurrency=monedaExplicitaFuenteMvp205(doc);
 if(entry.moneda!==null&&entry.moneda!=='ARS'&&entry.moneda!=='USD')
  return blocked('moneda_sin_acreditar');
 if(stated.length===1&&entry.moneda!==null&&
    stated[0]!==entry.moneda)
  return blocked('moneda_contradictoria_en_original');
 const corroboratedCurrency=sourceCurrency??entry.moneda;
 if(corroboratedCurrency!=='ARS'&&corroboratedCurrency!=='USD')
  return blocked('moneda_sin_acreditar');
 const sourceLines=new Map<number,typeof doc.lineas[number]>();
 for(const x of doc.lineas)sourceLines.set(x.lineNo,x);
 const facts=new Map<number,typeof fuente.lines[number]>();
 for(const fact of fuente.lines){
  if(!Number.isSafeInteger(fact.lineNo)||!sourceLines.has(fact.lineNo)||
    facts.has(fact.lineNo))return blocked('hecho_fuente_inconsistente');
  facts.set(fact.lineNo,fact);
 }
 const discounts=new Map<number,typeof economia.descuentos.precios[number]>();
 for(const a of economia.descuentos.precios){
  if(!Number.isSafeInteger(a.linea)||!sourceLines.has(a.linea)||
    discounts.has(a.linea)||a.unitarioComercialTrasDescuento===null||
    !['descuento_explicito_conciliado','importe_sin_ajuste_conciliado'].includes(a.estado))
   return blocked('importe_fuente_no_conciliado');
  // A verified source total does NOT alone prove that a claimed discount
  // or unit price belongs to that line. Reconcile at exact page/row and
  // decimal cents before any base-price comparison or pair is computed.
  const line=sourceLines.get(a.linea)!,fact=facts.get(a.linea);
  const q=cantidadFuenteMvp162(line.quantityLiteral);
  const unitNet=centavosFuenteMvp162(a.unitarioComercialTrasDescuento);
  const lineTotal=centavosFuenteMvp162(line.lineTotalLiteral);
  if(!fact||!Number.isSafeInteger(fact.page)||fact.page<1||
    !Number.isSafeInteger(fact.row)||fact.row<1||
    a.pagina!==fact.page||a.fila!==fact.row||q===null||
    unitNet===null||lineTotal===null||
    (unitNet*milli(q)+500n)/1000n!==lineTotal)
   return blocked('importe_fuente_no_conciliado');
  discounts.set(a.linea,a);
 }
 if(!entry.correlaciones.length||entry.correlaciones.length>pedido.items.length)
  return blocked('sin_lineas_asignadas');
 // A nominal bag conversion must come with a line-bound proof from the
 // authenticated buyer request, not a guessed unit inserted by AI.
 const proofs=new Map<string,PruebaBolsonMvp165>();
 if(entry.pruebasBolson!==undefined){
  if(!Array.isArray(entry.pruebasBolson)||
     entry.pruebasBolson.length>doc.lineas.length)
   return blocked('prueba_bolson_invalida');
  for(const proof of entry.pruebasBolson){
   const paired=entry.correlaciones.find(x=>x.itemId===proof?.itemId);
   if(!proof||!paired||paired.lineNo!==proof.lineNo||
      proof.sourceSha256!==doc.sourceSha256||
      proofs.has(proof.itemId)||
      typeof proof.pedidoDescripcionLiteral!=='string'||
      !proof.pedidoDescripcionLiteral.trim()||
      proof.pedidoDescripcionLiteral.length>500||
      !['big_bag','bolson'].includes(proof.presentacionFuente))
    return blocked('prueba_bolson_invalida');
   proofs.set(proof.itemId,proof);
  }
 }
 const packProofs=new Map<string,PruebaEnvaseObraMvp195>();
 if(entry.pruebasEnvasesObra!==undefined){
  if(!Array.isArray(entry.pruebasEnvasesObra)||
     entry.pruebasEnvasesObra.length>doc.lineas.length)
    return blocked('prueba_envase_obra_invalida');
  for(const proof of entry.pruebasEnvasesObra){
   const paired=entry.correlaciones.find(x=>x.itemId===proof?.itemId);
   if(!proof||!paired||paired.lineNo!==proof.lineNo||
      proof.sourceSha256!==doc.sourceSha256||
      packProofs.has(proof.itemId)||proofs.has(proof.itemId)||
      typeof proof.pedidoDescripcionLiteral!=='string'||
      !proof.pedidoDescripcionLiteral.trim()||
      proof.pedidoDescripcionLiteral.length>500||
      !['cemento_gris_obra','hidrofugo'].includes(proof.familia))
    return blocked('prueba_envase_obra_invalida');
   packProofs.set(proof.itemId,proof);
  }
 }
 const prices=new Map<string,bigint>(),usedLines=new Set<number>();
 const nominalBigBagItems=new Set<string>();
 const envaseObraItems=new Set<string>();
 for(const match of entry.correlaciones){
  const target=pedido.items.find(item=>item.id===match.itemId);
  const line=sourceLines.get(match.lineNo),fact=facts.get(match.lineNo);
  if(!target||!line||!fact||
    match.sourceSha256!==doc.sourceSha256||
    !['verificada','comercial_razonable'].includes(match.equivalencia)||
    prices.has(target.id)||usedLines.has(match.lineNo))
   return blocked('equivalencia_o_asignacion_sin_acreditar');
  // An original quote line or its independent source-fact ledger must
  // explicitly prove the unit. Never infer units from a generic name.
  const sourceLocated=Number.isSafeInteger(fact.page)&&fact.page>=1&&
    Number.isSafeInteger(fact.row)&&fact.row>=1;
  const explicit=fact.unitStatus==='explicit'&&sourceLocated?fact.unit:null;
  const sourceUnit=unit(line.unitLiteral);
  const explicitMatch=explicit!==null&&explicit===target.unidad&&
    (sourceUnit===null||sourceUnit===explicit);
  // All other commercial presentations remain NOT comparable without
  // independent unit evidence. Only BIG BAG of source-matched aggregates
  // may be treated as nominal 1m³ for a PRELIMINARY materials subtotal.
  let nominal=false;
  const proof=proofs.get(target.id);
  if(!explicitMatch&&sourceLocated&&proof&&target.unidad==='m3'&&
     match.equivalencia==='comercial_razonable'&&
     fact.unitStatus==='not_explicit'&&fact.unit===null&&
     line.unitLiteral===null&&fact.presentation===proof.presentacionFuente){
    const check=interpretarBolsonAridosMvp164({
     pedidoDescripcion:proof.pedidoDescripcionLiteral,
     pedidoCantidad:target.cantidad,pedidoUnidad:target.unidad,
     ofertaDescripcion:line.descriptionLiteral,
     ofertaCantidad:line.quantityLiteral??'',
     presentacionFuente:proof.presentacionFuente,
     fuenteVerificada:true,presentacionComprobada:true
    });
    nominal=check.cantidadNominalCoincide===true&&
     check.origen==='convencion_nominal'&&
     ['compatible_con_aclaracion','compatible_comercialmente'].includes(check.estado);
  }
  let normalizedPack=false;
  const packaging=packProofs.get(target.id);
  if(sourceLocated&&packaging&&
     match.equivalencia==='comercial_razonable'&&
     fact.unitStatus==='not_explicit'&&fact.unit===null&&
     line.unitLiteral===null&&
     (target.unidad==='bag'&&packaging.familia==='cemento_gris_obra'||
      target.unidad==='l'&&packaging.familia==='hidrofugo')){
   const checked=cotejarPresentacionObraMvp174({
    id:target.id,cantidad:target.cantidad,unidad:target.unidad,
    descripcionLiteral:packaging.pedidoDescripcionLiteral,
    familia:packaging.familia
   },[line],[fact]);
   normalizedPack=checked.itemId===target.id&&
     checked.lineNo===line.lineNo&&
     checked.estado==='alternativa_comercial_con_aclaracion';
  }
  if(!explicitMatch&&!nominal&&!normalizedPack)
   return blocked('unidad_sin_acreditar');
  const q=cantidadFuenteMvp162(line.quantityLiteral);
  if(q===null||!normalizedPack&&!nominal&&
     milli(q)!==milli(target.cantidad))
   return blocked('cantidad_incompatible');
  const value=centavosFuenteMvp162(line.lineTotalLiteral);
  if(value===null||value>MONEY_MAX)return blocked('importe_fuente_no_conciliado');
  usedLines.add(match.lineNo);prices.set(target.id,value);
  if(nominal)nominalBigBagItems.add(target.id);
  if(normalizedPack)envaseObraItems.add(target.id);
 }
 // Pallets, additional charges and unassigned lines must NEVER disappear
 // from a price-based comparison (even if their totals were source-verified).
 if(usedLines.size!==doc.lineas.length)
  return blocked('cargos_o_lineas_sin_asignar');
 return {label,interpretacion,moneda:corroboratedCurrency,prices,
  nominalBigBagItems,envaseObraItems,usable:true,motivo:null};
}
type Candidate={providers:string[];assignment:string[];moneda:MonedaCotizada;value:bigint};
export function compararPreciosCotizadosMvp185(input:Readonly<{
 pedido:PedidoComparable;ofertas:readonly EntradaOfertaMvp185[];
}>):ResultadoPreciosCotizadosMvp185{
 if(!input||!input.pedido||!Array.isArray(input.pedido.items)||
   input.pedido.items.length<1||input.pedido.items.length>25||
   !Array.isArray(input.ofertas)||input.ofertas.length<1||
   input.ofertas.length>10)return invalid();
 const ids=new Set<string>();
 for(const item of input.pedido.items){
  if(!item||!ID.test(item.id)||ids.has(item.id)||
    !UNIDADES.has(item.unidad)||typeof item.cantidad!=='string'||
    !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u.test(item.cantidad)||
    milli(item.cantidad)===0n)return invalid();
  ids.add(item.id);
 }
 const requestId=input.ofertas[0]?.doc?.requestId;
 if(typeof requestId!=='string'||!requestId)return invalid();
 const seen=new Set<string>();
 const verified:ValidOffer[]=[];
 for(let i=0;i<input.ofertas.length;i++){
  const entry=input.ofertas[i];
  if(!entry?.doc||!HASH.test(entry.doc.messageHmac)||
    seen.has(entry.doc.messageHmac)||
    entry.doc.requestId!==requestId)return invalid();
  seen.add(entry.doc.messageHmac);
  verified.push(verifyOffer(input.pedido,entry,i,requestId));
 }
 const options:Candidate[]=[];
 const itemIds=input.pedido.items.map(x=>x.id);
 for(const q of verified){
  if(!q.usable||itemIds.some(id=>!q.prices.has(id)))continue;
  const value=itemIds.reduce((n,id)=>n+q.prices.get(id)!,0n);
  if(value<=MONEY_MAX)
   options.push({providers:[q.label],assignment:itemIds.map(()=>q.label),
    moneda:q.moneda as MonedaCotizada,value});
 }
 for(let i=0;i<verified.length;i++)for(let j=i+1;j<verified.length;j++){
  const a=verified[i],b=verified[j];
  if(!a.usable||!b.usable||a.moneda!==b.moneda||itemIds.length<2)continue;
  const assignment=elegirParExacto25({
   precios:itemIds.map(id=>({a:a.prices.get(id)??null,b:b.prices.get(id)??null})),
   // Only a provisional MATERIALS comparison, not confirmation that a
   // supplier has no minimum. Never propagate this as a final total.
   minimoA:0n,minimoB:0n,preferirA:a.label<b.label
  });
  if(assignment===null)continue;
  const arr=assignment.map(useA=>useA?a.label:b.label);
  const value=itemIds.reduce((sum,id,k)=>
   sum+(assignment[k]?a.prices.get(id)!:b.prices.get(id)!),0n);
  if(value<=MONEY_MAX)
   options.push({providers:[a.label,b.label].sort(),assignment:arr,
    moneda:a.moneda as MonedaCotizada,value});
 }
 options.sort((a,b)=>a.moneda.localeCompare(b.moneda)||
  (a.value<b.value?-1:a.value>b.value?1:0)||
  a.providers.join('|').localeCompare(b.providers.join('|'))||
  a.assignment.join('|').localeCompare(b.assignment.join('|')));
 let rank=0,previous:bigint|null=null,previousCurrency:MonedaCotizada|null=null;
 const visible=options.map((x)=>{
  if(previousCurrency!==x.moneda){rank=0;previous=null;previousCurrency=x.moneda}
  if(previous===null||previous!==x.value){rank++;previous=x.value}
  const hasUnknown=x.providers.some(label=>verified.find(q=>q.label===label)?.
    interpretacion==='sin_iva_por_convencion');
  return Object.freeze({
   proveedoresAnonimos:Object.freeze([...x.providers]),
   moneda:x.moneda,
   asignacion:Object.freeze(itemIds.map((itemId,i)=>
    Object.freeze({itemId,oferta:x.assignment[i]}))),
   subtotalMaterialesCotizadoSinIva:format(x.value),
   ordenPorPrecioCotizado:rank,
   advertencias:Object.freeze([
    ...(hasUnknown?['iva_no_informado' as const]:[]),
    ...(itemIds.some((itemId,i)=>verified.find(q=>q.label===x.assignment[i])?.
       nominalBigBagItems.has(itemId))?
       ['bolson_1m3_nominal_sin_stock' as const]:[]),
    ...(itemIds.some((itemId,i)=>verified.find(q=>q.label===x.assignment[i])?.
       envaseObraItems.has(itemId))?
       ['presentacion_envase_diferente_misma_cantidad_sin_stock' as const]:[]),
    'flete_no_incluido_en_comparacion' as const,
    'stock_no_corroborado' as const,
    'minimos_y_pago_no_evaluados' as const
   ])
  });
 });
 return Object.freeze({
  estado:'proyeccion_informativa' as const,
  ofertas:Object.freeze(verified.map(x=>Object.freeze({
   oferta:x.label,lineasConPrecioBaseComparable:x.prices.size,
   articulosSolicitados:itemIds.length,
   interpretacionIva:x.interpretacion,motivoExclusion:x.motivo
  }))),
  opcionesCotizadas:Object.freeze(visible),
  ivaNoInformadoTratadoComo:'sin_iva_solo_para_comparacion' as const,
  impuestosCalculados:false as const,fleteCalculado:false as const,
  stockConfirmado:false as const,rankingFinalHabilitado:false as const,
  adjudicacion:false as const,contactosRevelados:false as const,
  whatsappEnviado:false as const,originalesDescargables:false as const
 });
}

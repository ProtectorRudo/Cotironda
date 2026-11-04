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
import {centavosFuenteMvp162,cantidadFuenteMvp162,
 type DocumentoFuente,type CorrelacionFuente,type HechosPresentacionMvp170
} from './adaptador-documental-mvp162.ts';
import type {PedidoComparable,MonedaCotizada,UnidadCotizada} from './comparacion-ofertas.ts';
import type {AuditoriaDescuentosMvp166} from './auditoria-descuentos-mvp166.ts';
import type {ResultadoCondicionesMvp167,EstadoIvaMvp167} from './auditoria-condiciones-mvp167.ts';

export type EstadoComercialIvaMvp185=
 'sin_iva_por_convencion'|'sin_iva_declarado'|'iva_incluido_sin_base_homogenea'|
 'iva_no_determinable';
export type EntradaOfertaMvp185=Readonly<{
 doc:DocumentoFuente;
 fuente:HechosPresentacionMvp170;
 economia:Readonly<{
  state:'source_checked';sourceSha256:string;rankingAllowed:false;
  descuentos:AuditoriaDescuentosMvp166;
  condiciones:ResultadoCondicionesMvp167;
 }>;
 correlaciones:readonly CorrelacionFuente[];
 /** Corroborada fuera del modelo por el servicio privado. Nunca por defecto. */
 moneda:MonedaCotizada|null;
}>;
export type OpcionCotizadaMvp185=Readonly<{
 proveedoresAnonimos:readonly string[];
 asignacion:readonly Readonly<{itemId:string;oferta:string}>[];
 subtotalMaterialesCotizadoSinIva:string;
 ordenPorPrecioCotizado:number;
 advertencias:readonly ('iva_no_informado'|'flete_no_incluido_en_comparacion'|
  'stock_no_corroborado'|'minimos_y_pago_no_evaluados')[];
}>;
export type ResultadoPreciosCotizadosMvp185=Readonly<{
 estado:'proyeccion_informativa'|'insumos_invalidos';
 ofertas:readonly Readonly<{
  oferta:string;articulosCubiertos:number;articulosSolicitados:number;
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
 prices:Map<string,bigint>;usable:boolean;motivo:string|null
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
function verifyOffer(pedido:PedidoComparable,entry:EntradaOfertaMvp185,
 index:number,requestId:string):ValidOffer{
 const label='oferta_'+String(index+1).padStart(3,'0');
 const iva=entry?.economia?.condiciones?.iva?.estado as EstadoIvaMvp167;
 const interpretacion=interpretarSilencioIvaMvp185(iva);
 const blocked=(motivo:string):ValidOffer=>({
  label,interpretacion,prices:new Map(),usable:false,motivo
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
 if(entry.moneda!=='ARS'&&entry.moneda!=='USD')
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
  discounts.set(a.linea,a);
 }
 if(!entry.correlaciones.length||entry.correlaciones.length>pedido.items.length)
  return blocked('sin_lineas_asignadas');
 const prices=new Map<string,bigint>(),usedLines=new Set<number>();
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
  const explicit=fact.unitStatus==='explicit'&&
   fact.page!==null&&fact.row!==null?fact.unit:null;
  const sourceUnit=unit(line.unitLiteral);
  if(sourceUnit===null&&explicit===null||
    sourceUnit!==null&&explicit!==null&&sourceUnit!==explicit||
    (sourceUnit??explicit)!==target.unidad)
   return blocked('unidad_sin_acreditar');
  const q=cantidadFuenteMvp162(line.quantityLiteral);
  if(q===null||milli(q)!==milli(target.cantidad))
   return blocked('cantidad_incompatible');
  const value=centavosFuenteMvp162(line.lineTotalLiteral);
  if(value===null||value>MONEY_MAX)return blocked('importe_fuente_no_conciliado');
  usedLines.add(match.lineNo);prices.set(target.id,value);
 }
 // Pallets, additional charges and unassigned lines must NEVER disappear
 // from a price-based comparison (even if their totals were source-verified).
 if(usedLines.size!==doc.lineas.length)
  return blocked('cargos_o_lineas_sin_asignar');
 return {label,interpretacion,prices,usable:true,motivo:null};
}
type Candidate={providers:string[];assignment:string[];value:bigint};
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
  options.push({providers:[q.label],assignment:itemIds.map(()=>q.label),value});
 }
 for(let i=0;i<verified.length;i++)for(let j=i+1;j<verified.length;j++){
  const a=verified[i],b=verified[j];
  if(!a.usable||!b.usable||itemIds.length<2)continue;
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
  options.push({providers:[a.label,b.label].sort(),assignment:arr,value});
 }
 options.sort((a,b)=>a.value<b.value?-1:a.value>b.value?1:0||
  a.providers.join('|').localeCompare(b.providers.join('|'))||
  a.assignment.join('|').localeCompare(b.assignment.join('|')));
 let rank=0,previous:bigint|null=null;
 const visible=options.map((x)=>{
  if(previous===null||previous!==x.value){rank++;previous=x.value}
  const hasUnknown=x.providers.some(label=>verified.find(q=>q.label===label)?.
    interpretacion==='sin_iva_por_convencion');
  return Object.freeze({
   proveedoresAnonimos:Object.freeze([...x.providers]),
   asignacion:Object.freeze(itemIds.map((itemId,i)=>
    Object.freeze({itemId,oferta:x.assignment[i]}))),
   subtotalMaterialesCotizadoSinIva:format(x.value),
   ordenPorPrecioCotizado:rank,
   advertencias:Object.freeze([
    ...(hasUnknown?['iva_no_informado' as const]:[]),
    'flete_no_incluido_en_comparacion' as const,
    'stock_no_corroborado' as const,
    'minimos_y_pago_no_evaluados' as const
   ])
  });
 });
 return Object.freeze({
  estado:'proyeccion_informativa' as const,
  ofertas:Object.freeze(verified.map(x=>Object.freeze({
   oferta:x.label,articulosCubiertos:x.prices.size,
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

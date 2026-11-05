import type {
 OfertaComparable, PedidoComparable, LineaOfertaConfirmada, UnidadCotizada, IvaExplicito,
 FormaPago, MonedaCotizada
} from './comparacion-ofertas.ts';
import {interpretarBolsonAridosMvp164} from './aridos-bolson-mvp164.ts';

/** MVP162. Private-input, pure bridge. No network, files, identities or ranking.
 * Caller MUST populate from authoritative DB and independently corroborated
 * source proofs, NOT arbitrary model JSON or untrusted client flags. */
export type LineaFuente=Readonly<{
 lineNo:number;descriptionLiteral:string;quantityLiteral:string|null;
 unitLiteral:string|null;unitPriceLiteral:string|null;lineTotalLiteral:string|null;
}>;
export type PruebaFuente=Readonly<{
 requestId:string;messageHmac:string;sourceSha256:string;
 version:number;state:'verified'|'needs_source_review';reason:string;
 lineCount:number;sumLineCents:string|null;declaredTotalCents:string|null;
 rankingAllowed:boolean;
 /** Independently queried latest revision for this supplier and request. */
 revisionVigente:boolean;cotizacionVigente:boolean;
}>;
export type DocumentoFuente=Readonly<{
 requestId:string;anonId:string;messageHmac:string;sourceSha256:string;
 declaredTotalLiteral:string|null;lineas:readonly LineaFuente[];
 prueba:PruebaFuente;
}>;
export type CorrelacionFuente=Readonly<{
 itemId:string;lineNo:number;sourceSha256:string;
 equivalencia:'verificada'|'comercial_razonable'|'sin_verificar'|'incompatible';
 /** Buyer quantity in source is NOT proof that seller has stock. */
 disponibilidadCorroborada:boolean;
}>;
/** Authenticated server-side source-evidence verifier must produce these data.
 * In particular netUnitPrice is AFTER every source discount and BEFORE VAT.
 * No default VAT=0, freight=free, minimum=0 or unconditional availability. */
export type TerminosAuditados=Readonly<{
 sourceSha256:string;sourceVerified:boolean;
 moneda:MonedaCotizada|null;pago:FormaPago|null;
 plazoEntregaDias:number|null;fleteFinal:string|null;minimoCompraFinal:string|null;
 /** Required to prevent double-counting freight already in source prices. */
 tratamientoFlete:'fuera_del_total'|'incluido_en_precios'|'sin_cargo'|null;
 precios:readonly Readonly<{
  lineNo:number;sourceSha256:string;
  unitarioNetoTrasDescuento:string;ivaExplicito:IvaExplicito|null;
  /** Source-audited VAT basis FOR THIS LINE; never default from the rate. */
  tratamientoIva:'incluido_en_total'|'excluido_del_total'|null;
 }>[];
}>;
/** MVP165: authenticated server-side verifier supplies the ORIGINAL buyer description
 * and supplier presentation tied to the SAME source revision and line.
 * These are proof references, never buyer/client/LLM authority to rank.
 * Do not fill unitLiteral or overwrite a source line with this evidence. */
export type PruebaBolsonMvp165=Readonly<{
 itemId:string;lineNo:number;sourceSha256:string;
 pedidoDescripcionLiteral:string;presentacionFuente:'big_bag'|'bolson';
}>;
export type Motivo =
 'fuente_no_verificada'|'origen_inconsistente'|'faltan_articulos'
 |'unidad_sin_acreditar'|'cantidad_sin_acreditar'
 |'equivalencia_sin_acreditar'|'disponibilidad_sin_acreditar'|'extras_sin_clasificar'
 |'condiciones_sin_acreditar'|'importe_sin_acreditar'|'importe_no_conciliado';
export type ResultadoPuente=Readonly<{
 anonId:string;estado:'fuente_no_verificada'|'visible_no_comparable'|'comparable';
 fuenteCuadra:boolean;articulosSinCobertura:readonly string[];
 lineasNoAsignadas:readonly number[];motivos:readonly Motivo[];
 ofertaComparable:OfertaComparable|null;contactosRevelados:false;
 originalesDescargables:false;
}>;

const unitAliases:Readonly<Record<string,UnidadCotizada>>={
 'u':'unit','unidad':'unit','unidades':'unit','unit':'unit',
 'bolsa':'bag','bolsas':'bag','saco':'bag','sacos':'bag','bag':'bag',
 'bolson':'bag','bolsones':'bag','big bag':'bag','bigbag':'bag',
 'caja':'box','cajas':'box','box':'box',
 'kg':'kg','kilo':'kg','kilos':'kg','kilogramo':'kg','kilogramos':'kg',
 'g':'g','gramo':'g','gramos':'g','l':'l','lt':'l','litro':'l','litros':'l',
 'ml':'ml','mililitro':'ml','mililitros':'ml',
 'm':'m','metro':'m','metros':'m',
 'm2':'m2','m²':'m2','metro cuadrado':'m2','metros cuadrados':'m2',
 'm3':'m3','m³':'m3','metro cubico':'m3','metros cubicos':'m3',
 'roll':'roll','rollo':'roll','rollos':'roll',
 'pack':'pack','paquete':'pack','paquetes':'pack'
};
const HASH=/^[a-f0-9]{64}$/u;
const ID=/^[a-z][a-z0-9_]{2,49}$/u;
const centsMax=1000000000000n;
const allowedIVA=new Set(['0','10.5','21']);
const saneMoney=(x:unknown):x is string=>typeof x==='string'&&
 /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/u.test(x);
const saneQuantity=(x:unknown):x is string=>typeof x==='string'&&
 /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u.test(x);
const round=(a:bigint,b:bigint)=>(a+b/2n)/b;
const money=(n:bigint)=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const milli=(x:string):bigint=>{
 const [w,fract='']=x.split('.');
 return BigInt(w)*1000n+BigInt(fract.padEnd(3,'0')||'0');
};
const normUnit=(x:string|null):UnidadCotizada|null=>{
 if(typeof x!=='string')return null;
 const key=x.trim().toLocaleLowerCase('es-AR').normalize('NFD')
  .replace(/[\u0300-\u036f]/gu,'').replace(/\s+/gu,' ');
 return unitAliases[key]??null;
};
const grade=(id:string,estado:ResultadoPuente['estado'],sourceOK:boolean,
 uncovered:readonly string[],unused:readonly number[],motivos:Motivo[],
 offer:OfertaComparable|null):ResultadoPuente=>Object.freeze({
 anonId:id,estado,fuenteCuadra:sourceOK,
 articulosSinCobertura:Object.freeze([...uncovered]),
 lineasNoAsignadas:Object.freeze([...unused]),
 motivos:Object.freeze([...new Set(motivos)].sort()),
 ofertaComparable:offer,
 contactosRevelados:false as const,originalesDescargables:false as const
});
/** Reject notation 1.000 (ambiguous without decimal digits), not the whole PDF. */
export function centavosFuenteMvp162(input:unknown):bigint|null{
 if(typeof input!=='string'||input.length>48)return null;
 const x=input.trim().replace(/^(?:AR\$|US\$|U\$S|USD|\$)\s*/iu,'');
 let canonical:string;
 if(/^[1-9]\d{0,2}(?:\.\d{3})+,\d{2}$/u.test(x))
  canonical=x.replace(/\./gu,'').replace(',','.');
 else if(/^[1-9]\d{0,2}(?:,\d{3})+\.\d{2}$/u.test(x))
  canonical=x.replace(/,/gu,'');
 else if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(x))
  canonical=x.replace(',','.');
 else return null;
 const [whole,fr='']=canonical.split('.');
 const n=BigInt(whole)*100n+BigInt(fr.padEnd(2,'0')||'0');
 return n<=centsMax?n:null;
}
export function cantidadFuenteMvp162(input:unknown):string|null{
 if(typeof input!=='string')return null;
 const x=input.trim();
 if(!/^[1-9]\d{0,7}(?:[.,]\d{1,2})?$/u.test(x))return null;
 return x.replace(',','.');
}

/** Do not use this as a buyer-facing API or as proof of original-file access.
 * An offer remains visible via the existing tracking even when noncomparable. */
export function adaptarDocumentoMvp162(
 pedido:PedidoComparable,doc:DocumentoFuente,
 equivalencias:readonly CorrelacionFuente[],
 terminos:TerminosAuditados|null,
 pruebasBolson:readonly PruebaBolsonMvp165[]=[]
):ResultadoPuente{
 const rejected=()=>grade(doc?.anonId??'anon_invalid',
  'fuente_no_verificada',false,[],[],['fuente_no_verificada'],null);
 if(!doc||!pedido||!Array.isArray(pedido.items)||
  !Array.isArray(doc.lineas)||!Array.isArray(equivalencias)||!Array.isArray(pruebasBolson)||
  !doc.prueba||!ID.test(doc.anonId)||!doc.anonId.startsWith('anon_')||
  !HASH.test(doc.sourceSha256)||!HASH.test(doc.messageHmac))return rejected();
 const p=doc.prueba;
 if(p.requestId!==doc.requestId||p.messageHmac!==doc.messageHmac||
  p.sourceSha256!==doc.sourceSha256||p.state!=='verified'||
  p.reason!=='covered'||!Number.isSafeInteger(p.version)||p.version<2||
  p.rankingAllowed!==false||p.revisionVigente!==true||
  p.cotizacionVigente!==true||!Number.isSafeInteger(p.lineCount)||
  p.lineCount<1||p.lineCount!==doc.lineas.length||
  p.sumLineCents===null||p.declaredTotalCents===null||
  !/^\d{1,15}$/u.test(p.declaredTotalCents)||
  p.sumLineCents!==p.declaredTotalCents||
  centavosFuenteMvp162(doc.declaredTotalLiteral)!==BigInt(p.declaredTotalCents))
  return rejected();
 const originals=new Map<number,LineaFuente>(),totals=new Map<number,bigint>();
 let sum=0n;
 for(const l of doc.lineas){
  if(!Number.isSafeInteger(l.lineNo)||l.lineNo<1||
   originals.has(l.lineNo)||typeof l.descriptionLiteral!=='string'||
   !l.descriptionLiteral.trim())return grade(doc.anonId,
    'fuente_no_verificada',false,[],[],['origen_inconsistente'],null);
  const cents=centavosFuenteMvp162(l.lineTotalLiteral);
  if(cents===null)return grade(doc.anonId,'visible_no_comparable',
   true,[],[l.lineNo],['importe_sin_acreditar'],null);
  originals.set(l.lineNo,l);totals.set(l.lineNo,cents);sum+=cents;
 }
 if(sum!==BigInt(p.declaredTotalCents))
  return grade(doc.anonId,'visible_no_comparable',true,[],[],
   ['importe_no_conciliado'],null);
 const ordinals=[...originals.keys()].sort((a,b)=>a-b);
 if(ordinals.some((lineNo,index)=>lineNo!==index+1))
  return grade(doc.anonId,'visible_no_comparable',true,[],ordinals,
   ['origen_inconsistente'],null);
 const items=new Map(pedido.items.map(x=>[x.id,x]));
 if(items.size!==pedido.items.length||!pedido.items.length||
  pedido.items.some(x=>!ID.test(x.id)||!saneQuantity(x.cantidad)))
  return grade(doc.anonId,'fuente_no_verificada',true,[],[],
   ['origen_inconsistente'],null);
 const correlated=new Map<string,CorrelacionFuente>(),seen=new Set<number>();
 for(const match of equivalencias){
  if(!items.has(match.itemId)||!originals.has(match.lineNo)||
   correlated.has(match.itemId)||seen.has(match.lineNo)||
   match.sourceSha256!==doc.sourceSha256)
   return grade(doc.anonId,'fuente_no_verificada',true,[],[],
    ['origen_inconsistente'],null);
  correlated.set(match.itemId,match);seen.add(match.lineNo);
 }
 // Every commercial convention must be anchored to one source-correlated line.
 // Missing, crossed and duplicate proofs are never treated as ranking evidence.
 const bolsones=new Map<string,PruebaBolsonMvp165>();
 for(const proof of pruebasBolson){
  const match=correlated.get(proof?.itemId);
  if(!match||match.lineNo!==proof.lineNo||
   proof.sourceSha256!==doc.sourceSha256||bolsones.has(proof.itemId)||
   typeof proof.pedidoDescripcionLiteral!=='string'||
   !proof.pedidoDescripcionLiteral.trim()||
   proof.pedidoDescripcionLiteral.length>500||
   !['big_bag','bolson'].includes(proof.presentacionFuente))
   return grade(doc.anonId,'fuente_no_verificada',true,[],[],
    ['origen_inconsistente'],null);
  bolsones.set(proof.itemId,proof);
 }
 const unused=[...originals.keys()].filter(n=>!seen.has(n)).sort((a,b)=>a-b);
 const reasons:Motivo[]=unused.length?['extras_sin_clasificar']:[];
 const uncovered:string[]=[];
 const verified:OfertaComparable['items'][number][]=[];
 for(const item of pedido.items){
  const map=correlated.get(item.id);
  if(!map){uncovered.push(item.id);reasons.push('faltan_articulos');continue}
  const line=originals.get(map.lineNo)!;
  if(centavosFuenteMvp162(line.unitPriceLiteral)===null){
   uncovered.push(item.id);reasons.push('importe_sin_acreditar');continue;
  }
  const quantity=cantidadFuenteMvp162(line.quantityLiteral);
  const unit=normUnit(line.unitLiteral);
  if(quantity===null){uncovered.push(item.id);reasons.push('cantidad_sin_acreditar');continue}
  if(!['verificada','comercial_razonable'].includes(map.equivalencia)){
   uncovered.push(item.id);reasons.push('equivalencia_sin_acreditar');continue;
  }
  // For áridos only, verified 1 m³ NOMINAL per BIG BAG allows the SAME
  // numeric quantity and unit net price to be interpreted per m³ nominal.
  // Other capacities require a separately audited price conversion: reject.
  // The source unitLiteral stays untouched and technical variety is checked.
  let effectiveUnit=unit;
  let effectiveEquivalence:LineaOfertaConfirmada['equivalencia']=map.equivalencia;
  if(effectiveUnit!==item.unidad){
   const proof=bolsones.get(item.id);
   if(item.unidad==='m3'&&(unit===null||unit==='bag')&&proof){
    const r=interpretarBolsonAridosMvp164({
     pedidoDescripcion:proof.pedidoDescripcionLiteral,
     pedidoCantidad:item.cantidad,pedidoUnidad:item.unidad,
     ofertaDescripcion:line.descriptionLiteral,ofertaCantidad:quantity,
     presentacionFuente:proof.presentacionFuente,
     fuenteVerificada:true,presentacionComprobada:true
    });
    if(['compatible_comercialmente','compatible_con_aclaracion'].includes(r.estado)&&
     r.volumenM3PorUnidad==='1.000'&&r.cantidadNominalCoincide){
     effectiveUnit='m3';
     if(r.estado==='compatible_con_aclaracion')
      effectiveEquivalence='comercial_razonable';
    }else{
     const reason:Motivo=r.estado==='variedad_no_informada'||
      r.estado==='variedad_distinta'||r.estado==='familia_distinta'
       ?'equivalencia_sin_acreditar':
      r.estado==='volumen_distinto'?'cantidad_sin_acreditar':
      'unidad_sin_acreditar';
     uncovered.push(item.id);reasons.push(reason);continue;
    }
   }
  }
  if(effectiveUnit===null||effectiveUnit!==item.unidad){
   uncovered.push(item.id);reasons.push('unidad_sin_acreditar');continue;
  }
  if(milli(quantity)!==milli(item.cantidad)){
   uncovered.push(item.id);reasons.push('cantidad_sin_acreditar');continue;
  }
  if(map.disponibilidadCorroborada!==true){
   uncovered.push(item.id);reasons.push('disponibilidad_sin_acreditar');continue;
  }
  verified.push({itemId:item.id,unidad:effectiveUnit,cantidadDisponible:quantity,
   equivalencia:effectiveEquivalence,precioUnitarioNeto:null,ivaPorcentaje:null});
 }
 // Falta de artículos NO invalida los renglones efectivamente cotizados.
 // El motor MVP118/160 solo considera opciones que cubren TODA la canasta,
 // eventualmente mediante dos proveedores. Extras no clasificados, stock,
 // IVA y unidades sin prueba sí impiden una comparación monetaria.
 if(unused.length||verified.length===0||
  reasons.some(reason=>reason!=='faltan_articulos'))
  return grade(doc.anonId,'visible_no_comparable',true,uncovered,unused,reasons,null);
 if(!terminos||terminos.sourceSha256!==doc.sourceSha256||
  terminos.sourceVerified!==true||
  !['ARS','USD'].includes(terminos.moneda??'')||
  !['contado','transferencia','cuenta_corriente_30_dias'].includes(terminos.pago??'')||
  !Number.isSafeInteger(terminos.plazoEntregaDias)||
  (terminos.plazoEntregaDias??-1)<0||(terminos.plazoEntregaDias??121)>120||
  !saneMoney(terminos.fleteFinal)||!saneMoney(terminos.minimoCompraFinal)||
  terminos.tratamientoFlete===null||
  !['fuera_del_total','incluido_en_precios','sin_cargo'].includes(terminos.tratamientoFlete)||
  (terminos.tratamientoFlete!=='fuera_del_total'&&terminos.fleteFinal!=='0.00')||
  (terminos.tratamientoFlete==='fuera_del_total'&&
    centavosFuenteMvp162(terminos.fleteFinal)===0n)||
  !Array.isArray(terminos.precios))
  return grade(doc.anonId,'visible_no_comparable',true,uncovered,unused,
   [...reasons,'condiciones_sin_acreditar'],null);
 const prices=new Map(terminos.precios.map(x=>[x.lineNo,x]));
 if(prices.size!==verified.length||prices.size!==terminos.precios.length)
  return grade(doc.anonId,'visible_no_comparable',true,uncovered,unused,
   [...reasons,'importe_sin_acreditar'],null);
 const final:OfertaComparable['items'][number][]=[];
 const vat:Readonly<Record<IvaExplicito,bigint>>={'0':0n,'10.5':1050n,'21':2100n};
 for(const line of verified){
  const corresponding=correlated.get(line.itemId)!;
  const proof=prices.get(corresponding.lineNo);
  if(!proof||proof.sourceSha256!==doc.sourceSha256||
   !saneMoney(proof.unitarioNetoTrasDescuento)||
   proof.ivaExplicito===null||!allowedIVA.has(proof.ivaExplicito))
   return grade(doc.anonId,'visible_no_comparable',true,uncovered,unused,
    [...reasons,'importe_sin_acreditar'],null);
  // "Sin IVA" and "IVA incluido" yield different SOURCE totals. Even a
  // documented 21% rate does not prove which one the supplier wrote.
  if(!['incluido_en_total','excluido_del_total'].includes(proof.tratamientoIva??''))
   return grade(doc.anonId,'visible_no_comparable',true,uncovered,unused,
    [...reasons,'condiciones_sin_acreditar'],null);
  const unitPrice=centavosFuenteMvp162(proof.unitarioNetoTrasDescuento);
  if(unitPrice===null)return grade(doc.anonId,'visible_no_comparable',
   true,uncovered,unused,[...reasons,'importe_sin_acreditar'],null);
  const base=round(unitPrice*milli(line.cantidadDisponible),1000n);
  const gross=base+round(base*vat[proof.ivaExplicito as IvaExplicito],10000n);
  // The existing comparator always computes the FINAL amount with audited
  // VAT. The archived supplier's row, however, may explicitly EXCLUDE VAT.
  const expectedSource=proof.tratamientoIva==='excluido_del_total'?base:gross;
  if(expectedSource!==totals.get(corresponding.lineNo))
   return grade(doc.anonId,'visible_no_comparable',
    true,uncovered,unused,[...reasons,'importe_no_conciliado'],null);
  final.push({...line,precioUnitarioNeto:money(unitPrice),
   ivaPorcentaje:proof.ivaExplicito});
 }
 const oferta:OfertaComparable={
  anonId:doc.anonId,version:p.version,confirmada:true,
  moneda:terminos.moneda as MonedaCotizada,
  formaPago:terminos.pago as FormaPago,
  plazoEntregaDias:terminos.plazoEntregaDias as number,
  fleteFinal:terminos.fleteFinal as string,
  minimoCompraFinal:terminos.minimoCompraFinal as string,
  items:final
 };
 // 'comparable' se refiere SOLO a las líneas acreditadas, nunca a la
 // cobertura total. Se conservan faltantes para mostrar la oferta parcial.
 return grade(doc.anonId,'comparable',true,uncovered,[],reasons,oferta);
}


/**
 * MVP170 — correlación prudente de áridos con hechos documentales MVP163.
 *
 * La lectura del PDF/Excel original (con SHA corroborado de bytes), sus hechos
 * inmutables y el pedido deben llegar desde el backend PRIVADO, nunca desde
 * un navegador ni del JSON libre de un modelo.
 *
 * Integra la evidencia de presentación con adaptarDocumentoMvp162, sin editar
 * unitLiteral=null, sin tomar la cantidad cotizada como prueba de STOCK y
 * sin construir TerminosAuditados cuando el IVA/flete siguen sin acreditar.
 */
export type PedidoItemOriginalMvp170=Readonly<{
 id:string;descripcionLiteral:string;cantidad:string;unidad:UnidadCotizada;
}>;
export type HechosPresentacionMvp170=Readonly<{
 requestId:string;messageHmac:string;sourceSha256:string;
 state:'source_checked'|'unreadable';
 rankingAllowed:false;sourceImmutabilityPreserved:true;
 lines:readonly Readonly<{
  lineNo:number;unitStatus:'explicit'|'not_explicit'|'ambiguous'|'not_found';
  unit:UnidadCotizada|null;
  presentation:'big_bag'|'bolson'|'bag_weight'|'none';
  page:number|null;row:number|null;
 }>[];
}>;
export type MotivoPresentacionMvp170=
 'no_aplica'|'sin_presentacion_corroborada'|'cantidad_diferente'|
 'variedad_no_acreditada'|'variedad_diferente'|'presentacion_ambigua'|
 'alternativa_comercial_con_aclaracion'|
 'coincide_volumen_nominal_sin_stock';
export type ResultadoPresentacionMvp170=Readonly<{
 estado:'fuente_no_verificada'|'preparacion_offline';
 diagnosticos:readonly Readonly<{
  itemId:string;lineNo:number|null;estado:MotivoPresentacionMvp170
 }>[];
 correlaciones:readonly CorrelacionFuente[];
 pruebasBolson:readonly PruebaBolsonMvp165[];
 puente:ResultadoPuente|null;
 rankingHabilitado:false;contactosRevelados:false;
}>;

const failPresentation=():ResultadoPresentacionMvp170=>Object.freeze({
 estado:'fuente_no_verificada' as const,diagnosticos:[],
 correlaciones:[],pruebasBolson:[],puente:null,
 rankingHabilitado:false as const,contactosRevelados:false as const
});
/** Contiene claves de fuente privadas; NO exportar el resultado al portal. */
export function prepararPresentacionesAridosMvp170(
 pedidoOriginal:readonly PedidoItemOriginalMvp170[],
 doc:DocumentoFuente,
 fuente:HechosPresentacionMvp170
):ResultadoPresentacionMvp170{
 const p=doc?.prueba;
 if(!Array.isArray(pedidoOriginal)||pedidoOriginal.length<1||
  pedidoOriginal.length>30||
  pedidoOriginal.some(x=>!x||!ID.test(x.id)||
   !['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'].includes(x.unidad)||
   !saneQuantity(x.cantidad)||
   typeof x.descripcionLiteral!=='string'||!x.descripcionLiteral.trim()||
   x.descripcionLiteral.length>500)||
  new Set(pedidoOriginal.map(x=>x.id)).size!==pedidoOriginal.length||
  !doc||!p||!fuente||!HASH.test(doc.sourceSha256)||
  !HASH.test(doc.messageHmac)||
  fuente.requestId!==doc.requestId||
  fuente.messageHmac!==doc.messageHmac||
  fuente.sourceSha256!==doc.sourceSha256||
  fuente.state!=='source_checked'||
  fuente.rankingAllowed!==false||
  fuente.sourceImmutabilityPreserved!==true||
  p.requestId!==doc.requestId||p.messageHmac!==doc.messageHmac||
  p.sourceSha256!==doc.sourceSha256||p.version!==9||
  p.state!=='verified'||p.reason!=='covered'||
  p.rankingAllowed!==false||p.revisionVigente!==true||
  p.cotizacionVigente!==true||
  !Array.isArray(doc.lineas)||!Array.isArray(fuente.lines)||
  !Number.isSafeInteger(p.lineCount)||p.lineCount<1||
  p.lineCount!==doc.lineas.length||fuente.lines.length!==doc.lineas.length||
  p.sumLineCents===null||p.declaredTotalCents===null||
  !/^\d{1,15}$/u.test(p.declaredTotalCents)||
  p.sumLineCents!==p.declaredTotalCents||
  centavosFuenteMvp162(doc.declaredTotalLiteral)!==BigInt(p.declaredTotalCents))
  return failPresentation();
 const lines=new Map<number,LineaFuente>();
 let sum=0n;
 for(const line of doc.lineas){
  const cents=centavosFuenteMvp162(line.lineTotalLiteral);
  if(!Number.isSafeInteger(line.lineNo)||line.lineNo<1||
   lines.has(line.lineNo)||cents===null||
   typeof line.descriptionLiteral!=='string'||!line.descriptionLiteral.trim())
   return failPresentation();
  lines.set(line.lineNo,line);sum+=cents;
 }
 if(sum!==BigInt(p.declaredTotalCents)||lines.size!==p.lineCount||
  [...lines.keys()].sort((a,b)=>a-b).some((v,i)=>v!==i+1))
  return failPresentation();
 const facts=new Map<number,HechosPresentacionMvp170['lines'][number]>();
 for(const line of fuente.lines){
  if(!Number.isSafeInteger(line?.lineNo)||!lines.has(line.lineNo)||
   facts.has(line.lineNo)||
   !['explicit','not_explicit','ambiguous','not_found'].includes(line.unitStatus)||
   !['big_bag','bolson','bag_weight','none'].includes(line.presentation)||
   !(line.unit===null||['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'].includes(line.unit))||
   !(line.page===null||Number.isSafeInteger(line.page)&&line.page>=1)||
   !(line.row===null||Number.isSafeInteger(line.row)&&line.row>=1))
   return failPresentation();
  facts.set(line.lineNo,line);
 }
 const pre: {itemId:string;lineNo:number|null;estado:MotivoPresentacionMvp170;
  presentacionFuente:'big_bag'|'bolson'|null;pedidoDescripcionLiteral:string}[]=[];
 const pedido:PedidoComparable={items:pedidoOriginal.map(x=>({
  id:x.id,cantidad:x.cantidad,unidad:x.unidad
 }))};
 for(const item of pedidoOriginal){
  if(item.unidad!=='m3'){
   pre.push({itemId:item.id,lineNo:null,estado:'no_aplica',
    presentacionFuente:null,pedidoDescripcionLiteral:item.descripcionLiteral});
   continue;
  }
  const matches:{lineNo:number;estado:MotivoPresentacionMvp170;
   presentacionFuente:'big_bag'|'bolson'}[]=[];
  for(const [lineNo,line] of lines){
   const evidence=facts.get(lineNo)!;
   if((evidence.presentation!=='big_bag'&&evidence.presentation!=='bolson')||
    !['explicit','not_explicit'].includes(evidence.unitStatus)||
    evidence.page===null||evidence.row===null||
    (evidence.unit!==null&&evidence.unit!=='bag')||
    cantidadFuenteMvp162(line.quantityLiteral)===null)
    continue;
   const r=interpretarBolsonAridosMvp164({
    pedidoDescripcion:item.descripcionLiteral,
    pedidoCantidad:item.cantidad,pedidoUnidad:item.unidad,
    ofertaDescripcion:line.descriptionLiteral,
    ofertaCantidad:cantidadFuenteMvp162(line.quantityLiteral)!,
    presentacionFuente:evidence.presentation,
    fuenteVerificada:true,presentacionComprobada:true
   });
   if(['no_aplica','familia_distinta','fuente_no_acreditada'].includes(r.estado))
    continue;
   const estado:MotivoPresentacionMvp170=
    r.estado==='compatible_comercialmente'
    ?'coincide_volumen_nominal_sin_stock':
    r.estado==='compatible_con_aclaracion'
    ?'alternativa_comercial_con_aclaracion':
    r.estado==='variedad_no_informada'
    ?'variedad_no_acreditada':
    r.estado==='variedad_distinta'
    ?'variedad_diferente':
    r.estado==='volumen_distinto'
    ?'cantidad_diferente':'presentacion_ambigua';
   matches.push({lineNo,estado,presentacionFuente:evidence.presentation});
  }
  if(matches.length!==1){
   pre.push({itemId:item.id,lineNo:null,
    estado:matches.length?'presentacion_ambigua':'sin_presentacion_corroborada',
    presentacionFuente:null,pedidoDescripcionLiteral:item.descripcionLiteral});
   continue;
  }
  pre.push({...matches[0],itemId:item.id,
   pedidoDescripcionLiteral:item.descripcionLiteral});
 }
 // Never attribute one supplier line to two different buyer items.
 const used=new Map<number,number>();
 for(const x of pre)if(x.lineNo!==null)
  used.set(x.lineNo,(used.get(x.lineNo)??0)+1);
 const diagnostics:ResultadoPresentacionMvp170['diagnosticos'][number][]=[];
 const correlations:CorrelacionFuente[]=[];
 const proofs:PruebaBolsonMvp165[]=[];
 for(const x of pre){
  const conflicting=x.lineNo!==null&&(used.get(x.lineNo)??0)>1;
  diagnostics.push(Object.freeze({
   itemId:x.itemId,lineNo:conflicting?null:x.lineNo,
   estado:conflicting?'presentacion_ambigua':x.estado
  }));
  if(!conflicting&&['coincide_volumen_nominal_sin_stock',
   'alternativa_comercial_con_aclaracion'].includes(x.estado)&&
   x.lineNo!==null&&x.presentacionFuente!==null){
   correlations.push(Object.freeze({
    itemId:x.itemId,lineNo:x.lineNo,sourceSha256:doc.sourceSha256,
    equivalencia:x.estado==='alternativa_comercial_con_aclaracion'?
     'comercial_razonable' as const:'verificada' as const,
    disponibilidadCorroborada:false as const
   }));
   proofs.push(Object.freeze({
    itemId:x.itemId,lineNo:x.lineNo,sourceSha256:doc.sourceSha256,
    pedidoDescripcionLiteral:x.pedidoDescripcionLiteral,
    presentacionFuente:x.presentacionFuente
   }));
  }
 }
 return Object.freeze({
  estado:'preparacion_offline' as const,
  diagnosticos:Object.freeze(diagnostics),
  correlaciones:Object.freeze(correlations),
  pruebasBolson:Object.freeze(proofs),
  puente:adaptarDocumentoMvp162(pedido,doc,correlations,null,proofs),
  rankingHabilitado:false as const,contactosRevelados:false as const
 });
}

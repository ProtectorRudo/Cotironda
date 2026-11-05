/**
 * MVP210 — connect existing source-priced comparator MVP185 to the BUYER
 * only after a closed, token-authorized round. All offers remain visible.
 * A materials-only subtotal is NOT a final price, an economic award, a
 * supplier ranking, or a permission to reveal contacts/originals.
 *
 * The private v9 envelope is never serialized; only reviewed buyer labels
 * and source-supported arithmetic leave this function.
 */
import {diagnosticarRondaPrivadaMvp172,
 type InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';
import {resumirImportesCotizadosCompradorMvp186,
 type ResumenImportesMvp186} from './resumen-importes-cotizados-mvp186.ts';
import {compararPreciosCotizadosMvp185,
 type EntradaOfertaMvp185} from './precios-cotizados-sin-iva-mvp185.ts';

type PublicOffer=Readonly<{label:string;text:string}>;
type Status=Readonly<{
 state?:unknown;can_open?:unknown;
 offers?:readonly PublicOffer[];
 economy?:Readonly<{
  state?:unknown;quotations?:unknown;ranking_allowed?:unknown;
  price_comparable?:unknown;contacts_revealed?:unknown;
 }> |null;
}>;
type Input=Omit<InsumoRondaPrivadoMvp172,'quotations'>&Readonly<{
 quotations:readonly (InsumoRondaPrivadoMvp172['quotations'][number]&
  Readonly<{publicText:string}>)[];
}>;

export type ComparacionMaterialesCompradorMvp210=Readonly<{
 state:'referencia_materiales_sin_precio_final';
 quotations:number;requested_items:number;
 ofertas:readonly Readonly<{
  oferta:string;articulosConBase:number;
  motivo:string|null;
 }>[];
 opciones:readonly Readonly<{
  ofertasAnonimas:readonly string[];
  moneda:'ARS'|'USD';subtotalMaterialesSinIva:string;
  asignacion:readonly Readonly<{itemId:string;oferta:string}>[];
  advertencias:readonly string[];
 }>[];
 ranking_final:false;iva_calculado:false;flete_calculado:false;
 stock_confirmado:false;contactos_revelados:false;
 adjudicacion:false;originales_descargables:false;whatsapp_enviado:false;
}>;

const isObj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const comparable=new Set([
 'alternativa_comercial_con_aclaracion','coincide_volumen_nominal_sin_stock'
]);
// A constant allowlist prevents future raw diagnostic, SQL, names, routes,
// source metadata or input strings from leaking into a buyer's browser.
const exclusions=new Set([
 'fuente_no_acreditada','iva_incluido_no_normalizado',
 'tratamiento_iva_ambiguo','iva_silencioso_inconsistente',
 'moneda_contradictoria_en_original','moneda_sin_acreditar',
 'hecho_fuente_inconsistente','importe_fuente_no_conciliado',
 'sin_lineas_asignadas','prueba_bolson_invalida',
 'prueba_envase_obra_invalida','equivalencia_o_asignacion_sin_acreditar',
 'unidad_sin_acreditar','cantidad_incompatible',
 'cargos_o_lineas_sin_asignar'
]);
const warnings=new Set([
 'iva_no_informado','flete_no_incluido_en_comparacion',
 'stock_no_corroborado','minimos_y_pago_no_evaluados',
 'bolson_1m3_nominal_sin_stock',
 'presentacion_envase_diferente_misma_cantidad_sin_stock'
]);

export function resumirMaterialesCotizadosCompradorMvp210(
 status:Status|null,source:unknown,prices:ResumenImportesMvp186|null
):ComparacionMaterialesCompradorMvp210|null{
 try{
  if(status?.state!=='closed'||status.can_open!==true||
    !Array.isArray(status.offers)||status.offers.length<1||
    status.offers.length>10||
    status.economy?.state!=='economia_observada_sin_ranking'||
    status.economy.quotations!==status.offers.length||
    status.economy.ranking_allowed!==false||
    status.economy.price_comparable!==false||
    status.economy.contacts_revealed!==false||
    prices?.state!=='importes_por_articulo_sin_ranking'||
    prices.quotations!==status.offers.length||
    prices.requested_items<1||prices.requested_items>25||
    prices.ranking_allowed!==false||prices.price_comparable!==false||
    prices.contacts_revealed!==false||prices.adjudicacion!==false||
    prices.originales_descargables!==false||prices.IVA_calculado!==false||
    prices.flete_calculado!==false||prices.stock_confirmado!==false||
    !isObj(source)||source.state!=='private_inputs'||
    !Array.isArray(source.quotations)||
    source.quotations.length!==status.offers.length||
    !Array.isArray(source.requestItems)||
    source.requestItems.length!==prices.requested_items||
    source.rankingAllowed!==false||source.contactsRevealed!==false)return null;
  const input=source as Input;
  const checked=diagnosticarRondaPrivadaMvp172(input);
  if(checked.estado!=='diagnostico_privado'||
    checked.rondaResumen.cotizacionesAuditadas!==status.offers.length||
    checked.rondaResumen.articulosSolicitados!==prices.requested_items||
    checked.rankingHabilitado!==false||checked.contactosRevelados!==false||
    checked.adjudicacion!==false||checked.originalesDescargables!==false||
    checked.whatsappEnviado!==false)return null;

  // Independently recompute the item-price envelope from SAME private source
  // and reviewed public texts. A falsified/stale MVP186 payload cannot be
  // leveraged to inject an apparent preliminary subtotal.
  const rerun=resumirImportesCotizadosCompradorMvp186(status,source);
  if(!rerun||JSON.stringify(rerun)!==JSON.stringify(prices))return null;

  const byText=new Map<string,number>(),labels=new Set<string>();
  input.quotations.forEach((q,i)=>{
   if(typeof q.publicText==='string'&&!byText.has(q.publicText))
    byText.set(q.publicText,i);
  });
  if(byText.size!==input.quotations.length)return null;
  const ordered:EntradaOfertaMvp185[]=[];
  for(const offer of status.offers){
   if(!offer||typeof offer.label!=='string'||!offer.label||
     offer.label.length>100||typeof offer.text!=='string'||!offer.text||
     offer.text.length>16000||labels.has(offer.label))return null;
   labels.add(offer.label);
   const index=byText.get(offer.text);
   if(index===undefined)return null;
   const quote=input.quotations[index];
   const view=checked.proveedoresAnonimos[index];
   if(!quote||!view)return null;
   const lines=new Map(quote.fuente.lines.map(f=>[f.lineNo,f]));
   const requestById=new Map(input.requestItems.map(x=>[x.id,x]));
   const correlation:EntradaOfertaMvp185['correlaciones'][number][]=[];
   const bags:NonNullable<EntradaOfertaMvp185['pruebasBolson']>[number][]=[];
   const packs:NonNullable<EntradaOfertaMvp185['pruebasEnvasesObra']>[number][]=[];
   const assigned=new Set<number>();
   for(const row of view.articulos){
    if(!comparable.has(row.estado)||row.lineaFuente===null)continue;
    const request=requestById.get(row.itemId);
    const fact=lines.get(row.lineaFuente);
    if(!request||!fact||assigned.has(row.lineaFuente))return null;
    assigned.add(row.lineaFuente);
    correlation.push({
     itemId:row.itemId,lineNo:row.lineaFuente,
     sourceSha256:quote.doc.sourceSha256,
     equivalencia:'comercial_razonable',
     disponibilidadCorroborada:false
    });
    // A reasonable generic aggregate (arena/piedra) may be classified as
    // "alternativa_comercial_con_aclaracion", not just "coincide_volumen".
    // Attach source-backed BIG BAG evidence in BOTH cases. The existing
    // MVP185/MVP164 validator still rechecks material family, amount,
    // original wording, nominal m³, quantity and SHA before pricing.
    if(request.unidad==='m3'&&
       (fact.presentation==='big_bag'||fact.presentation==='bolson')){
      bags.push({
       itemId:row.itemId,lineNo:row.lineaFuente,
       sourceSha256:quote.doc.sourceSha256,
       pedidoDescripcionLiteral:request.descripcionLiteral,
       presentacionFuente:fact.presentation
      });
    }else if(row.estado==='alternativa_comercial_con_aclaracion'&&
       (request.familia==='cemento_gris_obra'||
        request.familia==='hidrofugo')){
      packs.push({
       itemId:row.itemId,lineNo:row.lineaFuente,
       sourceSha256:quote.doc.sourceSha256,
       pedidoDescripcionLiteral:request.descripcionLiteral,
       familia:request.familia
      });
    }
   }
   ordered.push({
    doc:quote.doc,fuente:quote.fuente,
    economia:{
      ...quote.economia,
      // MVP172 source ledger records the audited price rows but older
      // source facts omit these invariant action flags. Adding FALSE
      // cannot authorize calculation or disclosure; MVP185 rechecks
      // the source amount, document, discounts and authorization.
      descuentos:{
       ...quote.economia.descuentos,
       rankingHabilitado:false,
       contactosRevelados:false,
       originalesModificados:false
      }
    } as EntradaOfertaMvp185['economia'],
    correlaciones:correlation,pruebasBolson:bags,
    pruebasEnvasesObra:packs,
    // Source-only. Never infer ARS from a bare '$', even in Argentina.
    moneda:null
   });
  }
  if(labels.size!==input.quotations.length)return null;
  const analysed=compararPreciosCotizadosMvp185({
   pedido:{items:input.requestItems.map(x=>({
    id:x.id,cantidad:x.cantidad,unidad:x.unidad
   }))},
   ofertas:ordered
  });
  if(analysed.estado!=='proyeccion_informativa'||
    analysed.rankingFinalHabilitado!==false||
    analysed.impuestosCalculados!==false||
    analysed.fleteCalculado!==false||
    analysed.stockConfirmado!==false||
    analysed.adjudicacion!==false||
    analysed.contactosRevelados!==false||
    analysed.originalesDescargables!==false||
    analysed.whatsappEnviado!==false||
    analysed.ofertas.length!==status.offers.length||
    analysed.opcionesCotizadas.length>55)return null;

  const prefix=new Map(status.offers.map((o,i)=>[
   'oferta_'+String(i+1).padStart(3,'0'),o.label
  ]));
  const visibleOffers=analysed.ofertas.map((x,i)=>{
   if(!prefix.has(x.oferta)||x.oferta!==
      'oferta_'+String(i+1).padStart(3,'0')||
      (x.motivoExclusion!==null&&!exclusions.has(x.motivoExclusion))||
      !Number.isSafeInteger(x.lineasConPrecioBaseComparable)||
      x.lineasConPrecioBaseComparable<0||
      x.lineasConPrecioBaseComparable>input.requestItems.length)return null;
   return Object.freeze({
    oferta:prefix.get(x.oferta)!,
    articulosConBase:x.lineasConPrecioBaseComparable,
    motivo:x.motivoExclusion
   });
  });
  if(visibleOffers.some(x=>x===null))return null;

  const options:ComparacionMaterialesCompradorMvp210['opciones'][number][]=[];
  for(const x of analysed.opcionesCotizadas){
   if(!Array.isArray(x.proveedoresAnonimos)||
      x.proveedoresAnonimos.length<1||x.proveedoresAnonimos.length>2||
      x.proveedoresAnonimos.some(p=>!prefix.has(p))||
      new Set(x.proveedoresAnonimos).size!==x.proveedoresAnonimos.length||
      x.asignacion.length!==input.requestItems.length||
      (x.moneda!=='ARS'&&x.moneda!=='USD')||
      !/^(?:0|[1-9]\d{0,11})\.\d{2}$/u.test(x.subtotalMaterialesCotizadoSinIva)||
      x.advertencias.some(w=>!warnings.has(w)))return null;
   const names=x.proveedoresAnonimos.map(p=>prefix.get(p)!);
   const assignments=x.asignacion.map(a=>({
    itemId:a.itemId,oferta:prefix.get(a.oferta)
   }));
   if(assignments.some(x=>typeof x.oferta!=='string')||
      assignments.some((a,i)=>a.itemId!==input.requestItems[i].id||
        !names.includes(a.oferta!))||
      new Set(assignments.map(a=>a.oferta)).size!==names.length)return null;
   options.push(Object.freeze({
    ofertasAnonimas:Object.freeze(names),
    moneda:x.moneda,
    subtotalMaterialesSinIva:x.subtotalMaterialesCotizadoSinIva,
    asignacion:Object.freeze(assignments.map(x=>Object.freeze({
     itemId:x.itemId,oferta:x.oferta!
    }))),
    advertencias:Object.freeze([...x.advertencias])
   }));
  }
  return Object.freeze({
   state:'referencia_materiales_sin_precio_final' as const,
   quotations:status.offers.length,requested_items:input.requestItems.length,
   ofertas:Object.freeze(visibleOffers as NonNullable<typeof visibleOffers[number]>[]),
   opciones:Object.freeze(options),
   ranking_final:false as const,iva_calculado:false as const,
   flete_calculado:false as const,stock_confirmado:false as const,
   contactos_revelados:false as const,adjudicacion:false as const,
   originales_descargables:false as const,whatsapp_enviado:false as const
  });
 }catch{return null}
}

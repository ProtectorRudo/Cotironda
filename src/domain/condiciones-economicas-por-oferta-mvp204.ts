/**
 * MVP204 — buyer-safe per-offer economic readiness, from the SAME v9 source
 * already checked by MVP172/186. Never a ranking or a fiscal total.
 * A missing IVA statement means "sin IVA por convención comercial", NOT 0%.
 * MVP168 has no structured currency; only consistent, explicit ORIGINAL
 * AR$/US$/U$S/USD v9 amounts can now attest it (MVP205).
 */
import {diagnosticarRondaPrivadaMvp172,
 type InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';
import type {ResumenImportesMvp186} from './resumen-importes-cotizados-mvp186.ts';
import {monedaExplicitaFuenteMvp205} from './precios-cotizados-sin-iva-mvp185.ts';

const IVA=new Set(['no_informado','incluido','no_incluido','tasa_sin_base','contradictorio']);
const FLETE=new Set([
 'no_informado','incluido','sin_cargo','adicional_con_importe',
 'adicional_sin_importe','importe_sin_tratamiento','a_convenir','contradictorio'
]);
const PAGO=new Set([
 'no_informado','contado','transferencia','cuenta_corriente_30_dias','multiple'
]);
const HASH=/^[a-f0-9]{64}$/u;
type EstadoIva='no_informado'|'incluido'|'no_incluido'|'tasa_sin_base'|'contradictorio';
type EstadoFlete='no_informado'|'incluido'|'sin_cargo'|'adicional_con_importe'|
 'adicional_sin_importe'|'importe_sin_tratamiento'|'a_convenir'|'contradictorio';
type EstadoPago='no_informado'|'contado'|'transferencia'|
 'cuenta_corriente_30_dias'|'multiple';
export type EstadoOfertaMvp204=Readonly<{
 oferta:string;articulosConImporte:number;articulosSolicitados:number;
 iva:EstadoIva;flete:EstadoFlete;pago:EstadoPago;
 moneda:'no_acreditada'|'ARS'|'USD';stockCorroborado:false;
 plazoCorroborado:false;minimoCorroborado:false;
}>;
export type ResumenCondicionesMvp204=Readonly<{
 state:'condiciones_por_oferta_sin_ranking';
 quotations:number;requested_items:number;
 ofertas:readonly EstadoOfertaMvp204[];
 ranking_allowed:false;price_comparable:false;contacts_revealed:false;
 tax_calculated:false;freight_calculated:false;stock_confirmed:false;
 automatic_award:false;originals_downloadable:false;
}>;
type Offer=Readonly<{label:string;text:string}>;
type Status=Readonly<{
 state?:unknown;can_open?:unknown;offers?:readonly Offer[];
 economy?:Readonly<{state?:unknown;quotations?:unknown;
  ranking_allowed?:unknown;price_comparable?:unknown;contacts_revealed?:unknown;
  iva_not_informed?:unknown;freight_not_informed?:unknown;
  freight_to_agree?:unknown;payment_not_informed?:unknown;
  stock_unverified?:unknown;net_unverified?:unknown;
  delivery_unverified?:unknown;minimum_unverified?:unknown
 }> |null;
}>;
type Input=InsumoRondaPrivadoMvp172&Readonly<{
 quotations:readonly (InsumoRondaPrivadoMvp172['quotations'][number]&
  Readonly<{publicText:string}>)[];
}>;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);

/** Null means omit ONLY this optional panel; never disclose source IDs. */
export function resumirCondicionesEconomicasPorOfertaMvp204(
 status:Status|null,source:unknown,prices:ResumenImportesMvp186|null
):ResumenCondicionesMvp204|null{
 try{
  if(status?.state!=='closed'||status.can_open!==true||
    !Array.isArray(status.offers)||status.offers.length<1||
    status.offers.length>12||status.economy?.state!=='economia_observada_sin_ranking'||
    status.economy.quotations!==status.offers.length||
    status.economy.ranking_allowed!==false||
    status.economy.price_comparable!==false||
    status.economy.contacts_revealed!==false||
    prices?.state!=='importes_por_articulo_sin_ranking'||
    prices.quotations!==status.offers.length||
    prices.requested_items<1||prices.requested_items>30||
    !Array.isArray(prices.articulos)||prices.articulos.length!==prices.requested_items||
    prices.ranking_allowed!==false||prices.price_comparable!==false||
    prices.contacts_revealed!==false||prices.adjudicacion!==false||
    prices.originales_descargables!==false||prices.IVA_calculado!==false||
    prices.flete_calculado!==false||prices.stock_confirmado!==false||
    !obj(source)||source.state!=='private_inputs'||
    source.rankingAllowed!==false||source.contactsRevealed!==false||
    !Array.isArray(source.quotations)||
    source.quotations.length!==status.offers.length)return null;
  const input=source as Input;
  const diagnosis=diagnosticarRondaPrivadaMvp172(input);
  if(diagnosis.estado!=='diagnostico_privado'||
    diagnosis.rondaResumen.cotizacionesAuditadas!==status.offers.length||
    diagnosis.rondaResumen.articulosSolicitados!==prices.requested_items||
    diagnosis.rankingHabilitado!==false||diagnosis.adjudicacion!==false||
    diagnosis.contactosRevelados!==false||diagnosis.originalesDescargables!==false||
    diagnosis.whatsappEnviado!==false)return null;

  const textToLabel=new Map<string,string>();
  const uniqueLabels=new Set<string>();
  for(const o of status.offers){
   if(!o||typeof o.text!=='string'||!o.text||o.text.length>16000||
      typeof o.label!=='string'||!o.label||o.label.length>100||
      textToLabel.has(o.text)||uniqueLabels.has(o.label))return null;
   textToLabel.set(o.text,o.label);uniqueLabels.add(o.label);
  }
  const countByLabel=new Map([...uniqueLabels].map(label=>[label,0]));
  const itemIds=new Set<string>();
  for(const row of prices.articulos){
   if(!row||!/^item_\d{3}$/u.test(row.itemId)||itemIds.has(row.itemId)||
      !Array.isArray(row.referencias)||row.referencias.length!==uniqueLabels.size)
    return null;
   itemIds.add(row.itemId);
   const seen=new Set<string>();
   for(const ref of row.referencias){
    if(!ref||!countByLabel.has(ref.oferta)||seen.has(ref.oferta))return null;
    seen.add(ref.oferta);
    if(ref.importeCotizado!==null){
     if(typeof ref.importeCotizado!=='string'||!ref.importeCotizado||
        typeof ref.cantidadCotizadaLiteral!=='string'||
        !['sin_iva_por_convencion','sin_iva_declarado'].includes(ref.iva)||
        !['alternativa_comercial_con_aclaracion',
          'coincide_volumen_nominal_sin_stock'].includes(ref.estado))return null;
     countByLabel.set(ref.oferta,countByLabel.get(ref.oferta)!+1);
    }else if(ref.cantidadCotizadaLiteral!==null)return null;
   }
  }
  const byLabel=new Map<string,EstadoOfertaMvp204>();
  for(const quote of input.quotations){
   if(!quote||!textToLabel.has(quote.publicText)||
      byLabel.has(textToLabel.get(quote.publicText)!)||
      quote.doc?.prueba?.version!==9||
      quote.doc.prueba.revisionVigente!==true||
      quote.doc.prueba.cotizacionVigente!==true||
      quote.doc.sourceSha256!==quote.economia?.sourceSha256||
      !HASH.test(quote.doc.sourceSha256)||
      quote.fuente?.sourceSha256!==quote.doc.sourceSha256)return null;
   const cond=quote.economia.condiciones as unknown;
   if(!obj(cond)||cond.estado!=='fuente_leida'||
      cond.rankingHabilitado!==false||cond.stockCorroborado!==false||
      cond.plazoCorroborado!==false||cond.minimoCompraCorroborado!==false||
      cond.netoSinIvaAcreditado!==false||cond.contactosRevelados!==false||
      cond.originalesModificados!==false||
      !obj(cond.iva)||!IVA.has(String(cond.iva.estado))||
      !obj(cond.flete)||!FLETE.has(String(cond.flete.estado))||
      !obj(cond.pago)||!PAGO.has(String(cond.pago.estado)))return null;
   const label=textToLabel.get(quote.publicText)!;
   const priceCount=countByLabel.get(label)!;
   // MVP168 contains no independently audited currency. Never infer ARS
   // from the unqualified "$" used in most Argentine quote documents.
   byLabel.set(label,Object.freeze({
    oferta:label,articulosConImporte:priceCount,
    articulosSolicitados:prices.requested_items,
    iva:cond.iva.estado as EstadoIva,
    flete:cond.flete.estado as EstadoFlete,
    pago:cond.pago.estado as EstadoPago,
    moneda:monedaExplicitaFuenteMvp205(quote.doc)??'no_acreditada',
    stockCorroborado:false as const,
    plazoCorroborado:false as const,minimoCorroborado:false as const
   }));
  }
  if(byLabel.size!==uniqueLabels.size)return null;
  const ordered=status.offers.map(o=>byLabel.get(o.label)!);
  const econ=status.economy;
  if(ordered.filter(x=>x.iva==='no_informado').length!==econ.iva_not_informed||
     ordered.filter(x=>x.flete==='no_informado').length!==econ.freight_not_informed||
     ordered.filter(x=>x.flete==='a_convenir').length!==econ.freight_to_agree||
     ordered.filter(x=>x.pago==='no_informado').length!==econ.payment_not_informed||
     ordered.length!==econ.stock_unverified||
     ordered.length!==econ.net_unverified||
     ordered.length!==econ.delivery_unverified||
     ordered.length!==econ.minimum_unverified)return null;
  return Object.freeze({
   state:'condiciones_por_oferta_sin_ranking' as const,
   quotations:ordered.length,requested_items:prices.requested_items,
   ofertas:Object.freeze(ordered),
   ranking_allowed:false as const,price_comparable:false as const,
   contacts_revealed:false as const,tax_calculated:false as const,
   freight_calculated:false as const,stock_confirmed:false as const,
   automatic_award:false as const,originals_downloadable:false as const
  });
 }catch{return null}
}

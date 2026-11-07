/**
 * MVP186 — Buyer-visible, source-backed per-article QUOTED prices.
 * Reuses the already installed buyer-token private selector MVP175.
 * Only the Edge can call this. No new supplier prompts, approval screens,
 * contact disclosure, award, ranking or assumption of zero tax/freight.
 */
import {diagnosticarRondaPrivadaMvp172,
 type InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';
import {centavosFuenteMvp162,cantidadFuenteMvp162} from './adaptador-documental-mvp162.ts';

export type ReferenciaPrecioMvp186=Readonly<{
 oferta:string;
 importeCotizado:string|null;
 /** Original supplier quantity; never converted to the buyer's unit. */
 cantidadCotizadaLiteral:string|null;
 estado:'alternativa_comercial_con_aclaracion'|'coincide_volumen_nominal_sin_stock'|
 'no_homologable'|'sin_importe_asignable';
 iva:'sin_iva_por_convencion'|'sin_iva_declarado'|
 'iva_incluido_no_homologado'|'iva_ambiguo';
}>;
export type ResumenImportesMvp186=Readonly<{
 state:'importes_por_articulo_sin_ranking';
 quotations:number;requested_items:number;
 articulos:readonly Readonly<{itemId:string;
  descripcionSolicitada:string;cantidadSolicitada:string;unidadSolicitada:string;
  referencias:readonly ReferenciaPrecioMvp186[]}>[];
 ranking_allowed:false;price_comparable:false;contacts_revealed:false;
 adjudicacion:false;originales_descargables:false;
 IVA_calculado:false;flete_calculado:false;stock_confirmado:false;
}>;
type PricedQuote=InsumoRondaPrivadoMvp172['quotations'][number]&
 Readonly<{publicText:string}>;
type PriceInput=InsumoRondaPrivadoMvp172&Readonly<{
 quotations:readonly PricedQuote[];
}>;
type Status=Readonly<{
 state?:unknown;can_open?:unknown;
 offers?:readonly Readonly<{label:string;text:string}>[];
 economy?:Readonly<{
  state?:unknown;quotations?:unknown;ranking_allowed?:unknown;
  price_comparable?:unknown;contacts_revealed?:unknown;
 }> |null;
}>;

const safeId=/^item_\d{3}$/u;
const sourceTotal=/^\s*(?:(?:AR\$|US\$|U\$S|(?:ARS|USD)\s*\$?|\$)\s*)?[\d.,]+\s*$/iu;
const isObject=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const classifyIva=(value:string):
 ReferenciaPrecioMvp186['iva']=>{
 if(value==='no_informado')return 'sin_iva_por_convencion';
 if(value==='no_incluido')return 'sin_iva_declarado';
 if(value==='incluido')return 'iva_incluido_no_homologado';
 return 'iva_ambiguo';
};

/**
 * Exactly match each supplier's REVIEWED public text to the buyer-visible
 * offer before attaching a source price. RPC quotation order is by HMAC,
 * but buyer offer order is by public text. Index alignment would mix prices!
 *
 * The optional publicText is generated ONLY server-side by the service-role
 * RPC after v9 source verification. It NEVER goes into the response.
 */
export function resumirImportesCotizadosCompradorMvp186(
 status:Status|null,privateInput:unknown
):ResumenImportesMvp186|null{
 try{
  if(!status||status.can_open!==true||
    !['waiting','closed'].includes(String(status.state))||
    !Array.isArray(status.offers)||status.offers.length<1||
    status.offers.length>12||
    !status.economy||
    status.economy.state!=='economia_observada_sin_ranking'||
    status.economy.ranking_allowed!==false||
    status.economy.price_comparable!==false||
    status.economy.contacts_revealed!==false||
    status.economy.quotations!==status.offers.length||
    !isObject(privateInput)||privateInput.state!=='private_inputs'||
    privateInput.rankingAllowed!==false||
    privateInput.contactsRevealed!==false||
    !Array.isArray(privateInput.quotations)||
    privateInput.quotations.length!==status.offers.length)
   return null;
  const input=privateInput as PriceInput;
  const checked=diagnosticarRondaPrivadaMvp172(input);
  if(checked.estado!=='diagnostico_privado'||checked.rankingHabilitado!==false||
    checked.contactosRevelados!==false||checked.originalesDescargables!==false||
    checked.whatsappEnviado!==false||
    checked.rondaResumen.cotizacionesAuditadas!==status.offers.length)
   return null;
  const labels=new Map<string,string>();
  const positions=new Map<string,number>();
  for(const [i,offer] of status.offers.entries()){
   if(!offer||typeof offer.text!=='string'||offer.text.length<1||
     offer.text.length>16000||
     typeof offer.label!=='string'||offer.label.length<1||
     offer.label.length>100||labels.has(offer.text)||
     positions.has(offer.label))
    return null; // neither duplicate texts NOR duplicate buyer labels
   labels.set(offer.text,offer.label);
   positions.set(offer.label,i);
  }
  if(checked.rondaResumen.articulosSolicitados!==input.requestItems.length||
    checked.proveedoresAnonimos.length!==input.quotations.length)
   return null;
  const incomingTexts=new Set<string>();
  const byItem=new Map<string,{
   descripcionSolicitada:string;cantidadSolicitada:string;unidadSolicitada:string;
   referencias:ReferenciaPrecioMvp186[]
  }>();
  for(const item of input.requestItems){
   if(!safeId.test(item.id)||byItem.has(item.id))return null;
   // This is the BUYER'S own request, not a supplier source description.
   // It can safely be returned ONLY inside this token-authorized buyer view.
   if(typeof item.descripcionLiteral!=='string'||
      item.descripcionLiteral.trim().length<1||
      item.descripcionLiteral.length>500)return null;
   byItem.set(item.id,{
    descripcionSolicitada:item.descripcionLiteral,
    cantidadSolicitada:item.cantidad,unidadSolicitada:item.unidad,
    referencias:[]
   });
  }
  for(let i=0;i<input.quotations.length;i++){
   const q=input.quotations[i],preview=checked.proveedoresAnonimos[i];
   if(!q||!preview||typeof q.publicText!=='string'||
     q.publicText.length<1||q.publicText.length>16000||
     !labels.has(q.publicText)||incomingTexts.has(q.publicText))
    return null;
   incomingTexts.add(q.publicText);
   const label=labels.get(q.publicText)!;
   const ivaStatus=q.economia?.condiciones?.iva?.estado;
   if(typeof ivaStatus!=='string')return null;
   const iva=classifyIva(ivaStatus);
   const audit=q.economia.descuentos;
   const pricesUsable=audit?.estado==='descuentos_conciliados_sin_iva'&&
      audit.precios.length===q.doc.lineas.length;
   const lines=new Map(q.doc.lineas.map(l=>[l.lineNo,l]));
   const proven=new Map<number,boolean>();
   if(pricesUsable){
    for(const a of audit.precios){
     if(!isObject(a)||!Number.isSafeInteger(a.linea)||
       proven.has(a.linea as number)||
       !['importe_sin_ajuste_conciliado',
        'descuento_explicito_conciliado'].includes(String(a.estado))||
       typeof a.unitarioComercialTrasDescuento!=='string'||
       (a.pagina!==null&&!Number.isSafeInteger(a.pagina))||
       (a.fila!==null&&!Number.isSafeInteger(a.fila)))return null;
     // Reconcile every commercially discounted unit price against the
     // immutable source line and its independently located original row.
     const line=q.doc.lineas.find(x=>x.lineNo===a.linea);
     const located=q.fuente.lines.find(x=>x.lineNo===a.linea);
     const quantity=cantidadFuenteMvp162(line?.quantityLiteral);
     const unit=centavosFuenteMvp162(a.unitarioComercialTrasDescuento);
     const source=centavosFuenteMvp162(line?.lineTotalLiteral);
     if(!line||!located||a.pagina!==located.page||
       a.fila!==located.row||quantity===null||unit===null||
       source===null)return null;
     const [whole,fraction='']=quantity.split('.');
     const milli=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0')||'0');
     if((unit*milli+500n)/1000n!==source)return null;
     proven.set(a.linea as number,true);
    }
   }
   // One source line must not be used for two different buyer articles.
   const useCount=new Map<number,number>();
   for(const p of preview.articulos){
    if(p.lineaFuente!==null)useCount.set(p.lineaFuente,
       (useCount.get(p.lineaFuente)??0)+1);
   }
   for(const p of preview.articulos){
    const refs=byItem.get(p.itemId)?.referencias;
    if(!refs)return null;
    const provisional=p.estado==='alternativa_comercial_con_aclaracion'||
      p.estado==='coincide_volumen_nominal_sin_stock';
    const line=p.lineaFuente===null?null:lines.get(p.lineaFuente);
    const literal=line?.lineTotalLiteral;
    const admissible=provisional&&line&&
       useCount.get(p.lineaFuente!)===1&&
       pricesUsable&&proven.get(p.lineaFuente!)===true&&
       (iva==='sin_iva_por_convencion'||iva==='sin_iva_declarado')&&
       typeof literal==='string'&&literal.length<=48&&
       sourceTotal.test(literal)&&centavosFuenteMvp162(literal)!==null;
    const ref:ReferenciaPrecioMvp186=Object.freeze({
     oferta:label,
     importeCotizado:admissible?literal!.trim():null,
     cantidadCotizadaLiteral:admissible?line!.quantityLiteral!.trim():null,
     estado:!provisional?'sin_importe_asignable':
       !admissible?'no_homologable':p.estado,
     iva
    });
    refs.push(ref);
   }
  }
  if(incomingTexts.size!==labels.size||
    [...byItem.values()].some(item=>item.referencias.length!==status.offers?.length))
   return null;
  return Object.freeze({
   state:'importes_por_articulo_sin_ranking' as const,
   quotations:status.offers.length,
   requested_items:byItem.size,
   articulos:Object.freeze([...byItem.entries()].map(([itemId,item])=>
     Object.freeze({itemId,
      descripcionSolicitada:item.descripcionSolicitada,
      cantidadSolicitada:item.cantidadSolicitada,
      unidadSolicitada:item.unidadSolicitada,
      // RPC rows come sorted by HMAC, NOT by buyer-visible labels.
      // Keep each source's verified label/value together but present every
      // article in the SAME order as the buyer's reviewed offer list.
      referencias:Object.freeze([...item.referencias].sort((a,b)=>
       positions.get(a.oferta)!-positions.get(b.oferta)!)
      )
     }))),
   ranking_allowed:false as const,price_comparable:false as const,
   contacts_revealed:false as const,adjudicacion:false as const,
   originales_descargables:false as const,IVA_calculado:false as const,
   flete_calculado:false as const,stock_confirmado:false as const
  });
 }catch{
  // Any source inconsistency means omit this optional widget only.
  return null;
 }
}

/**
 * MVP194 — Buyer-visible completeness of SOURCE-BACKED article amounts.
 * Works ONLY on MVP186's already audited, buyer-token-authorized projection.
 * No money arithmetic, currency inference, ranking, prices, supplier identity,
 * adjudication, downloads or outbound messages.
 *
 * A source amount on an article is not a final payable amount: freight,
 * tax, payment, minimums and stock remain separate.
 */
import type {ResumenImportesMvp186} from './resumen-importes-cotizados-mvp186.ts';

type AnonymousOffer=Readonly<{label:string;text:string}>;
export type ResumenImportesCubiertosMvp194=Readonly<{
 state:'cobertura_importes_sin_ranking';
 quotations:number;requested_items:number;
 coberturaPorOferta:readonly Readonly<{
  oferta:string;articulosConImporte:number;articulosSolicitados:number;
 }>[];
 /** Only a pair where NEITHER supplier alone has all source amounts, and
  * BOTH add at least one exclusive article. Never suggests a winner. */
 parejasConImportesParaTodos:readonly Readonly<{
  ofertasAnonimas:readonly [string,string];
  articulos:readonly Readonly<{
   itemId:string;ofertasConImporte:readonly string[];
  }>[];
 }>[];
 ranking_allowed:false;price_comparable:false;tax_calculated:false;
 freight_calculated:false;stock_confirmed:false;contacts_revealed:false;
 automatic_award:false;finalists_selected:false;whatsapp_sent:false;
 originals_downloadable:false;
}>;
type Status=Readonly<{
 state?:unknown;can_open?:unknown;
 offers?:readonly AnonymousOffer[];
 economy?:Readonly<{
  state?:unknown;quotations?:unknown;ranking_allowed?:unknown;
  price_comparable?:unknown;contacts_revealed?:unknown;
 }> |null;
}>;
const ID=/^item_\d{3}$/u;
const pricedStates=new Set([
 'alternativa_comercial_con_aclaracion','coincide_volumen_nominal_sin_stock'
]);
const vatStates=new Set(['sin_iva_por_convencion','sin_iva_declarado']);
const amount=/^(?:\s*(?:ARS|USD)?\s*\$?\s*)?[\d.,]+\s*$/iu;
const quantity=/^[0-9][0-9., ]{0,47}$/u;

export function resumirCoberturaImportesMvp194(
 status:Status|null,validatedMvp186:ResumenImportesMvp186|null
):ResumenImportesCubiertosMvp194|null{
 try{
  // During an active round never suggest a one/two-provider pairing.
  if(status?.state!=='closed'||status.can_open!==true||
     !Array.isArray(status.offers)||status.offers.length<1||
     status.offers.length>12||
     status.economy?.state!=='economia_observada_sin_ranking'||
     status.economy.quotations!==status.offers.length||
     status.economy.ranking_allowed!==false||
     status.economy.price_comparable!==false||
     status.economy.contacts_revealed!==false||
     validatedMvp186?.state!=='importes_por_articulo_sin_ranking'||
     validatedMvp186.quotations!==status.offers.length||
     validatedMvp186.requested_items<1||
     validatedMvp186.requested_items>30||
     !Array.isArray(validatedMvp186.articulos)||
     validatedMvp186.articulos.length!==validatedMvp186.requested_items||
     validatedMvp186.ranking_allowed!==false||
     validatedMvp186.price_comparable!==false||
     validatedMvp186.contacts_revealed!==false||
     validatedMvp186.adjudicacion!==false||
     validatedMvp186.originales_descargables!==false||
     validatedMvp186.IVA_calculado!==false||
     validatedMvp186.flete_calculado!==false||
     validatedMvp186.stock_confirmado!==false)return null;

  const labels=status.offers.map(x=>x?.label);
  if(labels.some(x=>typeof x!=='string'||!x||x.length>100)||
     new Set(labels).size!==labels.length||
     new Set(status.offers.map(x=>x.text)).size!==labels.length||
     status.offers.some(x=>typeof x?.text!=='string'||!x.text||
      x.text.length>16000))return null;
  const priced=new Map(labels.map(x=>[x,new Set<string>()]));
  const articleIds:string[]=[];
  const seenIds=new Set<string>();
  for(const item of validatedMvp186.articulos){
   if(!item||!ID.test(item.itemId)||seenIds.has(item.itemId)||
     !Array.isArray(item.referencias)||item.referencias.length!==labels.length)
    return null;
   seenIds.add(item.itemId);articleIds.push(item.itemId);
   const seenLabels=new Set<string>();
   for(const ref of item.referencias){
    if(!ref||typeof ref.oferta!=='string'||!priced.has(ref.oferta)||
       seenLabels.has(ref.oferta))return null;
    seenLabels.add(ref.oferta);
    const hasAmount=typeof ref.importeCotizado==='string';
    if(hasAmount){
     if(ref.importeCotizado!.length>48||
       !amount.test(ref.importeCotizado!)||
       !pricedStates.has(ref.estado)||!vatStates.has(ref.iva)||
       typeof ref.cantidadCotizadaLiteral!=='string'||
       !quantity.test(ref.cantidadCotizadaLiteral))return null;
     priced.get(ref.oferta)!.add(item.itemId);
    }else if(ref.importeCotizado!==null||
             ref.cantidadCotizadaLiteral!==null)return null;
   }
   if(seenLabels.size!==labels.length)return null;
  }
  const total=articleIds.length;
  const coberturaPorOferta=Object.freeze(labels.map(oferta=>
    Object.freeze({oferta,
     articulosConImporte:priced.get(oferta)!.size,
     articulosSolicitados:total
    })));
  const pairs:ResumenImportesCubiertosMvp194['parejasConImportesParaTodos'][number][]=[];
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j],left=priced.get(a)!,right=priced.get(b)!;
   if(left.size>=total||right.size>=total||
      articleIds.some(id=>!left.has(id)&&!right.has(id))||
      !articleIds.some(id=>left.has(id)&&!right.has(id))||
      !articleIds.some(id=>right.has(id)&&!left.has(id)))continue;
   pairs.push(Object.freeze({
    ofertasAnonimas:Object.freeze([a,b] as [string,string]),
    articulos:Object.freeze(articleIds.map(itemId=>Object.freeze({
     itemId,ofertasConImporte:Object.freeze([
      ...(left.has(itemId)?[a]:[]),...(right.has(itemId)?[b]:[])
     ])
    })))
   }));
  }
  return Object.freeze({
   state:'cobertura_importes_sin_ranking' as const,
   quotations:labels.length,requested_items:total,
   coberturaPorOferta,
   parejasConImportesParaTodos:Object.freeze(pairs),
   ranking_allowed:false as const,price_comparable:false as const,
   tax_calculated:false as const,freight_calculated:false as const,
   stock_confirmed:false as const,contacts_revealed:false as const,
   automatic_award:false as const,finalists_selected:false as const,
   whatsapp_sent:false as const,originals_downloadable:false as const
  });
 }catch{return null}
}

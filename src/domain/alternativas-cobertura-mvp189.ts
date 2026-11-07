/**
 * MVP189 — one/two-supplier potential COVERAGE, not a price ranking.
 * Input is exclusively the already token-gated, source-checked private
 * envelope + the buyer's independently checked anonymous tracking view.
 * Results are shown AFTER closure, preserving every supplier and original.
 * No tax, freight, stock, minimum, contact, award, or new WhatsApp message.
 */
import {diagnosticarRondaPrivadaMvp172,
 type InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';

type EntradaOfertaMvp189=InsumoRondaPrivadoMvp172['quotations'][number]&
 Readonly<{publicText:string}>;
type InsumosMvp189=InsumoRondaPrivadoMvp172&Readonly<{
 quotations:readonly EntradaOfertaMvp189[];
}>;
type SeguimientoMvp189=Readonly<{
 state?:unknown;can_open?:unknown;
 offers?:readonly Readonly<{label:string;text:string}>[];
 economy?:Readonly<{
  state?:unknown;quotations?:unknown;ranking_allowed?:unknown;
  price_comparable?:unknown;contacts_revealed?:unknown;
 }> |null;
 coverage?:Readonly<{
  state?:unknown;quotations?:unknown;requested_items?:unknown;
  ranking_allowed?:unknown;price_comparable?:unknown;
  contacts_revealed?:unknown;
 }> |null;
}>;
export type AlternativaCoberturaMvp189=Readonly<{
 modo:'individual'|'complementaria';
 ofertasAnonimas:readonly string[];
 articulos:readonly Readonly<{itemId:string;ofertasConAlternativa:readonly string[]}>[];
}>;
export type CoberturaPosibleMvp189=Readonly<{
 state:'alternativas_cobertura_sin_ranking';
 quotations:number;requested_items:number;
 coberturaPorOferta:readonly Readonly<{
  oferta:string;articulosConAlternativa:number;articulosSolicitados:number;
 }>[];
 alternativas:readonly AlternativaCoberturaMvp189[];
 ranking_allowed:false;price_comparable:false;tax_calculated:false;
 freight_calculated:false;stock_confirmed:false;contacts_revealed:false;
 automatic_award:false;finalists_selected:false;whatsapp_sent:false;
 originals_downloadable:false;
}>;
const compatible=new Set([
 'alternativa_comercial_con_aclaracion',
 'coincide_volumen_nominal_sin_stock'
]);
const id=/^item_\d{3}$/u;
const isRecord=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);

/** Null on *any* loss of binding, not a partial or stale coverage report. */
export function resumirAlternativasCoberturaMvp189(
 status:SeguimientoMvp189|null,privateInput:unknown
):CoberturaPosibleMvp189|null{
 try{
  if(!status||status.state!=='closed'||status.can_open!==true||
    !Array.isArray(status.offers)||status.offers.length<1||
    status.offers.length>12||
    status.economy?.state!=='economia_observada_sin_ranking'||
    status.economy.quotations!==status.offers.length||
    status.economy.ranking_allowed!==false||
    status.economy.price_comparable!==false||
    status.economy.contacts_revealed!==false||
    status.coverage?.state!=='cobertura_revisada'||
    status.coverage.quotations!==status.offers.length||
    status.coverage.ranking_allowed!==false||
    status.coverage.price_comparable!==false||
    status.coverage.contacts_revealed!==false||
    !isRecord(privateInput)||privateInput.state!=='private_inputs'||
    privateInput.rankingAllowed!==false||
    privateInput.contactsRevealed!==false||
    !Array.isArray(privateInput.quotations)||
    privateInput.quotations.length!==status.offers.length)
   return null;
  const privateRound=privateInput as InsumosMvp189;
  const diagnosed=diagnosticarRondaPrivadaMvp172(privateRound);
  if(diagnosed.estado!=='diagnostico_privado'||
    diagnosed.rankingHabilitado!==false||
    diagnosed.contactosRevelados!==false||
    diagnosed.originalesDescargables!==false||
    diagnosed.whatsappEnviado!==false||
    diagnosed.adjudicacion!==false||
    diagnosed.rondaResumen.cotizacionesAuditadas!==status.offers.length||
    diagnosed.rondaResumen.articulosSolicitados!==status.coverage.requested_items)
   return null;
  const itemIds=privateRound.requestItems.map(x=>x.id);
  if(itemIds.length<1||itemIds.length>30||
    itemIds.some(x=>!id.test(x))||
    new Set(itemIds).size!==itemIds.length)return null;

  // Source query is HMAC ordered; buyer labels are NOT. Never rely on index.
  const reviewToLabel=new Map<string,string>();
  const labels=new Set<string>();
  for(const offer of status.offers){
   if(!offer||typeof offer.text!=='string'||!offer.text||
     offer.text.length>16000||typeof offer.label!=='string'||
     !offer.label||offer.label.length>100||
     reviewToLabel.has(offer.text)||labels.has(offer.label))return null;
   reviewToLabel.set(offer.text,offer.label);labels.add(offer.label);
  }
  const coveredBy=new Map<string,Set<string>>();
  const usedTexts=new Set<string>();
  for(let index=0;index<privateRound.quotations.length;index++){
   const quote=privateRound.quotations[index];
   const view=diagnosed.proveedoresAnonimos[index];
   if(!quote||!view||typeof quote.publicText!=='string'||
     !reviewToLabel.has(quote.publicText)||usedTexts.has(quote.publicText)||
     view.articulos.length!==itemIds.length)return null;
   usedTexts.add(quote.publicText);
   const label=reviewToLabel.get(quote.publicText)!;
   const lines=new Set<string>();
   const cover=new Set<string>();
   for(const line of view.articulos){
    if(!line||!id.test(line.itemId)||!itemIds.includes(line.itemId)||
      lines.has(line.itemId))return null;
    lines.add(line.itemId);
    if(compatible.has(line.estado)&&line.lineaFuente!==null)
     cover.add(line.itemId);
   }
   if(lines.size!==itemIds.length||coveredBy.has(label))return null;
   coveredBy.set(label,cover);
  }
  if(coveredBy.size!==labels.size||usedTexts.size!==labels.size)return null;
  const offers=status.offers.map(o=>o.label);
  const singles:AlternativaCoberturaMvp189[]=[];
  const pairs:AlternativaCoberturaMvp189[]=[];
  for(const label of offers){
   const match=coveredBy.get(label)!;
   if(match.size===itemIds.length)
    singles.push(Object.freeze({
     modo:'individual' as const,
     ofertasAnonimas:Object.freeze([label]),
     articulos:Object.freeze(itemIds.map(itemId=>Object.freeze({
      itemId,ofertasConAlternativa:Object.freeze([label])
     })))
    }));
  }
  // Only genuine complementary combinations. A pair where one supplier
  // already covers the whole list is redundant, not a second "winner".
  for(let i=0;i<offers.length;i++)for(let j=i+1;j<offers.length;j++){
   const a=offers[i],b=offers[j];
   const left=coveredBy.get(a)!,right=coveredBy.get(b)!;
   if(left.size===itemIds.length||right.size===itemIds.length)continue;
   if(itemIds.some(itemId=>!left.has(itemId)&&!right.has(itemId)))continue;
   pairs.push(Object.freeze({
    modo:'complementaria' as const,
    ofertasAnonimas:Object.freeze([a,b]),
    articulos:Object.freeze(itemIds.map(itemId=>Object.freeze({
     itemId,ofertasConAlternativa:Object.freeze([
      ...(left.has(itemId)?[a]:[]),...(right.has(itemId)?[b]:[])
     ])
    })))
   }));
  }
  return Object.freeze({
   state:'alternativas_cobertura_sin_ranking' as const,
   quotations:labels.size,requested_items:itemIds.length,
   coberturaPorOferta:Object.freeze(offers.map(oferta=>Object.freeze({
    oferta,articulosConAlternativa:coveredBy.get(oferta)!.size,
    articulosSolicitados:itemIds.length
   }))),
   alternativas:Object.freeze([...singles,...pairs]),
   ranking_allowed:false as const,price_comparable:false as const,
   tax_calculated:false as const,freight_calculated:false as const,
   stock_confirmed:false as const,contacts_revealed:false as const,
   automatic_award:false as const,finalists_selected:false as const,
   whatsapp_sent:false as const,originals_downloadable:false as const
  });
 }catch{
  return null;
 }
}

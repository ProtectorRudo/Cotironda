/**
 * MVP196 — private SOURCE-BACKED replacement for the literal SQL coverage
 * planner MVP159. No economic winner, contact disclosure or network side effect.
 *
 * Only call with the service_role gated MVP172 private envelope for a round
 * independently proved CLOSED and created AFTER the finalist activation
 * timestamp. The result includes HMAC/SHA and MUST NEVER reach the browser.
 */
import {diagnosticarRondaPrivadaMvp172,
 type InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';
import {centavosFuenteMvp162,cantidadFuenteMvp162} from './adaptador-documental-mvp162.ts';

type SourceMatch=Readonly<{itemId:string;lineNo:number}>;
export type FuenteSeleccionadaMvp196=Readonly<{
 oferta:string;messageHmac:string;sourceSha256:string;
 matches:readonly SourceMatch[];
}>;
export type SeleccionPrivadaMvp196=Readonly<{
 state:'plan_ready'|'sin_cobertura_completa'|
  'multiples_opciones_no_desempatadas'|'insumos_invalidos';
 mode:'one_complete_alternative'|'two_complete_alternatives'|
  'two_supplier_combination'|null;
 requestId:string|null;
 allOffers:readonly Readonly<{
  oferta:string;articulosCubiertos:number;articulosSolicitados:number;
  lineasOriginalesExtra:number;
 }>[];
 /** PRIVATE proof, a SQL resolver independently maps it to supplier_key. */
 selected:readonly FuenteSeleccionadaMvp196[];
 rankingAllowed:false;priceRanked:false;automaticAward:false;
 contactsRevealed:false;messagesSent:false;originalsDownloadable:false;
}>;
const HEX=/^[0-9a-f]{64}$/u;
const ITEM=/^item_\d{3}$/u;
const covered=new Set(['alternativa_comercial_con_aclaracion',
 'coincide_volumen_nominal_sin_stock']);
type Quote=InsumoRondaPrivadoMvp172['quotations'][number];
const negative=(state:SeleccionPrivadaMvp196['state'],
 requestId:string|null=null,allOffers:SeleccionPrivadaMvp196['allOffers']=[],
):SeleccionPrivadaMvp196=>Object.freeze({
 state,mode:null,requestId,
 allOffers:Object.freeze([...allOffers]),selected:Object.freeze([]),
 rankingAllowed:false as const,priceRanked:false as const,
 automaticAward:false as const,contactsRevealed:false as const,
 messagesSent:false as const,originalsDownloadable:false as const
});
type ValidCandidate={
 oferta:string;quote:Quote;matched:SourceMatch[];remaining:number;
};
/** No buyer text, company IDs or private source hash leaves this boundary. */
export function seleccionarComercialmenteMvp196(input:Readonly<{
 closureChecked:true;privateInputs:InsumoRondaPrivadoMvp172;
}>):SeleccionPrivadaMvp196{
 if(!input||input.closureChecked!==true||!input.privateInputs)
  return negative('insumos_invalidos');
 const data=input.privateInputs;
 const diag=diagnosticarRondaPrivadaMvp172(data);
 if(diag.estado!=='diagnostico_privado'||diag.rankingHabilitado!==false||
  diag.adjudicacion!==false||diag.contactosRevelados!==false||
  diag.originalesDescargables!==false||diag.whatsappEnviado!==false||
  diag.rondaResumen.cotizacionesAuditadas!==data.quotations.length||
  diag.rondaResumen.articulosSolicitados!==data.requestItems.length)
  return negative('insumos_invalidos');
 const requestId=data.quotations[0]?.doc?.requestId;
 if(typeof requestId!=='string'||!requestId)return negative('insumos_invalidos');
 const requested=data.requestItems.map(x=>x.id);
 if(requested.some(x=>!ITEM.test(x))||
  new Set(requested).size!==requested.length)return negative('insumos_invalidos');
 const seenHmac=new Set<string>(),candidates:ValidCandidate[]=[];
 const summaries:SeleccionPrivadaMvp196['allOffers'][number][]=[];
 for(let i=0;i<data.quotations.length;i++){
  const quote=data.quotations[i],preview=diag.proveedoresAnonimos[i];
  const doc=quote?.doc,source=quote?.fuente,proof=doc?.prueba;
  if(!doc||!source||!proof||!preview||
   !HEX.test(doc.messageHmac)||!HEX.test(doc.sourceSha256)||
   seenHmac.has(doc.messageHmac)||doc.requestId!==requestId||
   proof.version!==9||proof.state!=='verified'||proof.reason!=='covered'||
   proof.sourceSha256!==doc.sourceSha256||
   proof.messageHmac!==doc.messageHmac||
   proof.requestId!==requestId||proof.revisionVigente!==true||
   proof.cotizacionVigente!==true||proof.rankingAllowed!==false||
   source.messageHmac!==doc.messageHmac||
   source.sourceSha256!==doc.sourceSha256||
   source.requestId!==requestId||source.state!=='source_checked'||
   source.rankingAllowed!==false||
   source.sourceImmutabilityPreserved!==true||
   quote.economia?.state!=='source_checked'||
   quote.economia?.sourceSha256!==doc.sourceSha256||
   quote.economia?.rankingAllowed!==false||
   !Array.isArray(doc.lineas)||!Array.isArray(preview.articulos)||
   preview.articulos.length!==requested.length||
   !Array.isArray(source.lines)||source.lines.length!==doc.lineas.length||
   !Array.isArray(quote.economia?.descuentos?.precios)||
   quote.economia.descuentos.precios.length!==doc.lineas.length)
   return negative('insumos_invalidos');
  seenHmac.add(doc.messageHmac);
  const byLine=new Map<number,typeof doc.lineas[number]>();
  const byFact=new Map<number,typeof source.lines[number]>();
  for(const l of doc.lineas){
   if(!Number.isSafeInteger(l.lineNo)||l.lineNo<1||l.lineNo>25||
    byLine.has(l.lineNo)||centavosFuenteMvp162(l.lineTotalLiteral)===null)
    return negative('insumos_invalidos');
   byLine.set(l.lineNo,l);
  }
  for(const fact of source.lines){
   if(!Number.isSafeInteger(fact.lineNo)||!byLine.has(fact.lineNo)||
    byFact.has(fact.lineNo))return negative('insumos_invalidos');
   byFact.set(fact.lineNo,fact);
  }
  // The economic line ledger MUST be source-reconciled even though this
  // planner never ranks by money. A corrupted discount/total cannot produce
  // a recommendation indirectly via "coverage".
  if(quote.economia.descuentos.estado!=='descuentos_conciliados_sin_iva')
   return negative('insumos_invalidos');
  const byPrice=new Set<number>();
  for(const price of quote.economia.descuentos.precios){
   if(!price||typeof price!=='object'||Array.isArray(price))
    return negative('insumos_invalidos');
   const p=price as Record<string,unknown>;
   const no=p.linea;
   if(!Number.isSafeInteger(no)||!byLine.has(no as number)||
     byPrice.has(no as number)||typeof p.unitarioComercialTrasDescuento!=='string'||
     !['descuento_explicito_conciliado','importe_sin_ajuste_conciliado']
       .includes(String(p.estado)))return negative('insumos_invalidos');
   const line=byLine.get(no as number)!,fact=byFact.get(no as number);
   const qty=cantidadFuenteMvp162(line.quantityLiteral);
   const net=centavosFuenteMvp162(p.unitarioComercialTrasDescuento);
   const total=centavosFuenteMvp162(line.lineTotalLiteral);
   if(!fact||!Number.isSafeInteger(fact.page)||fact.page<1||
     !Number.isSafeInteger(fact.row)||fact.row<1||
     p.pagina!==fact.page||p.fila!==fact.row||
     qty===null||net===null||total===null)
    return negative('insumos_invalidos');
   const [whole,frac='']=qty.split('.');
   const milli=BigInt(whole)*1000n+BigInt(frac.padEnd(3,'0')||'0');
   if((net*milli+500n)/1000n!==total)
    return negative('insumos_invalidos');
   byPrice.add(no as number);
  }
  if(byPrice.size!==doc.lineas.length)return negative('insumos_invalidos');
  const matched:SourceMatch[]=[];
  const itemSeen=new Set<string>(),usedLines=new Set<number>();
  for(const x of preview.articulos){
   if(!x||!requested.includes(x.itemId)||itemSeen.has(x.itemId))
    return negative('insumos_invalidos');
   itemSeen.add(x.itemId);
   if(!covered.has(x.estado))continue;
   const l=x.lineaFuente===null?null:byLine.get(x.lineaFuente);
   const fact=x.lineaFuente===null?null:byFact.get(x.lineaFuente);
   if(!l||!fact||usedLines.has(l.lineNo)||
    !Number.isSafeInteger(fact.page)||fact.page<1||
    !Number.isSafeInteger(fact.row)||fact.row<1)
    return negative('insumos_invalidos');
   usedLines.add(l.lineNo);
   matched.push(Object.freeze({itemId:x.itemId,lineNo:l.lineNo}));
  }
  if(itemSeen.size!==requested.length)return negative('insumos_invalidos');
  const remaining=doc.lineas.length-usedLines.size;
  const oferta='oferta_'+String(i+1).padStart(3,'0');
  if(preview.oferta!==oferta)return negative('insumos_invalidos');
  summaries.push(Object.freeze({
   oferta,articulosCubiertos:matched.length,
   articulosSolicitados:requested.length,lineasOriginalesExtra:remaining
  }));
  candidates.push({oferta,quote,matched,remaining});
 }
 const allOffers=Object.freeze(summaries);
 // Coverage decisions are NOT price decisions, and MUST preserve every
 // quote (including partial/extra supplier lines) in the buyer tracking.
 const complete=candidates.filter(x=>x.matched.length===requested.length);
 let chosen:ValidCandidate[]=[];let mode:SeleccionPrivadaMvp196['mode']=null;
 if(complete.length===1){chosen=complete;mode='one_complete_alternative'}
 else if(complete.length===2){chosen=complete;mode='two_complete_alternatives'}
 else if(complete.length>2){
  return negative('multiples_opciones_no_desempatadas',requestId,allOffers);
 }else{
  const list:[ValidCandidate,ValidCandidate][]=[];
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
   const a=candidates[i],b=candidates[j];
   if(!a.matched.length||!b.matched.length||
    a.matched.length===requested.length||
    b.matched.length===requested.length)continue;
   const ca=new Set(a.matched.map(m=>m.itemId));
   const cb=new Set(b.matched.map(m=>m.itemId));
   if(requested.some(id=>!ca.has(id)&&!cb.has(id))||
    !requested.some(id=>ca.has(id)&&!cb.has(id))||
    !requested.some(id=>cb.has(id)&&!ca.has(id)))continue;
   list.push([a,b]);
  }
  if(list.length===1){chosen=[...list[0]];mode='two_supplier_combination'}
  else if(list.length>1)
   return negative('multiples_opciones_no_desempatadas',requestId,allOffers);
 }
 if(!mode)return negative('sin_cobertura_completa',requestId,allOffers);
 const selected=Object.freeze(chosen.map(x=>Object.freeze({
  oferta:x.oferta,messageHmac:x.quote.doc.messageHmac,
  sourceSha256:x.quote.doc.sourceSha256,
  matches:Object.freeze(x.matched.map(y=>Object.freeze({...y})))
 })));
 return Object.freeze({
  state:'plan_ready' as const,mode,requestId,allOffers,selected,
  rankingAllowed:false as const,priceRanked:false as const,
  automaticAward:false as const,contactsRevealed:false as const,
  messagesSent:false as const,originalsDownloadable:false as const
 });
}
/** Browser-safe projection only. Keep HMAC/SHA and supplier identity PRIVATE. */
export function resumirSeleccionComercialMvp196(
 result:SeleccionPrivadaMvp196
):Readonly<{state:SeleccionPrivadaMvp196['state'];mode:SeleccionPrivadaMvp196['mode'];
 ofertas:SeleccionPrivadaMvp196['allOffers'];recomendadosAnonimos:readonly string[];
 rankingAllowed:false;contactsRevealed:false;messagesSent:false}>{
 const recommended=result.state==='plan_ready'?
  result.selected.map(s=>s.oferta):[];
 return Object.freeze({
  state:result.state,mode:result.mode,
  ofertas:result.allOffers,
  recomendadosAnonimos:Object.freeze(recommended),
  rankingAllowed:false,contactsRevealed:false,messagesSent:false
 });
}

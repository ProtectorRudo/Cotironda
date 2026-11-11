/**
 * V2 B6 — private bridge between independently verified document evidence
 * (MVP162) and the existing exact, deterministic comparison engine (MVP118).
 *
 * WARNING: This module is not a source verifier. Never build a DocumentoFuente,
 * PruebaFuente or TerminosAuditados from AI JSON or browser input. The server
 * must retrieve them from its own authenticated, source-audited ledgers.
 *
 * B5d/B5e candidates are sourceVerified=false, so they NEVER enter this
 * comparator just because their model reading is numerically plausible.
 * No SQL, network, WhatsApp, contact reveal or publication side effects.
 */
import {
 adaptarDocumentoMvp162,centavosFuenteMvp162,
 type DocumentoFuente,type CorrelacionFuente,type TerminosAuditados,
 type PruebaBolsonMvp165,type ResultadoPuente
} from '../adaptador-documental-mvp162.ts';
import {
 compararCotizacionesOffline,
 type PedidoComparable,type OfertaComparable,type ResultadoComparacion,
 type MonedaCotizada,type FormaPago,type IvaExplicito
} from '../comparacion-ofertas.ts';

export type EvidenceEntryB6=Readonly<{
 documento:DocumentoFuente;
 correlaciones:readonly CorrelacionFuente[];
 terminos:TerminosAuditados|null;
 pruebasBolson?:readonly PruebaBolsonMvp165[];
}>;
type Status=Readonly<{
 presupuestoAnonimo:string;
 estado:ResultadoPuente['estado'];
 articulosSinCobertura:readonly string[];
 lineasNoAsignadas:readonly number[];
 motivos:readonly ResultadoPuente['motivos'][number][];
}>;
type UnitOffer=Readonly<{
 presupuestoAnonimo:string;
 precioUnitarioNeto:string;
}>;
type UnitComparison=Readonly<{
 articuloId:string;
 unidad:PedidoComparable['items'][number]['unidad'];
 cantidadPedida:string;
 moneda:MonedaCotizada;
 ivaExplicito:IvaExplicito;
 pago:FormaPago;
 plazoEntregaDias:number;
 referencias:readonly UnitOffer[];
 precioUnitarioMinimoNeto:string;
 precioUnitarioMaximoNeto:string;
 alcance:'solo_precio_unitario_no_incluye_flete_ni_minimos';
 rankingGeneralPermitido:false;
}>;
export type ResultadoPrivadoB6=Readonly<{
 estado:'comparacion_privada_sin_publicacion'|'entrada_invalida';
 presupuestos:readonly Status[];
 cantidadFuentesComparables:number;
 articulosComparables:readonly UnitComparison[];
 comparacionCanastaCompleta:ResultadoComparacion|null;
 canPublish:false;
 canRevealContacts:false;
 canAdjudicate:false;
 canComparePartialTotals:false;
}>;
const INVALID:ResultadoPrivadoB6=Object.freeze({
 estado:'entrada_invalida',presupuestos:[],
 cantidadFuentesComparables:0,articulosComparables:[],
 comparacionCanastaCompleta:null,canPublish:false,
 canRevealContacts:false,canAdjudicate:false,
 canComparePartialTotals:false
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const hash=/^[0-9a-f]{64}$/iu;
const formatCents=(x:bigint):string=>
 (x/100n).toString()+'.'+(x%100n).toString().padStart(2,'0');
type Comparable=Readonly<{anonId:string;line:OfertaComparable['items'][number];
 quote:OfertaComparable;cents:bigint}>;
const sameConditions=(v:Comparable):string=>
 [v.quote.moneda,v.quote.formaPago,String(v.quote.plazoEntregaDias),
  v.line.ivaPorcentaje].join('|');

/** Use only in a private backend with server-side verified source ledgers.
 * Output contains ANONYMOUS references; no original quote IDs or source SHA.
 */
export function prepararComparacionPrivadaB6(args:Readonly<{
 requestId:string;
 pedido:PedidoComparable;
 documentos:readonly EvidenceEntryB6[];
}>):ResultadoPrivadoB6{
 if(!args||!uuid.test(args.requestId)||!args.pedido||
  !Array.isArray(args.pedido.items)||args.pedido.items.length<1||
  args.pedido.items.length>100||!Array.isArray(args.documentos)||
  args.documentos.length>200)
  return INVALID;
 const anonIds=new Set<string>(),sourceIds=new Set<string>();
 const statuses:Status[]=[],confirmed:OfertaComparable[]=[];
 for(const entry of args.documentos){
  const d=entry?.documento;
  if(!d||d.requestId!==args.requestId||
     typeof d.anonId!=='string'||anonIds.has(d.anonId)||
     typeof d.messageHmac!=='string'||!hash.test(d.messageHmac)||
     sourceIds.has(d.messageHmac)||!Array.isArray(entry.correlaciones)||
     !(entry.terminos===null||typeof entry.terminos==='object')||
     !(entry.pruebasBolson===undefined||Array.isArray(entry.pruebasBolson)))
   return INVALID;
  anonIds.add(d.anonId);sourceIds.add(d.messageHmac);
  const status=adaptarDocumentoMvp162(
   args.pedido,d,entry.correlaciones,entry.terminos,
   entry.pruebasBolson??[]
  );
  statuses.push({
   presupuestoAnonimo:status.anonId,
   estado:status.estado,
   articulosSinCobertura:status.articulosSinCobertura,
   lineasNoAsignadas:status.lineasNoAsignadas,
   motivos:status.motivos
  });
  if(status.estado==='comparable'&&status.ofertaComparable!==null)
   confirmed.push(status.ofertaComparable);
 }
 // Reuse the existing commercial engine; it alone handles complete basket
 // allocations, freight, minimum orders, currency and payment conditions.
 let complete:ResultadoComparacion|null=null;
 try{
  // Validate even when zero quotes. Invalid user-request shapes fail closed.
  complete=compararCotizacionesOffline(args.pedido,confirmed);
 }catch{return INVALID}

 // Partial offers are NOT compared by total. This section compares unit
 // prices ONLY on the same requested item, quantity, unit, *explicit* IVA
 // rate, currency, payment and delivery terms. Freight/minimum purchase are
 // intentionally excluded and explicitly named in the response scope.
 // A technically plausible substitute is NOT an identical item.
 const byItem=new Map<string,Map<string,Comparable[]>>();
 for(const quote of confirmed){
  if(!quote.confirmada||quote.formaPago===null||
     quote.plazoEntregaDias===null)continue;
  for(const line of quote.items){
   if(line.equivalencia!=='verificada'||line.precioUnitarioNeto===null||
      line.ivaPorcentaje===null)continue;
   const cents=centavosFuenteMvp162(line.precioUnitarioNeto);
   if(cents===null)continue;
   const value:Comparable={anonId:quote.anonId,quote,line,cents};
   const keys=byItem.get(line.itemId)??new Map<string,Comparable[]>();
   const condition=sameConditions(value);
   keys.set(condition,[...(keys.get(condition)??[]),value]);
   byItem.set(line.itemId,keys);
  }
 }
 const comparable:UnitComparison[]=[];
 for(const requested of args.pedido.items){
  const groups=byItem.get(requested.id);
  if(!groups)continue;
  for(const group of groups.values()){
   if(group.length<2||group.some(x=>x.line.unidad!==requested.unidad||
    x.line.cantidadDisponible!==requested.cantidad&&
      // Adapter matches exact semantic quantity, but canonical notation
      // may differ: both cases were source corroborated by MVP162.
      !sameQuantity(x.line.cantidadDisponible,requested.cantidad)))
    continue;
   const cents=group.map(x=>x.cents);
   const minimum=cents.reduce((x,y)=>x<y?x:y);
   const maximum=cents.reduce((x,y)=>x>y?x:y);
   const first=group[0];
   comparable.push({
    articuloId:requested.id,unidad:requested.unidad,
    cantidadPedida:requested.cantidad,moneda:first.quote.moneda,
    ivaExplicito:first.line.ivaPorcentaje as IvaExplicito,
    pago:first.quote.formaPago as FormaPago,
    plazoEntregaDias:first.quote.plazoEntregaDias as number,
    referencias:group.map(x=>({
      presupuestoAnonimo:x.anonId,
      precioUnitarioNeto:formatCents(x.cents)
    })).sort((a,b)=>a.presupuestoAnonimo.localeCompare(b.presupuestoAnonimo)),
    precioUnitarioMinimoNeto:formatCents(minimum),
    precioUnitarioMaximoNeto:formatCents(maximum),
    alcance:'solo_precio_unitario_no_incluye_flete_ni_minimos',
    rankingGeneralPermitido:false
   });
  }
 }
 return {
  estado:'comparacion_privada_sin_publicacion',
  presupuestos:statuses,
  cantidadFuentesComparables:confirmed.length,
  articulosComparables:comparable,
  comparacionCanastaCompleta:complete,
  canPublish:false,canRevealContacts:false,
  canAdjudicate:false,canComparePartialTotals:false
 };
}
function sameQuantity(a:string,b:string):boolean{
 const pattern=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u;
 if(!pattern.test(a)||!pattern.test(b))return false;
 const milli=(s:string)=>{
  const [i,f='']=s.split('.');
  return BigInt(i)*1000n+BigInt(f.padEnd(3,'0')||'0');
 };
 return milli(a)===milli(b);
}

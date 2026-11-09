/**
 * MVP322 — preliminary source-backed line subtotals PER ANONYMOUS OFFER.
 * Consumes ONLY the existing buyer-token RPC (MVP227), once its reviewed
 * projection was accepted by vistaCotizacionesRubrosMvp227.
 * No supplier identifiers, source documents, contact data, winner, ranking
 * or approximation of taxes/freight/missing prices. Not a final quote total.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {vistaCotizacionesRubrosMvp227,type SalidaVistaMvp227} from './vista-comprador-rubros-mvp227.ts';

type Money='ARS'|'USD';
type Tax='incluido_explicito'|'sin_iva_explicito'|'no_informado';
type Freight='incluido_explicito'|'excluido_explicito'|'a_convenir'|'no_informado';
type Payment='contado'|'transferencia'|'credito'|'no_informado';
type Line=Readonly<{
 itemId:string;descripcion:string;rubro:RubroMvp216;
 cantidadSolicitada:string;unidadSolicitada:string;
 importeRenglonCentavos:string;
}>;
type Offer=Readonly<{
 label:string;moneda:Money;iva:Tax;flete:Freight;pago:Payment;
 articulos:readonly Line[];
 articulosConImporte:number;
 solicitadosAsignados:number;respondidosAsignados:number;
 precioDeMaterialesCentavos:string;
 cobertura:'parcial'|'completa_asignada';
}>;
export type PreliminarAnonimoMvp322=Readonly<{
 state:'preliminar_anonimo_verificado';
 ofertas:readonly Offer[];
 ranking_permitido:false;total_final:false;
 iva_calculado:false;flete_calculado:false;
 contactos_revelados:false;adjudicacion_automatica:false;
}>;
const isObj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const int=(x:unknown,max=200):x is number=>
 typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=max;
const id=/^item_[1-9][0-9]{0,2}$/u;
const cents=/^(?:0|[1-9][0-9]{0,16})$/u;
const amount=/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,3})?$/u;
const units=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const money=new Set(['ARS','USD']);
const vat=new Set(['incluido_explicito','sin_iva_explicito','no_informado']);
const freight=new Set(['incluido_explicito','excluido_explicito','a_convenir','no_informado']);
const payment=new Set(['contado','transferencia','credito','no_informado']);
const safeDescription=(x:unknown):x is string=>
 typeof x==='string'&&x.trim().length>0&&x.length<=500&&
 !/[\u0000-\u001f\u007f]/u.test(x);

/** Null means no preview, not permission to guess source values. */
export function preliminarAnonimoPresupuestosMvp322(
 raw:unknown,vista:SalidaVistaMvp227|null
):PreliminarAnonimoMvp322|null{
 if(!isObj(raw)||raw.state!=='rubros_por_articulo'||
    raw.ranking_global_permitido!==false||
    raw.adjudicacion_automatica!==false||
    raw.contactos_revelados!==false||
    !Array.isArray(raw.items)||raw.items.length<1||raw.items.length>200||
    !Array.isArray(raw.ofertas)||raw.ofertas.length<1||raw.ofertas.length>25||
    !vista||!int(raw.recibidos,25)||!int(raw.pendientes_revision,100)||
    vista.received_count!==raw.recibidos||
    vista.files_pending_review!==raw.pendientes_revision||
    !Array.isArray(vista.offers)||!Array.isArray(vista.rubros_ia))return null;
 // The caller cannot swap prices after validation: recompute the EXACT
 // public allowlist before deriving any new economic amount.
 const reread=vistaCotizacionesRubrosMvp227(raw);
 if(!reread||JSON.stringify(reread)!==JSON.stringify(vista))return null;
 const items=new Map<string,{
  descripcion:string;rubro:RubroMvp216;cantidad:string;unidad:string
 }>();
 for(const row of raw.items){
  if(!isObj(row)||typeof row.itemId!=='string'||!id.test(row.itemId)||
     items.has(row.itemId)||!safeDescription(row.descripcion)||
     typeof row.rubro!=='string'||!Object.hasOwn(RUBROS_MVP216,row.rubro)||
     typeof row.cantidad!=='string'||!amount.test(row.cantidad)||
     typeof row.unidad!=='string'||!units.has(row.unidad))return null;
  items.set(row.itemId,{
   descripcion:row.descripcion,rubro:row.rubro as RubroMvp216,
   cantidad:row.cantidad,unidad:row.unidad
  });
 }
 const verifiedLabels=new Set(vista.offers.map(x=>x.label));
 if(verifiedLabels.size!==vista.offers.length)return null;
 const foundLabels=new Set<string>(),seenTitles=new Set<string>();
 const out:Offer[]=[];
 for(const q of raw.ofertas){
  if(!isObj(q)||typeof q.label!=='string'||
     !/^Presupuesto [1-9][0-9]{0,2}$/u.test(q.label)||
     foundLabels.has(q.label)||!money.has(String(q.moneda))||
     !vat.has(String(q.iva))||!freight.has(String(q.flete))||
     !payment.has(String(q.pago))||
     !Array.isArray(q.rubros)||q.rubros.length<1||q.rubros.length>7||
     !Array.isArray(q.precios)||q.precios.length<1||q.precios.length>25)
   return null;
  foundLabels.add(q.label);
  let assigned=0,responded=0;
  const rubros=new Map<RubroMvp216,{solicitados:number;respondidos:number}>();
  for(const r of q.rubros){
   if(!isObj(r)||typeof r.rubro!=='string'||
      !Object.hasOwn(RUBROS_MVP216,r.rubro)||
      rubros.has(r.rubro as RubroMvp216)||
      !int(r.solicitados)||r.solicitados<1||
      !int(r.respondidos,r.solicitados as number)||
      r.cobertura!==(r.respondidos===r.solicitados?'completa':
       r.respondidos===0?'sin_cobertura':'parcial'))return null;
   const rubric=r.rubro as RubroMvp216;
   const totalInRubro=[...items.values()].filter(i=>i.rubro===rubric).length;
   if(r.solicitados>totalInRubro)return null;
   const header=q.label+' · '+RUBROS_MVP216[rubric];
   if(!verifiedLabels.has(header)||seenTitles.has(header))return null;
   seenTitles.add(header);
   rubros.set(rubric,{
    solicitados:r.solicitados as number,respondidos:r.respondidos as number
   });
   assigned+=r.solicitados as number;
   responded+=r.respondidos as number;
  }
  const seenLines=new Set<string>(),counts=new Map<RubroMvp216,number>();
  let total=0n;
  const lines:Line[]=[];
  for(const p of q.precios){
   if(!isObj(p)||typeof p.pedidoId!=='string'||
      seenLines.has(p.pedidoId)||!items.has(p.pedidoId)||
      typeof p.centavos!=='string'||!cents.test(p.centavos))
    return null;
   const item=items.get(p.pedidoId)!;
   if(!rubros.has(item.rubro)||
      // Source-checked line references MUST use the buyer's assigned unit.
      p.cantidad!==undefined&&p.cantidad!==item.cantidad||
      p.unidad!==undefined&&p.unidad!==item.unidad)return null;
   seenLines.add(p.pedidoId);
   counts.set(item.rubro,(counts.get(item.rubro)??0)+1);
   total+=BigInt(p.centavos);
   lines.push(Object.freeze({
    itemId:p.pedidoId,descripcion:item.descripcion,rubro:item.rubro,
    cantidadSolicitada:item.cantidad,unidadSolicitada:item.unidad,
    importeRenglonCentavos:p.centavos
   }));
  }
  if([...rubros].some(([r,v])=>(counts.get(r)??0)>v.respondidos)||
     lines.length>responded)return null;
  out.push(Object.freeze({
   label:q.label,moneda:q.moneda as Money,iva:q.iva as Tax,
   flete:q.flete as Freight,pago:q.pago as Payment,
   articulos:Object.freeze(lines),
   articulosConImporte:lines.length,
   solicitadosAsignados:assigned,respondidosAsignados:responded,
   precioDeMaterialesCentavos:total.toString(),
   cobertura:responded===assigned&&lines.length===assigned?
    'completa_asignada':'parcial'
  }));
 }
 if(seenTitles.size!==verifiedLabels.size||
    [...verifiedLabels].some(x=>!seenTitles.has(x)))return null;
 return Object.freeze({
  state:'preliminar_anonimo_verificado',
  ofertas:Object.freeze(out),
  ranking_permitido:false,total_final:false,iva_calculado:false,
  flete_calculado:false,contactos_revelados:false,
  adjudicacion_automatica:false
 });
}

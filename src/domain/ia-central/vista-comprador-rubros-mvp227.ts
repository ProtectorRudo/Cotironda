/** MVP227 — adaptador PRIVADO del RPC al seguimiento del comprador.
 * Sin proveedor/telefono/source HMAC, sin ranking global ni adjudicación.
 * Solo precios con verificación de origen que SQL autorizó por token.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
export type SalidaVistaMvp227=Readonly<{
 received_count:number;files_pending_review:number;
 offers:readonly Readonly<{label:string;text:string}>[];
 rubros_ia:readonly Readonly<{
  rubro:RubroMvp216;titulo:string;
  solicitados:number;ofertas:number
 }>[];
}>;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const itemId=/^item_[1-9][0-9]{0,2}$/u;
const safe=(v:unknown,max:number):v is string=>
 typeof v==='string'&&v.trim().length>0&&v.length<=max&&
 !/[\u0000-\u001f\u007f]/u.test(v);
const amt=/^[0-9]{1,17}$/u;
function displayCentavos(amount:string,moneda:'ARS'|'USD'):string{
 const cents=BigInt(amount);
 const integer=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu,'.');
 const fraction=(cents%100n).toString().padStart(2,'0');
 return (moneda==='ARS'?'$ ':'USD ')+integer+','+fraction;
}
export function vistaCotizacionesRubrosMvp227(input:unknown):
 SalidaVistaMvp227|null{
 if(!obj(input)||input.state!=='rubros_por_articulo'||
    !Array.isArray(input.items)||input.items.length<1||
    input.items.length>200||
    !Array.isArray(input.ofertas)||input.ofertas.length>25||
    typeof input.recibidos!=='number'||
    (typeof input.recibidos!=='number'||typeof input.recibidos!=='number'||!Number.isSafeInteger(input.recibidos))||
    (input.recibidos as number)<0||
    (input.recibidos as number)>25||
    typeof input.pendientes_revision!=='number'||
    (typeof input.pendientes_revision!=='number'||
      typeof input.pendientes_revision!=='number'||!Number.isSafeInteger(input.pendientes_revision))||
    (input.pendientes_revision as number)<0||
    (input.pendientes_revision as number)>100)
   return null;
 const seen=new Set<string>();
 const items=new Map<string,Readonly<{
  descripcion:string;rubro:RubroMvp216;cantidad:string;unidad:string
 }>>();
 for(const x of input.items){
  if(!obj(x)||typeof x.itemId!=='string'||!itemId.test(x.itemId)||
     seen.has(x.itemId)||!safe(x.descripcion,500)||
     !safe(x.cantidad,40)||!/^\d{1,8}(?:\.\d{1,3})?$/u.test(x.cantidad)||
     !safe(x.unidad,20)||
     !['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'].includes(x.unidad)||
     typeof x.rubro!=='string'||!Object.hasOwn(RUBROS_MVP216,x.rubro))
   return null;
  seen.add(x.itemId);
  items.set(x.itemId,{descripcion:x.descripcion,rubro:x.rubro as RubroMvp216,
   cantidad:x.cantidad,unidad:x.unidad});
 }
 const offers:SalidaVistaMvp227['offers'][number][]=[];
 const labels=new Set<string>();
 const byRubro=new Map<RubroMvp216,number>();
 for(const offer of input.ofertas){
  if(!obj(offer)||typeof offer.label!=='string'||
     !/^Presupuesto [1-9][0-9]{0,2}$/u.test(offer.label)||
     labels.has(offer.label)||!['ARS','USD'].includes(String(offer.moneda))||
     !['incluido_explicito','sin_iva_explicito','no_informado'].includes(String(offer.iva))||
     !['incluido_explicito','excluido_explicito','a_convenir','no_informado'].includes(String(offer.flete))||
     !['contado','transferencia','credito','no_informado'].includes(String(offer.pago))||
     !Array.isArray(offer.rubros)||offer.rubros.length>7||
     !Array.isArray(offer.precios)||offer.precios.length>25)return null;
  labels.add(offer.label);
  const price=new Map<string,string>();
  const quotedRubros=new Set<string>();
  for(const line of offer.precios){
   if(!obj(line)||typeof line.pedidoId!=='string'||
      !items.has(line.pedidoId)||price.has(line.pedidoId)||
      typeof line.centavos!=='string'||!amt.test(line.centavos))
    return null;
   price.set(line.pedidoId,line.centavos);
  }
  for(const r of offer.rubros){
   if(!obj(r)||typeof r.rubro!=='string'||
      !Object.hasOwn(RUBROS_MVP216,r.rubro)||
      typeof r.solicitados!=='number'||typeof r.respondidos!=='number'||
      typeof r.solicitados!=='number'||typeof r.solicitados!=='number'||!Number.isSafeInteger(r.solicitados)||
      typeof r.respondidos!=='number'||typeof r.respondidos!=='number'||!Number.isSafeInteger(r.respondidos)||
      (r.solicitados as number)<1||(r.respondidos as number)<0||
      (r.respondidos as number)>(r.solicitados as number)||
      !['completa','parcial','sin_cobertura'].includes(String(r.cobertura)))
    return null;
   const rubro=r.rubro as RubroMvp216;
   const nSolicitados=r.solicitados as number;
   const nRespondidos=r.respondidos as number;
   if(quotedRubros.has(rubro))return null;
   quotedRubros.add(rubro);
   byRubro.set(rubro,(byRubro.get(rubro)??0)+1);
   const corresponding=[...items].filter(([,v])=>v.rubro===rubro);
   // La lista general del comprador puede contener MÁS artículos que
   // los asignados a este negocio. Nunca inventar cobertura total.
   if(nSolicitados>corresponding.length)return null;
   if(nRespondidos>corresponding.length)return null;
   const details=corresponding.map(([id,v])=>
    v.descripcion+' ('+v.cantidad+' '+v.unidad+'): '+
    (price.has(id)?displayCentavos(price.get(id)!,offer.moneda as 'ARS'|'USD'):
      'Sin precio directamente comparable')).join('\n');
   const iva=offer.iva==='incluido_explicito'?'IVA incluido explícito':
    offer.iva==='sin_iva_explicito'?'Sin IVA explícito':'IVA no informado';
   const flete=offer.flete==='incluido_explicito'?'Flete incluido':
    offer.flete==='excluido_explicito'?'Flete no incluido':
    offer.flete==='a_convenir'?'Flete a convenir':'Flete no informado';
   offers.push({label:offer.label+' · '+RUBROS_MVP216[rubro],
    text:'Cotizó '+nRespondidos+' de '+nSolicitados+
     ' artículos asignados a este negocio ('+corresponding.length+
     ' solicitados en el rubro completo).\n'+
     details+'\n'+iva+' · '+flete+
     ' · Pago: '+offer.pago+'. Sin adjudicación automática.'});
  }
  // Una línea de precio no puede aparecer en un rubro que el negocio
  // no cotizó ni está acreditado por el reporte de la misma fuente.
  if([...price.keys()].some(id=>!quotedRubros.has(items.get(id)!.rubro)))
    return null;
 }
 const rubros=[...new Set([...items.values()].map(x=>x.rubro))]
   .map(rubro=>({rubro,titulo:RUBROS_MVP216[rubro],
    solicitados:[...items.values()].filter(x=>x.rubro===rubro).length,
    ofertas:byRubro.get(rubro)??0}));
 return {
  received_count:input.recibidos as number,
  files_pending_review:input.pendientes_revision as number,
  offers,rubros_ia:rubros
 };
}

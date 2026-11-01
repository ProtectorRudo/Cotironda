/**
 * MVP-038. Entirely OFFLINE, disposable browser-only rehearsal.
 * Real supplier selection, equivalence, identity, pricing, authorization,
 * WhatsApp and adjudication MUST NEVER depend on these synthetic fixtures.
 */
import {prepararPedidoTextoMvp028, type PedidoPilotoMvp028}
 from './pedido-piloto-mvp028.ts';
import {compararCotizacionesOffline,
 type OfertaComparable,type PedidoComparable,type IvaExplicito,
 type FormaPago,type ResultadoComparacion,type UnidadCotizada}
 from './comparacion-ofertas.ts';

export const EJEMPLO_PILOTO_MVP038=[
 '20 bolsas de Cemento CPC Loma Negra 50 kg',
 '5 unidades de Hidrófugo para mezcla',
 'Entrega en: La Plata'
].join('\n');
const UNITS=new Set<string>([
 'unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'
]);
const COST:Readonly<Record<string,string>>=Object.freeze({
 cemento_gris_obra:'9300',hidrofugo:'4900',pintura_latex:'8300',
 placa_yeso:'11000',cable_unipolar:'1750',cano_pvc:'7500'
});
export type CotizacionFicticiaMvp038={
 anonId:'anon_a'|'anon_b';presentada:boolean;
 lineas:{itemId:string;incluida:boolean;precioNeto:string;
   iva:IvaExplicito|''}[];
 flete:string;minimo:string;pago:FormaPago;plazoDias:string;
};
export type EscenarioPilotoMvp038=Readonly<{
 pedido:PedidoPilotoMvp028;
 solicitudesFicticias:2;
 whatsappEnviados:0;
 datosPersistidos:false;
 adjudicacionRealizada:false;
}>;
const fail=()=>{throw Error('mvp038_demo_invalida')};
export function crearEscenarioMvp038(texto:string,zona?:string|null):EscenarioPilotoMvp038{
 const pedido=prepararPedidoTextoMvp028(texto,zona);
 return Object.freeze({pedido,solicitudesFicticias:2,
   whatsappEnviados:0,datosPersistidos:false,adjudicacionRealizada:false});
}
export function propuestasFicticiasMvp038(pedido:PedidoPilotoMvp028):[
 CotizacionFicticiaMvp038,CotizacionFicticiaMvp038]{
 if(pedido.estado!=='listo_para_registrar'||pedido.items.length===0)fail();
 const lines=(id:'anon_a'|'anon_b')=>pedido.items.map((p,index)=>({
  itemId:p.product_code,incluida:id==='anon_a'||index===0,
  precioNeto:id==='anon_a'?COST[p.product_code]??'5000':
   String(Math.floor(Number(COST[p.product_code]??'5000')*0.94)),
  iva:'21' as const
 }));
 return [
  {anonId:'anon_a',presentada:true,lineas:lines('anon_a'),
    flete:'15000',minimo:'0',pago:'transferencia',plazoDias:'3'},
  {anonId:'anon_b',presentada:true,lineas:lines('anon_b'),
    flete:'9000',minimo:'0',pago:'transferencia',plazoDias:'3'}
 ];
}
export function dineroDemostrativoMvp038(valor:string):string|null{
 if(valor.trim()==='')return null;
 // No guessing thousands separators. Amounts in ARS, 2 decimal places max.
 if(!/^(?:0|[1-9][0-9]{0,8})(?:[.,][0-9]{1,2})?$/u.test(valor))fail();
 return valor.replace(',','.');
}
export function compararPilotoMvp038(
 pedido:PedidoPilotoMvp028,
 propuestas:readonly CotizacionFicticiaMvp038[]
):ResultadoComparacion{
 if(pedido.estado!=='listo_para_registrar'||pedido.items.length===0||
  !pedido.zonaEntrega||propuestas.length!==2||
  propuestas[0].anonId!=='anon_a'||propuestas[1].anonId!=='anon_b')fail();
 const ids=new Set<string>();
 const items:PedidoComparable['items'][number][]=[];
 for(const p of pedido.items){
  if(ids.has(p.product_code)||!UNITS.has(p.unit))fail();
  ids.add(p.product_code);
  items.push({id:p.product_code,cantidad:p.quantity,
    unidad:p.unit as UnidadCotizada});
 }
 const ofertas:OfertaComparable[]=propuestas.map(p=>{
  if(p.lineas.length!==items.length||
    !Number.isSafeInteger(Number(p.plazoDias))||
    !/^(?:0|[1-9][0-9]{0,2})$/u.test(p.plazoDias)||
    Number(p.plazoDias)>120)fail();
  if(new Set(p.lineas.map(l=>l.itemId)).size!==items.length||
    p.lineas.some((l,i)=>l.itemId!==items[i].id))fail();
  return {
   anonId:p.anonId,version:1,confirmada:p.presentada,
   moneda:'ARS',formaPago:p.pago,plazoEntregaDias:Number(p.plazoDias),
   fleteFinal:dineroDemostrativoMvp038(p.flete),
   minimoCompraFinal:dineroDemostrativoMvp038(p.minimo),
   items:p.lineas.filter(l=>l.incluida).map(l=>({
    itemId:l.itemId,unidad:items.find(x=>x.id===l.itemId)!.unidad,
    cantidadDisponible:items.find(x=>x.id===l.itemId)!.cantidad,
    // Only literal, identical materials for this SYNTHETIC scenario.
    // Real equivalence verification is an independent backend gate.
    equivalencia:'verificada' as const,
    precioUnitarioNeto:dineroDemostrativoMvp038(l.precioNeto),
    ivaPorcentaje:l.iva||null
   }))
  };
 });
 return compararCotizacionesOffline({items},ofertas);
}

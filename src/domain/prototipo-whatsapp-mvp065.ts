/**
 * MVP-065 — BROWSER-ONLY WhatsApp-first pilot rehearsal.
 * No provider identity, phone, API token, real price, backend or AI.
 * Verbatim supplier texts are always preserved. Never silently reconcile
 * line totals or treat incomplete quotes as comparable rankings.
 */
import {separarListaWhatsappNaturalMvp058}
 from './lista-whatsapp-natural-mvp058.ts';
import {prepararPedidoTextoMvp028}
 from './pedido-piloto-mvp028.ts';

export const MENSAJE_DEMO_MVP065=
 '20 bolsas de cemento CPC 50 kg, 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata.';
export type RolComercioMvp065='corralon_a'|'corralon_b'|'pintureria_c';
export type OfertaSimuladaMvp065=Readonly<{
 id:RolComercioMvp065;anonimo:'Proveedor A'|'Proveedor B'|'Proveedor C';
 rubro:'Corralón'|'Pinturería';
 productosPedido:readonly string[];
 productosCotizados:readonly string[];
 historial:readonly string[];
 plantillaOriginal:string;
}>;
export type EscenarioWhatsAppMvp065=Readonly<{
 pedido:ReturnType<typeof prepararPedidoTextoMvp028>;
 ofertas:readonly OfertaSimuladaMvp065[];
 personas:4;whatsappEnviados:0;datosGuardados:false;
}>;
const ARS=new Intl.NumberFormat('es-AR',{
 minimumFractionDigits:2,maximumFractionDigits:2
});
const fmt=(value:number)=>'$ '+ARS.format(value);
const familias={
 corralon_a:['cemento_gris_obra','hidrofugo'],
 corralon_b:['cemento_gris_obra','hidrofugo'],
 pintureria_c:['pintura_latex']
} as const;
const meta={
 corralon_a:{anonimo:'Proveedor A',rubro:'Corralón'},
 corralon_b:{anonimo:'Proveedor B',rubro:'Corralón'},
 pintureria_c:{anonimo:'Proveedor C',rubro:'Pinturería'}
} as const;
function deny():never{throw Error('mvp065_demo_invalida')}
const cantidad=(s:string)=>Number(s);
function linea(id:string,qty:string,unit:string,precio:number):string{
 const desc=({cemento_gris_obra:'cemento CPC 50 kg',
  hidrofugo:'hidrófugo para mezcla',
  pintura_latex:'pintura látex interior'} as Record<string,string>)[id]??id;
 const singular=unit==='bag'?'bolsas':unit==='l'?'litros':'unidades';
 return qty+' '+singular+' de '+desc+' x '+fmt(precio)+
  ' = '+fmt(cantidad(qty)*precio);
}
function plantilla(
 id:RolComercioMvp065,
 items:EscenarioWhatsAppMvp065['pedido']['items']
):string{
 const prices:Readonly<Record<string,number>>=id==='corralon_a'?
  {cemento_gris_obra:9500,hidrofugo:4200}:
  id==='corralon_b'?
   {cemento_gris_obra:9100,hidrofugo:4500}:
   {pintura_latex:12800};
 const scoped=items.filter(i=>Object.hasOwn(prices,i.product_code));
 const subtotal=scoped.reduce((n,i)=>
  n+cantidad(i.quantity)*prices[i.product_code as keyof typeof prices],0);
 const materials=scoped.map(i=>
  linea(i.product_code,i.quantity,i.unit,
   prices[i.product_code as keyof typeof prices]));
 if(id==='corralon_a'){
  return [
   'PRESUPUESTO PROVEEDOR A — Ejemplo ficticio',
   ...materials,
   '2 pallets vacíos x $ 7.000,00 = $ 14.000,00',
   '1 bolsón vacío x $ 3.500,00 = $ 3.500,00',
   'Flete a obra: $ 12.000,00',
   'Descuento comercial: -$ 3.000,00',
   'TOTAL FINAL: '+fmt(subtotal+14000+3500+12000-3000),
   'IVA: no informado. Condiciones a consultar.'
  ].join('\n');
 }
 if(id==='corralon_b'){
  return [
   'PRESUPUESTO PROVEEDOR B — Ejemplo ficticio',
   ...materials.slice(0,1),
   'Entrega: flete a convenir',
   'TOTAL DECLARADO: '+fmt(
    scoped.length>0?cantidad(scoped[0].quantity)*(prices[scoped[0].product_code]??0):0),
   'Observación: cotización parcial; IVA no aclarado.'
  ].join('\n');
 }
 return [
  'PRESUPUESTO PROVEEDOR C — Ejemplo ficticio',
  ...materials,
  'Flete: $ 0,00 (informado)',
  'TOTAL FINAL: '+fmt(subtotal),
  'IVA: no informado. Pago por transferencia.'
 ].join('\n');
}
export function crearPrototipoWhatsAppMvp065(
 texto:string,zona:string|null=null
):EscenarioWhatsAppMvp065{
 const pedido=prepararPedidoTextoMvp028(
  separarListaWhatsappNaturalMvp058(texto),zona);
 if(pedido.estado!=='listo_para_registrar'||pedido.items.length===0)deny();
 const ids=Object.keys(familias) as RolComercioMvp065[];
 const ofertas=ids.map(id=>{
  const products=pedido.items.filter(i=>
   familias[id].some(c=>c===i.product_code)).map(i=>i.product_code);
  if(products.length===0)return null;
  const original=plantilla(id,pedido.items);
  return Object.freeze({
   id,anonimo:meta[id].anonimo,rubro:meta[id].rubro,
   productosPedido:Object.freeze(products),
   productosCotizados:Object.freeze(id==='corralon_b'?products.slice(0,1):products),
   historial:Object.freeze([original]),
   plantillaOriginal:original
  });
 }).filter((x):x is NonNullable<typeof x>=>x!==null);
 if(ofertas.length===0)deny();
 return Object.freeze({
  pedido,ofertas:Object.freeze(ofertas),
  personas:4 as const,whatsappEnviados:0 as const,datosGuardados:false as const
 });
}
export function registrarCorreccionFicticiaMvp065(
 oferta:OfertaSimuladaMvp065,nuevoTexto:string
):OfertaSimuladaMvp065{
 if(!oferta||typeof nuevoTexto!=='string'||!nuevoTexto.trim()||
   nuevoTexto.length>12000||oferta.historial.length>=20)deny();
 // NEVER trim, normalize, merge or overwrite the provider's text.
 return Object.freeze({...oferta,
  historial:Object.freeze([...oferta.historial,nuevoTexto])
 });
}
const TOTAL_LINE=/^\s*(?:TOTAL(?:\s+(?:FINAL|GENERAL|DECLARADO|A\s+PAGAR))?|IMPORTE\s+TOTAL)\s*[:=-]?\s*(\$\s*[\d.,]+)\s*(?:ARS|pesos)?\s*$/iu;
const TOTAL_HEAD=/^\s*(?:TOTAL(?:\s|:|$)|IMPORTE\s+TOTAL\b)/iu;
export function resumenFuenteFielMvp065(
 texto:string
):Readonly<{lineas:readonly string[];
 totalLiteral:string|null;revisionTotal:boolean}>{
 if(typeof texto!=='string'||texto.length>12000)deny();
 const lines=texto.split(/\r\n|\n|\r/u);
 let invalid=false;
 const candidates:string[]=[];
 for(const s of lines){
  if(!TOTAL_HEAD.test(s))continue;
  const found=s.match(TOTAL_LINE);
  if(!found){invalid=true;continue}
  candidates.push(found[1]);
 }
 return Object.freeze({
  lineas:Object.freeze(lines),totalLiteral:!invalid&&candidates.length===1?
   candidates[0]:null,
  revisionTotal:invalid||candidates.length>1
 });
}
export function evaluarCoberturaMvp065(
 escenario:EscenarioWhatsAppMvp065,
 ofertas:readonly OfertaSimuladaMvp065[]
):Readonly<{
 cubiertos:readonly string[];
 sinProveedor:readonly string[];
 invitaciones:number;
 posiblesCoberturasConDos:readonly string[];
 comparacionEconomica:'no_verificable_sin_iva_y_cargos';
}>{
 const pedido=escenario.pedido.items.map(i=>i.product_code);
 const valid=ofertas.filter(o=>o.historial.at(-1)===o.plantillaOriginal);
 const covered=new Set(valid.flatMap(o=>[...o.productosCotizados]));
 const full=pedido.filter(k=>covered.has(k));
 const missing=pedido.filter(k=>!covered.has(k));
 const combos:string[]=[];
 for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
  const both=new Set([...valid[i].productosCotizados,...valid[j].productosCotizados]);
  if(pedido.every(id=>both.has(id)))
   combos.push(valid[i].anonimo+' + '+valid[j].anonimo);
 }
 return Object.freeze({
  cubiertos:Object.freeze(full),sinProveedor:Object.freeze(missing),
  invitaciones:ofertas.length,
  posiblesCoberturasConDos:Object.freeze(combos),
  comparacionEconomica:'no_verificable_sin_iva_y_cargos'
 });
}

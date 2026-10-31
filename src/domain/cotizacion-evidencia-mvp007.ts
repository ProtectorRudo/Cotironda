/**
 * MVP-007 — adaptador de presupuesto entrante a D046 (SOLO OFFLINE).
 * Precio original y citas son PROPUESTAS. Nunca se registran como oferta
 * confirmada ni equivalencia técnica; D046 exige confirmación del proveedor.
 * No API/DB/Whapi/IA. No calcular IVA desde una frase ambigua o una tasa
 * adivinada. Los importes brutos convertidos deben recomponer centavo exacto.
 */
import {
  leerCondicionesPresupuesto,
  type EstadoIva, type EstadoFlete
} from './lectura-condiciones-documentales-mvp006.ts';
import type {ExigenciaIva} from './condiciones-comprador-mvp006.ts';
import type {FormaPago,UnidadCotizada,IvaExplicito,MonedaCotizada} from './comparacion-ofertas.ts';

type Evidencia=Readonly<{linea:number;cita:string}>;
type LineaCandidata=Readonly<{
  itemId:string;
  unidad:UnidadCotizada;
  cantidadDisponible:string;
  precioInformado:string|null;
  evidenciaPrecio:Evidencia|null;
}>;
export type CotizacionFuenteMvp007=Readonly<{
  textoFuente:string;
  moneda:MonedaCotizada;
  formaPago:FormaPago|null;
  plazoEntregaDias:number|null;
  minimoCompraFinal:string|null;
  fleteInformado:string|null;
  evidenciaFlete:Evidencia|null;
  items:readonly LineaCandidata[];
  condicionIvaComprador:ExigenciaIva;
}>;
type PropuestaLineaD046=Readonly<{
 itemId:string;unidad:UnidadCotizada;cantidadDisponible:string;
 precioUnitarioNeto:string|null;ivaPorcentaje:IvaExplicito|null;
}>;
export type PropuestaCotizacionD046=Readonly<{
 moneda:MonedaCotizada;formaPago:FormaPago|null;plazoEntregaDias:number|null;
 fleteFinal:string|null;minimoCompraFinal:string|null;
 items:readonly PropuestaLineaD046[];
}>;
export type PreparacionCotizacionMvp007=Readonly<{
 estado:'propuesta_para_borrador_d046_sin_confirmar';
 propuesta:PropuestaCotizacionD046;
 condiciones:Readonly<{iva:EstadoIva;flete:EstadoFlete;comprador:ExigenciaIva}>;
 fuentes:Readonly<{lineasIva:readonly number[];lineasFlete:readonly number[];
   lineasPrecioVerificadas:readonly number[];
   preciosVerificados:readonly Readonly<{itemId:string;linea:number;precioOriginal:string}>[]}>;
 pendientes:readonly string[];
 proveedorConfirmo:false;
 comparableSinConfirmacion:false;
 mensajesWhatsapp:0;
}>;

const MONTO=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/u;
const ITEM=/^[a-z][a-z0-9_]{2,49}$/u;
const UNIDADES=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const FORMAS=new Set(['contado','transferencia','cuenta_corriente_30_dias']);
const IVA=new Set<IvaExplicito>(['0','10.5','21']);
const max=100000000000n;
const money=(cent:bigint)=>String(cent/100n)+'.'+String(cent%100n).padStart(2,'0');
const rounded=(num:bigint,den:bigint)=>(num+den/2n)/den;
function fail():never{throw new TypeError('mvp007_entrada_invalida')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,fields:readonly string[]):boolean{
 return obj(v)&&Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k));
}
function centavos(v:string):bigint{
 if(!MONTO.test(v))fail();
 const [i,f='']=v.split('.');
 const c=BigInt(i)*100n+BigInt(f.padEnd(2,'0')||'0');
 if(c>max)fail();
 return c;
}
/** Formatos argentinos seguros: 12100,00 | 12.100,00 | 12100.00 | 12.100 | 12100 */
function parseMontoFuente(s:string):bigint|null{
 let v=s;
 if(/^(?:0|[1-9]\d{0,2})(?:\.\d{3})+(?:,\d{1,2})?$/u.test(v)){
   v=v.replace(/\./gu,'').replace(',','.');
 }else if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(v)){
   v=v.replace(',','.');
 }else return null;
 if(!MONTO.test(v))return null;
 return centavos(v);
}
/** A quote must be a literal substring of the corresponding original line. */
function citar(lines:readonly string[],v:Evidencia|null):string|null{
 if(v===null||!exact(v,['linea','cita'])||!Number.isSafeInteger(v.linea)||
    v.linea<1||v.linea>lines.length||typeof v.cita!=='string'||
    v.cita.length<5||v.cita.length>240||/[^\S \t]/u.test(v.cita))return null;
 const original=lines[v.linea-1].trim();
 return original.length<=450&&original.includes(v.cita)?v.cita:null;
}
function precioEnCita(cita:string|null):bigint|null{
 if(cita===null)return null;
 // Only an explicitly marked currency amount is admitted; bare numeric
 // quantities, package weight and percentages must not become prices.
 const re=/\$\s*(\d[\d.,]{0,18})(?![\d.,])/gu;
 const values=[...cita.matchAll(re)];
 if(values.length!==1)return null;
 return parseMontoFuente(values[0][1]);
}
function tasaExpresa(evidencias:readonly Readonly<{linea:number;cita:string}>[]):IvaExplicito|null{
 const tasas=new Set<IvaExplicito>();
 for(const e of evidencias){
   const normalized=e.cita.replace(/,/gu,'.');
   const m=[...normalized.matchAll(/\b(0|10\.5|21)\s*%/gu)];
   for(const match of m){if(IVA.has(match[1] as IvaExplicito))tasas.add(match[1] as IvaExplicito);}
 }
 return tasas.size===1?[...tasas][0]:null;
}
const basicos=['textoFuente','moneda','formaPago','plazoEntregaDias',
 'minimoCompraFinal','fleteInformado','evidenciaFlete','items','condicionIvaComprador'];
const camposLinea=['itemId','unidad','cantidadDisponible','precioInformado','evidenciaPrecio'];
/** Does NOT call D046: the trusted broker must validate identity/ledger. */
export function prepararPropuestaEconomicaMvp007(raw:CotizacionFuenteMvp007):PreparacionCotizacionMvp007{
 if(!exact(raw,basicos)||typeof raw.textoFuente!=='string'||raw.textoFuente.length>18000||
   !['ARS','USD'].includes(raw.moneda)||
   !(raw.formaPago===null||FORMAS.has(raw.formaPago))||
   !(raw.plazoEntregaDias===null||
     Number.isSafeInteger(raw.plazoEntregaDias)&&raw.plazoEntregaDias>=0&&raw.plazoEntregaDias<=120)||
   !(raw.minimoCompraFinal===null||typeof raw.minimoCompraFinal==='string')||
   !(raw.fleteInformado===null||typeof raw.fleteInformado==='string')||
   !['con_iva','sin_iva','no_especificado','contradictorio'].includes(raw.condicionIvaComprador)||
   !Array.isArray(raw.items)||raw.items.length<1||raw.items.length>8)fail();
 const lines=raw.textoFuente.split(/\r\n|\n|\r/u);
 const obs=leerCondicionesPresupuesto(raw.textoFuente);
 if(raw.minimoCompraFinal!==null)centavos(raw.minimoCompraFinal);
 if(raw.fleteInformado!==null)centavos(raw.fleteInformado);
 const rate=tasaExpresa(obs.iva.evidencias);
 const pendientes:string[]=[];
 const priceProofs:number[]=[];
 const preciosVerificados:{itemId:string;linea:number;precioOriginal:string}[]=[];
 const ivaCompatible=raw.condicionIvaComprador!=='contradictorio'&&
   !(raw.condicionIvaComprador==='con_iva'&&obs.iva.estado!=='incluido')&&
   !(raw.condicionIvaComprador==='sin_iva'&&obs.iva.estado!=='no_incluido');
 if(!ivaCompatible)pendientes.push('condicion_iva_comprador_sin_cumplir_o_ambigua');
 const seen=new Set<string>();
 const items:PropuestaLineaD046[]=raw.items.map(item=>{
  if(!exact(item,camposLinea)||typeof item.itemId!=='string'||!ITEM.test(item.itemId)||
    seen.has(item.itemId)||!UNIDADES.has(item.unidad)||
    typeof item.cantidadDisponible!=='string'||!MONTO.test(item.cantidadDisponible)||
    centavos(item.cantidadDisponible)===0n||
    !(item.precioInformado===null||typeof item.precioInformado==='string'))fail();
  seen.add(item.itemId);
  const original=item.precioInformado===null?null:centavos(item.precioInformado);
  const cita=citar(lines,item.evidenciaPrecio);
  const encontrado=precioEnCita(cita);
  let neto:string|null=null,iva:IvaExplicito|null=null;
  if(original!==null&&encontrado!==null&&encontrado===original&&ivaCompatible){
    priceProofs.push(item.evidenciaPrecio!.linea);
    preciosVerificados.push(Object.freeze({itemId:item.itemId,
     linea:item.evidenciaPrecio!.linea,precioOriginal:money(original)}));
    if(obs.iva.estado==='no_incluido'){
      neto=money(original);
      iva=rate;
    }else if(obs.iva.estado==='incluido'&&rate!==null){
      const tasas:{[K in IvaExplicito]:bigint}={'0':0n,'10.5':1050n,'21':2100n};
      const basis=tasas[rate];
      const net=rounded(original*10000n,10000n+basis);
      // For unrepresentable cents: NEVER quietly lose/gain a cent.
      if(net+rounded(net*basis,10000n)===original){
       neto=money(net);iva=rate;
      }else pendientes.push('recomposicion_de_iva_no_exacta_'+item.itemId);
    }
  }
  if(neto===null)pendientes.push('precio_base_o_iva_sin_evidencia_'+item.itemId);
  else if(iva===null)pendientes.push('alicuota_iva_no_informada_'+item.itemId);
  return Object.freeze({itemId:item.itemId,unidad:item.unidad,
    cantidadDisponible:item.cantidadDisponible,precioUnitarioNeto:neto,ivaPorcentaje:iva});
 });
 let flete:string|null=null;
 if(obs.flete.estado==='sin_cargo'||obs.flete.estado==='incluido'){
   flete='0.00'; // no charge ADDITIONAL; freight was explicitly declared.
 }else if(obs.flete.estado==='adicional'&&raw.fleteInformado!==null){
   const parsed=precioEnCita(citar(lines,raw.evidenciaFlete));
   const declared=centavos(raw.fleteInformado);
   // Explicit note "flete aparte / adicional" must be on quoted line.
   if(parsed!==null&&parsed===declared&&
     /(?:flete|env[ií]o|transporte)/iu.test(raw.evidenciaFlete!.cita)){
     flete=money(declared);
   }
 }
 if(flete===null)pendientes.push('flete_no_aclarado_o_sin_monto');
 if(raw.minimoCompraFinal===null)pendientes.push('minimo_de_compra_no_informado');
 if(raw.formaPago===null)pendientes.push('forma_de_pago_no_informada');
 if(raw.plazoEntregaDias===null)pendientes.push('plazo_entrega_no_informado');
 const propuesta:PropuestaCotizacionD046=Object.freeze({
   moneda:raw.moneda,formaPago:raw.formaPago,
   plazoEntregaDias:raw.plazoEntregaDias,
   minimoCompraFinal:raw.minimoCompraFinal,
   fleteFinal:flete,items:Object.freeze(items)
 });
 return Object.freeze({
   estado:'propuesta_para_borrador_d046_sin_confirmar',propuesta,
   condiciones:Object.freeze({iva:obs.iva.estado,flete:obs.flete.estado,
     comprador:raw.condicionIvaComprador}),
   fuentes:Object.freeze({
     lineasIva:Object.freeze(obs.iva.evidencias.map(x=>x.linea)),
     lineasFlete:Object.freeze(obs.flete.evidencias.map(x=>x.linea)),
     lineasPrecioVerificadas:Object.freeze(priceProofs),
     preciosVerificados:Object.freeze(preciosVerificados)}),
   pendientes:Object.freeze(pendientes),
   proveedorConfirmo:false,comparableSinConfirmacion:false,mensajesWhatsapp:0
 });
}

/**
 * MVP-013: zero-cost, deterministic interpreter for a deliberately SMALL
 * subset of supplier text quotes. Not a replacement for OpenAI + documents.
 *
 * Requires explicit available quantity + recognized unit + distinctive
 * material name + ONE currency-marked unit price on the SAME source line.
 * Never assumes supplier covers the round's quantities, net/IVA or freight.
 * Ambiguous price or multiple candidates for a line => no offer for that line.
 *
 * Input is the already-decrypted and authenticated D028 inbox; roundItems
 * must come ONLY from D061 private DB snapshot.
 */
import type {InterpreteCotizacionD061} from './whapi-quote-inbox-processor-d061.ts';
import type {CotizacionFuenteMvp007} from '../domain/cotizacion-evidencia-mvp007.ts';

const names:Readonly<Record<string,readonly string[]>>={
 bag:['bolsa','bolsas','saco','sacos'],
 unit:['unidad','unidades','u'],
 box:['caja','cajas'],
 kg:['kg','kilo','kilos'],
 g:['g','gramo','gramos'],
 l:['l','litro','litros'],
 ml:['ml','mililitro','mililitros'],
 m:['m','metro','metros'],
 m2:['m2','metro2','metros2'],
 m3:['m3','metro3','metros3'],
 roll:['rollo','rollos'],
 pack:['pack','packs','paquete','paquetes']
};
const roundCode=/^[a-z][a-z0-9_]{2,49}$/u;
const words=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .toLowerCase().match(/[a-z]{3,}/gu)??[];
function parseAmount(v:string):string|null{
 let a=v;
 // Explicitly disallow "12.100" without a fractional marker: 12.1 or 12100?
 if(/^\d{1,3}(?:\.\d{3})+,\d{2}$/u.test(a))
  a=a.replace(/\./gu,'').replace(',','.');
 else if(/^(0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(a))
  a=a.replace(',','.');
 else return null;
 const [integer,fraction='']=a.split('.');
 const n=BigInt(integer);
 if(n>999999999n)return null;
 return n.toString()+'.'+fraction.padEnd(2,'0');
}
function validQuantity(q:string):string|null{
 if(!/^[1-9]\d{0,5}(?:[.,]\d{1,2})?$/u.test(q))return null;
 return q.replace(',','.');
}
export const interpretarCotizacionSimpleD063:InterpreteCotizacionD061=
 async (text,items):Promise<CotizacionFuenteMvp007|null>=>{
  if(typeof text!=='string'||text.length>3000||text.length<5||
    !Array.isArray(items)||items.length<1||items.length>8||
    /\b(?:usd|dolares|dólares)\b|u\$s/iu.test(text))return null;
  const lines=text.split(/\r\n|\n|\r/u);
  if(lines.length>160)return null;
  const selected=new Map<string,{
   itemId:string;unidad:CotizacionFuenteMvp007['items'][number]['unidad'];
   cantidadDisponible:string;precioInformado:string;
   evidenciaPrecio:{linea:number;cita:string};
  }>();
  const ambiguous=new Set<string>();
  for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();
   if(line.length<10||line.length>240)continue;
   // The whole line has exactly one price with $ and an explicit quantity.
   const prices=[...line.matchAll(/\$\s*([0-9][0-9.,]{0,17})/gu)];
   if(prices.length!==1)continue;
   const price=parseAmount(prices[0][1]);
   if(price===null)continue;
   const qtyLine=line.slice(0,prices[0].index);
   const head=qtyLine.match(/^\s*([1-9]\d{0,5}(?:[.,]\d{1,2})?)\s+([\p{L}\d]+)\s+(.+)$/u);
   if(!head)continue;
   const qty=validQuantity(head[1]);
   if(!qty)continue;
   const unit=head[2].toLowerCase();
   const contents=new Set(words(head[3]));
   // Reject any candidate that matches more than one material (or none).
   const candidates=items.filter(it=>{
    if(!it||typeof it.itemId!=='string'||!roundCode.test(it.itemId)||
       typeof it.unit!=='string'||!names[it.unit]?.includes(unit))return false;
    const tokens=it.itemId.split('_').filter(w=>
      /^[a-z]{4,}$/u.test(w)&&!['item','producto','material','generico'].includes(w));
    return tokens.some(w=>contents.has(w));
   });
   // With multiple cement products, a generic token is insufficient.
   // A brand/product-specific token may disambiguate, but cannot infer it.
   const discriminated=candidates.length<=1?candidates:candidates.filter(it=>
    it.itemId.split('_').some(token=>contents.has(token)&&
      !items.some(other=>other.itemId!==it.itemId&&
        other.itemId.split('_').includes(token))));
   if(discriminated.length!==1)continue;
   const it=discriminated[0];
   if(ambiguous.has(it.itemId))continue;
   if(selected.has(it.itemId)){
    selected.delete(it.itemId);ambiguous.add(it.itemId);
    continue;
   }
   selected.set(it.itemId,{
    itemId:it.itemId,
    unidad:it.unit as CotizacionFuenteMvp007['items'][number]['unidad'],
    cantidadDisponible:qty,
    precioInformado:price,
    evidenciaPrecio:{linea:i+1,cita:line}
   });
  }
  if(!selected.size)return null;
  return {
   textoFuente:text,moneda:'ARS',formaPago:null,plazoEntregaDias:null,
   minimoCompraFinal:null,fleteInformado:null,evidenciaFlete:null,
   condicionIvaComprador:'no_especificado',items:[...selected.values()]
  };
 };

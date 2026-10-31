/**
 * MVP-014: an authenticated buyer sees REAL quotes for ONE of their rounds.
 * Never ranks uncomparable offers, infers VAT/freight, or reveals supplier IDs.
 * D025 authenticates current JWT session and buyer membership in SQL.
 * D060 returns only latest version by anonymous supplier alias.
 */
import {procesarLecturaRonda,rondasLecturaHabilitada,
 type DependenciasLecturaRonda,type ResumenRonda} from './rondas-lectura-http.ts';

export type PrecioRecibidoMvp014=Readonly<{
 supplier_alias:string;offer_version:number;line_no:number;
 quoted_unit_price:string|null;
 vat_basis:'incluido'|'no_incluido'|'no_informado'|'contradictorio';
 currency:'ARS'|'USD';quoted_unit:string;
 available_qty:string;freight_gross:string|null;
 payment_method:'contado'|'transferencia'|'cuenta_corriente_30_dias'|null;
 lead_days:number|null;
}>;
export type DependenciasOfertasMvp014=DependenciasLecturaRonda&{
 leerOfertas:(roundId:string)=>Promise<unknown>;
};
const ALIAS=/^anon_[a-z0-9_]{3,48}$/u;
const AMOUNT=/^(?:0|[1-9][0-9]{0,14})\.[0-9]{2}$/u;
const QTY=/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,3})?$/u;
const VAT=new Set(['incluido','no_incluido','no_informado','contradictorio']);
const UNITS=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const PAYMENT=new Set(['contado','transferencia','cuenta_corriente_30_dias']);
const FIELDS=['supplier_alias','offer_version','line_no','quoted_unit_price',
 'vat_basis','currency','quoted_unit','available_qty','freight_gross',
 'payment_method','lead_days'];
const HDR={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'vary':'Cookie, Authorization','x-content-type-options':'nosniff'};
function response(status:number,obj:Record<string,unknown>):Response{
 return new Response(JSON.stringify(obj),{status,headers:HDR});
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
}
function validOffers(value:unknown,round:ResumenRonda):value is PrecioRecibidoMvp014[]{
 if(!Array.isArray(value)||value.length>400)return false;
 const roundLines=new Set(round.items.map(x=>x.line_no));
 const aliases=new Map<string,string>();
 const rows=new Set<string>();
 for(const row of value){
  if(!exact(row,FIELDS)||
    typeof row.supplier_alias!=='string'||!ALIAS.test(row.supplier_alias)||
    typeof row.offer_version!=='number'||
    !Number.isSafeInteger(row.offer_version)||row.offer_version<1||
    row.offer_version>100000||
    typeof row.line_no!=='number'||!roundLines.has(row.line_no)||
    !VAT.has(String(row.vat_basis))||
    !['ARS','USD'].includes(String(row.currency))||
    !UNITS.has(String(row.quoted_unit))||
    typeof row.available_qty!=='string'||!QTY.test(row.available_qty)||
    !(row.quoted_unit_price===null||
      typeof row.quoted_unit_price==='string'&&AMOUNT.test(row.quoted_unit_price))||
    !(row.freight_gross===null||
      typeof row.freight_gross==='string'&&AMOUNT.test(row.freight_gross))||
    !(row.payment_method===null||PAYMENT.has(String(row.payment_method)))||
    !(row.lead_days===null||
      typeof row.lead_days==='number'&&Number.isSafeInteger(row.lead_days)&&
      row.lead_days>=0&&row.lead_days<=365)
  )return false;
  // Never show inconsistent repeated data or a mixed-version supplier
  // as if it were a coherent quote.
  const conditions=JSON.stringify([row.offer_version,row.currency,
    row.freight_gross,row.payment_method,row.lead_days]);
  if(aliases.has(row.supplier_alias)&&aliases.get(row.supplier_alias)!==conditions)
    return false;
  aliases.set(row.supplier_alias,conditions);
  const unique=row.supplier_alias+':'+row.line_no;
  if(rows.has(unique))return false;
  rows.add(unique);
 }
 return true;
}
export function ofertasLecturaHabilitada(env:Record<string,string|undefined>):boolean{
 return rondasLecturaHabilitada(env)&&env.COTIRONDA_QUOTES_READ_ENABLED==='true';
}
export async function procesarLecturaOfertasMvp014(
 request:Request,roundId:string,deps:DependenciasOfertasMvp014
):Promise<Response>{
 const first=await procesarLecturaRonda(request,roundId,deps);
 if(first.status!==200)return first;
 let round:ResumenRonda;
 try{const data:unknown=await first.json();
  if(!data||typeof data!=='object'||!('ronda' in data))throw Error('invalid');
  round=(data as {ronda:ResumenRonda}).ronda;
 }catch{return response(503,{error:'ofertas_no_disponibles'});}
 try{
  const rows=await deps.leerOfertas(roundId);
  if(!validOffers(rows,round))return response(503,{error:'ofertas_no_disponibles'});
  return response(200,{ronda:round,ofertas:rows});
 }catch{
  return response(503,{error:'ofertas_no_disponibles'});
 }
}

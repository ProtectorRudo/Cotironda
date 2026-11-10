/**
 * MVP180 — Only anonymous counts of audited source conditions.
 * Input is a service-role-only RPC result tied to the SAME buyer bearer
 * as MVP091. This is never a ranking, an economic estimate or a price.
 */
export type ResumenEconomiaCompradorMvp180=Readonly<{
 state:'economia_observada_sin_ranking';
 quotations:number;
 iva_not_informed:number;
 freight_not_informed:number;
 freight_to_agree:number;
 stock_unverified:number;
 payment_not_informed:number;
 net_unverified:number;
 delivery_unverified:number;
 minimum_unverified:number;
 ranking_allowed:false;
 price_comparable:false;
 contacts_revealed:false;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);
const count=(x:unknown,max:number)=>Number.isSafeInteger(x)&&
 typeof x==='number'&&x>=0&&x<=max;
const counters=['iva_not_informed','freight_not_informed',
 'freight_to_agree','stock_unverified','payment_not_informed',
 'net_unverified','delivery_unverified','minimum_unverified'] as const;
type Tracking=Readonly<{state?:unknown;can_open?:unknown;offers?:unknown}>;

/** Null means "do not reveal ANY economic summary" (never coerce to 0). */
export function resumirEconomiaCompradorMvp180(
 tracking:Tracking|null,source:unknown
):ResumenEconomiaCompradorMvp180|null{
 if(!tracking||tracking.can_open!==true||
   !['waiting','closed'].includes(String(tracking.state))||
   !Array.isArray(tracking.offers)||
   !tracking.offers.length||tracking.offers.length>100||
   !obj(source)||source.state!=='economia_observada_sin_ranking'||
   source.ranking_allowed!==false||
   source.price_comparable!==false||
   source.contacts_revealed!==false||
   !count(source.quotations,100)||
   source.quotations!==tracking.offers.length)return null;
 const max=source.quotations as number;
 if(!counters.every(k=>count(source[k],max))||
   (source.freight_not_informed as number)+
   (source.freight_to_agree as number)>max)return null;
 // Allowlist: no provider identity, source hash, unit price, tax rate,
 // raw original, access token or arbitrary DB fields can be returned.
 return Object.freeze({
  state:'economia_observada_sin_ranking' as const,
  quotations:max,
  iva_not_informed:source.iva_not_informed as number,
  freight_not_informed:source.freight_not_informed as number,
  freight_to_agree:source.freight_to_agree as number,
  stock_unverified:source.stock_unverified as number,
  payment_not_informed:source.payment_not_informed as number,
  net_unverified:source.net_unverified as number,
  delivery_unverified:source.delivery_unverified as number,
  minimum_unverified:source.minimum_unverified as number,
  ranking_allowed:false as const,
  price_comparable:false as const,
  contacts_revealed:false as const
 });
}
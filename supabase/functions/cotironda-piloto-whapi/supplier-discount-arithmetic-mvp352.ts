/**
 * MVP352 — a read-only, EXACT diagnostic for a separately documented
 * percentage discount on a supplier's UNIT LIST PRICE.
 *
 * This is a consistency check, NOT permission to rewrite supplier fields,
 * associate a request, approve VAT/freight, or publish an anonymous offer.
 * The original PDF still requires independent full-source verification.
 */
import {pistaIdentidadMaterialMvp352} from './supplier-material-identity-hint-mvp352.ts';

export type SupplierDiscountResultMvp352=Readonly<{
 state:'consistent'|'inconsistent'|'not_evaluable';
 explanation:string;
 inferred_effective_unit_price:string|null;
 checked_extended_total:string|null;
 source_verified:false;publication_allowed:false;
}>;

const outcome=(state:SupplierDiscountResultMvp352['state'],explanation:string,
 effective:bigint|null=null,extended:bigint|null=null):SupplierDiscountResultMvp352=>
 Object.freeze({
  state,explanation,
  inferred_effective_unit_price:effective===null?null:formatCents(effective),
  checked_extended_total:extended===null?null:formatCents(extended),
  source_verified:false,publication_allowed:false
 });

function parseCents(raw:string|null):bigint|null{
 if(typeof raw!=='string'||raw.length>60)return null;
 let s=raw.trim();
 if(!s.startsWith('$'))return null;
 s=s.slice(1).trim();
 if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(s))
  s=s.replace(',','.');
 else if(/^[1-9]\d{0,2}(?:\.\d{3})+,(?:\d{1,2})$/u.test(s))
  s=s.replace(/\./gu,'').replace(',','.');
 else if(/^[1-9]\d{0,2}(?:,\d{3})+\.(?:\d{1,2})$/u.test(s))
  s=s.replace(/,/gu,'');
 else return null;
 const [units,fraction='']=s.split('.');
 const cents=BigInt(units)*100n+BigInt(fraction.padEnd(2,'0'));
 return cents>0n&&cents<100000000000n?cents:null;
}
function milliQuantity(raw:string|null):bigint|null{
 if(typeof raw!=='string'||!/^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,3})?$/u.test(raw.trim()))
  return null;
 const [whole,dec='']=raw.trim().replace(',','.').split('.');
 const n=BigInt(whole)*1000n+BigInt(dec.padEnd(3,'0'));
 return n>0n&&n<=10000000000n?n:null;
}
function formatCents(value:bigint):string{
 return '$'+String(value/100n)+'.'+String(value%100n).padStart(2,'0');
}
function discountMilliPercent(description:string):bigint|null{
 if(pistaIdentidadMaterialMvp352(description)===null)return null;
 const tail=description.slice(description.lastIndexOf(';')+1).trim();
 const match=tail.match(
  /^(?:dscto\.?|dcto\.?|dto\.?|descuento|bonif\.?|bonificaci[oó]n)\s*:?[ \t]*(\d{1,3}(?:[.,]\d{1,3})?)[ \t]*%$/iu
 );
 if(!match)return null;
 const [whole,fraction=''] = match[1].replace(',','.').split('.');
 const n=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
 return n>=0n&&n<=100000n?n:null;
}
/**
 * First discount the UNIT, round unit to cents (commercial convention),
 * THEN multiply by quantity and round extended price to cents.
 * Never silently accept the alternative "discount extended total" method.
 */
export function comprobarDescuentoUnitarioMvp352(args:{
 original_description:string;quantity:string|null;
 unit_price:string|null;line_total:string|null;
}):SupplierDiscountResultMvp352{
 if(!args||typeof args.original_description!=='string')
  return outcome('not_evaluable','invalid_source_fields');
 const discount=discountMilliPercent(args.original_description);
 const list=parseCents(args.unit_price),q=milliQuantity(args.quantity);
 const declared=parseCents(args.line_total);
 if(discount===null||list===null||q===null||declared===null)
  return outcome('not_evaluable','missing_explicit_discount_or_price');
 const effective=(list*(100000n-discount)+50000n)/100000n;
 const extended=(effective*q+500n)/1000n;
 if(effective<=0n||extended<=0n)
  return outcome('not_evaluable','nonpositive_after_discount');
 return outcome(
  extended===declared?'consistent':'inconsistent',
  extended===declared?'unit_discount_rounded_then_extended':'line_total_differs_from_discount',
  effective,extended
 );
}

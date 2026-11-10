/**
 * Cotironda V2 B5 — PURE, deterministic PRIVATE commercial audit.
 *
 * Never supplements a silent supplier quote with IVA, freight, shipping,
 * currency, price adjustments or delivery. Never turns an AI extraction or
 * historical AI interpretation into independently verified source evidence.
 *
 * All integer arithmetic uses centavos / thousandths / basis points via bigint.
 * This module makes no database writes, calls no model and cannot publish.
 */
import {
 revisarContratoProveedorV2,
 type RawSupplierQuoteV2,type RawLineV2
} from './contrato-lectura.ts';

type Presence='included_explicit'|'excluded_explicit'|
 'rate_mentioned'|'mentioned_unpriced'|'conflicting_mentions';
type FreightPresence='included_explicit'|'free_explicit'|
 'quoted_price_explicit'|'mentioned_unpriced'|'conflicting_mentions';
export type CommercialMentionsB5=Readonly<{
 // Keys are ABSENT if the supplier has not explicitly mentioned them.
 iva?:Readonly<{state:Presence;literal:string}>;
 flete?:Readonly<{state:FreightPresence;literal:string;
  amount_raw?:string}>;
}>;
export type ReconciliationCodeB5=
 'matched_arithmetic_unverified'|'differs_from_declared_total'|
 'list_vs_effective_ambiguous'|'insufficient_numeric_data'|
 'conflicting_explicit_discount'|'explicit_discount_unverified';
export type AuditedLineB5=Readonly<{
 ordinal:number;
 kind:RawLineV2['kind'];
 result:ReconciliationCodeB5|'non_material';
 /**
  * Only when a discount is literally LABELLED in the source candidate
  * or a PREVIOUS unverified transcription. Not inferred from arithmetic.
  */
 discount_literal?:string;
 discount_origin?:'candidate_literal'|'historical_unverified';
 listed_unit_cents?:string;
 computed_effective_unit_cents?:string;
 computed_line_total_cents?:string;
 declared_line_total_cents?:string;
 comparison_difference_cents?:string;
 original_source_verified:false;
}>;
export type PrivateCommercialAuditB5=Readonly<{
 state:'private_arithmetic_only'|'invalid_candidate';
 can_publish:false;
 can_rank:false;
 can_reveal_contacts:false;
 lines:readonly AuditedLineB5[];
 material_count:number;
 notes_count:number;
 mentions:CommercialMentionsB5;
 total_declared_cents?:string;
 total_material_lines_cents?:string;
 totals_agree?:boolean;
 source_verified:false;
 issue?:'invalid_structure';
}>;
const safeText=(v:unknown):string=>typeof v==='string'?v:'';
function parseDecimal(value:string,decimals:number):bigint|null{
 const text=value.trim();
 if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/u.test(text))
  return null;
 const [int,fract='']=text.split(',');
 if(fract.length>decimals)return null;
 const grouped=int.replaceAll('.','');
 if(grouped.length>16)return null;
 const n=BigInt(grouped)*10n**BigInt(decimals)+
  BigInt(fract.padEnd(decimals,'0')||'0');
 return n>=0n?n:null;
}
export function parseArgentineMoneyCentsB5(raw:string|null):bigint|null{
 if(raw===null||typeof raw!=='string')return null;
 const n=raw.trim().replace(/^(?:ARS\s*|USD\s*|U\$S\s*|\$\s*)/iu,'');
 const positive=n.replace(/^(\+)\s*/u,'');
 const negative=positive.startsWith('-');
 const value=(negative?positive.slice(1):positive).trim().replace(/^\$\s*/u,'');
 const parsed=parseDecimal(value,2);
 return parsed===null?null:negative?-parsed:parsed;
}
export function parseQuantityThousandthsB5(raw:string|null):bigint|null{
 return raw===null||typeof raw!=='string'?null:parseDecimal(raw,3);
}
type DiscountCandidate=Readonly<{
 basisPoints:bigint; literal:string;
 origin:'candidate_literal'|'historical_unverified';
}>;
function scanLabeledDiscount(text:string):DiscountCandidate[] {
 const pattern=/\b(?:dscto\.?|dcto\.?|dto\.?|descuento|bonif(?:icaci[oó]n)?\.?|rebaja)\s*(?::|de|del)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/giu;
 const items:DiscountCandidate[]=[];
 for(const match of text.matchAll(pattern)){
  const raw=match[1].replace('.',',');
  const n=parseDecimal(raw,2);
  if(n!==null&&n<=10000n){
   items.push({basisPoints:n,literal:match[0],origin:'candidate_literal'});
  }
 }
 return items;
}
function discountFromText(
 line:RawLineV2,archived?:string
):DiscountCandidate| 'conflict' | null{
 const now=scanLabeledDiscount([
  line.original_line_raw,line.original_description_raw
 ].join('\n'));
 const earlier=archived===undefined?[]:
  scanLabeledDiscount(archived).map(x=>({...x,
   origin:'historical_unverified' as const}));
 const all=[...now,...earlier];
 if(!all.length)return null;
 if(all.some(x=>x.basisPoints!==all[0].basisPoints))
  return 'conflict';
 return now[0]??earlier[0];
}
const roundHalfUp=(num:bigint,den:bigint):bigint=>{
 if(num<0n)return -roundHalfUp(-num,den);
 return (num*2n+den)/(den*2n);
};
const metaAbsent=/\b(?:no (?:informad[oa]|especificad[oa]|declarad[oa]|aclarad[oa])|sin datos|sin informar)\b/iu;
const pickMention=(terms:readonly string[],pattern:RegExp):string[]=>{
 const output:string[]=[];
 for(const t of terms){
  if(pattern.test(t)&&!metaAbsent.test(t)&&!output.includes(t))
   output.push(t);
 }
 return output;
};
function extractConditions(doc:RawSupplierQuoteV2):CommercialMentionsB5{
 const all=[
  ...doc.commercial_conditions_raw,
  ...doc.lines.filter(x=>x.kind==='commercial_note'||
   x.kind==='additional_charge').map(x=>x.original_line_raw),
  ...doc.lines.filter(x=>x.kind==='commercial_note'||
   x.kind==='additional_charge').map(x=>x.original_description_raw)
 ].map(x=>x.trim()).filter(Boolean);
 const iva=pickMention(all,/\bIVA\b/iu);
 const freight=pickMention(all,/\b(?:flete|env[ií]o|transporte)\b/iu);
 const result:{
  iva?:{state:Presence;literal:string};
  flete?:{state:FreightPresence;literal:string;amount_raw?:string};
 }={};
 if(iva.length){
  const included=iva.some(x=>/\b(?:IVA\s+incluid[oa]|incluy\w*\s+(?:el\s+)?IVA|con\s+IVA\b)/iu.test(x));
  const excluded=iva.some(x=>/\b(?:sin\s+IVA\b|IVA\s+no\s+incluid[oa]|no\s+incluy\w*\s+(?:el\s+)?IVA)/iu.test(x));
  const rate=iva.some(x=>/\bIVA\s*(?:del\s*)?\d{1,2}(?:[,.]\d+)?\s*%/iu.test(x));
  const state:Presence=included&&excluded?'conflicting_mentions':
   included?'included_explicit':
   excluded?'excluded_explicit':rate?'rate_mentioned':
    'mentioned_unpriced';
  result.iva={state,literal:iva.join(' | ')};
 }
 if(freight.length){
  const included=freight.some(x=>/\b(?:flete|env[ií]o|transporte)\s+incluid[oa]/iu.test(x));
  const free=freight.some(x=>/\b(?:flete|env[ií]o|transporte)\s+(?:sin\s+cargo|gratis|gratuito)/iu.test(x));
  const prices=freight.flatMap(x=>Array.from(
   x.matchAll(/(?:\$\s*|ARS\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/giu),
   m=>m[0]
  ));
  const conflicted=(included&&free)||(prices.length>1&&new Set(prices).size>1);
  const state:FreightPresence=conflicted?'conflicting_mentions':
   prices.length?'quoted_price_explicit':
   included?'included_explicit':free?'free_explicit':'mentioned_unpriced';
  result.flete={
   state,literal:freight.join(' | '),
   ...(state==='quoted_price_explicit'?{amount_raw:prices[0]}:{})
  };
 }
 return result;
}
const MAX_CENTS=1000000000000000n;
function lineAudit(
 row:RawLineV2,archived?:string
):AuditedLineB5{
 const base={ordinal:row.ordinal,kind:row.kind,
  original_source_verified:false as const};
 if(row.kind!=='material')
  return {...base,result:'non_material'};
 const q=parseQuantityThousandthsB5(row.quantity_raw);
 const unit=parseArgentineMoneyCentsB5(row.unit_price_raw);
 const total=parseArgentineMoneyCentsB5(row.line_total_raw);
 const discount=discountFromText(row,archived);
 const extra:Partial<AuditedLineB5>={
  ...(unit!==null?{listed_unit_cents:unit.toString()}:{})
 };
 if(total!==null)extra.declared_line_total_cents=total.toString();
 if(discount==='conflict'){
  return {...base,...extra,result:'conflicting_explicit_discount'};
 }
 if(discount!==null){
  extra.discount_literal=discount.literal;
  extra.discount_origin=discount.origin;
 }
 if(q===null||unit===null||total===null||q===0n||
  unit<0n||total<0n||unit>MAX_CENTS||q>MAX_CENTS)
  return {...base,...extra,result:'insufficient_numeric_data'};
 if(discount&&row.unit_price_role==='effective_explicit'){
  // Explicitly effective unit must NOT be discounted for a second time.
  return {...base,...extra,result:'explicit_discount_unverified'};
 }
 if(row.unit_price_role==='unknown'||row.unit_price_role==='absent')
  return {...base,...extra,result:'insufficient_numeric_data'};
 // First round each *discounted unit price* to centavos, then multiply by
 // quantity; this follows the 2026 pilot PDFs and eliminates 0.04/0.08
 // divergences created by rounding only after line aggregation.
 const effective=discount!==null
  ?roundHalfUp(unit*(10000n-discount.basisPoints),10000n):unit;
 const calculated=roundHalfUp(effective*q,1000n);
 extra.computed_effective_unit_cents=effective.toString();
 extra.computed_line_total_cents=calculated.toString();
 extra.comparison_difference_cents=(total-calculated).toString();
 if(calculated!==total){
  return {...base,...extra,result:discount===null&&
   row.unit_price_role==='list_explicit'?
   'list_vs_effective_ambiguous':'differs_from_declared_total'};
 }
 return {...base,...extra,result:'matched_arithmetic_unverified'};
}
/**
 * archivedDescriptions = PREVIOUS, UNVERIFIED AI transcription, not source
 * evidence. Never mark lines source-verified from two agreeing models.
 * The caller must NOT display this audit as an accepted offer.
 */
export function auditarComercialPrivadoB5(
 value:unknown,archivedDescriptions:readonly string[]=[]
):PrivateCommercialAuditB5{
 const report=revisarContratoProveedorV2(value);
 const empty:Pick<PrivateCommercialAuditB5,
  'can_publish'|'can_rank'|'can_reveal_contacts'|'source_verified'>={
   can_publish:false,can_rank:false,can_reveal_contacts:false,
   source_verified:false
 };
 if(report.state!=='private_extract'||!report.document)
  return {...empty,state:'invalid_candidate',lines:[],
   material_count:0,notes_count:0,mentions:{},issue:'invalid_structure'};
 const doc=report.document;
 let materialNumber=0;
 const lines=doc.lines.map(row=>lineAudit(row,
  row.kind==='material'?archivedDescriptions[materialNumber++]:undefined));
 const total=parseArgentineMoneyCentsB5(doc.total_declared_raw);
 const materialLineAmounts=doc.lines.filter(x=>x.kind==='material')
  .map(x=>parseArgentineMoneyCentsB5(x.line_total_raw));
 const allTotalsPresent=materialLineAmounts.length>0&&
  materialLineAmounts.every(x=>x!==null);
 const summed=allTotalsPresent?materialLineAmounts
  .reduce<bigint>((acc,x)=>acc+(x??0n),0n):null;
 return {
  ...empty,state:'private_arithmetic_only',
  lines,material_count:doc.lines.filter(x=>x.kind==='material').length,
  notes_count:doc.lines.filter(x=>x.kind==='commercial_note').length,
  mentions:extractConditions(doc),
  ...(total!==null?{total_declared_cents:total.toString()}:{}) ,
  ...(summed!==null?{total_material_lines_cents:summed.toString()}:{}) ,
  ...(total!==null&&summed!==null
   ?{totals_agree:total===summed}:{}),
 };
}

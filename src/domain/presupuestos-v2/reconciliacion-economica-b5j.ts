/**
 * B5j: deterministic PRIVATE economic reconciliation, not offer approval.
 * Input is original-corroborated PDF evidence. No money, PII, literals or
 * coordinates ever leave the output. Never promotes source_verified.
 */
import {revisarContratoProveedorV2,type RawSupplierQuoteV2} from './contrato-lectura.ts';
import {auditarComercialPrivadoB5,parseArgentineMoneyCentsB5}
 from './auditoria-comercial-b5.ts';
import type {OriginalPdfCheckB5} from './evidencia-pdf-original-b5.ts';
import type {GeometryResultB5i} from './diagnostico-geometria-total-b5i.ts';
import type {PdfRowB5h} from './diagnostico-total-pdf-b5h.ts';
import type {CurrencyEvidenceB5k} from './cotejo-moneda-original-b5k.ts';

export type ReconciliationCodeB5j=
 'invalid_candidate'|'source_rows_unconfirmed'|'geometry_unconfirmed'|
 'source_unmapped_content'|'currency_ambiguous'|
 'missing_line_amount'|'invalid_charge_or_discount'|
 'discount_scope_ambiguous'|'line_arithmetic_unconfirmed'|
 'source_conditions_unconfirmed'|'fiscal_or_freight_ambiguous'|
 'grand_total_differs'|'grand_total_balances_private';
export type MentionCodeB5j=
 'not_mentioned'|'included_explicit'|'excluded_explicit'|
 'free_explicit'|'quoted_price_explicit'|'rate_mentioned'|
 'mentioned_unpriced'|'conflicting_mentions';
export type EconomicResultB5j=Readonly<{
 code:ReconciliationCodeB5j;
 material_count:number;material_arithmetic_matches:number;
 note_count:number;additional_charge_count:number;standalone_discount_count:number;
 source_condition_count:number;conditions_corroborated:number;
 iva:MentionCodeB5j;freight:MentionCodeB5j;
 material_total_matches_declared:boolean;
 source_verified:false;full_document_covered:false;can_publish:false;
 can_rank:false;can_reveal_contacts:false;
}>;
const chargeLabel=/\b(?:flete|env[ií]o|transporte|cargo|recargo|pallets?|embalaje|log[ií]stica)\b/iu;
const discountLabel=/\b(?:descuento|bonificaci[oó]n|rebaja|dscto|dcto|dto)\b/iu;
const fiscalUnknown=/\b(?:iva|flete|env[ií]o|transporte|impuesto|percepci[oó]n|retenci[oó]n)\b/iu;
const MAX_AMOUNT=1000000000000000n;
const normalize=(x:string):string=>x.normalize('NFKC').trim().replace(/\s+/gu,' ')
 .toLocaleLowerCase('es-AR');
const body=(value:string)=>normalize(value).replace(/\s*([:;,.])\s*/gu,'$1');
/**
 * B5 exits with source_total_unverified before its unclaimed-row scan when
 * the document lacks a total label. B5j must NOT silently ignore extra
 * source prices/charges/IVA just because all extracted lines were matched.
 * This is negative evidence only; returning false DOES NOT establish
 * full-document coverage.
 */
function hasUnmappedCommercialSource(
 rows:readonly PdfRowB5h[],doc:RawSupplierQuoteV2,total:bigint
):boolean{
 const used=new Set<number>();
 const materialClaims:{index:number;raw:string}[]=[];
 const conditionClaims=new Map<number,string[]>();
 const financial=/\b(?:iva|flete|env[ií]o|transporte|cargos?|recargos?|embalaje|pallets?|impuestos?|percepciones?|retenciones?|descuentos?|dscto|dcto|bonificaci[oó]n|subtotal|sub\s*total)\b/iu;
 for(const line of doc.lines){
  const desc=normalize(line.original_description_raw);
  if(!desc)return true;
  const matches=rows.flatMap((row,index)=>
   normalize(row.text).includes(desc)?[index]:[]);
  // Duplicate descriptions may be benign in some supplier formats, but
  // cannot be attributed unambiguously without further source evidence.
  if(matches.length!==1)return true;
  used.add(matches[0]);
  materialClaims.push({index:matches[0],
   raw:line.original_line_raw+' '+line.original_description_raw});
 }
 for(const term of doc.commercial_conditions_raw){
  const wanted=body(term);
  if(wanted.length<3)continue;
  rows.forEach((row,index)=>{
   if(body(row.text).includes(wanted)){
    used.add(index);
    conditionClaims.set(index,[...(conditionClaims.get(index)??[]),wanted]);
   }
  });
 }
 // An extracted article may match all expected amounts while the PDF
 // contains an extra tax or delivery term in that SAME article row.
 for(const {index,raw} of materialClaims){
  const residual=rows[index].text;
  if(financial.test(residual)&&!financial.test(raw)&&
     !doc.commercial_conditions_raw.some(t=>financial.test(t)&&
       body(residual).includes(body(t))))return true;
 }
 // A short extracted condition ('Transferencia') must not mask IVA or
 // a separate amount printed on the same PDF.js source row.
 for(const [index,terms] of conditionClaims){
  if(materialClaims.some(p=>p.index===index))continue;
  let residual=body(rows[index].text);
  for(const term of terms)residual=residual.replace(term,' ');
  if(financial.test(residual)||
     /(?:\$\s*|(?:ARS|USD|U\$S)\s*)\d/u.test(residual)||
     /\b(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b/u.test(residual))
   return true;
 }
 const footers=rows.flatMap((row,index)=>
  (row.parts??[]).filter(p=>parseArgentineMoneyCentsB5(p.text)===total)
   .length===1?[index]:[]);
 if(footers.length!==1||used.has(footers[0]))return true;
 used.add(footers[0]);
 const currency=/(?:\$\s*|(?:ARS|USD|U\$S)\s*)\d/u;
 const decimal=/\b(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\b/u;
 const percent=/\b\d{1,3}(?:[,.]\d{1,2})?\s*%(?!\d)/u;
 const tableHeading=/\b(?:cant(?:idad)?|descripci[oó]n|art[ií]culo|precio|unitario)\b/iu;
 const unsafeHeader=/\b(?:iva|flete|env[ií]o|transporte|cargos?|recargos?|impuestos?|percepciones?|retenciones?|pallets?|embalaje)\b/iu;
 for(let index=0;index<rows.length;index++){
  if(used.has(index))continue;
  const text=rows[index].text;
  // A generic discount-column heading is normal; an unexplained
  // VAT/freight/tax COLUMN is not, even if the same row says "Precio".
  if(tableHeading.test(text)&&!unsafeHeader.test(text)&&
     !currency.test(text)&&!decimal.test(text)&&
     !percent.test(text))continue;
  if(financial.test(text)||currency.test(text)||decimal.test(text)||
     percent.test(text))
   return true;
 }
 return false;
}

const empty=()=>({materials:0,matched:0,notes:0,charges:0,discounts:0,
 terms:0,verifiedTerms:0,iva:'not_mentioned' as MentionCodeB5j,
 freight:'not_mentioned' as MentionCodeB5j,balance:false});
type Counts=ReturnType<typeof empty>;
const result=(code:ReconciliationCodeB5j,n:Counts):EconomicResultB5j=>Object.freeze({
 code,material_count:n.materials,material_arithmetic_matches:n.matched,
 note_count:n.notes,additional_charge_count:n.charges,
 standalone_discount_count:n.discounts,source_condition_count:n.terms,
 conditions_corroborated:n.verifiedTerms,iva:n.iva,freight:n.freight,
 material_total_matches_declared:n.balance,source_verified:false,
 full_document_covered:false,can_publish:false,can_rank:false,
 can_reveal_contacts:false
});
export function reconciliarEconomiaTotalB5j(args:{
 candidate:unknown;source:OriginalPdfCheckB5;
 geometry:GeometryResultB5i;rows:readonly PdfRowB5h[];
 /** Optional B5k evidence; never changes the original candidate fields. */
 currencyEvidence?:CurrencyEvidenceB5k;
}):EconomicResultB5j{
 const n=empty();
 const report=revisarContratoProveedorV2(args.candidate);
 if(report.state!=='private_extract'||!report.document)
  return result('invalid_candidate',n);
 const doc:RawSupplierQuoteV2=report.document;
 n.materials=doc.lines.filter(l=>l.kind==='material').length;
 n.notes=doc.lines.filter(l=>l.kind==='commercial_note').length;
 n.charges=doc.lines.filter(l=>l.kind==='additional_charge').length;
 n.discounts=doc.lines.filter(l=>l.kind==='discount').length;
 n.terms=doc.commercial_conditions_raw.length;
 const fail=(code:ReconciliationCodeB5j)=>result(code,n);
 if(args.source.reason==='unmapped_source_content')
  return fail('source_unmapped_content');
 // B5 intentionally returns needs_source_review for a source total lacking
 // a label, even when EVERY material row corresponds. B5j may still run a
 // PRIVATE calculation, but never promote any source verification flags.
 const eligibleSource=
  (args.source.reason==='source_total_unverified'&&
   (args.source.state==='needs_source_review'||
    args.source.state==='source_rows_correspond_private'))||
  (args.source.reason==='rows_correspond_but_full_coverage_unchecked'&&
   args.source.state==='source_rows_correspond_private');
 if(!Array.isArray(args.rows)||!args.rows.length||args.rows.length>300||
    !args.source.sha_verified||!eligibleSource||
    args.source.lines.length!==doc.lines.length||
    args.source.lines.some((line,i)=>line.ordinal!==i+1||
      line.state!=='source_line_corresponds'))
  return fail('source_rows_unconfirmed');
 if(args.geometry.code!=='amount_after_material_table'||
    args.geometry.column!=='aligned_material_total'||
    args.geometry.exact_cells!==1||args.geometry.candidate_rows!==1||
    args.geometry.material_rows!==n.materials||
    args.geometry.pages<1||args.geometry.pages>12||
    args.geometry.source_verified!==false)
  return fail('geometry_unconfirmed');

 // Require some explicit currency in original; never infer by geography.
 const currency=normalize(doc.currency_declared_raw??'');
 const proof=args.currencyEvidence;
 // "$" in an original proves a currency SYMBOL, not an ISO code.
 // Only use this narrow observation for PRIVATE arithmetic, never ranking.
 if(proof!==undefined){
  const acceptable=proof.code==='uniform_dollar_symbol_iso_unstated'||
    proof.code==='explicit_ars_source';
  if(!acceptable||proof.source_verified!==false||
      proof.can_publish!==false||proof.can_rank!==false||
      !proof.footer_with_symbol||
      proof.material_count!==n.materials||
      proof.material_lines_with_symbol!==n.materials||
      proof.unit_prices_with_symbol!==doc.lines.filter(l=>
       l.kind==='material'&&l.unit_price_raw!==null).length)
   return fail('currency_ambiguous');
 }
 const documentedCurrency=['$','ars','pesos','peso argentino'].includes(currency);
 const privateSymbolFallback=currency===''&&proof!==undefined&&
  (proof.code==='uniform_dollar_symbol_iso_unstated'||
   proof.code==='explicit_ars_source');
 if((!documentedCurrency&&!privateSymbolFallback)||
    !args.rows.some(row=>/(?:\$\s*\d|(?:ars|pesos)\s+\d)/iu.test(row.text)))
  return fail('currency_ambiguous');

 const discounts=args.source.lines.flatMap(p=>p.discount_evidence===undefined?[]:
  [{ordinal:p.ordinal,basis_points:p.discount_evidence.basis_points,
    literal:p.discount_evidence.literal,origin:p.discount_evidence.origin}]);
 const audit=auditarComercialPrivadoB5(doc,[],discounts);
 if(audit.state!=='private_arithmetic_only'||audit.lines.length!==doc.lines.length)
  return fail('line_arithmetic_unconfirmed');
 n.matched=audit.lines.filter(x=>x.kind==='material'&&
  x.result==='matched_arithmetic_unverified').length;
 if(n.materials<1||n.matched!==n.materials)
  return fail('line_arithmetic_unconfirmed');

 // Notes have no priced-line amount. A monetary or unpriced fiscal/
 // logistics charge inside a note must NEVER silently become zero.
 if(doc.lines.some(line=>line.kind==='commercial_note'&&
  fiscalUnknown.test(line.original_line_raw)&&
  /(?:\$\s*\d|\b(?:ars|usd)\b\s*\d|\b(?:a\s+cotizar|a\s+confirmar|pendiente|sin\s+precio)\b)/iu
   .test(line.original_line_raw)))
  return fail('fiscal_or_freight_ambiguous');

 // Discounts already reflected in line_total_raw are not subtracted twice.
 let sum=0n;
 for(const line of doc.lines){
  if(line.kind==='commercial_note')continue;
  const amount=parseArgentineMoneyCentsB5(line.line_total_raw);
  if(amount===null||amount>MAX_AMOUNT||amount< -MAX_AMOUNT)
   return fail('missing_line_amount');
  if(line.kind==='material'){
   if(amount<0n)return fail('missing_line_amount');
   sum+=amount;
  }else if(line.kind==='additional_charge'){
   if(amount<0n||!chargeLabel.test(line.original_line_raw))
    return fail('invalid_charge_or_discount');
   sum+=amount;
  }else{
   if(!discountLabel.test(line.original_line_raw))
    return fail('invalid_charge_or_discount');
   if(discounts.length>0)return fail('discount_scope_ambiguous');
   sum-=amount<0n?-amount:amount;
  }
  if(sum>MAX_AMOUNT||sum< -MAX_AMOUNT)return fail('missing_line_amount');
 }
 const total=parseArgentineMoneyCentsB5(doc.total_declared_raw);
 if(total===null||total<0n||total>MAX_AMOUNT)return fail('missing_line_amount');
 if(hasUnmappedCommercialSource(args.rows,doc,total))
  return fail('source_unmapped_content');
 // All natural-language conditions must be corroborated verbatim in original.
 const sourceRows=args.rows.map(row=>body(row.text));
 n.verifiedTerms=doc.commercial_conditions_raw.filter(term=>{
  const literal=body(term);return literal.length>=3&&
   sourceRows.some(row=>row.includes(literal));
 }).length;
 if(n.verifiedTerms!==n.terms)return fail('source_conditions_unconfirmed');

 n.iva=audit.mentions.iva?.state??'not_mentioned';
 n.freight=audit.mentions.flete?.state??'not_mentioned';
 // A matching sum proves ONLY the explicitly listed lines balance against
 // the source's candidate amount. It is NOT the final payable price when
 // freight, taxes or other conditions are still unpriced/ambiguous.
 // Record that narrow fact before the commercial-condition gate; the gate
 // must retain its private, non-publishable failure code.
 n.balance=sum===total;
 // Absence means UNKNOWN, not "sin IVA". Unpriced/ambiguous fiscal or
 // freight terms cannot be supplied with invented additions.
 if(n.iva==='conflicting_mentions'||n.iva==='rate_mentioned'||
    n.iva==='mentioned_unpriced'||n.freight==='conflicting_mentions'||
    n.freight==='mentioned_unpriced'||
    (n.freight==='quoted_price_explicit'&&n.charges===0)||
    doc.commercial_conditions_raw.some(s=>fiscalUnknown.test(s)&&
      /\b(?:pendiente|a\s+cotizar|a\s+confirmar)\b/iu.test(s)))
  return fail('fiscal_or_freight_ambiguous');

 return result(n.balance?'grand_total_balances_private':
  'grand_total_differs',n);
}

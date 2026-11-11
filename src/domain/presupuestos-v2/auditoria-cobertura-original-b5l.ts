/**
 * B5l - Conservative source coverage ledger for real PDF.js source rows.
 *
 * This ONLY checks that visible extractable rows are accounted for; it does
 * not prove invisible/scanned layers, source completeness, totals, currency,
 * offer validity, or permission to publish. Never returns supplier text,
 * prices, raw coordinates, PII, or offers.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import type {RawLineV2} from './contrato-lectura.ts';
import {parseArgentineMoneyCentsB5} from './auditoria-comercial-b5.ts';
import type {OriginalPdfCheckB5} from './evidencia-pdf-original-b5.ts';
import type {GeometryResultB5i} from './diagnostico-geometria-total-b5i.ts';
import type {PdfRowB5h} from './diagnostico-total-pdf-b5h.ts';

export type CoverageCodeB5l=
 'candidate_invalid'|'reader_unconfirmed'|'source_lines_unconfirmed'|
 'source_geometry_unconfirmed'|'line_assignment_ambiguous'|
 'source_line_unaccounted'|'unmapped_fiscal_or_logistics'|
 'unmapped_monetary_or_percentage'|'unmapped_text'|
 'commercial_condition_unverified'|'unpriced_commercial_risk'|
 'visible_rows_accounted_private';
export type ConditionFailureKindB5n=
 'condition_too_short'|'source_row_not_unique'|
 'source_span_not_independent'|'source_part_mixed';
export type CoverageResultB5l=Readonly<{
 code:CoverageCodeB5l;
 source_rows:number;attributed_rows:number;unattributed_rows:number;
 source_lines:number;attributed_lines:number;
 commercial_conditions:number;corroborated_conditions:number;
 /** Private, ordinal-only first failure. Never includes PDF text, prices, PII. */
 first_unresolved_condition_ordinal:number|null;
 condition_failure_kind:ConditionFailureKindB5n|null;
 page_count:number;source_verified:false;full_document_covered:false;
 can_publish:false;can_rank:false;can_reveal_contacts:false;
}>;
type Counts={rows:number;attributed:number;lines:number;matched:number;
 conditions:number;corroborated:number;pages:number;
 firstUnresolvedOrdinal:number|null;conditionFailureKind:ConditionFailureKindB5n|null};
const out=(code:CoverageCodeB5l,n:Counts):CoverageResultB5l=>
 Object.freeze({
  code,source_rows:n.rows,attributed_rows:n.attributed,
  unattributed_rows:n.rows-n.attributed,
  source_lines:n.lines,attributed_lines:n.matched,
  commercial_conditions:n.conditions,
  corroborated_conditions:n.corroborated,
  first_unresolved_condition_ordinal:n.firstUnresolvedOrdinal,
  condition_failure_kind:n.conditionFailureKind,page_count:n.pages,
  source_verified:false,full_document_covered:false,can_publish:false,
  can_rank:false,can_reveal_contacts:false
 });
const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/gu,' ')
 .toLocaleLowerCase('es-AR');
const plain=(s:string)=>norm(s).replace(/\s*([.,:;])\s*/gu,'$1');
// B5n: only leading/trailing PRINT punctuation is semantically empty.
// Never discard letters, numbers, percentages, currency or inner text from
// a PDF.js part: these may be evidence of tax, freight or another item.
const conditionLiteral=(s:string)=>plain(s)
 .replace(/^[\s:;.!·•—–-]+|[\s:;.!·•—–-]+$/gu,'').trim();

/**
 * A condition is independently attributable only when its COMPLETE text
 * occupies one or more consecutive PDF.js source parts, with no unassigned
 * text inside those parts. A substring in the material description is NOT
 * sufficient evidence. The same source part cannot be claimed twice.
 */
function uniqueConditionParts(
 parts:readonly {text:string;x:number}[],term:string,
 reserved:ReadonlySet<number>
):readonly number[]|null{
 const wanted=conditionLiteral(term);
 if(wanted.length<3)return null;
 const found:number[][]=[];
 for(let start=0;start<parts.length;start++){
  if(reserved.has(start)||!conditionLiteral(parts[start].text))continue;
  let text='';
  for(let end=start;end<Math.min(parts.length,start+12);end++){
   if(reserved.has(end))break;
   text+=(text?' ':'')+parts[end].text;
   const current=conditionLiteral(text);
   if(current===wanted){
    // Prefer the shortest complete source span. Trailing empty PDF.js
    // fragments must not create a second, fake matching condition.
    found.push(Array.from({length:end-start+1},(_,i)=>start+i));
    break;
   }
   if(current.length>wanted.length+10)break;
  }
 }
 return found.length===1?found[0]:null;
}

const fiscal=/\b(?:iva|flete|env[ií]o|transporte|envios?|impuestos?|percepciones?|retenciones?|recargos?|cargos?|log[ií]stica|pallets?|embalaje|bonificaciones?|descuentos?|dscto|dcto|rebajas?|subtotal|sub\s*total)\b/iu;
const financial=/(?:\$\s*|(?:ARS|USD|U\$S|EUR|US\$)\s*|€\s*)\d|(?<![\p{L}\p{N}])\d{1,3}(?:\.\d{3})*,\d{2}(?![\p{L}\p{N}])|\b\d{1,3}(?:[,.]\d{1,2})?\s*%/iu;
const pending=/\b(?:a\s+cotizar|a\s+confirmar|pendiente|seg[uú]n\s+zona|consultar\s+precio|consultar\s+disponibilidad)\b/iu;
const moneyCell=/(?<![\p{L}\p{N}])(?:(?:ARS|USD|U\$S|US\$|EUR|€)\s*|\$\s*)\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?![\p{L}\p{N}])/giu;
function sourceHasExtraMoney(row:string,line:RawLineV2):boolean{
 const source=[...row.matchAll(moneyCell)].flatMap(m=>{
  const value=parseArgentineMoneyCentsB5(m[0]);
  return value===null?[]:[value];
 });
 const expected=[line.unit_price_raw,line.line_total_raw].flatMap(raw=>{
  if(raw===null)return [];
  const value=parseArgentineMoneyCentsB5(raw);
  return value===null?[]:[value];
 });
 const remaining=[...source];
 for(const amount of expected){
  const at=remaining.findIndex(x=>x===amount);
  if(at<0)return true;
  remaining.splice(at,1);
 }
 return remaining.length!==0;
}

const structural=/^(?:(?:n[úu]m(?:ero)?|nro|c[oó]d(?:igo)?|cant(?:idad)?|unidad|um|u\.?m\.?|descripci[oó]n|detalle|art[ií]culo|producto|material|precio|unitario|unit|valor|descuento|dscto|dto|bonif|total|importe|marca|%|[-|:;/])\s*)+$/iu;
function materialLineHasUnclaimedCommercial(
 row:string,parts:readonly {x:number;text:string}[],
 line:RawLineV2,discountPercent:string|null
):boolean{
 // Source fiscal/logistic text must be accounted for by a whole extracted
 // commercial line/condition, never by an unrelated material description.
 const original=norm(line.original_line_raw);
 const unexpectedFiscal=fiscal.test(row)&&!fiscal.test(original);
 if(unexpectedFiscal||sourceHasExtraMoney(row,line))return true;
 // Some PDF.js readers split "$" and its numeric amount across cells.
 // Look for an additional bare numeric cell beyond quantity/unit/line total;
 // a description containing 25kg is not a standalone monetary cell.
 const expected=[line.quantity_raw,line.unit_price_raw,
  line.line_total_raw].flatMap(raw=>{
   if(raw===null)return [];
   const value=parseArgentineMoneyCentsB5(raw);
   return value===null?[]:[value];
 });
 const sourceCells=parts.flatMap(p=>{
  const value=parseArgentineMoneyCentsB5(p.text);
  return value===null?[]:[value];
 });
 for(const amount of expected){
  const i=sourceCells.findIndex(x=>x===amount);
  if(i>=0)sourceCells.splice(i,1);
 }
 if(sourceCells.length>0)return true;
 // An amount-bearing material description that includes an unpriced tax or
 // logistic clause needs separate business semantics, not a quiet pass.
 if(line.kind==='material'&&
    /\b(?:iva|flete|env[ií]o|transporte|percepci[oó]n|retenci[oó]n|recargo|cargo)\b/iu
     .test(original))return true;
 if(pending.test(row)&&!pending.test(original))return true;
 const sourcePercent=[...row.matchAll(/\b\d{1,3}(?:[,.]\d{1,2})?\s*%/giu)]
  .map(m=>plain(m[0]));
 if(sourcePercent.some(p=>p!==plain(discountPercent??'')))return true;
 return false;
}
/** Conservatively attribute every text row. No "coverage verified" is ever
 * returned: this checks visible rows, not text loss or OCR reliability.
 * Rows that are not explainable must remain in review.
 */
export function auditarCoberturaPdfOriginalB5l(args:{
 candidate:unknown;rows:readonly PdfRowB5h[];
 scanned:boolean;pages:number;source:OriginalPdfCheckB5;
 geometry:GeometryResultB5i;
}):CoverageResultB5l{
 const d=revisarContratoProveedorV2(args.candidate);
 const n:Counts={rows:Array.isArray(args.rows)?args.rows.length:0,
  attributed:0,lines:0,matched:0,conditions:0,corroborated:0,
  firstUnresolvedOrdinal:null,conditionFailureKind:null,
  pages:Number.isSafeInteger(args.pages)?args.pages:0};
 const fail=(code:CoverageCodeB5l)=>out(code,n);
 if(d.state!=='private_extract'||!d.document)return fail('candidate_invalid');
 const doc=d.document;
 n.lines=doc.lines.length;n.conditions=doc.commercial_conditions_raw.length;
 const rows=args.rows;
 if(args.scanned||!Array.isArray(rows)||rows.length===0||rows.length>300||
    args.pages<1||args.pages>12||rows.some(r=>r.page<1||
      r.page>args.pages||typeof r.text!=='string'||r.text.length>8000||
      !Array.isArray(r.parts)||r.parts.length>100||
      r.parts.some((p:{x:number;text:string})=>!Number.isFinite(p.x)||typeof p.text!=='string')))
  return fail('reader_unconfirmed');
 const source=args.source;
 if(!source.sha_verified||
    source.lines.length!==doc.lines.length||
    !['source_total_unverified',
       'rows_correspond_but_full_coverage_unchecked'].includes(source.reason)||
    source.lines.some((line,i)=>line.ordinal!==i+1||
       line.state!=='source_line_corresponds'))
  return fail('source_lines_unconfirmed');
 const g=args.geometry;
 if(g.code!=='amount_after_material_table'||
    g.column!=='aligned_material_total'||
    g.exact_cells!==1||g.candidate_rows!==1||
    g.material_rows!==doc.lines.filter(x=>x.kind==='material').length||
    g.pages!==args.pages||g.source_verified!==false)
  return fail('source_geometry_unconfirmed');
 const attributed=new Map<number,RawLineV2>();
 for(const line of doc.lines){
  const wanted=norm(line.original_description_raw);
  if(wanted.length<3)return fail('line_assignment_ambiguous');
  const matches=rows.flatMap((row,index)=>
    norm(row.text).includes(wanted)?[index]:[]);
  if(matches.length!==1||attributed.has(matches[0]))
   return fail('line_assignment_ambiguous');
  const index=matches[0];
  attributed.set(index,line);
  n.matched++;n.attributed++;
 }
 const accounted=new Set(attributed.keys());
 // Reserve exact PDF.js parts, not whole rows. Real supplier PDFs may print
 // a payment or delivery term on the SAME geometric row as a material.
 const conditionParts=new Map<number,Set<number>>();
 let conditionOrdinal=0;
 const conditionFail=(code:CoverageCodeB5l,kind:ConditionFailureKindB5n)=>{
  n.firstUnresolvedOrdinal=conditionOrdinal;
  n.conditionFailureKind=kind;
  return fail(code);
 };
 for(const condition of doc.commercial_conditions_raw){
  conditionOrdinal++;
  const wanted=conditionLiteral(condition);
  if(wanted.length<3)
   return conditionFail('commercial_condition_unverified','condition_too_short');
  const matches=rows.flatMap((row,index)=>
   conditionLiteral(row.text).includes(wanted)?[index]:[]);
  if(matches.length!==1)
   return conditionFail('commercial_condition_unverified','source_row_not_unique');
  const index=matches[0];
  const used=conditionParts.get(index)??new Set<number>();
  const span=uniqueConditionParts(rows[index].parts,condition,used);
  if(span===null){
   // A shared source part with the material is still ambiguous. A
   // standalone condition containing extra IVA/cost is commercial risk.
   if(attributed.has(index))
    return conditionFail('line_assignment_ambiguous','source_span_not_independent');
   const residue=conditionLiteral(rows[index].text).replace(wanted,'').trim();
   return conditionFail(financial.test(residue)||fiscal.test(residue)||
     pending.test(residue)?'unmapped_fiscal_or_logistics':
     'commercial_condition_unverified','source_span_not_independent');
  }
  if(attributed.has(index)){
   const material=attributed.get(index)!;
   const description=plain(material.original_description_raw);
   const segment=conditionLiteral(span.map(i=>rows[index].parts[i].text).join(' '));
   // B5o: the SAME unpriced commercial note can appear in both
   // candidate.lines and commercial_conditions_raw. This is ONE source fact,
   // not a material plus a second payable item. Only accept an exact whole
   // PDF.js span, already unique and reserved, for an unpriced note whose
   // description equals the condition. Never generalize this to materials,
   // partial matches, another condition, percentages or monetary clauses.
   const identicalUnpricedNote=
    material.kind==='commercial_note'&&
    material.quantity_raw===null&&material.unit_raw===null&&
    material.unit_price_raw===null&&material.line_total_raw===null&&
    material.unit_price_role==='absent'&&
    segment===wanted&&
    conditionLiteral(material.original_description_raw)===wanted&&
    !financial.test(segment)&&
    // A candidate note with additional fiscal/monetary content in its raw
    // line is NOT interchangeable with the shorter declared condition.
    !(financial.test(material.original_line_raw)&&
      !financial.test(material.original_description_raw))&&
    !(fiscal.test(material.original_line_raw)&&
      !fiscal.test(material.original_description_raw))&&
    !(pending.test(material.original_line_raw)&&
      !pending.test(material.original_description_raw));
   // A MATERIAL's description overlapping a condition is still unsafe:
   // it could be a product name or a mixed fragment. Unpriced notes with
   // identical evidence aren't allowed to fabricate two separate source rows.
   if(financial.test(segment)||
      (description.length>2&&segment.includes(description)&&
       !identicalUnpricedNote))
    return conditionFail('line_assignment_ambiguous','source_part_mixed');
  }
  for(const part of span)used.add(part);
  conditionParts.set(index,used);
  n.corroborated++;
  if(!accounted.has(index)){accounted.add(index);n.attributed++}
 }
 // A wholly separate condition row may contain several independently
 // printed terms, but unexplained trailing text, IVA or prices still block.
 for(const [index,assigned] of conditionParts){
  if(attributed.has(index))continue;
  const rest=rows[index].parts.filter((_: {text:string;x:number},i:number)=>!assigned.has(i))
   .map((part:{text:string;x:number})=>part.text).join(' ').trim();
  if(financial.test(rest)||fiscal.test(rest)||pending.test(rest))
   return fail('unmapped_fiscal_or_logistics');
  if(rest&&!/^[\p{P}\p{S}\s]*$/u.test(rest))
   return fail('unmapped_text');
 }
 // Check all materials and the cited discounts before declaring their
 // source rows accounted for.
 for(const [index,line] of attributed){
  const evidence=source.lines[line.ordinal-1];
  // Strip ONLY independently corroborated condition parts. Never remove
  // an unverified substring from the material row or its monetary cells.
  const segments=conditionParts.get(index)??new Set<number>();
  const materialParts=rows[index].parts.filter((_: {text:string;x:number},i:number)=>!segments.has(i));
  const materialText=materialParts.map((p:{text:string;x:number})=>p.text).join(' ');
  if(materialLineHasUnclaimedCommercial(
     materialText,materialParts,line,
     evidence?.discount_evidence?.literal??null))
    return fail('unmapped_fiscal_or_logistics');
  if(line.kind==='commercial_note'&&
    (fiscal.test(materialText)||pending.test(materialText)))
    return fail('unpriced_commercial_risk');
 }
 const total=doc.total_declared_raw===null?null:
  parseArgentineMoneyCentsB5(doc.total_declared_raw);
 if(total===null)return fail('source_geometry_unconfirmed');
 const totalMatches=rows.flatMap((row,index)=>
  row.parts.filter((p:{x:number;text:string})=>parseArgentineMoneyCentsB5(p.text)===total)
   .length===1?[index]:[]);
 if(totalMatches.length!==1||accounted.has(totalMatches[0]))
  return fail('source_geometry_unconfirmed');
 accounted.add(totalMatches[0]);n.attributed++;
 // Any other visible row must be a *strictly recognized* table heading.
 // Unknown, seemingly harmless text (including extra supplier conditions)
 // stays in review; do not white-list names, dates, CUIT or promotional copy.
 for(let i=0;i<rows.length;i++){
  if(accounted.has(i))continue;
  const text=norm(rows[i].text);
  if(!text){accounted.add(i);n.attributed++;continue;}
  if(fiscal.test(text)&&!structural.test(text))
   return fail('unmapped_fiscal_or_logistics');
  if(financial.test(text))
   return fail('unmapped_monetary_or_percentage');
  if(structural.test(text)){
   accounted.add(i);n.attributed++;continue;
  }
  return fail('unmapped_text');
 }
 return out('visible_rows_accounted_private',n);
}

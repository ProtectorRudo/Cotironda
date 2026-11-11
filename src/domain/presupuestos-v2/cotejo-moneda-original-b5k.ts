/**
 * B5k: strictly PRIVATE currency-symbol observation against SHA-verified PDF
 * rows. "$" alone does NOT prove ARS or USD. No amounts, strings, coordinates
 * or personal data are returned. This is never an offer/ranking certificate.
 */
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import {parseArgentineMoneyCentsB5} from './auditoria-comercial-b5.ts';
import type {OriginalPdfCheckB5} from './evidencia-pdf-original-b5.ts';
import type {GeometryResultB5i} from './diagnostico-geometria-total-b5i.ts';
import type {PdfRowB5h} from './diagnostico-total-pdf-b5h.ts';

export type CurrencyCodeB5k=
 'invalid_candidate'|'source_rows_unconfirmed'|'geometry_unconfirmed'|
 'candidate_currency_conflict'|'mixed_currency_markers'|
 'material_currency_unconfirmed'|'footer_currency_unconfirmed'|
 'uniform_dollar_symbol_iso_unstated'|'explicit_ars_source'|
 'foreign_currency_detected'|'no_currency_evidence';
export type CurrencyEvidenceB5k=Readonly<{
 code:CurrencyCodeB5k;
 material_count:number;material_lines_with_symbol:number;
 unit_prices_with_symbol:number;footer_with_symbol:boolean;
 currency_iso_verified:boolean;source_verified:false;
 full_document_covered:false;can_publish:false;can_rank:false;
 can_reveal_contacts:false;
}>;
const money=/(?<![\p{L}\p{N}.,])(?:(ARS|USD|U\$S|US\$|EUR|€|\$)\s*)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?![\p{L}\p{N}.,])/giu;
const foreign=/(?:\b(?:USD|EUR|EUROS|D[OÓ]LARES|DOLLARS|DOLARES)\b|U\$S|US\$|€)/iu;
const ars=/\bARS\b|\bPESOS\s+ARGENTINOS\b/iu;
const norm=(s:string)=>s.normalize('NFKC')
 .replace(/\s+/gu,' ').trim().toLocaleLowerCase('es-AR');
type Family='dollar_sign'|'ars'|'foreign';
type Token={family:Family;value:bigint};
function tokens(text:string):Token[]{
 return [...text.matchAll(money)].flatMap(match=>{
  const currency=match[1].toUpperCase();
  const family:Family=currency==='$'?'dollar_sign':
   currency==='ARS'?'ars':'foreign';
  const value=parseArgentineMoneyCentsB5(
   currency+' '+match[2]+(match[3]===undefined?'':','+match[3]));
  return value===null?[]:[{family,value}];
 });
}
const wrap=(code:CurrencyCodeB5k,materials=0,lines=0,units=0,
 footer=false,iso=false):CurrencyEvidenceB5k=>Object.freeze({
 code,material_count:materials,material_lines_with_symbol:lines,
 unit_prices_with_symbol:units,footer_with_symbol:footer,
 currency_iso_verified:iso,source_verified:false,
 full_document_covered:false,can_publish:false,can_rank:false,
 can_reveal_contacts:false
});
/** The source, not the AI, must contain a monetary marker for every
 * material line total and the one total candidate located by PDF.js.
 * A uniform "$" is recorded as symbol-only, NEVER as ISO ARS.
 */
export function cotejarMonedaOriginalB5k(args:{
 candidate:unknown;rows:readonly PdfRowB5h[];
 source:OriginalPdfCheckB5;geometry:GeometryResultB5i;
}):CurrencyEvidenceB5k{
 const report=revisarContratoProveedorV2(args.candidate);
 if(report.state!=='private_extract'||!report.document)
  return wrap('invalid_candidate');
 const doc=report.document;
 const materials=doc.lines.filter(line=>line.kind==='material');
 const fail=(c:CurrencyCodeB5k,lines=0,units=0,footer=false)=>
  wrap(c,materials.length,lines,units,footer);
 const rows=args.rows;
 const proof=args.source;
 if(!Array.isArray(rows)||rows.length===0||rows.length>300||
    !proof.sha_verified||!['source_total_unverified',
      'rows_correspond_but_full_coverage_unchecked'].includes(proof.reason)||
    proof.lines.length!==doc.lines.length||
    proof.lines.some((line,i)=>line.ordinal!==i+1||
       line.state!=='source_line_corresponds'))
  return fail('source_rows_unconfirmed');
 const g=args.geometry;
 if(g.code!=='amount_after_material_table'||
    g.column!=='aligned_material_total'||g.exact_cells!==1||
    g.candidate_rows!==1||g.material_rows!==materials.length||
    g.source_verified!==false)
  return fail('geometry_unconfirmed');
 if(materials.length<1||materials.length>100)
  return fail('material_currency_unconfirmed');

 const candidateCurrency=norm(doc.currency_declared_raw??'');
 if(candidateCurrency&&!['$','ars','pesos','peso argentino'].includes(
    candidateCurrency))return fail('candidate_currency_conflict');
 const sourceText=rows.map(r=>r.text).join('\n');
 const markerFamilies=new Set<Family>();
 for(const row of rows)
  for(const token of tokens(row.text))markerFamilies.add(token.family);
 if(foreign.test(sourceText)||markerFamilies.has('foreign'))
  return fail('foreign_currency_detected');
 const hasExplicitArs=ars.test(sourceText);
 if(markerFamilies.has('ars')&&markerFamilies.has('dollar_sign')&&
    !hasExplicitArs)return fail('mixed_currency_markers');
 if(!markerFamilies.has('dollar_sign')&&!markerFamilies.has('ars'))
  return fail('no_currency_evidence');

 let matchedLines=0,matchedUnits=0;
 const used=new Set<number>();
 for(const line of materials){
  const desc=norm(line.original_description_raw);
  if(desc.length<3)return fail('material_currency_unconfirmed',matchedLines,matchedUnits);
  const hits=rows.flatMap((row,index)=>
   norm(row.text).includes(desc)?[{row,index}]:[]);
  if(hits.length!==1||used.has(hits[0].index))
   return fail('material_currency_unconfirmed',matchedLines,matchedUnits);
  used.add(hits[0].index);
  const lineTokens=tokens(hits[0].row.text);
  const total=line.line_total_raw===null?null:
   parseArgentineMoneyCentsB5(line.line_total_raw);
  const unit=line.unit_price_raw===null?null:
   parseArgentineMoneyCentsB5(line.unit_price_raw);
  if(total===null||!lineTokens.some(t=>t.value===total&&t.family!=='foreign'))
   return fail('material_currency_unconfirmed',matchedLines,matchedUnits);
  // Both values are explicitly present in the source row; relying only on
  // an AI-provided "$" prefix without source evidence is prohibited.
  matchedLines++;
  if(unit!==null){
   const same=unit===total;
   const occurrences=lineTokens.filter(t=>t.value===unit&&t.family!=='foreign').length;
   if(occurrences<(same?2:1))
    return fail('material_currency_unconfirmed',matchedLines,matchedUnits);
   matchedUnits++;
  }
 }
 const total=doc.total_declared_raw===null?null:
  parseArgentineMoneyCentsB5(doc.total_declared_raw);
 if(total===null)return fail('footer_currency_unconfirmed',matchedLines,matchedUnits);
 const footer=rows.flatMap((row,index)=>
  tokens(row.text).some(t=>t.value===total&&t.family!=='foreign')?
    [index]:[]);
 if(footer.length!==1||used.has(footer[0]))
  return fail('footer_currency_unconfirmed',matchedLines,matchedUnits);
 // The exact source total cell may be dollar-prefixed, or the PDF.js
 // column may keep "$" as a separate text item on the SAME source row.
 // Both are observations of a source symbol, not ISO certification.
 if(hasExplicitArs)return wrap('explicit_ars_source',materials.length,
  matchedLines,matchedUnits,true,true);
 if(markerFamilies.has('ars'))return fail('mixed_currency_markers',
  matchedLines,matchedUnits,true);
 return wrap('uniform_dollar_symbol_iso_unstated',materials.length,
  matchedLines,matchedUnits,true,false);
}

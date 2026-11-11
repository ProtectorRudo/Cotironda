/**
 * B5i — categorical PDF.js x/y analysis of an UNLABELLED quoted total.
 * No raw PDF strings, amounts, positions or PII leave this pure function.
 * All conclusions are private hints, NEVER financial verification.
 */
import {parseArgentineMoneyCentsB5} from './auditoria-comercial-b5.ts';
import type {PdfRowB5h} from './diagnostico-total-pdf-b5h.ts';

type Material=Readonly<{kind:string;original_description_raw:string;
 line_total_raw:string|null;}>;
export type TotalGeometryCodeB5i=
 'invalid_geometry'|'declared_total_invalid'|'amount_absent'|
 'multiple_matching_rows'|'amount_embedded_in_text_item'|
 'amount_with_missing_coordinates'|'multiple_matching_cells'|
 'amount_in_material_row'|'amount_in_fiscal_row'|
 'amount_after_material_table'|'amount_within_material_band'|
 'amount_before_material_table'|'material_band_unavailable';
export type NearbyContextB5i='alternative_commercial_label'|
 'fiscal_logistics_context'|'no_recognizable_label';
export type TotalColumnB5i='aligned_material_total'|'not_aligned'|
 'unknown_material_column'|'conflicting_columns';
export type GeometryResultB5i=Readonly<{
 code:TotalGeometryCodeB5i;
 context:NearbyContextB5i;
 column:TotalColumnB5i;
 candidate_rows:number;exact_cells:number;material_rows:number;
 pages:number;
 source_verified:false;can_publish:false;can_rank:false;
 can_reveal_contacts:false;
}>;
const money=/(?<![\p{L}\p{N}.,])(?:(?:ARS|USD|U\$S)\s*|\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?![\p{L}\p{N}.,])/giu;
const fiscal=/\b(?:iva|flete|env[ií]o|transporte|percepci[oó]n|
 retenci[oó]n|impuesto|pallets?|descuento|dscto|bonificaci[oó]n)\b/iu;
const altLabel=/\b(?:importe|monto|saldo|suma|neto|liquidaci[oó]n|
 presupuesto|a\s+pagar|total|final)\b/iu;
const norm=(value:string)=>value.normalize('NFKC')
 .replace(/\s+/gu,' ').trim().toLocaleLowerCase('es-AR');
const exact=(value:string,expected:bigint)=>!value.includes('%')&&
 parseArgentineMoneyCentsB5(value)===expected;
function containsAmount(value:string,expected:bigint):boolean{
 return [...value.matchAll(money)].some(x=>parseArgentineMoneyCentsB5(x[0])===expected);
}
const wrap=(code:TotalGeometryCodeB5i,context:NearbyContextB5i,
 column:TotalColumnB5i,rows:number,cells:number,materials:number,
 pages:number):GeometryResultB5i=>Object.freeze({
 code,context,column,candidate_rows:rows,exact_cells:cells,
 material_rows:materials,pages,source_verified:false,can_publish:false,
 can_rank:false,can_reveal_contacts:false
});
/**
 * Coded observation of the one amount B5h found, relative to known
 * material rows. No source amount/label is retained in the output.
 * x proximity is useful for investigation, NOT a total certificate.
 */
export function diagnosticarGeometriaTotalB5i(args:{
 rows:readonly PdfRowB5h[];declaredTotal:string|null;
 lines:readonly Material[];
}):GeometryResultB5i{
 const {rows,declaredTotal,lines}=args;
 const count=Array.isArray(rows)?rows.length:0;
 const pages=Array.isArray(rows)?rows.reduce((n,r)=>Math.max(n,r.page),0):0;
 const none=(code:TotalGeometryCodeB5i,r=0,c=0,m=0)=>
  wrap(code,'no_recognizable_label','unknown_material_column',r,c,m,pages);
 if(!Array.isArray(rows)||!Array.isArray(lines)||rows.length<1||
    rows.length>300||rows.some(r=>r.page<1||r.page>12||
      !Array.isArray(r.parts)&&r.parts!==undefined||
      typeof r.text!=='string'||r.text.length>8000||
      (r.y!==undefined&&!Number.isFinite(r.y))||
      (r.parts??[]).some(p=>!Number.isFinite(p.x)||
        typeof p.text!=='string'||p.text.length>2000)))
  return none('invalid_geometry');
 const expected=declaredTotal===null?null:
   parseArgentineMoneyCentsB5(declaredTotal);
 if(expected===null||expected<0n)return none('declared_total_invalid');
 // The PDF.js text line has one match in both historical sources; locate
 // its actual cell, but also report if PDF.js glued several fields together.
 const hits=rows.flatMap((row,index)=>
  containsAmount(row.text,expected)?[{row,index}]:[]);
 if(hits.length===0)return none('amount_absent');
 if(hits.length!==1)return none('multiple_matching_rows',hits.length);
 const {row,index}=hits[0];
 const materials=lines.filter(l=>l.kind==='material'&&
    typeof l.original_description_raw==='string'&&
    l.original_description_raw.trim().length>=3);
 const materialPositions=materials.flatMap(line=>{
  const description=norm(line.original_description_raw);
  return rows.flatMap(r=>r.page===row.page&&Number.isFinite(r.y)&&
   norm(r.text).includes(description)?[{row:r,line}]:[]);
 });
 const materialRows=materialPositions.length;
 const cells=(row.parts??[]).filter(part=>exact(part.text,expected));
 const embedded=(row.parts??[]).filter(part=>containsAmount(part.text,expected));
 if(cells.length===0)return none('amount_embedded_in_text_item',1,embedded.length,materialRows);
 if(cells.length!==1)return none('multiple_matching_cells',1,cells.length,materialRows);
 if(!Number.isFinite(row.y))return none('amount_with_missing_coordinates',1,1,materialRows);
 const matched=cells[0];
 const near=rows.filter((r,i)=>r.page===row.page&&
  Number.isFinite(r.y)&&Math.abs(r.y! -row.y!)<=38&&
  Math.abs(i-index)<=3);
 const tokens=near.flatMap(r=>r.parts??[{x:matched.x,text:r.text}])
  .filter(x=>x.text!==matched.text).map(x=>x.text);
 const isFiscal=tokens.some(x=>fiscal.test(x))||fiscal.test(row.text);
 const context:NearbyContextB5i=isFiscal?'fiscal_logistics_context':
  tokens.some(x=>altLabel.test(x))?'alternative_commercial_label':
  'no_recognizable_label';
 const colXs=materialPositions.flatMap(({row:r,line})=>
  (r.parts??[]).filter(part=>line.line_total_raw!==null&&
    exact(part.text,parseArgentineMoneyCentsB5(line.line_total_raw)??-1n))
   .map(part=>part.x));
 const uniqueColumn=colXs.length>=2&&
  colXs.every(x=>Math.abs(x-colXs[0])<=12);
 const column:TotalColumnB5i=colXs.length<2?'unknown_material_column':
  !uniqueColumn?'conflicting_columns':
  Math.abs(matched.x-colXs[0])<=15?'aligned_material_total':'not_aligned';
 let code:TotalGeometryCodeB5i='material_band_unavailable';
 if(materialPositions.some(p=>p.row===row))code='amount_in_material_row';
 else if(isFiscal)code='amount_in_fiscal_row';
 else if(materialPositions.length){
  const ys=materialPositions.map(p=>p.row.y!).filter(Number.isFinite);
  if(ys.length===0)code='material_band_unavailable';
  else if(row.y!<Math.min(...ys)-6)code='amount_after_material_table';
  else if(row.y!>Math.max(...ys)+6)code='amount_before_material_table';
  else code='amount_within_material_band';
 }
 return wrap(code,context,column,1,1,materialRows,pages);
}

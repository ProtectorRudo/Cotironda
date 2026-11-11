/**
 * B5h: independent, PRIVATE diagnosis of a PDF document total.
 * A diagnosis is not financial evidence, source verification or permission to
 * publish/rank. Never persist original text, values, contacts or coordinates.
 */
import {parseArgentineMoneyCentsB5} from './auditoria-comercial-b5.ts';

export type PdfRowB5h=Readonly<{
  page:number;text:string;
  y?:number;parts?:readonly {x:number;text:string}[];
}>;
export type TotalCodeB5h=
  'declared_total_invalid'|'total_label_missing'|'column_header_only'|
  'unlabeled_amount_found'|'multiple_total_labels'|'mixed_fiscal_logistics'|
  'multiple_amount_cells'|'total_amount_differs'|'total_amount_missing'|
  'next_row_has_other_content'|'same_row_corresponds_private'|
  'next_row_corresponds_private'|'ambiguous_amounts';
export type TotalDiagnosticB5h=Readonly<{
  code:TotalCodeB5h;
  label_rows:number;
  header_rows:number;
  document_pages:number;
  detected_amount_cells:number;
  matching_amount_cells:number;
  source_verified:false;
  can_publish:false;
  can_rank:false;
  can_reveal_contacts:false;
}>;

const money=/(?<![\p{L}\p{N}.,])(?:(?:ARS|USD|U\$S)\s*|\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?![\p{L}\p{N}.,])/giu;
const label=/\b(?:total(?:\s+(?:general|final|neto|presupuesto|comprobante|de\s+factura|a\s+pagar))?|importe\s+total|monto\s+total|a\s+pagar)\b/iu;
const col=/\b(?:cantidad|descripci[oó]n|art[ií]culo|unitario|precio|dscto|descuento)\b/iu;
const unsafe=/\b(?:iva|flete|env[ií]o|transporte|descuento|bonificaci[oó]n|pallets?|sub\s*total|percepci[oó]n|retenci[oó]n)\b/iu;
const currency=(value:string)=>[...value.matchAll(money)].map(x=>
  parseArgentineMoneyCentsB5(x[0]));
const pureAmount=(row:string):boolean=>{
  const tokens=[...row.matchAll(money)];
  if(tokens.length!==1)return false;
  return row.replace(money,'').replace(/[\s:;=|()-]/gu,'')==='';
};
const result=(code:TotalCodeB5h,labels:number,headers:number,pages:number,
 values:number,matching:number):TotalDiagnosticB5h=>Object.freeze({
  code,label_rows:labels,header_rows:headers,document_pages:pages,
  detected_amount_cells:values,matching_amount_cells:matching,
  source_verified:false,can_publish:false,can_rank:false,
  can_reveal_contacts:false
});

/**
 * Codes explain WHY the strict B5f total verifier can reject a source.
 * Even an apparent match is evidence for private investigation only.
 * No arithmetic or AI inference may synthesize the document total.
 */
export function diagnosticarTotalPdfB5h(
  rows:readonly PdfRowB5h[],declaredTotal:string|null
):TotalDiagnosticB5h{
  const pages=rows.reduce((n,row)=>Math.max(n,row.page),0);
  const expected=declaredTotal===null?null:
    parseArgentineMoneyCentsB5(declaredTotal);
  if(expected===null||expected<0n)
    return result('declared_total_invalid',0,0,pages,0,0);
  let headers=0;
  const labeled:{index:number;cells:(bigint|null)[];text:string}[]=[];
  let otherExact=0;
  for(let i=0;i<rows.length;i++){
    const text=rows[i].text;
    const cells=currency(text);
    if(cells.some(v=>v===expected))otherExact++;
    if(!label.test(text))continue;
    // A column header is NOT a document total.
    if(cells.length===0&&col.test(text)){headers++;continue;}
    // A subtotal isn't a document total, either.
    if(/\bsub\s*total\b/iu.test(text))continue;
    labeled.push({index:i,cells,text});
  }
  const count=labeled.length;
  if(count===0)return result(otherExact>0?'unlabeled_amount_found':
    headers>0?'column_header_only':'total_label_missing',
    0,headers,pages,0,otherExact);
  if(count>1){
    const cells=labeled.flatMap(r=>r.cells);
    return result('multiple_total_labels',count,headers,pages,
      cells.length,cells.filter(v=>v===expected).length);
  }
  const chosen=labeled[0];
  const cells=chosen.cells;
  const matched=cells.filter(v=>v===expected).length;
  const diag=(code:TotalCodeB5h,values=cells.length,matches=matched)=>
    result(code,count,headers,pages,values,matches);
  if(unsafe.test(chosen.text))return diag('mixed_fiscal_logistics');
  if(cells.some(v=>v===null))return diag('ambiguous_amounts');
  if(cells.length>1)return diag('multiple_amount_cells');
  if(cells.length===1)
    return diag(cells[0]===expected?
      'same_row_corresponds_private':'total_amount_differs');
  const next=rows[chosen.index+1];
  if(!next||next.page!==rows[chosen.index].page)
    return diag('total_amount_missing');
  const more=currency(next.text);
  if(more.some(v=>v===null))return diag('ambiguous_amounts',more.length,0);
  if(!pureAmount(next.text))
    return diag(more.length>0?'next_row_has_other_content':
      'total_amount_missing',more.length,more.filter(v=>v===expected).length);
  return diag(more[0]===expected?
    'next_row_corresponds_private':'total_amount_differs',
    more.length,more.filter(v=>v===expected).length);
}

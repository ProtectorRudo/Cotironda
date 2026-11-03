/**
 * MVP138: independently verify an archived supplier draft against actual bytes.
 * This proves textual fidelity, NOT economic comparability or buyer approval.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import {readPdfPositioned} from './supplier-source-pdf-general.ts';
import {readOfficeVisibleRows} from './supplier-source-office.ts';

type Reason='covered'|'invalid_input'|'unreadable'|'missing_line'|
 'missing_amount'|'missing_total'|'uncovered_note'|'extra_charge'|'ambiguous';
export type Evidence={state:'verified'|'needs_source_review';reason:Reason;lines:number};
type Reader=(source:DownloadedMedia)=>Promise<readonly string[]>;
const n=(x:string)=>x.normalize('NFKC').toLocaleLowerCase('es-AR').replace(/\s+/gu,' ').trim();
const scalar=(x:string)=>n(x).replace(/^\$\s*/u,'').replace(/\s+/gu,'');
const num=(x:string)=>/^\d+(?:[.,]\d+)*$/u.test(scalar(x));
const escape=(x:string)=>[...x].map(c=>'\\.^$*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
const has=(hay:string,x:string)=>num(x)&&
 new RegExp('(?<![\\p{L}\\p{N}.,])'+escape(scalar(x))+'(?![\\p{L}\\p{N}.,])','u')
 .test(n(hay).replace(/\$\s*/gu,''));
const cash=(x:string)=>Array.from(x.matchAll(/\$\s*\d[\d.,]*/gu),m=>scalar(m[0]));
const reject=(reason:Reason,lines:number):Evidence=>({state:'needs_source_review',reason,lines});
const nonmaterial=(x:string)=>/^(?:no se especifica el tratamiento del iva|no se indica disponibilidad|la moneda no est[aá] identificada expl[ií]citamente)/iu.test(n(x));
const minor=(x:string|null)=>x===null||x.trim()===''||
 /^unidad de cantidad no indicada\.?(?: descuento visible:\s*\d{1,2}[.,]\d{1,2}%\.?)?$/iu.test(n(x));
const discount=(x:string|null)=>x?.match(/descuento visible:\s*(\d{1,2}[.,]\d{1,2})\s*%/iu)?.[1]??null;

/** Decimal percentages are compared in exact basis points: 22,4 = 22,40.
 * Some supplier PDFs place Dscto in a separate column/text object.
 * Only accept a global discount when amount math independently corroborates. */
const basis=(v:string):bigint|null=>{
 const m=v.trim().replace('.',',').match(/^(\d{1,2})(?:,(\d{1,2}))?$/u);
 if(!m)return null;
 const b=BigInt(m[1])*100n+BigInt((m[2]??'').padEnd(2,'0'));
 return b<10000n?b:null;
};
const cents=(v:string):bigint|null=>{
 let t=scalar(v);
 if(/^\d{1,3}(?:\.\d{3})+,\d{2}$/u.test(t))t=t.replace(/\./gu,'');
 else if(!/^\d+(?:,\d{2})?$/u.test(t))return null;
 const [integer,decimal='']=t.split(',');
 return BigInt(integer)*100n+BigInt(decimal.padEnd(2,'0'));
};
const hundredths=(v:string):bigint|null=>{
 let t=scalar(v).replace('.',',');
 if(!/^\d+(?:,\d{1,2})?$/u.test(t))return null;
 const [a,b='']=t.split(',');
 return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
};
const discountMath=(line:DocumentDraft['lines'][number],rate:bigint)=>{
 const qty=hundredths(line.quantity??'');
 const unit=cents(line.unit_price??'');
 const extended=cents(line.line_total??'');
 if(qty===null||unit===null||extended===null)return false;
 const numerator=unit*qty*(10000n-rate);
 const actual=extended*100n*10000n;
 const diff=numerator>actual?numerator-actual:actual-numerator;
 // Up to 10 cents difference in a quantity × rounded two-decimal list price,
 // preserving the supplier's DECLARED line total without recalculation.
 return diff<=10n*100n*10000n;
};
const percentSeen=(rows:readonly string[],discount:bigint)=>rows.some(row=>
 [...row.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gu)]
 .some(m=>basis(m[1])===discount) ||
 (/(?:descuento|dscto|bonificaci[oó]n)/iu.test(row) &&
 [...row.matchAll(/(?<!\d)(\d{1,2}[.,]\d{1,2})(?!\d)/gu)]
  .some(m=>basis(m[1])===discount))
);
const discountProof=(row:string,rows:readonly string[],
 line:DocumentDraft['lines'][number],value:string)=>{
 if(has(row,value))return true;
 const d=basis(value);
 if(d===null)return false;
 return percentSeen(rows,d)&&
  rows.some(x=>/\b(?:descuento|dscto|bonificaci[oó]n)\b/iu.test(x))&&
  discountMath(line,d);
};

const pii=/(?:https?:\/\/|wa\.me|www\.|whatsapp|cuit|cuil|tel[eé]fono|raz[oó]n social|[a-z0-9._%+-]+@[a-z0-9.-]+|[0-9]{8,})/iu;
const commercial=/(?:\biva\b|flete|pallet|bolson|devoluci[oó]n|lista|contado|efectivo|plazo|entrega|env[ií]o|transporte|cargo|pago|transferencia|descuento)/iu;
const sourceReader:Reader=async f=>{
 if(f.mime==='application/pdf'){
  const pdf=await readPdfPositioned(f.bytes);
  return pdf.scanned?[]:pdf.rows.map(x=>x.text);
 }
 if(f.mime.includes('openxmlformats-officedocument'))return readOfficeVisibleRows(f);
 if(f.mime==='text/plain'||f.mime==='text/csv')
  return new TextDecoder('utf-8',{fatal:true}).decode(f.bytes).split(/\r?\n/gu).filter(Boolean);
 return [];
};
export async function verifySupplierEvidence(
 f:DownloadedMedia,p:DocumentDraft,read:Reader=sourceReader
):Promise<Evidence>{
 const c=p?.lines?.length??0;
 if(!f||!(f.bytes instanceof Uint8Array)||f.bytes.length<120||
  f.bytes.length>8388608||!/^[a-f0-9]{64}$/u.test(f.sha256)||
  !p||p.kind!=='supplier_quote'||c<1||c>25||!p.total_declared||
  !num(p.total_declared)||!Array.isArray(p.unanswered))
  return reject('invalid_input',c);
 if(p.unanswered.some(q=>!nonmaterial(q))||
  p.lines.some(l=>!l.original_description||!l.quantity||!l.unit_price||
   !l.line_total||!num(l.quantity)||!num(l.unit_price)||!num(l.line_total)||
   !minor(l.ambiguity)||pii.test(l.original_description))||
  pii.test(p.requested_delivery_note??''))
  return reject('ambiguous',c);
 let rows:readonly string[];
 try{rows=await read(f)}catch{return reject('unreadable',c)}
 if(rows.length<2||rows.length>300)return reject('unreadable',c);
 const source=rows.map(n),used=new Set<number>();
 for(const l of p.lines){
  const i=source.findIndex((row,j)=>!used.has(j)&&row.includes(n(l.original_description))&&
   has(row,l.quantity!)&&has(row,l.unit_price!)&&has(row,l.line_total!));
  if(i<0)return reject('missing_line',c);
  const d=discount(l.ambiguity);
  if(d&&!discountProof(source[i],source,l,d))return reject('missing_amount',c);
  const m=cash(source[i]);
  for(const v of [l.unit_price!,l.line_total!]){
   const pos=m.indexOf(scalar(v));if(pos>=0)m.splice(pos,1);
  }
  if(m.length)return reject('extra_charge',c);
  if(f.mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){
   // All bare numeric XLSX cells are source amounts, not just $-prefixed ones.
   const cells=source[i].split('·').map(v=>v.trim()).filter(v=>num(v));
   const expected=[l.quantity!,l.unit_price!,l.line_total!].map(scalar);
   for(const wanted of expected){
    const at=cells.findIndex(v=>scalar(v)===wanted);
    if(at<0)return reject('missing_amount',c);
    cells.splice(at,1);
   }
   if(cells.length)return reject('extra_charge',c);
  }
  used.add(i);
 }
 // Commercial PDFs often print TOTAL and its amount on adjacent text baselines.
 // Reconcile only an unambiguous, isolated amount right next to the label.
 // Every unconsumed monetary row still blocks publication.
 const label=/\b(?:total(?:\s+(?:general|final|a\s+pagar|presupuesto))?|importe\s+(?:total|a\s+pagar|final)|monto\s+a\s+pagar|neto\s+a\s+pagar|a\s+pagar)\b/iu;
 const inline=source.map((row,i)=>({row,i,consumed:[i]})).filter(({row,i})=>
  !used.has(i)&&label.test(row)&&has(row,p.total_declared!));
 const amountOnly=(row:string)=>/^\s*\$?\s*\d[\d.,]*\s*$/u.test(row)&&
  has(row,p.total_declared!);
 const split=source.flatMap((row,i)=>{
  if(used.has(i)||!label.test(row)||cash(row).length||
   /(?<![\p{L}\p{N}])\d[\d.,]*(?![\p{L}\p{N}])/u.test(row))
   return [] as {row:string;i:number;consumed:number[]}[];
  const neighbors=[i-1,i+1].filter(j=>j>=0&&j<source.length&&
   !used.has(j)&&amountOnly(source[j]));
  return neighbors.map(j=>({row:source[j],i,consumed:[i,j]}));
 });
 let totals=[...inline,...split];
 // The source PDF may have NO machine-readable TOTAL label; only source
 // amounts, an unambiguous money field and exact line-sum math are trusted.
 // Accept only one standalone, original-value money field, with the
 // deterministic sum of ALL quoted line totals equal to the claimed total.
 // All other unclaimed charges and conditions are still audited below.
 if(totals.length===0&&f.mime==='application/pdf'){
  const totalValue=cents(p.total_declared!);
  const values=p.lines.map(l=>cents(l.line_total??''));
  if(totalValue!==null&&values.every((v):v is bigint=>v!==null)&&
   values.reduce((a,v)=>a+(v??0n),0n)===totalValue){
   const noteEvidence=n(p.requested_delivery_note??'');
   const totalQualifiers=/\b(?:contado|efectivo|transferencia|iva|pago|plazo|lista|entrega)\b/giu;
   const otherCharge=/(?:pallet|bolson|flete|cargo|descuento|unitario|cemento|hidrofug|transporte|env[ií]o)/iu;
   const isolated=source.map((row,i)=>({row,i,consumed:[i]}))
    .filter(({row,i})=>!used.has(i)&&has(row,p.total_declared!)&&
      cash(row).length===1&&cash(row)[0]===scalar(p.total_declared!)&&
      !otherCharge.test(row)&&
      [...row.matchAll(totalQualifiers)].every(m=>noteEvidence.includes(m[0])));
   if(isolated.length===1)totals=isolated;
  }
 }
 if(totals.length!==1)return reject('missing_total',c);
 if(cash(totals[0].row).length>1)return reject('extra_charge',c);
 for(const i of totals[0].consumed)used.add(i);
 const note=n(p.requested_delivery_note??'');
 const flattened=n(source.join(' ')).replace(/[:;.,]/gu,' ');
 for(const clause of note.split(/[;\r\n]+/gu).filter(Boolean)){
  const words=n(clause).replace(/[:;.,]/gu,' ').split(' ').filter(Boolean);
  let at=0;
  for(const word of words){
   at=flattened.indexOf(word,at);
   if(at<0)return reject('uncovered_note',c);
   at+=word.length;
  }
 }
 for(const [i,row] of source.entries()){
  if(used.has(i))continue;
  // A supplier can submit prices without the $ sign. Unclaimed numeric
  // spreadsheet cells and bare PDF currency must never disappear.
  const bareCurrency=/(?<![\p{L}\p{N}])(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+,\d{2})(?![\d.,%])/u;
  const excelNumbers=f.mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?
   row.split('·').filter(v=>num(v.trim())).length:0;
  if(cash(row).length||bareCurrency.test(row)||
   excelNumbers>=2||excelNumbers>=1&&commercial.test(row))
   return reject('extra_charge',c);
  if(commercial.test(row)&&!note.includes(row)&&
    !/^\s*(?:descripci[oó]n|producto|cantidad|precio|importe)\b/iu.test(row))
   return reject('uncovered_note',c);
 }
 return {state:'verified',reason:'covered',lines:c};
}

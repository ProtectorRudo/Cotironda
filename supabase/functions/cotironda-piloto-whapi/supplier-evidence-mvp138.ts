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
const pii=/(?:https?:\/\/|wa\.me|www\.|whatsapp|cuit|cuil|tel[eé]fono|raz[oó]n social|[a-z0-9._%+-]+@[a-z0-9.-]+|[0-9]{8,})/iu;
const commercial=/(?:\biva\b|flete|pallet|bolson|devoluci[oó]n|lista|contado|efectivo|plazo|entrega|pago|transferencia|descuento)/iu;
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
  if(d&&!has(source[i],d))return reject('missing_amount',c);
  const m=cash(source[i]);
  for(const v of [l.unit_price!,l.line_total!]){
   const pos=m.indexOf(scalar(v));if(pos>=0)m.splice(pos,1);
  }
  if(m.length)return reject('extra_charge',c);
  used.add(i);
 }
 const totals=source.map((row,i)=>({row,i})).filter(({row,i})=>
  !used.has(i)&&/\b(?:total|importe a pagar)\b/iu.test(row)&&has(row,p.total_declared!));
 if(totals.length!==1)return reject('missing_total',c);
 if(cash(totals[0].row).length>1)return reject('extra_charge',c);
 used.add(totals[0].i);
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
  if(cash(row).length)return reject('extra_charge',c);
  if(commercial.test(row)&&!note.includes(row)&&
    !/^\s*(?:descripci[oó]n|producto|cantidad|precio|importe)\b/iu.test(row))
   return reject('uncovered_note',c);
 }
 return {state:'verified',reason:'covered',lines:c};
}

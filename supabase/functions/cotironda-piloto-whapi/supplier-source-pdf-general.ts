/**
 * MVP130. Independent, position-aware PDF evidence from the original bytes.
 * PDF.js reads embedded fonts, Flate streams and tables without executing PDF JS.
 * This is NOT an OCR or two-LLM proof; uncertainty always stays private.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import type {SourceCheckResult} from './supplier-source-text.ts';

export type PageRow=Readonly<{page:number;text:string}>;
export type PdfSourceEvidence=Readonly<{
 rows:readonly PageRow[];
 pages:number;
 scanned:boolean;
}>;
export type EvidenceReader=(bytes:Uint8Array)=>Promise<PdfSourceEvidence>;
type Reason=SourceCheckResult['reason'];
const MONEY=/(?:\$\s*-?\s*\d[\d.,]*|\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b|\b\d+,\d{2}\b)/gu;
const PII=/(?:cuit|cuil|whats?app|tel[eé]fono|celular|raz[oó]n social|facturar a|wa\.me|https?:\/\/|@[\w-]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b)/iu;
const TERMS=/(?:\biva\b|flete|entrega|formas? de pago|descuento|bonificaci[oó]n|disponib|vencimiento|contado|cr[eé]dito|financiaci[oó]n|impuestos|garant[ií]a)/iu;
const normalized=(s:string)=>s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('es-AR');
const invalid=(f:DownloadedMedia,n:number,r:Reason):SourceCheckResult=>
 Object.freeze({state:'needs_source_review',reason:r,lines:n,
  sourceSha256:f?.sha256??null,sourceVerified:false,
  publicationAllowed:false,rankingAllowed:false});
const covered=(f:DownloadedMedia,n:number):SourceCheckResult=>
 Object.freeze({state:'source_text_covered',reason:'covered',lines:n,
  sourceSha256:f.sha256,sourceVerified:false,
  publicationAllowed:false,rankingAllowed:false});
const mentions=(source:string,term:string|null):boolean=>term===null||
 normalized(source).includes(normalized(term));
// Quantities must be distinct from product size and price digits.
const regexEscape=(value:string):string=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const quantityUnitEvidence=(row:string,description:string,quantity:string|null,unit:string|null):boolean=>{
 const q=normalized(quantity??''),u=normalized(unit??''),desc=normalized(description);
 if(!/^\d+(?:[.,]\d+)?$/u.test(q)||!u||!desc)return false;
 const at=row.indexOf(desc);
 if(at<0)return false;
 // Remove product size/specification, then exclude every monetary amount.
 let context=row.slice(0,at)+' '+row.slice(at+desc.length);
 const moneyStart=context.search(MONEY);
 if(moneyStart>=0)context=context.slice(0,moneyStart);
 const sep='[\\s|:;·/-]*';
 const pattern='(?<![\\p{L}\\p{N}.,])(?:'+regexEscape(q)+sep+regexEscape(u)+'s?|'+
   regexEscape(u)+'s?'+sep+regexEscape(q)+')(?![\\p{L}\\p{N}.,])';
 return new RegExp(pattern,'iu').test(context);
};

/** Default adapter: pinned PDF.js serverless text extraction. */');
const quantityUnitEvidence=(row:string,description:string,quantity:string|null,unit:string|null):boolean=>{
 const q=normalized(quantity??''),u=normalized(unit??''),desc=normalized(description);
 if(!/^\d+(?:[.,]\d+)?$/u.test(q)||!u||!desc)return false;
 const at=row.indexOf(desc);
 if(at<0)return false;
 // Remove product size/specification, then exclude every monetary amount.
 let context=row.slice(0,at)+' '+row.slice(at+desc.length);
 const moneyStart=context.search(MONEY);
 if(moneyStart>=0)context=context.slice(0,moneyStart);
 const sep='[\\s|:;·\\\\/-]*';
 const pattern='(?<![\\\\p{L}\\\\p{N}.,])(?:'+regexEscape(q)+sep+regexEscape(u)+'s?|'+
   regexEscape(u)+'s?'+sep+regexEscape(q)+')(?![\\\\p{L}\\\\p{N}.,])';
 return new RegExp(pattern,'iu').test(context);
};

/** Default adapter: pinned PDF.js serverless text extraction. */
export async function readPdfPositioned(bytes:Uint8Array):Promise<PdfSourceEvidence>{
 if(bytes.length<120||bytes.length>8*1024*1024)throw Error('pdf_size_gate');
 const {getDocumentProxy,extractTextItems,inspectPages}=
  await import('npm:unpdf@2.1.0');
 const pdf=await getDocumentProxy(Uint8Array.from(bytes),{
  maxImageSize:16_777_216,isOffscreenCanvasSupported:false,
  isImageDecoderSupported:false
 });
 try{
  if(pdf.numPages<1||pdf.numPages>12)throw Error('pdf_pages_gate');
  const inspection=await inspectPages(pdf);
  if(inspection.totalPages!==pdf.numPages)throw Error('pdf_inspection_gate');
  const scanned=inspection.pages.some(page=>
   page.invisibleTextLength>0||
   page.textLength<20&&page.imageCoverage>0.65);
  if(scanned)return {rows:[],pages:pdf.numPages,scanned:true};
  const extracted=await extractTextItems(pdf);
  if(extracted.totalPages!==pdf.numPages)throw Error('pdf_pages_mismatch');
  let count=0;
  const rows:PageRow[]=[];
  for(const [index,page] of extracted.items.entries()){
   const groups:{y:number;parts:{x:number;text:string}[]}[]=[];
   for(const item of page){
    if(typeof item.str!=='string'||!item.str.trim())continue;
    if(!Number.isFinite(item.x)||!Number.isFinite(item.y))
      throw Error('pdf_geometry_invalid');
    if(++count>9000)throw Error('pdf_too_many_text_items');
    let g=groups.find(v=>Math.abs(v.y-item.y)<=2.0);
    if(!g){g={y:item.y,parts:[]};groups.push(g)}
    g.parts.push({x:item.x,text:item.str});
   }
   for(const group of groups.sort((a,b)=>b.y-a.y)){
    const line=group.parts.sort((a,b)=>a.x-b.x).map(v=>v.text.trim())
     .filter(Boolean).join(' ').replace(/\s+/gu,' ').trim();
    if(line)rows.push({page:index+1,text:line});
    if(rows.length>300)throw Error('pdf_too_many_rows');
   }
  }
  if(!rows.length)throw Error('pdf_no_text');
  return {pages:pdf.numPages,rows,scanned:false};
 }finally{
  // The unpdf proxy type does not expose destroy in every runtime build.
  // Dispose when available; never assume an untyped method exists.
  const disposable=pdf as unknown as {destroy?:()=>Promise<void>|void};
  await disposable.destroy?.();
 }
}

/**
 * Positive result only if every economic figure in every page row was claimed
 * exactly once, along with every commercial condition. We deliberately reject
 * subtotals/ambiguous headers and unmapped numbers instead of guessing.
 */
export async function checkGeneralPdfSource(
 f:DownloadedMedia,p:DocumentDraft,
 reader:EvidenceReader=readPdfPositioned
):Promise<SourceCheckResult>{
 const n=p?.lines?.length??0;
 if(!f||f.mime!=='application/pdf'||!p||p.kind!=='supplier_quote'||n<1||n>25||
    !/^[a-f0-9]{64}$/u.test(f.sha256))
  return invalid(f,n,'invalid_source');
 if(p.unanswered.length||!p.total_declared||p.lines.some(v=>
   v.ambiguity!==null||!v.original_description||!v.unit_price||!v.line_total||
   !v.quantity||!v.evidence_location.trim()))
  return invalid(f,n,'unresolved');
 for(const line of p.lines){
  if(PII.test(line.original_description)||PII.test(line.unit??'')||
    PII.test(line.ambiguity??''))return invalid(f,n,'unsafe_contact');
 }
 if(PII.test(p.requested_delivery_note??''))return invalid(f,n,'unsafe_contact');
 let source:PdfSourceEvidence;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  source=await Promise.race([
   reader(f.bytes),
   new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(Error('pdf_timeout')),10000);
   })
  ]);
 }catch{return invalid(f,n,'unsupported_layout')}
 finally{if(timer!==undefined)clearTimeout(timer)}
 if(source.scanned||source.pages<1||source.pages>12||
    source.rows.length>300||source.rows.some(v=>v.page<1||v.page>source.pages))
  return invalid(f,n,'unsupported_layout');
 const rows=source.rows.map(v=>normalized(v.text));
 const consumed=new Set<number>();
 const money=(v:string)=>Array.from(v.matchAll(MONEY),m=>normalized(m[0]));
 const exactAmounts=(row:string,expected:readonly string[])=>{
  const all=money(row),wanted=expected.flatMap(v=>money(v));
  return wanted.length>0&&all.length===wanted.length&&wanted.every(v=>{
   const i=all.indexOf(v);if(i<0)return false;all.splice(i,1);return true;
  });
 };
 for(const line of p.lines){
  const idx=rows.findIndex((row,i)=>!consumed.has(i)&&
   mentions(row,line.original_description)&&
   quantityUnitEvidence(row,line.original_description,line.quantity,line.unit)&&
   mentions(row,line.unit_price)&&mentions(row,line.line_total));
  if(idx<0)return invalid(f,n,'line_not_found');
  if(!exactAmounts(rows[idx],[line.unit_price!,line.line_total!]))
   return invalid(f,n,'uncovered_money');
  const economicTerm=rows[idx].match(TERMS)?.[0]??null;
  if(economicTerm&&
    !mentions(line.original_description,economicTerm)&&
    !mentions(p.requested_delivery_note??'',economicTerm))
   return invalid(f,n,'uncovered_terms');
  consumed.add(idx);
 }
 const totalCandidates=rows.map((text,index)=>({text,index})).filter(v=>
  !consumed.has(v.index)&&/\b(?:total(?:\s+general)?|importe\s+total|a\s+pagar)\b/iu.test(v.text)
  &&mentions(v.text,p.total_declared));
 if(totalCandidates.length!==1)return invalid(f,n,'total_not_found');
 if(!exactAmounts(totalCandidates[0].text,[p.total_declared]))
  return invalid(f,n,'uncovered_money');
 consumed.add(totalCandidates[0].index);
 for(const [i,row] of rows.entries()){
  // No money may be ignored: all amount-bearing rows must map to an
  // original supplier line (including freight, pallets and discounts) or total.
  if(!consumed.has(i)&&MONEY.test(row)){
   MONEY.lastIndex=0;
   return invalid(f,n,'uncovered_money');
  }
  MONEY.lastIndex=0;
  if(!consumed.has(i)&&TERMS.test(row)&&
     !mentions(p.requested_delivery_note??'',row))
    return invalid(f,n,'uncovered_terms');
  // Unclaimed numeric cell may be a quote extra, omitted quantity or code.
  // We fail closed rather than silently discard an economic element.
  if(!consumed.has(i)&&/\d/u.test(row))
   return invalid(f,n,'uncovered_number');
 }
 return covered(f,n);
}

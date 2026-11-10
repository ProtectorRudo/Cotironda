/**
 * B5 — independent PDF row corroboration from SHA-checked ORIGINAL bytes.
 * Source-row correspondence does NOT prove full-page coverage or discount
 * semantics. NEVER authorizes publication, buyer visibility or ranking.
 */
import {
 readPdfPositioned,type EvidenceReader
} from '../../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import type {RawLineV2} from './contrato-lectura.ts';

export type SourceRowCheckB5=Readonly<{
 ordinal:number;kind:RawLineV2['kind'];
 state:'source_line_corresponds'|'source_line_not_located'|
  'source_value_missing'|'source_ambiguous'|'source_location_conflict';
 page?:number;
}>;
export type OriginalPdfCheckB5=Readonly<{
 state:'source_rows_correspond_private'|'needs_source_review';
 reason:'rows_correspond_but_full_coverage_unchecked'|
  'invalid_file'|'sha_mismatch'|'bad_candidate'|'pdf_unreadable'|
  'line_discrepancy'|'reader_unavailable';
 source_sha256:string|null;
 sha_verified:boolean;source_rows_extracted:number;
 lines:readonly SourceRowCheckB5[];
 full_document_covered:false;discount_column_verified:false;
 can_publish:false;can_rank:false;can_reveal_contacts:false;
}>;
const hashRx=/^[a-f0-9]{64}$/u;
const isPDF=(bytes:Uint8Array)=>[0x25,0x50,0x44,0x46,0x2d]
 .every((x,i)=>bytes[i]===x);
const norm=(s:string):string=>s.normalize('NFKC')
 .replace(/\s+/gu,' ').replace(/\$\s+/gu,'$').trim()
 .toLocaleLowerCase('es-AR');
const escapeRx=(s:string)=>s.replace(/[|\\{}()[\]^$+*?.]/gu,'\\$&');
function hasToken(text:string,literal:string):boolean{
 const wanted=norm(literal);
 if(!wanted)return false;
 return new RegExp(
  '(?<![\\p{L}\\p{N}.,])'+escapeRx(wanted)+
  '(?![\\p{L}\\p{N}.,])','iu').test(text);
}
function pageExpected(location:string|null):number|null{
 if(location===null)return null;
 const m=location.match(/\bp[aá]g(?:ina)?\s*[:#]?\s*(\d{1,2})\b/iu);
 return m?Number(m[1]):null;
}
function rowProof(row:RawLineV2,sourceRow:string):boolean{
 const text=norm(sourceRow),desc=norm(row.original_description_raw);
 if(!desc||!text.includes(desc))return false;
 const beforeMoney=text.split(/\$\s*\d/u)[0]??'';
 // Strip dimensions in product text to avoid "25 kg" => quantity 25.
 const qtyContext=beforeMoney.replace(desc,' ');
 if(row.quantity_raw!==null&&!hasToken(qtyContext,row.quantity_raw))
  return false;
 if(row.unit_raw!==null&&!hasToken(qtyContext,row.unit_raw))
  return false;
 if(row.unit_price_raw!==null&&!hasToken(text,row.unit_price_raw))
  return false;
 if(row.line_total_raw!==null&&!hasToken(text,row.line_total_raw))
  return false;
 if(row.unit_price_raw!==null&&row.line_total_raw!==null&&
   norm(row.unit_price_raw)===norm(row.line_total_raw)){
  if(text.split(norm(row.unit_price_raw)).length<3)return false;
 }
 return true;
}
function fail(reason:OriginalPdfCheckB5['reason'],sha:string|null=null,
 verified=false,rows:readonly SourceRowCheckB5[]=[],
 count=0):OriginalPdfCheckB5{
 return {state:'needs_source_review',reason,source_sha256:sha,
  sha_verified:verified,source_rows_extracted:count,lines:rows,
  full_document_covered:false,discount_column_verified:false,
  can_publish:false,can_rank:false,can_reveal_contacts:false};
}
async function digest(bytes:Uint8Array):Promise<string>{
 const arr=new Uint8Array(await crypto.subtle.digest('SHA-256',
  Uint8Array.from(bytes).buffer));
 return Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');
}
/** A match is PRIVATE evidence only; an independent completeness audit
 * must still account for other pages, charges, taxes and discounts.
 */
export async function comprobarRenglonesPdfOriginalB5(args:{
 originalBytes:Uint8Array;sourceSha256:string;candidate:unknown;
 readPdf?:EvidenceReader;
}):Promise<OriginalPdfCheckB5>{
 const {originalBytes:bytes,sourceSha256}=args;
 if(!hashRx.test(sourceSha256)||!(bytes instanceof Uint8Array)||
  bytes.length<120||bytes.length>8*1024*1024||!isPDF(bytes))
  return fail('invalid_file');
 const real=await digest(bytes);
 if(real!==sourceSha256)return fail('sha_mismatch',real);
 const structural=revisarContratoProveedorV2(args.candidate);
 if(structural.state!=='private_extract'||!structural.document||
   structural.document.lines.length<1)
  return fail('bad_candidate',real,true);
 let extracted:Awaited<ReturnType<EvidenceReader>>;
 try{
  const timeout=AbortSignal.timeout(10000);
  extracted=await Promise.race([
   (args.readPdf??readPdfPositioned)(bytes),
   new Promise<never>((_r,reject)=>{
    timeout.addEventListener('abort',()=>reject(Error('pdf_timeout')),
     {once:true});
   })
  ]);
 }catch{return fail('reader_unavailable',real,true)}
 if(extracted.scanned||extracted.pages<1||extracted.pages>12||
   !Array.isArray(extracted.rows)||extracted.rows.length<1||
   extracted.rows.length>300||
   extracted.rows.some(r=>r.page<1||r.page>extracted.pages||
    typeof r.text!=='string'||r.text.length>8000))
  return fail('pdf_unreadable',real,true);
 const used=new Set<number>();
 const checks:SourceRowCheckB5[]=[];
 for(const row of structural.document.lines){
  const candidates=extracted.rows.map((sr,i)=>({sr,i}))
   .filter(x=>!used.has(x.i)&&norm(x.sr.text)
    .includes(norm(row.original_description_raw)));
  let selected:{sr:{page:number;text:string};i:number}|null=null;
  let status:SourceRowCheckB5['state']='source_line_not_located';
  if(candidates.length){
   const page=pageExpected(row.source_location_raw);
   const located=candidates.filter(x=>page===null||x.sr.page===page);
   if(!located.length)status='source_location_conflict';
   else{
    const matches=located.filter(x=>rowProof(row,x.sr.text));
    if(matches.length===1){
     selected=matches[0];status='source_line_corresponds';
     used.add(selected.i);
    }else if(matches.length>1)status='source_ambiguous';
    else status='source_value_missing';
   }
  }
  checks.push({ordinal:row.ordinal,kind:row.kind,state:status,
   ...(selected?{page:selected.sr.page}:{})});
 }
 if(checks.some(x=>x.state!=='source_line_corresponds'))
  return fail('line_discrepancy',real,true,checks,extracted.rows.length);
 return {state:'source_rows_correspond_private',
  reason:'rows_correspond_but_full_coverage_unchecked',
  source_sha256:real,sha_verified:true,
  source_rows_extracted:extracted.rows.length,lines:checks,
  full_document_covered:false,discount_column_verified:false,
  can_publish:false,can_rank:false,can_reveal_contacts:false};
}

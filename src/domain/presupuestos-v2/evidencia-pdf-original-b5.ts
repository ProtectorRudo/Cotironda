/**
 * B5 — independent PDF row corroboration from SHA-checked ORIGINAL bytes.
 * Source-row correspondence does NOT prove full-page coverage or discount
 * semantics. NEVER authorizes publication, buyer visibility or ranking.
 */
// Inject the already-existing Deno PDF.js reader at the Edge boundary.
 // Keep this pure module independent from Deno's npm: imports so Next.js
 // and the complete repository's TypeScript build remain compatible.
export type EvidenceReaderB5=(bytes:Uint8Array)=>Promise<{
 rows:readonly {
  page:number;text:string;
  /** Independent PDF.js geometry. No coordinate = no column proof. */
  y?:number;parts?:readonly {x:number;text:string}[];
 }[];
 pages:number;scanned:boolean;
}>;
import {revisarContratoProveedorV2} from './contrato-lectura.ts';
import type {RawLineV2} from './contrato-lectura.ts';
import {parseArgentineMoneyCentsB5} from './auditoria-comercial-b5.ts';

export type SourceRowCheckB5=Readonly<{
 ordinal:number;kind:RawLineV2['kind'];
 state:'source_line_corresponds'|'source_line_not_located'|
  'source_value_missing'|'source_ambiguous'|'source_location_conflict';
 page?:number;
 /** A row-level, private SOURCE observation, never publication authority. */
 discount_evidence?:Readonly<{
  basis_points:string;literal:string;
  origin:'inline_explicit'|'aligned_header';
 }>;
}>;
export type OriginalPdfCheckB5=Readonly<{
 state:'source_rows_correspond_private'|'needs_source_review';
 reason:'rows_correspond_but_full_coverage_unchecked'|
  'invalid_file'|'sha_mismatch'|'bad_candidate'|'pdf_unreadable'|
  'line_discrepancy'|'reader_unavailable'|'source_total_unverified'|
  'unmapped_source_content';
 source_sha256:string|null;
 sha_verified:boolean;source_rows_extracted:number;
 total_state?:'unique_source_total'|'not_declared';
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

type GeometricRow=Awaited<ReturnType<EvidenceReaderB5>>['rows'][number];
const percentPattern=/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*%(?!\d)/giu;
const discountLabel=/\b(?:descuentos?|dscto|dcto|dto|bonif(?:icaci[oó]n)?|rebaja)\b\.?/iu;
const nonsupplierPercent=/\b(?:iva|impuestos?|percepciones?|retenciones?|inter[eé]s)\b/iu;
function percentEvidence(src:string):{basis_points:string;literal:string}|null{
 const all=[...src.matchAll(percentPattern)];
 if(all.length!==1)return null;
 const [whole,fraction='']=all[0][1].replace('.',',').split(',');
 if(!/^\d{1,3}$/u.test(whole)||fraction.length>2)return null;
 const basis=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')||'0');
 if(basis>10000n)return null;
 return {basis_points:basis.toString(),literal:all[0][0].trim()};
}
/**
 * A number in a source row is NOT automatically a discount. Require either
 * an explicit discount label on the same row or PDF.js x alignment to an
 * unambiguous, earlier discount-column heading. Never trust AI to choose
 * the discount semantics or use an unrelated IVA percentage.
 */
type LocatedDiscount=NonNullable<SourceRowCheckB5['discount_evidence']> &
 Readonly<{header_index?:number}>;
function sourceDiscount(row:RawLineV2,src:GeometricRow,
 preceding:readonly GeometricRow[]):LocatedDiscount|undefined{
 if(row.kind!=='material'||row.unit_price_role!=='list_explicit')return;
 const pct=percentEvidence(src.text);
 if(!pct)return;
 const source=norm(src.text);
 if(nonsupplierPercent.test(source))return;
 if(discountLabel.test(source))return {...pct,origin:'inline_explicit'};
 if(!Number.isFinite(src.y)||!Array.isArray(src.parts))return;
 const percentCells=src.parts.filter(part=>
  typeof part.text==='string'&&Number.isFinite(part.x)&&
  percentEvidence(part.text)?.basis_points===pct.basis_points);
 if(percentCells.length!==1)return;
 const x=percentCells[0].x;
 const headings=preceding.flatMap((h,index)=>{
  if(h.page!==src.page||!Number.isFinite(h.y)||
     h.y!<=(src.y as number)||h.y!-(src.y as number)>360||
     !Array.isArray(h.parts)||nonsupplierPercent.test(h.text)||
     /\$\s*\d|\b(?:flete|env[ií]o|transporte|pallets?)\b/iu.test(h.text))
   return [];
  return (h.parts??[]).filter(p=>
   Number.isFinite(p.x)&&Math.abs(p.x-x)<=10&&
   discountLabel.test(p.text)).map(()=>index);
 });
 if(headings.length!==1)return;
 return {...pct,origin:'aligned_header',header_index:headings[0]};
}
const totalLabel=/\b(?:total(?:\s+(?:general|final|neto|presupuesto|comprobante|de\s+factura|a\s+pagar))?|importe\s+total|monto\s+total|a\s+pagar)\b/iu;
const totalUnsafe=/\b(?:iva|flete|env[ií]o|transporte|descuento|bonificaci[oó]n|pallets?|sub\s*total)\b/iu;
const numericMoney=/(?<![\p{L}\p{N}.,])(?:(?:ARS|USD|U\$S)\s*|\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?![\p{L}\p{N}.,])/giu;
function amountsIn(text:string):bigint[]|null{
 const tokens=[...text.matchAll(numericMoney)];
 const cents:bigint[]=[];
 for(const t of tokens){
  const amount=parseArgentineMoneyCentsB5(t[0]);
  if(amount===null)return null;
  cents.push(amount);
 }
 return cents;
}
function onlyAmount(text:string,expected:bigint):boolean{
 const tokens=[...text.matchAll(numericMoney)];
 if(tokens.length!==1)return false;
 const amount=parseArgentineMoneyCentsB5(tokens[0][0]);
 if(amount!==expected)return false;
 const rest=text.replace(numericMoney,'').replace(/[\s:;=|()-]/gu,'');
 return rest.length===0;
}
/** Match exactly one labeled total, with the amount in the same PDF row
 * or the immediate next amount-only row. No inference from material sums.
 * A repeated/competing total or mixed IVA/freight terms is NOT accepted.
 */
function findSourceTotal(rows:readonly GeometricRow[],
 used:ReadonlySet<number>,declared:string):number[]|null{
 const amount=parseArgentineMoneyCentsB5(declared);
 if(amount===null||amount<0n)return null;
 const candidates:number[][]=[];
 let seenLabels=0;
 for(let i=0;i<rows.length;i++){
  if(used.has(i)||!totalLabel.test(rows[i].text))continue;
  const labelRow=rows[i].text;
  const nums=amountsIn(labelRow);
  // A table header may have a "Total" COLUMN, not a document total.
  // Never count it as a competing total just because it says "Total".
  if(nums?.length===0&&
    /\b(?:cantidad|descripci[oó]n|art[ií]culo|unitario|precio|dscto|descuento)\b/iu.test(labelRow))
   continue;
  seenLabels++;
  if(totalUnsafe.test(labelRow))continue;
  // Same-row label + one exactly equal, parsed monetary value.
  if(nums?.length===1&&nums[0]===amount){
   candidates.push([i]);continue;
  }
  if(nums?.length!==0)continue;
  const next=rows[i+1];
  if(!next||used.has(i+1)||next.page!==rows[i].page||
     !onlyAmount(next.text,amount))continue;
  candidates.push([i,i+1]);
 }
 if(seenLabels!==1||candidates.length!==1)return null;
 return candidates[0];
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
 readPdf:EvidenceReaderB5;
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
 let extracted:Awaited<ReturnType<EvidenceReaderB5>>;
 try{
  const timeout=AbortSignal.timeout(10000);
  if(typeof args.readPdf!=='function')return fail('reader_unavailable',real,true);
  extracted=await Promise.race([
   args.readPdf(bytes),
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
    typeof r.text!=='string'||r.text.length>8000||
    (r.y!==undefined&&!Number.isFinite(r.y))||
    (r.parts!==undefined&&(!Array.isArray(r.parts)||
      r.parts.length>100||r.parts.some((p:{x:number;text:string})=>!Number.isFinite(p.x)||
        typeof p.text!=='string'||p.text.length>2000)))))
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
  const earlier=selected?extracted.rows.slice(0,selected.i):[];
  const discount=selected?sourceDiscount(row,selected.sr,earlier):undefined;
  if(discount?.header_index!==undefined)used.add(discount.header_index);
  const publicDiscount=discount===undefined?undefined:{
   basis_points:discount.basis_points,literal:discount.literal,
   origin:discount.origin
  };
  checks.push({ordinal:row.ordinal,kind:row.kind,state:status,
   ...(selected?{page:selected.sr.page}:{}),
   ...(publicDiscount?{discount_evidence:publicDiscount}:{})});
 }
 if(checks.some(x=>x.state!=='source_line_corresponds'))
  return fail('line_discrepancy',real,true,checks,extracted.rows.length);
 // A matched candidate line does not excuse an omitted priced item or an
 // unclaimed fiscal/logistics condition elsewhere in the original PDF.
 // This is NEGATIVE evidence only; the absence of suspicious rows is NOT
 // a complete source audit (unmarked numbers/columns may still be missed).
 const total=structural.document.total_declared_raw;
 if(total!==null){
  const matched=findSourceTotal(extracted.rows,used,total);
  if(matched===null)
   return fail('source_total_unverified',real,true,checks,extracted.rows.length);
  for(const index of matched)used.add(index);
 }
 const unclaimedTerm=/\b(?:iva|flete|env[ií]o|transporte|descuento|dscto|dcto|bonificaci[oó]n|pallets?|contado|efectivo|transferencia)\b/iu;
 if(extracted.rows.some((sr,i)=>!used.has(i)&&
   (/\$\s*\d/u.test(sr.text)||unclaimedTerm.test(sr.text))))
  return fail('unmapped_source_content',real,true,checks,extracted.rows.length);
 return {state:'source_rows_correspond_private',
  reason:'rows_correspond_but_full_coverage_unchecked',
  source_sha256:real,sha_verified:true,
  source_rows_extracted:extracted.rows.length,lines:checks,
  total_state:total===null?'not_declared':'unique_source_total',
  full_document_covered:false,discount_column_verified:false,
  can_publish:false,can_rank:false,can_reveal_contacts:false};
}

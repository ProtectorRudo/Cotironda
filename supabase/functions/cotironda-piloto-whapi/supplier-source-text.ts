/**
 * MVP-106: independent source-text coverage for a supplier's TXT/CSV attachment.
 * The model proposal is untrusted. The source is the downloaded, SHA256-checked
 * private file; this checker NEVER authorizes publication or a commercial rank.
 *
 * PDFs, images, DOCX and XLSX need independent format-aware readers; do not
 * pretend two LLM passes are evidence of their complete contents.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';

export type SourceCheckResult=Readonly<{
 state:'source_text_covered'|'needs_source_review';
 reason:'covered'|'unsupported_format'|'invalid_source'|'unsupported_layout'|
  'unresolved'|'unsafe_contact'|'line_not_found'|'line_order_mismatch'|
  'field_not_on_source'|'uncovered_money'|'uncovered_number'|'uncovered_terms'|'total_not_found';
 lines:number;
 sourceSha256:string|null;
 sourceVerified:boolean;
 publicationAllowed:false;
 rankingAllowed:false;
}>;

type Line=DocumentDraft['lines'][number];
type Reason=SourceCheckResult['reason'];
const DOLLARS=/-?\$\s*\d[\d.,]*/gu;
const HAS_CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const PII=/(\b(?:cuit|cuil|whats?app|celular|tel[eé]fono|contacto|corral[oó]n|pinturer[ií]a|ferreter[ií]a|facturar\s+a|raz[oó]n\s+social|direcci[oó]n|domicilio|instagram|firma\s+de)\b|https?:\/\/|wa\.me\/|@[a-z0-9_]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b|\+54[\s-]*\d)/iu;

const not=(reason:Reason,lines:number,hash:string|null):SourceCheckResult=>
 Object.freeze({state:'needs_source_review',reason,lines,
  sourceSha256:hash,sourceVerified:false,
  publicationAllowed:false,rankingAllowed:false});
const ok=(lines:number,hash:string):SourceCheckResult=>
 Object.freeze({state:'source_text_covered',reason:'covered',lines,
  sourceSha256:hash,sourceVerified:false,
  publicationAllowed:false,rankingAllowed:false});
function seen(haystack:string,needle:string|null):boolean{
 return needle===null||needle.length===0||
  haystack.includes(needle);
}
function isQuoteLine(line:Line,source:string):boolean{
 // Never silently fix punctuation, decimal separators or minus signs.
 if(!source.toLocaleLowerCase('es-AR').includes(
  line.original_description.toLocaleLowerCase('es-AR')))return false;
 return seen(source,line.unit_price)&&seen(source,line.line_total)&&
  seen(source,line.quantity)&&
  (line.unit===null||source.toLocaleLowerCase('es-AR').includes(
   line.unit.toLocaleLowerCase('es-AR')));
}
function moneyTokens(s:string):string[]{
 return [...s.matchAll(DOLLARS)].map(m=>m[0]);
}
function sourceMoneyCovered(source:string,line:Line):boolean{
 const seenOnSource=moneyTokens(source);
 const claimed=[line.unit_price,line.line_total].filter(
  (x):x is string=>typeof x==='string'&&x.length>0);
 // Compare EVERY occurrence, not just set membership. If the original
 // contains two identical $12.000,00 amounts, the model must account for
 // both, or the source remains for private review.
 if(seenOnSource.length!==claimed.length)return false;
 const occurrences=new Map<string,number>();
 for(const literal of seenOnSource)
  occurrences.set(literal,(occurrences.get(literal)??0)+1);
 for(const literal of claimed){
  const count=occurrences.get(literal)??0;
  if(count===0)return false;
  occurrences.set(literal,count-1);
 }
 return [...occurrences.values()].every(count=>count===0);
}
/**
 * Every visible word must belong to a model-captured description or unit.
 * Otherwise a trailing "IVA incluido", "pago contado", "flete sin cargo"
 * or other commercial condition could vanish without affecting the sums.
 * Allow only arithmetic "x" after subtracting source-exact fields.
 */
function unclaimedWords(source:string,line:Line):boolean{
 let left=source;
 const consume=(v:string|null):boolean=>{
  if(v===null||v.length===0)return true;
  const index=left.toLocaleLowerCase('es-AR').indexOf(
   v.toLocaleLowerCase('es-AR'));
  if(index<0)return false;
  left=left.slice(0,index)+' '+left.slice(index+v.length);
  return true;
 };
 if(!consume(line.original_description)||!consume(line.unit)||
    !consume(line.unit_price)||!consume(line.line_total))return true;
 // Numbers are already checked by remainingNumberCovered: after removing
 // descriptions and money, each is the explicitly declared quantity.
 left=left.replace(/\d+(?:[.,]\d+)?/gu,' ');
 const words=left.match(/\p{L}+/gu)??[];
 return words.some(word=>word.toLocaleLowerCase('es-AR')!=='x');
}
function remainingNumberCovered(source:string,line:Line):boolean{
 // Remove source-exact description and the full money tokens first, so
 // weights ("50 kg"), sizes ("2,5 mm²"), and prices are not mistaken for
 // a missing requested quantity.
 const lower=source.toLocaleLowerCase('es-AR');
 const needle=line.original_description.toLocaleLowerCase('es-AR');
 const start=lower.indexOf(needle);
 if(start<0)return false;
 const noDescription=source.slice(0,start)+' '+source.slice(
   start+line.original_description.length);
 const residual=noDescription.replace(DOLLARS,' ');
 const numeric=[...residual.matchAll(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)]
  .map(m=>m[0]);
 if(numeric.length===0)return true;
 if(line.quantity===null)return false;
 return numeric.every(n=>n===line.quantity);
}
/** Source-level textual coverage, not supplier identity vetting. */
export function checkSupplierTextSource(
 source:DownloadedMedia,proposal:DocumentDraft
):SourceCheckResult{
 const hash=source?.sha256??null;
 if(!source||!(source.bytes instanceof Uint8Array)||
   !/^[a-f0-9]{64}$/u.test(source.sha256)||
   !proposal||proposal.kind!=='supplier_quote'||
   !Array.isArray(proposal.lines))
  return not('invalid_source',0,null);
 if(source.mime!=='text/plain'&&source.mime!=='text/csv')
  return not('unsupported_format',proposal.lines.length,hash);
 if(source.bytes.byteLength<8||source.bytes.byteLength>3*1024*1024)
  return not('invalid_source',0,hash);
 let original:string;
 try{original=new TextDecoder('utf-8',{fatal:true}).decode(source.bytes)}
 catch{return not('invalid_source',0,hash)}
 if(original.charCodeAt(0)===0xfeff)original=original.slice(1);
 if(original.length>18000||HAS_CONTROL.test(original))
  return not('invalid_source',0,hash);
 if(PII.test(original))return not('unsafe_contact',proposal.lines.length,hash);
 if(proposal.unanswered.length>0||proposal.lines.some(
  l=>l.ambiguity!==null&&l.ambiguity.trim()!==''))
  return not('unresolved',proposal.lines.length,hash);
 const lines=original.replace(/\r\n|\r/gu,'\n').split('\n')
  .map(s=>s.trim()).filter(Boolean);
 // Strict ordered product rows first, followed by exactly one TOTAL
 // and optional non-monetary notes either before or after TOTAL. Notes
 // are never turned into price lines or allowed to conceal extra charges.
 const n=proposal.lines.length;
 if(n<1||n>25||lines.length<n+1||lines.length>n+21)
  return not('unsupported_layout',n,hash);
 const tail=lines.slice(n);
 const totalIndices=tail.flatMap((row,i)=>
  /^(?:total(?:\s+(?:final|general|a\s+pagar))?|importe\s+total)\s*[:=]?/iu.test(row)?[i]:[]);
 if(totalIndices.length!==1)return not('total_not_found',n,hash);
 const total=tail[totalIndices[0]];
 const notes=tail.filter((_,i)=>i!==totalIndices[0]);
 const note=(proposal.requested_delivery_note??'').trim();
 const clauses=note.split(/[;\r\n]+/u).map(v=>v.trim()).filter(Boolean);
 if(notes.some(v=>moneyTokens(v).length>0))
  return not('uncovered_money',n,hash);
 const norm=(v:string)=>v.replace(/\s+/gu,' ').trim().toLocaleLowerCase('es-AR');
 const complete=norm(note);
 if(notes.some(v=>!complete.includes(norm(v)))||
    clauses.some(v=>!notes.some(row=>norm(row).includes(norm(v)))))
  return not('uncovered_terms',n,hash);
 const totalMatch=total.match(
  /^(?:total(?:\s+(?:final|general|a\s+pagar))?|importe\s+total)\s*[:=]?\s*/iu);
 if(!totalMatch||
    typeof proposal.total_declared!=='string'||
    !moneyTokens(total).includes(proposal.total_declared)||
    moneyTokens(total).length!==1)
  return not('total_not_found',proposal.lines.length,hash);
 // A total with extra wording ("IVA incluido", "pago a 30 días", etc.)
 // must NOT be marked fully source-covered when those terms are not in
 // the independently verified economic record.
 // XLSX cells are joined with a middle-dot separator: `Total: · $ ...`.
 // Accept only that *leading* separator, never omitted trailing clauses.
 const amountTail=total.slice(totalMatch[0].length).trim()
  .replace(/^·\s*/u,'');
 if(amountTail!==proposal.total_declared)
  return not('uncovered_terms',proposal.lines.length,hash);
 for(let i=0;i<proposal.lines.length;i++){
  const originalLine=lines[i],line=proposal.lines[i];
  if(typeof line.original_description!=='string'||
   line.original_description.length<2||
   !originalLine.toLocaleLowerCase('es-AR').includes(
    line.original_description.toLocaleLowerCase('es-AR')))
    return not('line_not_found',i+1,hash);
  if(!isQuoteLine(line,originalLine))
    return not('field_not_on_source',i+1,hash);
  if(!sourceMoneyCovered(originalLine,line))
    return not('uncovered_money',i+1,hash);
  if(!remainingNumberCovered(originalLine,line))
    return not('uncovered_number',i+1,hash);
  if(unclaimedWords(originalLine,line))
    return not('uncovered_terms',i+1,hash);
 }
 return ok(proposal.lines.length,hash);
}

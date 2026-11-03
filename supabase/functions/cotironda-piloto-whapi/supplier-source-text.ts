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
  'field_not_on_source'|'uncovered_money'|'uncovered_number'|'total_not_found';
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
 // Every explicit monetary token must survive in the extracted line.
 // This is not an arithmetic or currency verification.
 if(seenOnSource.length===0)return claimed.length===0;
 if(claimed.length===0)return false;
 return seenOnSource.every(x=>claimed.includes(x))&&
   claimed.every(x=>seenOnSource.includes(x));
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
 // Strict one-item-per-line textual attachment; larger or complex documents
 // remain review-required instead of being quietly truncated or misread.
 if(lines.length!==proposal.lines.length+1||
   lines.length<2||lines.length>26)
  return not('unsupported_layout',proposal.lines.length,hash);
 const total=lines[lines.length-1];
 if(!/^(?:total(?:\s+(?:final|general|a\s+pagar))?|importe\s+total)\b/iu.test(total)||
   typeof proposal.total_declared!=='string'||
   !moneyTokens(total).includes(proposal.total_declared)||
   moneyTokens(total).length!==1)
  return not('total_not_found',proposal.lines.length,hash);
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
 }
 return ok(proposal.lines.length,hash);
}

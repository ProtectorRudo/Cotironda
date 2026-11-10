/**
 * MVP337 — Fuente documental flexible, SOLO DESARROLLO.
 *
 * Admite renglones fieles al origen preparados por lectores independientes.
 * No decodifica archivos, no hace OCR, no invoca IA ni autoriza publicar.
 * La IA puede proponer estructuras heterogéneas; ambas lecturas tienen que
 * citar la fuente y pasar por el cotejo original + economía preexistentes.
 *
 * Contrato independiente de la presentación del proveedor: texto, tablas,
 * hojas, páginas, mensajes y transcripciones son filas de evidencia.
 */
export type FormatoMvp337='whatsapp_text'|'pdf_text'|'pdf_ocr'|
 'image_ocr'|'xlsx'|'xls'|'docx'|'doc'|'csv'|'txt'|
 'message_group'|'audio_transcript';
export type ClaseMvp337='material'|'extra'|'condition'|'total'|'header'|'unknown';
export type FilaFuenteMvp337=Readonly<{
 position:number;section:string;literal:string
}>;
export type LoteMvp337=Readonly<{
 number:number;sourceSha256:string;rows:readonly FilaFuenteMvp337[];
}>;
export type PlanMvp337=Readonly<{
 state:'planned'|'review_required';reason:string;format:FormatoMvp337|null;
 sourceSha256:string|null;totalRows:number;lots:readonly LoteMvp337[];
 economicPublicationAllowed:false;whatsappMessages:0;
}>;
export type LecturaFilaMvp337=Readonly<{
 position:number;kind:ClaseMvp337;evidence:string;
 description:string|null;quantity:string|null;unit:string|null;
 unitPrice:string|null;lineTotal:string|null
}>;
export type ResultadoCotejoMvp337=Readonly<{
 state:'ready_for_independent_source_audit'|'review_required';
 reason:string;totalRows:number;agreed:number;
 missing:readonly number[];disagree:readonly number[];
 invalid:readonly number[];unknown:readonly number[];
 economicPublicationAllowed:false;whatsappMessages:0;
}>;
const SHA=/^[a-f0-9]{64}$/u;
const FORMATS=new Set<FormatoMvp337>([
 'whatsapp_text','pdf_text','pdf_ocr','image_ocr','xlsx','xls',
 'docx','doc','csv','txt','message_group','audio_transcript'
]);
const CLASSES=new Set<ClaseMvp337>([
 'material','extra','condition','total','header','unknown'
]);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const plain=(s:unknown,max:number):s is string=>
 typeof s==='string'&&s.length>0&&s.length<=max&&!CONTROL.test(s);
const no=(reason:string,format:FormatoMvp337|null,hash:string|null,total=0):
 PlanMvp337=>Object.freeze({
 state:'review_required',reason,format,sourceSha256:hash,
 totalRows:total,lots:[],economicPublicationAllowed:false,whatsappMessages:0
});
/** Never slice one row to meet a token limit: reject and preserve original. */
export function planificarEvidenciaMvp337(input:{
 format:FormatoMvp337;sourceSha256:string;rows:readonly FilaFuenteMvp337[];
 maxRowsPerLot?:number;maxCharsPerLot?:number;
}):PlanMvp337{
 const format=FORMATS.has(input?.format)?input.format:null;
 const hash=SHA.test(input?.sourceSha256??'')?input.sourceSha256:null;
 if(!format||!hash)return no('invalid_source_identity',format,hash);
 if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>1200)
  return no('source_size_requires_review',format,hash);
 const maxRows=input.maxRowsPerLot??20,maxChars=input.maxCharsPerLot??4500;
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>20||
    !Number.isSafeInteger(maxChars)||maxChars<100||maxChars>4500)
  return no('unsafe_batch_configuration',format,hash,input.rows.length);
 let totalChars=0;
 for(let i=0;i<input.rows.length;i++){
  const r=input.rows[i];
  if(!obj(r)||r.position!==i+1||
     !plain(r.section,100)||!plain(r.literal,8192))
   return no('invalid_or_out_of_order_source_row',format,hash,input.rows.length);
  totalChars+=r.literal.length;
  if(r.literal.length>maxChars)
   return no('single_row_exceeds_safe_batch',format,hash,input.rows.length);
  if(totalChars>450000)
   return no('extracted_text_too_large',format,hash,input.rows.length);
 }
 const lots:LoteMvp337[]=[];let current:FilaFuenteMvp337[]=[],used=0;
 const flush=()=>{
  if(current.length){
   lots.push(Object.freeze({number:lots.length+1,sourceSha256:hash,
    rows:Object.freeze(current)}));current=[];used=0;
  }
 };
 for(const r of input.rows){
  if(current.length&&(current.length>=maxRows||used+r.literal.length>maxChars))
   flush();
  current.push(Object.freeze({...r}));used+=r.literal.length;
 }
 flush();
 if(lots.length>1200)return no('too_many_batches',format,hash,input.rows.length);
 return Object.freeze({
  state:'planned',reason:'complete_original_rows',format,sourceSha256:hash,
  totalRows:input.rows.length,lots:Object.freeze(lots),
  economicPublicationAllowed:false,whatsappMessages:0
 });
}
const VALUES=['description','quantity','unit','unitPrice','lineTotal'] as const;
const allowNullable=(value:unknown):value is string|null=>
 value===null||plain(value,1024);
const monetary=/\$|\b(?:ars|usd|u\$s|ar\$)\b/iu;
/** A quote number cannot match inside a longer integer (15 != 15000). */
function literalMatch(source:string,value:string):boolean{
 if(!value||value.length>1024)return false;
 let at=source.indexOf(value);
 while(at>=0){
  const before=at===0?'':source[at-1],after=source[at+value.length]??'';
  if(!(before&&/\d/u.test(before)&&/^[\d.,]/u.test(value))&&
     !(after&&/\d/u.test(after)&&/[\d.,]$/u.test(value)))
   return true;
  at=source.indexOf(value,at+1);
 }
 return false;
}
function validateReading(row:FilaFuenteMvp337,v:unknown):v is LecturaFilaMvp337{
 if(!obj(v)||Object.keys(v).length!==8||
    v.position!==row.position||!CLASSES.has(v.kind as ClaseMvp337)||
    !plain(v.evidence,8192)||!row.literal.includes(v.evidence)||
    !VALUES.every(k=>allowNullable(v[k])))return false;
 for(const k of VALUES){
  const val=v[k];
  if(typeof val==='string'&&!literalMatch(row.literal,val))return false;
 }
 // A header cannot conceal commercial amounts. Conditions are preserved
 // as original source rows, not reinterpreted as zero-valued items.
 if(v.kind==='header'&&monetary.test(row.literal))return false;
 if(v.kind==='material'&&monetary.test(row.literal)&&
    v.unitPrice===null&&v.lineTotal===null)return false;
 if(v.kind==='total'&&v.lineTotal===null)return false;
 return true;
}
const signature=(r:LecturaFilaMvp337)=>JSON.stringify([
 r.kind,r.evidence,r.description,r.quantity,r.unit,r.unitPrice,r.lineTotal
]);
export function corroborarLecturasMvp337(
 plan:PlanMvp337,first:readonly LecturaFilaMvp337[],
 second:readonly LecturaFilaMvp337[]
):ResultadoCotejoMvp337{
 const done=(reason:string,agreed:number,missing:number[],
   disagree:number[],invalid:number[],unknown:number[]):
 ResultadoCotejoMvp337=>Object.freeze({
  state:plan?.state==='planned'&&!missing.length&&!disagree.length&&
   !invalid.length&&!unknown.length?'ready_for_independent_source_audit':
   'review_required',
  reason,totalRows:plan?.totalRows??0,agreed,
  missing:Object.freeze(missing),disagree:Object.freeze(disagree),
  invalid:Object.freeze(invalid),unknown:Object.freeze(unknown),
  economicPublicationAllowed:false,whatsappMessages:0
 });
 if(plan?.state!=='planned'||!Array.isArray(first)||!Array.isArray(second)||
    first.length>1200||second.length>1200)
  return done('invalid_plan_or_readings',0,[],[],[0],[]);
 const source=plan.lots.flatMap(x=>x.rows);
 if(source.length!==plan.totalRows||source.some((r,i)=>r.position!==i+1)||
    plan.lots.some((lot,i)=>lot.number!==i+1||
     lot.sourceSha256!==plan.sourceSha256))
  return done('plan_integrity_failed',0,[],[],[0],[]);
 const indexed=(entries:readonly LecturaFilaMvp337[])=>{
  const map=new Map<number,unknown>();let extras=false;
  for(const e of entries){
   if(!obj(e)||!Number.isSafeInteger(e.position)||e.position<1||
      e.position>source.length||map.has(e.position)){extras=true;continue}
   map.set(e.position,e);
  }
  return {map,extras};
 };
 const a=indexed(first),b=indexed(second);
 if(a.extras||b.extras)return done('duplicate_or_extra_source_row',0,[],[],[0],[]);
 let agreed=0;const missing:number[]=[],disagree:number[]=[],
  invalid:number[]=[],unknown:number[]=[];
 for(const row of source){
  const f=a.map.get(row.position),s=b.map.get(row.position);
  if(f===undefined||s===undefined){missing.push(row.position);continue}
  if(!validateReading(row,f)||!validateReading(row,s)){
   invalid.push(row.position);continue;
  }
  if(signature(f)!==signature(s)){disagree.push(row.position);continue}
  if(f.kind==='unknown'){unknown.push(row.position);continue}
  agreed++;
 }
 const reason=invalid.length?'unverifiable_source_literal':
  missing.length?'source_row_missing':
  disagree.length?'independent_readings_disagree':
  unknown.length?'unclassified_commercial_row':'all_rows_preserved';
 return done(reason,agreed,missing,disagree,invalid,unknown);
}

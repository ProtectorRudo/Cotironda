/**
 * MVP277 — independent, PRIVATE buyer document source check.
 *
 * Accepts only PDF with embedded positioned text, or simple DOCX/XLSX that
 * the existing strict ZIP/XML readers can decode in full.
 * This DOES NOT authorize a round: SQL MVP276 only supports TXT/CSV bytes.
 * Two identical model readings cannot replace independent binary evidence.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import {readOfficeVisibleRows} from './supplier-source-office.ts';
import {
 readPdfPositioned,type PdfSourceEvidence
} from './supplier-source-pdf-general.ts';

const PDF='application/pdf';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SUPPORTED=new Set([PDF,DOCX,XLSX]);
const HEX=/^[a-f0-9]{64}$/u;
const CTRL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DECIMAL=/^(?:0|[1-9][0-9]{0,5})(?:[.,][0-9]{1,3})?$/u;
const HEADING=/^(?:pedido|lista|solicitud|materiales|rubro|obra|entrega|destino|zona|localidad|direcci[oó]n|ubicaci[oó]n|cantidad|unidad|descripci[oó]n|detalle)(?:\b|[:\s])/iu;
type State='apagado'|'requiere_revision'|'requiere_zona'|'fuente_contrastada_privada';
export type AtestacionDocumentalCompradorMvp277=Readonly<{
 estado:State;codigo:string;
 sha256Original:string|null;sha256TextoDerivado:string|null;
 renglonesAcreditados:number;origenIndependiente:boolean;
 soloVistaPrivada:true;rondaCreada:false;whatsappEnviado:false;
 // Only in trusted server memory. Never include this in an HTTP response/log.
 textoFuentePrivado:string|null;
}>;
const result=(estado:State,codigo:string,hash:string|null=null,
 textHash:string|null=null,rows=0,text:string|null=null):
 AtestacionDocumentalCompradorMvp277=>Object.freeze({
 estado,codigo,sha256Original:hash,sha256TextoDerivado:textHash,
 renglonesAcreditados:rows,origenIndependiente:estado==='fuente_contrastada_privada',
 soloVistaPrivada:true,rondaCreada:false,whatsappEnviado:false,
 textoFuentePrivado:text
});
const hex=(b:Uint8Array):string=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(bytes:Uint8Array):Promise<string>=>hex(
 new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))
);
const normalize=(x:string):string=>x.normalize('NFKC')
 .replace(/\s+/gu,' ').trim().toLocaleLowerCase('es-AR');
const token=(s:string,value:string,forQuantity=false):boolean=>{
 const source=normalize(s),needle=normalize(value);
 if(!needle)return false;
 let i=source.indexOf(needle);
 while(i>=0){
  const left=source.slice(0,i),right=source.slice(i+needle.length);
  const boundary=forQuantity?/[\p{L}\p{N}.,]/u:/[\p{L}\p{N}]/u;
  if(!boundary.test(left.slice(-1))&&!boundary.test(right.slice(0,1)))
   return true;
  i=source.indexOf(needle,i+1);
 }
 return false;
};
const stripToken=(source:string,tokenValue:string,quantity=false):string|null=>{
 const lower=normalize(source),needle=normalize(tokenValue);
 let i=lower.indexOf(needle);
 while(i>=0){
  const before=lower.slice(0,i),after=lower.slice(i+needle.length);
  const boundary=quantity?/[\p{L}\p{N}.,]/u:/[\p{L}\p{N}]/u;
  if(!boundary.test(before.slice(-1))&&!boundary.test(after.slice(0,1)))
   return before+' '+after;
  i=lower.indexOf(needle,i+1);
 }
 return null;
};
const signature=(d:DocumentDraft)=>JSON.stringify({
 status:d.status,kind:d.kind,city:d.delivery_city,note:d.requested_delivery_note,
 total:d.total_declared,unanswered:d.unanswered,
 lines:d.lines.map(l=>[
  l.original_description,l.quantity,l.unit,l.unit_price,l.line_total,l.ambiguity
 ])
});
const credible=(d:DocumentDraft|null):d is DocumentDraft=>
 !!d&&d.kind==='buyer_request'&&d.status==='review_required'&&
 Array.isArray(d.lines)&&d.lines.length>0&&d.lines.length<=25&&
 Array.isArray(d.unanswered)&&d.unanswered.length===0&&
 d.total_declared===null&&
 (d.delivery_city===null||typeof d.delivery_city==='string'&&
  d.delivery_city.trim().length>=3&&d.delivery_city.length<=80)&&
 d.lines.every(l=>l&&typeof l.original_description==='string'&&
  l.original_description.trim().length>=3&&l.original_description.length<=500&&
  typeof l.quantity==='string'&&DECIMAL.test(l.quantity)&&
  typeof l.unit==='string'&&l.unit.trim().length>0&&l.unit.length<=40&&
  l.ambiguity===null&&l.unit_price===null&&l.line_total===null&&
  typeof l.evidence_location==='string'&&l.evidence_location.trim().length>0);
export async function contrastarDocumentoCompradorMvp277(args:{
 habilitado:boolean;
 original:DownloadedMedia;
 primera:DocumentDraft|null;
 segunda:DocumentDraft|null;
 // Inject only in tests. Production uses the actual strict source readers.
 lectorPdf?:typeof readPdfPositioned;
 lectorOffice?:typeof readOfficeVisibleRows;
}):Promise<AtestacionDocumentalCompradorMvp277>{
 if(args?.habilitado!==true)return result('apagado','flag_disabled');
 const input=args.original;
 if(!input||!SUPPORTED.has(input.mime)||!HEX.test(input.sha256)||
    !(input.bytes instanceof Uint8Array)||
    input.bytes.length<120||input.bytes.length>3145728)
  return result('requiere_revision','source_format_or_size_invalid');
 let actual:string;
 try{actual=await sha(input.bytes)}catch{
  return result('requiere_revision','hash_unavailable');
 }
 if(actual!==input.sha256)
  return result('requiere_revision','original_sha256_mismatch');
 const a=args.primera,b=args.segunda;
 if(!credible(a)||!credible(b)||signature(a)!==signature(b))
  return result('requiere_revision','two_readings_not_corroborated');
 let rows:string[];
 try{
  if(input.mime===PDF){
   const evidence:PdfSourceEvidence=await (args.lectorPdf??readPdfPositioned)(
    input.bytes
   );
   if(evidence.scanned||evidence.pages<1||evidence.pages>12||
      evidence.rows.length<1||evidence.rows.length>90||
      evidence.rows.some(r=>!Number.isInteger(r.page)||
       r.page<1||r.page>evidence.pages||typeof r.text!=='string'))
    return result('requiere_revision','pdf_scanned_or_layout_untrusted');
   rows=evidence.rows.map(r=>r.text);
  }else{
   rows=[...await (args.lectorOffice??readOfficeVisibleRows)(input)];
  }
 }catch{return result('requiere_revision','independent_reader_cannot_verify')}
 if(rows.length<1||rows.length>90||rows.some(r=>
  typeof r!=='string'||r.length<1||r.length>800||CTRL.test(r)
 ))return result('requiere_revision','source_rows_untrusted');
 const originalText=rows.map(r=>r.trim()).join('\n');
 if(originalText.length<10||originalText.length>4000)
  return result('requiere_revision','source_capacity_requires_batches');
 const taken=new Set<number>();
 // Each proposed item must appear on a DISTINCT source row in order.
 let cursor=-1;
 for(const l of a.lines){
  let found=-1;
  for(let i=cursor+1;i<rows.length;i++){
   const raw=normalize(rows[i]),desc=normalize(l.original_description);
   if(!raw.includes(desc))continue;
   const other=raw.replace(desc,' ');
   if(!token(other,l.quantity!,true)||!token(other,l.unit!))continue;
   // Do not silently lose a price, product number or an extra quantity.
   const minusQty=stripToken(other,l.quantity!,true);
   const minusUnit=minusQty===null?null:stripToken(minusQty,l.unit!);
   if(minusUnit===null||/[\d$€£]/u.test(minusUnit))continue;
   found=i;break;
  }
  if(found<0)return result('requiere_revision','line_not_proven_on_original');
  taken.add(found);cursor=found;
 }
 // Any unclaimed row with a number or a non-header statement blocks
 // the entire draft. No silently dropped articles or add-on materials.
 for(let i=0;i<rows.length;i++){
  if(taken.has(i))continue;
  if(/[\d$€£]/u.test(rows[i])||!HEADING.test(rows[i].trim()))
   return result('requiere_revision','unclaimed_original_row');
 }
 const city=a.delivery_city;
 if(!city||!rows.some(r=>normalize(r).includes(normalize(city))))
  return result('requiere_zona','delivery_city_not_proven',actual);
 const textHash=await sha(new TextEncoder().encode(originalText));
 return result('fuente_contrastada_privada','independent_rows_verified',
  actual,textHash,taken.size,originalText);
}

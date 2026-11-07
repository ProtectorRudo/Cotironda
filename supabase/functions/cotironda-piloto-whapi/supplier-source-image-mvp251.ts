/**
 * MVP251 — diagnóstico de originales visuales de presupuestos (JPEG/PNG/WebP).
 * Dos lecturas de visión concordantes NO son una prueba independiente del píxel:
 * la fuente sigue PRIVADA y requiere una corroboración ajena al LLM o revisión.
 * Esta función no guarda datos, no publica, no clasifica competitividad ni envía.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {SourceCheckResult} from './supplier-source-text.ts';

type Reason=SourceCheckResult['reason'];
const MIME=new Set(['image/jpeg','image/png','image/webp']);
const SHA=/^[a-f0-9]{64}$/u;
const PII=/(?:\bcuit\b|\bcuil\b|whats?app|celular|tel[eé]fono|raz[oó]n social|direcci[oó]n|contacto|https?:\/\/|wa\.me|@[\w.-]+|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\+54[\s-]*\d)/iu;
const control=/[\u0000-\u001f\u007f]/u;

const result=(source:DownloadedMedia|null,reason:Reason,lines:number):SourceCheckResult=>
 Object.freeze({state:'needs_source_review',reason,lines,
  sourceSha256:SHA.test(source?.sha256??'')?source!.sha256:null,
  sourceVerified:false,publicationAllowed:false,rankingAllowed:false});

function signature(bytes:Uint8Array,mime:string):boolean{
 const start=(...arr:number[])=>arr.every((v,i)=>bytes[i]===v);
 if(mime==='image/jpeg')return start(0xff,0xd8,0xff);
 if(mime==='image/png')return start(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
 if(mime==='image/webp')return start(0x52,0x49,0x46,0x46)&&
   bytes.length>=12&&startAt(bytes,8,0x57,0x45,0x42,0x50);
 return false;
}
function startAt(bytes:Uint8Array,offset:number,...values:number[]):boolean{
 return values.every((v,i)=>bytes[offset+i]===v);
}
function validReading(read:DocumentDraft|null):read is DocumentDraft{
 if(!read||read.status!=='review_required'||
    read.kind!=='supplier_quote'||!Array.isArray(read.lines)||
    read.lines.length<1||read.lines.length>25||
    !Array.isArray(read.unanswered)||read.unanswered.length>0||
    typeof read.total_declared!=='string'||!read.total_declared.trim()||
    !read.lines.every(line=>line&&line.ambiguity===null&&
      typeof line.original_description==='string'&&
      line.original_description.trim().length>=2&&
      typeof line.evidence_location==='string'&&
      line.evidence_location.trim().length>0&&
      [line.quantity,line.unit,line.unit_price,line.line_total].every(
        v=>v===null||typeof v==='string'&&v.length<=256
      )))return false;
 return true;
}
function claimedPII(read:DocumentDraft):boolean{
 const fields=[
  read.total_declared,read.requested_delivery_note,read.delivery_city,
  ...read.unanswered,
  ...read.lines.flatMap(line=>[
   line.original_description,line.quantity,line.unit,
   line.unit_price,line.line_total,line.evidence_location
  ])
 ];
 return fields.some(v=>typeof v==='string'&&(PII.test(v)||control.test(v)));
}
function signatureOfReading(read:DocumentDraft):string{
 // Misma representación económica, sin interpretar ni normalizar cifras.
 // La ubicación puede variar entre dos lecturas independientes, pero las
 // celdas, cantidades, precios, descripción y notas deben coincidir.
 return JSON.stringify({
  kind:read.kind,total:read.total_declared,
  delivery_city:read.delivery_city,
  note:read.requested_delivery_note,
  lines:read.lines.map(line=>[
   line.original_description,line.quantity,line.unit,
   line.unit_price,line.line_total
  ])
 });
}

/** Requisito independiente del motor OCR: sin dos lecturas, no cotejar. */
export function lecturasVisualesConcordantesMvp252(
 first:DocumentDraft|null,second:DocumentDraft|null
):boolean{
 return validReading(first)&&validReading(second)&&
  !claimedPII(first)&&!claimedPII(second)&&
  signatureOfReading(first)===signatureOfReading(second);
}

/** SIEMPRE retorna needs_source_review. Nunca autoriza publicación visual. */
export async function checkSupplierImageSourceMvp251(
 source:DownloadedMedia,
 first:DocumentDraft|null,
 second:DocumentDraft|null
):Promise<SourceCheckResult>{
 const count=Array.isArray(first?.lines)?first.lines.length:0;
 if(!source||!MIME.has(source.mime))return result(source,'unsupported_format',count);
 if(!(source.bytes instanceof Uint8Array)||source.bytes.length<12||
    source.bytes.length>8*1024*1024||!SHA.test(source.sha256)||
    !signature(source.bytes,source.mime))
  return result(source,'invalid_source',count);
 const hashed=Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(source.bytes))),
  b=>b.toString(16).padStart(2,'0')
 ).join('');
 if(hashed!==source.sha256)return result(source,'invalid_source',count);
 // No se aceptan fuentes con remitente/identidad incluida en los campos
 // del borrador. Este control NO sustituye revisar el píxel original.
 if(!validReading(first)||!validReading(second))
  return result(source,'unresolved',count);
 if(claimedPII(first)||claimedPII(second))
  return result(source,'unsafe_contact',count);
 if(signatureOfReading(first)!==signatureOfReading(second))
  return result(source,'unresolved',count);
 // Incluso dos modelos que coinciden podrían haber omitido la misma cifra.
 // Sin OCR independiente o una revisión de la imagen, NO hay fuente verificada.
 return result(source,'unsupported_layout',count);
}

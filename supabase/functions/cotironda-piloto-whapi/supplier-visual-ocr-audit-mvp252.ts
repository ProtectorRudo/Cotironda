/**
 * MVP252 — evidencia OCR INDEPENDIENTE, SOLO DIAGNÓSTICO PRIVADO.
 * Usa un lector distinto del modelo semántico; coteja cada línea y cada
 * importe con el estricto comprobador de origen de Cotironda.
 *
 * Por política deliberada NO registra "source_text_covered" en SQL MVP106,
 * NO invoca el publicador MVP107 y NO concede publicación ni ranking.
 * Las fotos no son admitidas por el contrato SQL actual. Falta ADR de
 * privacidad/proveedor externo + migración y E2E antes de promoverlas.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import {
 checkSupplierImageSourceMvp251,lecturasVisualesConcordantesMvp252
} from './supplier-source-image-mvp251.ts';
import {readPdfPositioned,type PdfSourceEvidence}
 from './supplier-source-pdf-general.ts';
import {checkSupplierTextSource} from './supplier-source-text.ts';
import {leerOCRGoogleMvp252} from './supplier-ocr-google-mvp252.ts';

type Status='disabled'|'source_ocr_covered_private'|'needs_review';
export type VisualAuditMvp252=Readonly<{
 state:Status;reason:string;
 sourceSha256:string|null;
 sourceVerified:false;publicationAllowed:false;rankingAllowed:false;
 provider:'google_cloud_vision'|null;
 pages:number|null;
 /** Digest of independently read text, never the text itself. */
 ocrTextSha256:string|null;
 minConfidenceMilli:number|null;
}>;
type Args=Readonly<{
 source:DownloadedMedia;primary:DocumentDraft|null;secondary:DocumentDraft|null;
 enabled:boolean;externalConsent:boolean;serviceAccountJson:string;
 fetchImpl?:typeof fetch;
 inspectPdf?:(bytes:Uint8Array)=>Promise<PdfSourceEvidence>;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const audit=(state:Status,reason:string,source:DownloadedMedia|null,
 provider:VisualAuditMvp252['provider']=null,pages:number|null=null,
 evidence:{ocrTextSha256:string;minConfidenceMilli:number}|null=null):
 VisualAuditMvp252=>Object.freeze({
  state,reason,sourceSha256:HASH.test(source?.sha256??'')?source!.sha256:null,
  sourceVerified:false,publicationAllowed:false,rankingAllowed:false,
  provider,pages,
  ocrTextSha256:evidence?.ocrTextSha256??null,
  minConfidenceMilli:evidence?.minConfidenceMilli??null
 });

export async function auditarFuenteVisualOCRMvp252(a:Args):
 Promise<VisualAuditMvp252>{
 if(a?.enabled!==true||a.externalConsent!==true)
  return audit('disabled','visual_ocr_disabled',a?.source??null);
 if(!a.source||!allowed.has(a.source.mime)||
    !lecturasVisualesConcordantesMvp252(a.primary,a.secondary))
  return audit('needs_review','inconsistent_visual_readings',a?.source??null);

 let pages=1;
 if(a.source.mime==='application/pdf'){
  let inspection:PdfSourceEvidence;
  try{inspection=await (a.inspectPdf??readPdfPositioned)(a.source.bytes)}
  catch{return audit('needs_review','pdf_inspection_failed',a.source)}
  if(!inspection.scanned||!Number.isSafeInteger(inspection.pages)||
     inspection.pages<1||inspection.pages>5)
   return audit('needs_review','pdf_not_scanned_or_too_many_pages',a.source);
  pages=inspection.pages;
 }else{
  const conservative=await checkSupplierImageSourceMvp251(
   a.source,a.primary,a.secondary
  );
  if(conservative.reason!=='unsupported_layout')
   return audit('needs_review',conservative.reason,a.source);
 }
 let text:string;
 let confidence=0;
 try{
  const recognized=await leerOCRGoogleMvp252(a.source,{
   enabled:true,consented:true,
   serviceAccountJson:a.serviceAccountJson,
   pages,fetchImpl:a.fetchImpl
  });
  if(recognized.sourceSha256!==a.source.sha256||
     recognized.mime!==a.source.mime||recognized.pages!==pages)
   return audit('needs_review','ocr_source_mismatch',a.source);
  text=recognized.text;
  confidence=recognized.minConfidence;
 }catch(e){
  const code=e instanceof Error&&/^visual_ocr_[a-z_]+$/u.test(e.message)
   ?e.message:'visual_ocr_unavailable';
  return audit('needs_review',code,a.source);
 }
 const checked=checkSupplierTextSource({
  mime:'text/plain',bytes:new TextEncoder().encode(text),sha256:a.source.sha256
 },a.primary!);
 // Sin texto OCR, importes ni identidad en la respuesta o logs.
 const verified=checked.state==='source_text_covered'&&
   checked.sourceSha256===a.source.sha256;
 const evidence=verified?{
  ocrTextSha256:[...new Uint8Array(await crypto.subtle.digest(
   'SHA-256',new TextEncoder().encode(text)))]
   .map(b=>b.toString(16).padStart(2,'0')).join(''),
  minConfidenceMilli:Math.floor(confidence*1000)
 }:null;
 return verified
   ?audit('source_ocr_covered_private','ocr_text_lines_covered',a.source,
      'google_cloud_vision',pages,evidence)
   :audit('needs_review',checked.reason,a.source,'google_cloud_vision',pages);
}

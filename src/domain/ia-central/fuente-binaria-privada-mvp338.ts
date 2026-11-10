/**
 * MVP338 — Puente privado entre BYTES reales y evidencia MVP337.
 *
 * NO interpreta importes, NO autoriza publicar, NO ejecuta macros ni HTML,
 * NO sube originales ni manda WhatsApps. Los lectores PDF/Office existentes
 * acreditan que el texto proviene del binario; la auditoría comercial sigue
 * siendo un paso separado e indispensable.
 */
import {
 planificarEvidenciaMvp337,
 type FormatoMvp337,type FilaFuenteMvp337,type PlanMvp337
} from './ingesta-evidencia-flexible-mvp337.ts';
import {filasTextoMvp337} from './adaptador-texto-flexible-mvp337.ts';
import {readOfficeVisibleRows} from '../../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';
import {
 readPdfPositioned,
 type PdfSourceEvidence
} from '../../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';

type Mime='application/pdf'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'|
 'application/vnd.ms-excel'|'application/msword'|'text/plain'|'text/csv'|
 'image/jpeg'|'image/png'|'image/webp';
export type OriginalPrivadoMvp338=Readonly<{
 mime:Mime;bytes:Uint8Array;sha256:string
}>;
export type ResultadoBinarioMvp338=Readonly<{
 state:'evidence_planned_private'|'review_required';
 reason:string;format:FormatoMvp337|null;
 sourceSha256:string|null;
 rows:number;lots:number;plan:PlanMvp337|null;
 economicPublicationAllowed:false;whatsappMessages:0;
}>;
const SHA=/^[a-f0-9]{64}$/u;
const MAX_BYTES=8*1024*1024;
const formats:Readonly<Partial<Record<Mime,FormatoMvp337>>>={
 'application/pdf':'pdf_text',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.ms-excel':'xls','application/msword':'doc',
 'text/plain':'txt','text/csv':'csv',
 'image/jpeg':'image_ocr','image/png':'image_ocr','image/webp':'image_ocr'
};
const failure=(reason:string,format:FormatoMvp337|null,
 hash:string|null):ResultadoBinarioMvp338=>Object.freeze({
 state:'review_required',reason,format,sourceSha256:hash,
 rows:0,lots:0,plan:null,economicPublicationAllowed:false,whatsappMessages:0
});
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const magic=(bytes:Uint8Array,mime:Mime):boolean=>{
 const begins=(...values:number[])=>values.every((x,i)=>bytes[i]===x);
 if(mime==='application/pdf')return begins(37,80,68,70,45); // %PDF-
 if(mime==='image/png')return begins(137,80,78,71,13,10,26,10);
 if(mime==='image/jpeg')return begins(255,216,255);
 if(mime==='image/webp')return begins(82,73,70,70)&&
  [87,69,66,80].every((v,i)=>bytes[i+8]===v);
 if(mime.includes('openxmlformats-officedocument'))return begins(80,75,3,4);
 if(mime==='application/msword'||mime==='application/vnd.ms-excel')
  return begins(208,207,17,224,161,177,26,225);
 return true;
};
const fromRows=(format:FormatoMvp337,hash:string,
 rows:readonly FilaFuenteMvp337[]):ResultadoBinarioMvp338=>{
 const plan=planificarEvidenciaMvp337({format,sourceSha256:hash,rows});
 if(plan.state!=='planned')return failure(plan.reason,format,hash);
 return Object.freeze({
  state:'evidence_planned_private',reason:'source_rows_extracted_not_economically_verified',
  format,sourceSha256:hash,rows:plan.totalRows,lots:plan.lots.length,plan,
  economicPublicationAllowed:false,whatsappMessages:0
 });
};
/**
 * El parámetro lectorPdf se usa SOLO para ensayos con extractor simulado.
 * En ejecución normal se usa el parser real unpdf@2.1.0 con controles
 * de páginas, capas invisibles, geometría y cantidad de filas.
 */
export async function extraerEvidenciaPrivadaMvp338(
 source:OriginalPrivadoMvp338,
 lectorPdf:typeof readPdfPositioned=readPdfPositioned
):Promise<ResultadoBinarioMvp338>{
 const format=formats[source?.mime]??null;
 if(!format||!(source?.bytes instanceof Uint8Array)||
    source.bytes.length<1||source.bytes.length>MAX_BYTES||
    !SHA.test(source?.sha256??''))
  return failure('invalid_format_or_source_identity',format,null);
 const actualHash=hex(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(source.bytes))));
 if(actualHash!==source.sha256)
  return failure('original_sha256_mismatch',format,null);
 if(!magic(source.bytes,source.mime))
  return failure('binary_signature_mismatch',format,actualHash);
 if(format==='image_ocr')
  // No OCR independiente conectado todavía: conservar el original,
  // pero NO atribuir un monto de una lectura visual de IA.
  return failure('independent_visual_evidence_required',format,actualHash);
 if(format==='xls'||format==='doc')
  // OLE2 es legado: archivos válidos se archivan; un parser seguro de CFB
  // aún no está aprobado. Jamás abrir ejecutables ni macros.
  return failure('legacy_office_reader_required',format,actualHash);
 try{
  if(format==='pdf_text'){
   const evidence:PdfSourceEvidence=await lectorPdf(source.bytes);
   if(evidence.scanned)return failure('scanned_pdf_requires_independent_ocr',
    format,actualHash);
   if(!Number.isSafeInteger(evidence.pages)||evidence.pages<1||
      evidence.pages>12||!Array.isArray(evidence.rows)||
      evidence.rows.length<1||evidence.rows.length>300||
      evidence.rows.some(x=>!Number.isSafeInteger(x.page)||
       x.page<1||x.page>evidence.pages||
       typeof x.text!=='string'||!x.text.trim()))
    return failure('pdf_extraction_unverifiable',format,actualHash);
   const rows=evidence.rows.map((x,i)=>({
    position:i+1,section:'pagina:'+x.page,literal:x.text
   }));
   return fromRows(format,actualHash,rows);
  }
  if(format==='xlsx'||format==='docx'){
   const rows=await readOfficeVisibleRows(source);
   // Existing Office parser verifies ZIP/CRC and ignores NO unexplained
   // hidden worksheets, formulas, macros or external XML relationships.
   // It returns flattened visible rows, NOT sheet/cell coordinates.
   // Do not invent an exact worksheet location: record original order.
   return fromRows(format,actualHash,rows.map((literal,i)=>({
    position:i+1,section:format+':visible_row_order',literal
   })));
  }
  if(format==='txt'||format==='csv'){
   const text=new TextDecoder('utf-8',{fatal:true}).decode(source.bytes);
   const rows=filasTextoMvp337(text,format+':literal_line');
   if(!rows)return failure('text_source_invalid_or_too_large',
    format,actualHash);
   return fromRows(format,actualHash,rows);
  }
  return failure('format_needs_independent_parser',format,actualHash);
 }catch{
  // Never expose exception messages or confidential supplier source in logs.
  return failure('source_reader_requires_private_review',format,actualHash);
 }
}

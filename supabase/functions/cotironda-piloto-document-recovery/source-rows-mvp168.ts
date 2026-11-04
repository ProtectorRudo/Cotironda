/**
 * MVP168 — único lector privado del original archivado, reutilizado por MVP163
 * y por la auditoría económica. Nunca devuelve estos bytes/textos al comprador.
 * La ruta de Storage y la autorización del remitente proceden de una RPC
 * service_role con control de invitación, v9 y vigencia de la revisión.
 */
import {readPdfPositioned} from '../cotironda-piloto-whapi/supplier-source-pdf-general.ts';
import {readOfficeVisibleRows} from '../cotironda-piloto-whapi/supplier-source-office.ts';
import type {FactRow} from '../cotironda-piloto-whapi/supplier-source-facts-mvp163.ts';

export const MIME_ECONOMICOS_MVP168=new Set([
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain','text/csv'
]);
const HASH=/^[a-f0-9]{64}$/u;
type Input=Readonly<{
 mime:string;sizeBytes:number;sourceSha256:string;
}>;
export type ResultadoLecturaMvp168=
 Readonly<{estado:'checked';hash:string;rows:readonly FactRow[]}>|
 Readonly<{estado:'unreadable';hash:string;rows:readonly []}>|
 Readonly<{estado:'source_mismatch';hash:null;rows:readonly []}>;

/** Valida bytes y SHA ANTES de intentar leer contenido potencialmente hostil.
 * Fallo de parseo no equivale a archivo alterado: ambos bloquean ranking.
 */
export async function leerOriginalPrivadoMvp168(
 file:Blob,input:Input,
 readers?:Readonly<{
  pdf?:(bytes:Uint8Array)=>Promise<{scanned:boolean;rows:readonly {page:number;text:string}[]}>;
  office?:(src:{bytes:Uint8Array;mime:string;sha256:string})=>Promise<readonly string[]>;
 }>
):Promise<ResultadoLecturaMvp168>{
 const rejected=():ResultadoLecturaMvp168=>({
  estado:'source_mismatch',hash:null,rows:[] as const
 });
 if(!(file instanceof Blob)||!input||!MIME_ECONOMICOS_MVP168.has(input.mime)||
  !HASH.test(input.sourceSha256)||
  !Number.isSafeInteger(input.sizeBytes)||input.sizeBytes<120||
  input.sizeBytes>8388608||file.size!==input.sizeBytes)
  return rejected();
 let bytes:Uint8Array,hash:string;
 try{
  bytes=new Uint8Array(await file.arrayBuffer());
  hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
   b=>b.toString(16).padStart(2,'0')).join('');
 }catch{return rejected()}
 if(hash!==input.sourceSha256)return rejected();
 try{
  let rows:FactRow[]=[];
  if(input.mime==='application/pdf'){
   const pdf=await (readers?.pdf??readPdfPositioned)(bytes);
   if(pdf.scanned)return {estado:'unreadable',hash,rows:[]};
   rows=pdf.rows.map((r,i)=>({page:r.page,row:i+1,text:r.text}));
  }else if(input.mime.includes('openxmlformats-officedocument')){
   const office=await (readers?.office??readOfficeVisibleRows)({
    bytes,mime:input.mime,sha256:hash
   });
   rows=office.map((text,i)=>({page:1,row:i+1,text}));
  }else{
   const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   rows=source.split(/\r?\n/gu).map((text,i)=>({
    page:1,row:i+1,text
   })).filter(row=>row.text.trim()!=='');
  }
  if(rows.length<1||rows.length>300||rows.some(r=>
   !Number.isSafeInteger(r.page)||r.page<1||r.page>12||
   !Number.isSafeInteger(r.row)||r.row<1||r.row>300||
   typeof r.text!=='string'||r.text.length>2000))
   return {estado:'unreadable',hash,rows:[]};
  return {estado:'checked',hash,rows};
 }catch{return {estado:'unreadable',hash,rows:[]}}
}

/** V2-04b: only verified bytes from PRIVATE Storage, no reconstructed budget.
 * Reuse the conservative ZIP/XML reader already in the Cotironda repository.
 * Unsupported/scanned/image/PDF never yield synthetic text as evidence.
 */
import {createHash} from 'node:crypto';
import {readOfficeVisibleRows}
 from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';

const SHA=/^[a-f0-9]{64}$/u;
const OFFICE=new Set([
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const TEXT=new Set(['text/plain','text/csv']);
export type PdfSourceReaderV2=(
 bytes:Uint8Array,sourceSha256:string
)=>Promise<Readonly<{text:string;textSha256:string;sourceSha256:string}>|null>;
export type TextoOriginalV2=Readonly<{
 fuente:string;shaTexto:string;shaBinario:string;
 tipo:'texto_extraido_de_original';
}>;

/** 8 MiB original max; text <=24,000 Unicode code units for bounded model cost.
 * PDF requires the private Edge source proof; scanned PDF and legacy binary
 * DOC/XLS still fail closed. Never call a PDF decoder inside Node's build.
 */
export async function obtenerTextoVerificadoV2(input:Readonly<{
 bytes:Uint8Array;mime:string;shaBinario:string;
 pdfReader?:PdfSourceReaderV2;
}>):Promise<TextoOriginalV2|null>{
 try{
  if(!(input?.bytes instanceof Uint8Array)||
   input.bytes.length<1||input.bytes.length>8388608||
   typeof input.mime!=='string'||!SHA.test(input.shaBinario))
    return null;
  const actual=createHash('sha256').update(input.bytes).digest('hex');
  if(actual!==input.shaBinario)return null;
  let text:string;
  if(TEXT.has(input.mime)){
   if(input.bytes.length>100000)return null;
   text=new TextDecoder('utf-8',{fatal:true}).decode(input.bytes);
  }else if(OFFICE.has(input.mime)){
   if(input.bytes.length>3145728)return null;
   const rows=await readOfficeVisibleRows({
    bytes:input.bytes,sha256:input.shaBinario,mime:input.mime
   });
   if(rows.length<1||rows.length>300)return null;
   text=rows.join('\n');
  }else if(input.mime==='application/pdf'&&input.pdfReader){
   const evidence=await input.pdfReader(input.bytes,input.shaBinario);
   if(!evidence||evidence.sourceSha256!==input.shaBinario||
    typeof evidence.text!=='string'||typeof evidence.textSha256!=='string'||
    createHash('sha256').update(evidence.text,'utf8').digest('hex')!==
     evidence.textSha256)return null;
   text=evidence.text;
  }else return null;
  if(text.length<40||text.length>24000||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
   return null;
  return Object.freeze({
   fuente:text,shaTexto:createHash('sha256').update(text,'utf8').digest('hex'),
   shaBinario:input.shaBinario,tipo:'texto_extraido_de_original'
  });
 }catch{return null}
}

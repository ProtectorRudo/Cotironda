/**
 * MVP337 — adaptador conservador para WhatsApp, TXT y CSV.
 * No interpreta materiales ni precios. Mantiene orden y texto literal
 * de todas las líneas NO vacías, también saludos, aclaraciones, descuentos
 * y totales: la IA decidirá su clase, la auditoría decidirá su validez.
 */
import type {FilaFuenteMvp337} from './ingesta-evidencia-flexible-mvp337.ts';
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
export function filasTextoMvp337(text:string,section='mensaje:1'):
 readonly FilaFuenteMvp337[]|null{
 if(typeof text!=='string'||text.length<1||text.length>450000||
    typeof section!=='string'||section.length<1||section.length>100||
    CONTROL.test(text)||CONTROL.test(section))return null;
 const lines=text.split(/\r\n|\n|\r/u);
 const rows:FilaFuenteMvp337[]=[];
 for(const line of lines){
  if(line.trim().length===0)continue; // Blank separators aren't quote items.
  if(line.length>8192||rows.length>=1200)return null;
  rows.push(Object.freeze({position:rows.length+1,section,literal:line}));
 }
 return rows.length?Object.freeze(rows):null;
}
export function filasMensajesMvp337(messages:readonly {text:string}[]):
 readonly FilaFuenteMvp337[]|null{
 if(!Array.isArray(messages)||messages.length<1||messages.length>50)return null;
 const rows:FilaFuenteMvp337[]=[];
 for(let i=0;i<messages.length;i++){
  const lines=filasTextoMvp337(messages[i]?.text,'mensaje:'+(i+1));
  if(!lines||rows.length+lines.length>1200)return null;
  for(const line of lines)
   rows.push(Object.freeze({...line,position:rows.length+1}));
 }
 return Object.freeze(rows);
}

/**
 * B5f — isolated PDF.js geometry reader for PRIVATE V2 shadow only.
 * Do NOT edit the pinned MVP332 Whapi source reader or its manifest.
 * Original source bytes, no OCR, no network beyond pinned npm module load.
 */
import type {EvidenceReaderB5} from
 '../../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';

export const readPdfWithGeometryB5f:EvidenceReaderB5=async bytes=>{
 if(!(bytes instanceof Uint8Array)||bytes.length<120||
    bytes.length>8*1024*1024)throw Error('pdf_size_gate');
 const {getDocumentProxy,extractTextItems,inspectPages}=
  await import('npm:unpdf@2.1.0');
 const pdf=await getDocumentProxy(Uint8Array.from(bytes),{
  maxImageSize:16_777_216,isOffscreenCanvasSupported:false,
  isImageDecoderSupported:false
 });
 try{
  if(pdf.numPages<1||pdf.numPages>12)throw Error('pdf_pages_gate');
  const inspection=await inspectPages(pdf);
  if(inspection.totalPages!==pdf.numPages)throw Error('pdf_inspection_gate');
  const scanned=inspection.pages.some(page=>
   page.invisibleTextLength>0||
   page.textLength<20&&page.imageCoverage>0.65);
  if(scanned)return {rows:[],pages:pdf.numPages,scanned:true};
  const extracted=await extractTextItems(pdf);
  if(extracted.totalPages!==pdf.numPages)
   throw Error('pdf_pages_mismatch');
  let count=0;
  const rows:{
   page:number;text:string;y:number;
   parts:{x:number;text:string}[];
  }[]=[];
  for(const [index,page] of extracted.items.entries()){
   const groups:{y:number;parts:{x:number;text:string}[]}[]=[];
   for(const item of page){
    if(typeof item.str!=='string'||!item.str.trim())continue;
    if(!Number.isFinite(item.x)||!Number.isFinite(item.y))
     throw Error('pdf_geometry_invalid');
    if(++count>9000)throw Error('pdf_too_many_text_items');
    let group=groups.find(x=>Math.abs(x.y-item.y)<=2);
    if(!group){group={y:item.y,parts:[]};groups.push(group)}
    group.parts.push({x:item.x,text:item.str});
   }
   for(const group of groups.sort((a,b)=>b.y-a.y)){
    const parts=group.parts.sort((a,b)=>a.x-b.x).map(x=>({
     x:x.x,text:x.text.trim()
    })).filter(x=>x.text.length>0);
    const text=parts.map(x=>x.text).join(' ').replace(/\s+/gu,' ').trim();
    if(text)rows.push({page:index+1,text,y:group.y,parts});
    if(rows.length>300)throw Error('pdf_too_many_rows');
   }
  }
  if(!rows.length)throw Error('pdf_no_text');
  return {rows,pages:pdf.numPages,scanned:false};
 }finally{
  const disposable=pdf as unknown as {destroy?:()=>Promise<void>|void};
  await disposable.destroy?.();
 }
};

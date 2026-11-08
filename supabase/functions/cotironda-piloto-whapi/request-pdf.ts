/**
 * MVP-091: deterministic, private, multi-page PDF for the SUPPLIER request.
 * No brand/customer identity, quote amounts or commercial-condition prompts.
 * Pure TS / Uint8Array: works in Deno Edge and Node 22; no network/deps.
 * Important: source lines MUST come from the trusted request_lines SQL snapshot.
 */
import {lineaComercialLegibleMvp288} from '../../../src/domain/ia-central/fidelidad-pedido-mvp288.ts';
import {PIE_PDF_PROVEEDORES_MVP305} from '../_shared/aviso-proveedores-cierre-mvp305.ts';
export type ItemSolicitudMvp091=Readonly<{
 description:string;quantity:string;unit:string;
}>;
export type SolicitudPdfMvp091=Readonly<{
 requestId:string;city:string;deadlineIso:string;deliveryNote?:string|null;
 items:readonly ItemSolicitudMvp091[];
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const NUM=/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/u;
const CONTACT=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\s.-]?){9,}|\b(?:whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email|raz[oó]n social)\b)/iu;
const UNITS:Readonly<Record<string,string>>={
 bag:'bolsas',unit:'unidades',box:'cajas',kg:'kg',g:'g',
 l:'litros',ml:'ml',m:'m',m2:'m2',m3:'m3',roll:'rollos',pack:'paquetes'
};
function fail():never{throw new TypeError('mvp091_pdf_input_invalid')}
function textOk(s:string,max:number):boolean{
 return typeof s==='string'&&s.length>0&&s.length<=max&&
 s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s)&&
 // PDF WinAnsi covers most common Argentine material descriptions.
 [...s].every(c=>c.codePointAt(0)!<=255);
}
function decimal(n:string):string{
 if(typeof n!=='string'||!NUM.test(n)||Number(n)<=0)fail();
 const p=n.split('.');
 const fraction=p[1]?.replace(/0+$/u,'')??'';
 return fraction?p[0]+'.'+fraction:p[0];
}
function quote(s:string):string{
 return s.replace(/\\/gu,'\\\\').replace(/\(/gu,'\\(').replace(/\)/gu,'\\)');
}
function isoBytes(s:string):Uint8Array{
 const out:number[]=[];
 for(const cp of s){
  const n=cp.codePointAt(0)!;
  if(n>255)fail();
  out.push(n);
 }
 return Uint8Array.from(out);
}
function formatDay(iso:string):string{
 if(typeof iso!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/u.test(iso))fail();
 const dt=new Date(iso);
 if(Number.isNaN(dt.getTime()))fail();
 const parts=new Intl.DateTimeFormat('es-AR',{
  timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',
  year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
 }).formatToParts(dt);
 const get=(k:string)=>parts.find(p=>p.type===k)?.value??'';
 return get('day')+'/'+get('month')+'/'+get('year')+' · '+get('hour')+':'+get('minute')+' h';
}
function drawText(cmds:string[],x:number,y:number,label:string,size=11,
 bold=false,color='0.10 0.16 0.29'){
 cmds.push('BT '+color+' rg /'+(bold?'F2':'F1')+' '+size+
  ' Tf 1 0 0 1 '+x+' '+y+' Tm ('+quote(label)+') Tj ET');
}
function box(cmds:string[],x:number,y:number,w:number,h:number,rgb:string){
 cmds.push(rgb+' rg '+x+' '+y+' '+w+' '+h+' re f');
}
/** Generate a compact corporate PDF; no source or buyer identity escapes. */
/** Render 1–25 already-verified supplier-specific request lines, in order.
 * Each PDF page has its own content stream. No item truncation or spillover
 * under the footer; the PDF must remain a single immutable document.
 */
export function generarSolicitudPdfMvp091(input:SolicitudPdfMvp091):Uint8Array{
 if(!input||typeof input!=='object'||!UUID.test(input.requestId)||
  !textOk(input.city,70)||CONTACT.test(input.city)||!Array.isArray(input.items)||
  input.items.length<1||input.items.length>25)fail();
 const lines=input.items.map((it,i)=>{
  if(!it||!textOk(it.description,75)||CONTACT.test(it.description)||
    typeof it.unit!=='string'||!Object.hasOwn(UNITS,it.unit))fail();
  const readable=lineaComercialLegibleMvp288(
   it.quantity,it.unit,it.description);
  if(!readable)fail();
  const display=readable.cantidad+' '+readable.unidad;
  if(display.length>35||!textOk(readable.descripcion,75))fail();
  return {name:readable.descripcion,display,i};
 });
 const deadline=formatDay(input.deadlineIso);
 const note=input.deliveryNote??null;
 if(note!==null&&(!textOk(note,90)||CONTACT.test(note)))fail();
 const pageCount=Math.ceil(lines.length/8);
 const fontNormal=3+2*pageCount,fontBold=fontNormal+1;
 const streamBytes:Uint8Array[]=[];
 for(let page=0;page<pageCount;page++){
  const cmds:string[]=[];
  box(cmds,0,836,595,6,'0.10 0.23 0.55');
  drawText(cmds,48,774,'COTIRONDA',25,true,'0.10 0.23 0.55');
  drawText(cmds,48,750,'La nueva forma de cotizar',10,false,'0.40 0.46 0.55');
  box(cmds,48,725,499,1,'0.85 0.88 0.93');
  drawText(cmds,48,687,page===0?'Solicitud de cotización':
   'Solicitud de cotización · continuación',18,true);
  drawText(cmds,48,663,
   'Código de solicitud: '+input.requestId.slice(0,8).toUpperCase(),
   9,false,'0.40 0.46 0.55');
  box(cmds,48,note?520:551,499,note?122:91,'0.96 0.97 0.99');
  drawText(cmds,65,615,'LOCALIDAD',9,true,'0.40 0.46 0.55');
  drawText(cmds,310,615,'CIERRE DE COTIZACIONES',9,true,'0.40 0.46 0.55');
  drawText(cmds,65,586,input.city,11,true);
  drawText(cmds,310,586,deadline,10,true);
  if(note){
   drawText(cmds,65,558,'ENTREGA SOLICITADA POR EL COMPRADOR',
    9,true,'0.40 0.46 0.55');
   drawText(cmds,65,538,note,10,true);
  }
  box(cmds,48,497,499,40,'0.10 0.23 0.55');
  drawText(cmds,63,511,'MATERIAL',10,true,'1 1 1');
  drawText(cmds,442,511,'CANTIDAD',10,true,'1 1 1');
  let y=464;
  for(const it of lines.slice(page*8,(page+1)*8)){
   if(it.i%2===1)box(cmds,48,y-13,499,46,'0.96 0.97 0.99');
   const text=it.name;
   const breakAt=text.length>53?Math.max(1,text.lastIndexOf(' ',53)):0;
   if(breakAt>0){
    drawText(cmds,63,y+7,text.slice(0,breakAt),9,false);
    drawText(cmds,63,y-8,text.slice(breakAt+1),9,false);
   }else drawText(cmds,63,y+1,text,10,false);
   drawText(cmds,449,y+1,it.display,10,true);
   box(cmds,48,y-14,499,0.6,'0.85 0.88 0.93');
   y-=48;
  }
  drawText(cmds,48,62,'Respondé por WhatsApp con tu presupuesto.',
   9,false,'0.40 0.46 0.55');
  drawText(cmds,48,43,PIE_PDF_PROVEEDORES_MVP305,
   8,false,'0.40 0.46 0.55');
  drawText(cmds,492,43,'Pág. '+(page+1)+'/'+pageCount,8,false,
   '0.40 0.46 0.55');
  streamBytes.push(isoBytes(cmds.join('\n')+'\n'));
 }
 // Dynamic, non-incremental page tree. Object refs never overlap with fonts:
 // 1 catalog, 2 /Pages, (3/4,5/6...) Page+Contents, last two shared fonts.
 const bytes:number[]=[],offsets:number[]=[0];
 const add=(str:string)=>{bytes.push(...isoBytes(str))};
 add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 const object=(id:number,content:string|Uint8Array)=>{
  if(id!==offsets.length)fail();
  offsets.push(bytes.length);add(id+' 0 obj\n');
  if(typeof content==='string')add(content);else bytes.push(...content);
  add('\nendobj\n');
 };
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 const kids=Array.from({length:pageCount},(_,i)=>(3+i*2)+' 0 R').join(' ');
 object(2,'<< /Type /Pages /Kids ['+kids+'] /Count '+pageCount+' >>');
 for(let i=0;i<pageCount;i++){
  const pageId=3+i*2,contentId=pageId+1,data=streamBytes[i];
  object(pageId,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]'+
   ' /Contents '+contentId+' 0 R /Resources << /Font << /F1 '+
   fontNormal+' 0 R /F2 '+fontBold+' 0 R >> >> >>');
  const pre=isoBytes('<< /Length '+data.length+' >>\nstream\n');
  const post=isoBytes('\nendstream');
  const content=new Uint8Array(pre.length+data.length+post.length);
  content.set(pre,0);content.set(data,pre.length);
  content.set(post,pre.length+data.length);
  object(contentId,content);
 }
 object(fontNormal,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica'+
  ' /Encoding /WinAnsiEncoding >>');
 object(fontBold,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold'+
  ' /Encoding /WinAnsiEncoding >>');
 const xref=bytes.length;
 add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
 for(let i=1;i<offsets.length;i++)
  add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 add('trailer\n<< /Size '+offsets.length+
  ' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return Uint8Array.from(bytes);
}

/**
 * MVP-091: deterministic, private, single-page PDF for the SUPPLIER request.
 * No brand/customer identity, quote amounts or commercial-condition prompts.
 * Pure TS / Uint8Array: works in Deno Edge and Node 22; no network/deps.
 * Important: source lines MUST come from the trusted request_lines SQL snapshot.
 */
export type ItemSolicitudMvp091=Readonly<{
 description:string;quantity:string;unit:string;
}>;
export type SolicitudPdfMvp091=Readonly<{
 requestId:string;city:string;deadlineIso:string;
 items:readonly ItemSolicitudMvp091[];
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const NUM=/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/u;
const CONTACT=/(?:https?:\/\/|www\.|[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}|(?:\\+?\\d[\\s.-]?){9,}|\\b(?:whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email|raz[oó]n social)\\b)/iu;
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
export function generarSolicitudPdfMvp091(input:SolicitudPdfMvp091):Uint8Array{
 if(!input||typeof input!=='object'||!UUID.test(input.requestId)||
  !textOk(input.city,70)||CONTACT.test(input.city)||!Array.isArray(input.items)||
  input.items.length<1||input.items.length>8)fail();
 const lines=input.items.map((it,i)=>{
  if(!it||!textOk(it.description,75)||CONTACT.test(it.description)||
    typeof it.unit!=='string'||!Object.hasOwn(UNITS,it.unit))fail();
  const qty=decimal(it.quantity);
  if((qty+' '+UNITS[it.unit]).length>35)fail();
  return {name:it.description,display:qty+' '+UNITS[it.unit],i};
 });
 const deadline=formatDay(input.deadlineIso);
 const cmds:string[]=[];
 box(cmds,0,836,595,6,'0.10 0.23 0.55');
 drawText(cmds,48,774,'COTIRONDA',25,true,'0.10 0.23 0.55');
 drawText(cmds,48,750,'La nueva forma de cotizar',10,false,'0.40 0.46 0.55');
 box(cmds,48,725,499,1,'0.85 0.88 0.93');
 drawText(cmds,48,687,'Solicitud de cotización',18,true);
 drawText(cmds,48,663,'Código de solicitud: '+input.requestId.slice(0,8).toUpperCase(),9,false,'0.40 0.46 0.55');
 box(cmds,48,551,499,91,'0.96 0.97 0.99');
 drawText(cmds,65,615,'LOCALIDAD',9,true,'0.40 0.46 0.55');
 drawText(cmds,310,615,'CIERRE DE COTIZACIONES',9,true,'0.40 0.46 0.55');
 drawText(cmds,65,586,input.city,11,true);
 drawText(cmds,310,586,deadline,10,true);
 box(cmds,48,497,499,40,'0.10 0.23 0.55');
 drawText(cmds,63,511,'MATERIAL',10,true,'1 1 1');
 drawText(cmds,442,511,'CANTIDAD',10,true,'1 1 1');
 let y=464;
 for(const it of lines){
  if(it.i%2===1)box(cmds,48,y-13,499,46,'0.96 0.97 0.99');
  drawText(cmds,63,y+1,it.name,10,false);
  drawText(cmds,449,y+1,it.display,10,true);
  box(cmds,48,y-14,499,0.6,'0.85 0.88 0.93');
  y-=48;
 }
 drawText(cmds,48,62,'Respondé por WhatsApp con tu presupuesto.',9,false,'0.40 0.46 0.55');
 drawText(cmds,48,43,'Cotironda · Solicitud privada para proveedor invitado',8,false,'0.40 0.46 0.55');
 const stream=cmds.join('\n')+'\n';
 const bytes:number[]=[];
 const add=(str:string)=>{bytes.push(...isoBytes(str))};
 const offsets:number[]=[0];
 add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 const object=(id:number,content:string|Uint8Array)=>{
  offsets.push(bytes.length);add(id+' 0 obj\n');
  if(typeof content==='string')add(content);
  else bytes.push(...content);
  add('\nendobj\n');
 };
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>');
 const data=isoBytes(stream);
 const pre=isoBytes('<< /Length '+data.length+' >>\nstream\n');
 const post=isoBytes('\nendstream');
 const concat=new Uint8Array(pre.length+data.length+post.length);
 concat.set(pre,0);concat.set(data,pre.length);concat.set(post,pre.length+data.length);
 object(4,concat);
 object(5,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 object(6,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const xref=bytes.length;
 add('xref\n0 7\n0000000000 65535 f \n');
 for(let i=1;i<=6;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 add('trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return Uint8Array.from(bytes);
}

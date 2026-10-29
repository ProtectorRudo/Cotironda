// Validación previa a enviar borradores a Supabase Storage.
// Defensa adicional; NO sustituye antivirus, autorización RLS ni validación del servidor.
// No registrar nombres, contenidos ni tokens en logs.
export const BUCKET_BORRADORES='cotironda-buyer-drafts';
export const MAX_BORRADOR_BYTES=10*1024*1024;
const MAX_XML_UNPACKED_BYTES=40*1024*1024;
const MAX_ENTRIES=1000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const formatos:Record<string,string>={
 'application/pdf':'pdf',
 'image/jpeg':'jpg',
 'image/png':'png',
 'image/webp':'webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'
};

export class DocumentoRechazado extends Error {
 constructor(public readonly code:string){
  super(code);
  this.name='DocumentoRechazado';
 }
}
export function rutaBorrador(organizationId:string,requestId:string,fileId:string,extension:string):string {
 if(![organizationId,requestId,fileId].every(x=>uuid.test(x)) ||
    !Object.values(formatos).includes(extension))
  throw new DocumentoRechazado('ruta_invalida');
 return `${organizationId}/requests/${requestId}/${fileId}.${extension}`;
}
function prefix(buf:Uint8Array,bytes:number[]):boolean {
 return bytes.every((b,i)=>buf[i]===b);
}
function ascii(buf:Uint8Array,from:number,length:number):string {
 return String.fromCharCode(...buf.subarray(from,from+length));
}
function inspectZip(bytes:Uint8Array,required:string):void {
 if(!prefix(bytes,[0x50,0x4b,0x03,0x04]))throw new DocumentoRechazado('firma_no_coincide');
 // Buscar EOCD. Sin ZIP64, datos después del EOCD ni multi-disk: fallar cerrado.
 let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(prefix(bytes.subarray(i),[0x50,0x4b,0x05,0x06])){eocd=i;break;}
 }
 if(eocd<0)throw new DocumentoRechazado('zip_inseguro');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const rd16=(i:number)=>d.getUint16(i,true),rd32=(i:number)=>d.getUint32(i,true);
 const entries=rd16(eocd+10);
 const size=rd32(eocd+12),offset=rd32(eocd+16),comment=rd16(eocd+20);
 if(rd16(eocd+4)!==0||rd16(eocd+6)!==0||
    rd16(eocd+8)!==entries||entries===0||entries>MAX_ENTRIES||
    entries===65535||size===0xffffffff||offset===0xffffffff||
    eocd+22+comment!==bytes.length||offset+size!==eocd)
  throw new DocumentoRechazado('zip_inseguro');
 let at=offset,total=0;
 const names=new Set<string>();
 for(let i=0;i<entries;i++){
  if(at+46>eocd||rd32(at)!==0x02014b50)throw new DocumentoRechazado('zip_inseguro');
  const flags=rd16(at+8),packed=rd32(at+20),unpacked=rd32(at+24);
  const nameLength=rd16(at+28),extraLength=rd16(at+30),commentLength=rd16(at+32);
  const localOff=rd32(at+42);
  const next=at+46+nameLength+extraLength+commentLength;
  if(next>eocd || localOff===0xffffffff || packed===0xffffffff ||
     unpacked===0xffffffff || (flags&1)!==0 || (flags&8)!==0 ||
     nameLength===0||nameLength>240||localOff+30>offset ||
     rd32(localOff)!==0x04034b50)
   throw new DocumentoRechazado('zip_inseguro');
  const name=ascii(bytes,at+46,nameLength);
  if(name.includes('\\')||name.startsWith('/')||name.includes('..')||
     name.includes('vbaProject.bin')||name.includes('VbaProject.bin')||
     name.includes('encryptedPackage')||name.includes('EncryptionInfo') ||
     names.has(name))throw new DocumentoRechazado('zip_inseguro');
  names.add(name);
  total+=unpacked;
  if(total>MAX_XML_UNPACKED_BYTES || (packed>0&&unpacked>packed*200))
    throw new DocumentoRechazado('zip_inseguro');
  at=next;
 }
 if(at!==eocd || !names.has('[Content_Types].xml') || !names.has(required))
  throw new DocumentoRechazado('firma_no_coincide');
}
export async function prepararBorrador(input:{
 file:Blob & {name?:string};
 organizationId:string;requestId:string;fileId:string;
}):Promise<{bucket:string;path:string;mime:string;file:Blob}>{
 const {file,organizationId,requestId,fileId}=input;
 if(!(file instanceof Blob) || file.size===0)
  throw new DocumentoRechazado('archivo_invalido');
 if(file.size>MAX_BORRADOR_BYTES)
  throw new DocumentoRechazado('archivo_excede_limite');
 const mime=file.type.toLowerCase();
 const extension=formatos[mime];
 if(!extension)throw new DocumentoRechazado('formato_no_permitido');
 const path=rutaBorrador(organizationId,requestId,fileId,extension);
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const good=extension==='pdf'?ascii(head,0,5)==='%PDF-':
  extension==='png'?prefix(head,[137,80,78,71,13,10,26,10]):
  extension==='jpg'?prefix(head,[255,216,255]):
  extension==='webp'?ascii(head,0,4)==='RIFF'&&ascii(head,8,4)==='WEBP':
  prefix(head,[80,75,3,4]);
 if(!good)throw new DocumentoRechazado('firma_no_coincide');
 if(extension==='docx'||extension==='xlsx'){
  const data=new Uint8Array(await file.arrayBuffer());
  inspectZip(data,extension==='docx'?'word/document.xml':'xl/workbook.xml');
 }
 return {bucket:BUCKET_BORRADORES,path,mime,file};
}

/**
 * MVP338: guard de fórmulas en XLSX como segunda prueba estructural.
 * Recorre TODAS las hojas XML del ZIP, incluidas las no referenciadas,
 * sin ejecutar fórmulas. El lector Office existente comprueba CRC, rutas,
 * relaciones y el resto de las condiciones DESPUÉS de este control.
 *
 * Este guard nunca devuelve un valor comercial: solo booleano de fórmula,
 * o lanza error local que obliga a revisión privada del original.
 */
const u16=(d:DataView,i:number)=>d.getUint16(i,true);
const u32=(d:DataView,i:number)=>d.getUint32(i,true);
const SHEET=/^xl\/worksheets\/[a-z0-9_-]+\.xml$/iu;
const FORMULA=/<(?:[a-z_][\w.-]*:)?f(?=[\s/>])/iu;
const fatal=new TextDecoder('utf-8',{fatal:true});
async function uncompress(body:Uint8Array,method:number,limit:number){
 if(method===0){
  if(body.length>limit)throw Error('formula_zip_size');
  return body;
 }
 if(method!==8)throw Error('formula_zip_method');
 const stream=new Blob([Uint8Array.from(body)]).stream()
  .pipeThrough(new DecompressionStream('deflate-raw'));
 const reader=stream.getReader();
 const fragments:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const x=await reader.read();if(x.done)break;
   size+=x.value.byteLength;
   if(size>limit){await reader.cancel();throw Error('formula_zip_inflation')}
   fragments.push(x.value);
  }
 }finally{reader.releaseLock()}
 const result=new Uint8Array(size);let off=0;
 for(const part of fragments){result.set(part,off);off+=part.length}
 return result;
}
/** True is a mandatory private-review gate, never a price verification. */
export async function contieneFormulaXlsxMvp338(bytes:Uint8Array):Promise<boolean>{
 if(!(bytes instanceof Uint8Array)||bytes.length<30||
    bytes.length>3*1024*1024)throw Error('formula_zip_invalid');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(u32(dv,i)===0x06054b50&&i+22+u16(dv,i+20)===bytes.length){
   end=i;break;
  }
 }
 if(end<0||u16(dv,end+4)!==0||u16(dv,end+6)!==0||
    u16(dv,end+8)!==u16(dv,end+10))
  throw Error('formula_zip_directory');
 const count=u16(dv,end+10),off=u32(dv,end+16),length=u32(dv,end+12);
 if(count<2||count>80||off<0||off+length>end)
  throw Error('formula_zip_directory');
 let pos=off,seen=0,found=0,hasFormula=false;
 for(let i=0;i<count;i++){
  if(pos+46>end||u32(dv,pos)!==0x02014b50)
   throw Error('formula_zip_entry');
  const flags=u16(dv,pos+8),method=u16(dv,pos+10);
  const packed=u32(dv,pos+20),plain=u32(dv,pos+24);
  const nlen=u16(dv,pos+28),extra=u16(dv,pos+30),comment=u16(dv,pos+32);
  const local=u32(dv,pos+42);
  if(flags&1||flags&0x40||![0,8].includes(method)||
     packed>1048576||plain>1048576||nlen<1||nlen>240||
     pos+46+nlen+extra+comment>off+length||local+30>off)
   throw Error('formula_zip_untrusted');
  const name=fatal.decode(bytes.subarray(pos+46,pos+46+nlen));
  pos+=46+nlen+extra+comment;
  if(!SHEET.test(name))continue;
  found++;
  if(u32(dv,local)!==0x04034b50||
     u16(dv,local+8)!==method)throw Error('formula_zip_local');
  const localLen=u16(dv,local+26),localExtra=u16(dv,local+28);
  if(localLen!==nlen||local+30+localLen>off||
    fatal.decode(bytes.subarray(local+30,local+30+localLen))!==name)
   throw Error('formula_zip_name');
  const start=local+30+localLen+localExtra;
  if(start+packed>off)throw Error('formula_zip_bounds');
  const raw=await uncompress(bytes.subarray(start,start+packed),method,1048576);
  if(raw.byteLength!==plain)throw Error('formula_zip_plain_size');
  const xml=fatal.decode(raw);
  // Detect original <f>, <x:f>, shared formulas and formula arrays.
  // No code from the worksheet is executed.
  if(FORMULA.test(xml))hasFormula=true;
  seen++;
 }
 if(pos!==off+length||found===0||seen!==found)
  throw Error('formula_zip_worksheet_missing');
 return hasFormula;
}

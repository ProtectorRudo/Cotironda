/**
 * MVP357. pg_net.net.http_post sends the JSON object "{}" as its body.
 * The old private Edge accepted only an empty body, returning HTTP 413
 * to an otherwise authenticated cron. Accept exactly EMPTY or "{}".
 * Read at most 2 bytes before rejecting; never parse payload fields.
 */
export async function aceptarBodyVacioBatchMvp357(req:Request):Promise<boolean>{
 const h=req.headers.get('content-length');
 if(h!==null&&!/^(0|1|2)$/u.test(h))return false;
 if(!req.body)return true;
 let reader:ReadableStreamDefaultReader<Uint8Array>;
 try{reader=req.body.getReader();}catch{return false;}
 const bytes:number[]=[];
 try{
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array)||
       bytes.length+chunk.value.length>2){
    await reader.cancel().catch(()=>{});
    return false;
   }
   for(const b of chunk.value)bytes.push(b);
  }
 }catch{return false}
 finally{reader.releaseLock();}
 return bytes.length===0||
   (bytes.length===2&&bytes[0]===123&&bytes[1]===125);
}

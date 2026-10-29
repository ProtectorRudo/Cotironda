// Adaptador ClamAV clamd, SOLO para un worker Node aislado con socket Unix local.
// NO invocar desde navegador ni rutas públicas. No existe daemon configurado en Cotironda.
// Referencia: https://docs.clamav.net/manual/Usage/ClamdProtocol.html
import {connect} from 'node:net';
import {isAbsolute} from 'node:path';

export const MAX_SCAN_BYTES=10*1024*1024;
const CHUNK=64*1024;
const MAX_REPLY_BYTES=1024;

export class AnalisisNoDisponible extends Error {
 constructor(){
  super('analisis_no_disponible');
  this.name='AnalisisNoDisponible';
 }
}
export type VeredictoClamAV='clean'|'malicious';

/**
 * INSTREAM sobre socket LOCAL; el daemon debe estar en el MISMO entorno privado.
 * Respuestas válidas: "stream: OK" o "stream: <firma> FOUND".
 * Cualquier otra respuesta falla cerrado, sin revelar firmas en errores/logs.
 * El antivirus real y sus firmas NO están incluidos en este adaptador.
 */
export function escanearConClamd(
 data:Uint8Array,
 socketPath:string,
 timeoutMs=7000
):Promise<VeredictoClamAV> {
 if(!(data instanceof Uint8Array) || data.byteLength===0 ||
    data.byteLength>MAX_SCAN_BYTES ||
    typeof socketPath!=='string' || !isAbsolute(socketPath) ||
    socketPath.includes('..') || Buffer.byteLength(socketPath)>100 ||
    !Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>30000)
  return Promise.reject(new AnalisisNoDisponible());

 return new Promise((resolve,reject)=>{
  const socket=connect({path:socketPath});
  let done=false,waiting=false,at=-1;
  let output=Buffer.alloc(0);
  const deadline=setTimeout(()=>failed(),timeoutMs);
  const failed=()=>{
   if(done)return;
   done=true;
   clearTimeout(deadline);
   socket.destroy();
   reject(new AnalisisNoDisponible());
  };
  const success=(verdict:VeredictoClamAV)=>{
   if(done)return;
   done=true;
   clearTimeout(deadline);
   socket.destroy();
   resolve(verdict);
  };
  socket.setTimeout(timeoutMs,failed); // además de deadline absoluto
  socket.on('error',failed);
  socket.on('close',()=>{
   if(!done)failed();
  });
  socket.on('data',(chunk:Buffer)=>{
   if(done)return;
   if(output.length+chunk.length>MAX_REPLY_BYTES){failed();return;}
   output=Buffer.concat([output,chunk]);
   const sep=output.findIndex(b=>b===0||b===10);
   if(sep<0)return;
   // Nunca aceptar OK con bytes adicionales/truncamiento de framing.
   const reply=output.subarray(0,sep).toString('utf8').trimEnd();
   if(output.subarray(sep+1).some(b=>b!==0&&b!==10&&b!==13)){
    failed();return;
   }
   if(reply==='stream: OK')success('clean');
   else if(/^stream: [^\r\n\0]{1,240} FOUND$/.test(reply))success('malicious');
   else failed();
  });
  function push(bytes:Buffer){
   if(done)return;
   if(!socket.write(bytes)){
    waiting=true;
    socket.once('drain',()=>{
     waiting=false;
     if(!done)queueMicrotask(pump);
    });
   } else {
    queueMicrotask(pump);
   }
  }
  function pump(){
   if(done||waiting)return;
   if(at===-1){
    at=0;
    push(Buffer.from('zINSTREAM\0','ascii'));
    return;
   }
   if(at===data.byteLength){
    at++;
    const end=Buffer.alloc(4);
    socket.end(end);
    return;
   }
   if(at>data.byteLength)return;
   const n=Math.min(CHUNK,data.byteLength-at);
   const frame=Buffer.allocUnsafe(n+4);
   frame.writeUInt32BE(n,0);
   frame.set(data.subarray(at,at+n),4);
   at+=n;
   push(frame);
  }
  socket.on('connect',pump);
 });
}

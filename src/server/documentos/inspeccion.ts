// Evaluación local: formatos admisibles + antivirus real + hash verificable.
// No se conecta a HTTP, no lee tokens, no crea trabajos, no promociona Storage.
import {createHash} from 'node:crypto';
import {prepararBorrador} from '../../domain/borradores-storage.ts';
import {AnalisisNoDisponible,escanearConClamd} from './clamav.ts';

export class DocumentoInseguro extends Error{
 constructor(){
  super('documento_rechazado');
  this.name='DocumentoInseguro';
 }
}
export async function inspeccionarDocumentoEnWorker(input:{
 file:Blob & {name?:string};
 organizationId:string;requestId:string;fileId:string;
 socketPath:string;timeoutMs?:number;
}):Promise<{path:string;mime:string;size:number;sha256Hex:string}>{
 const validado=await prepararBorrador(input);
 const bytes=new Uint8Array(await validado.file.arrayBuffer());
 // Rechazo y fallas no se convierten jamás en approved.
 const verdict=await escanearConClamd(bytes,input.socketPath,input.timeoutMs);
 if(verdict==='malicious')throw new DocumentoInseguro();
 if(verdict!=='clean')throw new AnalisisNoDisponible();
 return {
  path:validado.path,
  mime:validado.mime,
  size:bytes.byteLength,
  sha256Hex:createHash('sha256').update(bytes).digest('hex')
 };
}

/**
 * D056 private pre-HTTP quota and consent check for D055.
 * Requires a D053 committed begin_send: SQL trigger already reserved
 * monthly/day caps, then this verifies same recipient HMAC and current BAJA.
 * NO raw phone to DB, no global SQL connection, no HTTP, no ENV fallback.
 */
import {createHmac,timingSafeEqual} from 'node:crypto';

const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const PHONE=/^[0-9]{9,15}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SQL='select cotironda_private.whapi_check_send_authorized_d056($1::uuid,$2::text,$3::text) as payload';
function fail():never{throw new Error('d056_send_not_authorized')}
export type PuertoAutorizacionD056=Readonly<{
  committedRpc:(sql:string,args:readonly unknown[])=>
    Promise<Readonly<{payload:unknown}>>;
}>;
export function calcularChatDestinatarioD056(
 channel:string,to:string,identityKey:Buffer):string{
 if(!CHANNEL.test(channel)||!PHONE.test(to)||!Buffer.isBuffer(identityKey)||
   identityKey.length!==32)fail();
 return createHmac('sha256',identityKey)
  .update(JSON.stringify(['cotironda','chat',1,channel,to+'@s.whatsapp.net']))
  .digest('hex');
}
export function crearAutorizadorEnvioD056(
 backend:PuertoAutorizacionD056,
 channel:string,
 identityKey:Buffer
){
 if(!backend||typeof backend.committedRpc!=='function'||
  typeof channel!=='string'||!CHANNEL.test(channel)||
  !Buffer.isBuffer(identityKey)||identityKey.length!==32)fail();
 const secret=Buffer.from(identityKey);
 async function autorizarIntento(request:Readonly<{
  jobId:string;to:string;body:string;
 }>):Promise<boolean>{
  if(!request||typeof request!=='object'||Object.keys(request).sort().join(',')!==
    'body,jobId,to'||typeof request.jobId!=='string'||!UUID.test(request.jobId)||
    typeof request.to!=='string'||!PHONE.test(request.to)||
    typeof request.body!=='string'||request.body.length<4||
    request.body.length>1600)return false;
  // Reproduce D029's HMAC over NORMALIZED exact recipient. No PII in SQL.
  const chatKey=calcularChatDestinatarioD056(channel,request.to,secret);
  try{
   const result=await backend.committedRpc(SQL,[request.jobId,channel,chatKey]);
   // An explicit SQL boolean TRUE is necessary. No truthy strings/numbers.
   if(!result||typeof result!=='object'||
      Object.keys(result).length!==1||result.payload!==true)return false;
   return true;
  }catch{return false;}
 }
 return Object.freeze({autorizarIntento});
}

/** V2-14: descifrado SOLO en servidor de la fuente WhatsApp exacta.
 * Es el mismo AES-256-GCM y AAD que usa el webhook PILOTO v76.
 * No abrir URLs, no leer perfiles, no registrar bytes ni claves en logs.
 */
import {createDecipheriv,createHash} from 'node:crypto';

const HMAC=/^[a-f0-9]{64}$/u;
const KEY=/^[a-f0-9]{64}$/u;
const B64=/^[A-Za-z0-9+/]+={0,2}$/u;
export type SobreTextoWhatsAppV2=Readonly<{
 state:'authorized_text_v2';messageHmac:string;chatHmac:string;
 nonceB64:string;ciphertextB64:string;sha256:string;mime:'text/plain';
}>;

const decode=(s:string,max:number):Buffer|null=>{
 if(s.length>max||s.length%4!==0||!B64.test(s))return null;
 try{
  const b=Buffer.from(s,'base64');
  return b.toString('base64')===s?b:null;
 }catch{return null}
};

/** La clave sólo se lee de COTIRONDA_PILOT_AES_HEX en Node privado.
 * El SQL comprueba la autenticación y entrega el sobre, nunca el texto;
 * este lector coteja el SHA de los bytes exactos DESPUÉS de AES-GCM.
 */
export function descifrarTextoWhatsAppV2(
 source:unknown,secretHex:unknown
):Uint8Array|null{
 try{
  if(!source||typeof source!=='object'||Array.isArray(source))return null;
  const s=source as Partial<SobreTextoWhatsAppV2>;
  if(s.state!=='authorized_text_v2'||s.mime!=='text/plain'||
   typeof s.chatHmac!=='string'||!HMAC.test(s.chatHmac)||
   typeof s.messageHmac!=='string'||!HMAC.test(s.messageHmac)||
   typeof s.sha256!=='string'||!HMAC.test(s.sha256)||
   typeof s.nonceB64!=='string'||s.nonceB64.length!==16||
   typeof s.ciphertextB64!=='string'||s.ciphertextB64.length<24||
   typeof secretHex!=='string'||!KEY.test(secretHex)||
   /^0{64}$/u.test(secretHex))return null;
  const iv=decode(s.nonceB64,16),encrypted=decode(s.ciphertextB64,20000);
  if(!iv||iv.length!==12||!encrypted||encrypted.length<17||
   encrypted.length>10000)return null;
  const ciphertext=encrypted.subarray(0,encrypted.length-16);
  const tag=encrypted.subarray(encrypted.length-16);
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(secretHex,'hex'),iv);
  decipher.setAAD(Buffer.from(s.chatHmac+'|'+s.messageHmac+'|text','utf8'));
  decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  if(plain.length<5||plain.length>4000||
   createHash('sha256').update(plain).digest('hex')!==s.sha256)return null;
  // Rechazar bytes inválidos; no normalizar saltos, montos ni espacios.
  new TextDecoder('utf-8',{fatal:true}).decode(plain);
  return new Uint8Array(plain);
 }catch{return null}
}

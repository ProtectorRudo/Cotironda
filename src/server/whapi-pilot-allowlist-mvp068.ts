/**
 * MVP-068: private, channel-scoped pilot allowlist (exactly 1 buyer + 2 suppliers).
 * SERVER ONLY. Never store cleartext phone numbers, names or calculated real
 * chat HMACs in source control. Use protected Preview environment variables.
 *
 * This list is only an EXTRA gate. The D074/D030 PostgreSQL binding, company
 * verification, consent, BAJA and round authorization remain mandatory.
 */
import {timingSafeEqual} from 'node:crypto';
import {calcularChatDestinatarioD056}
 from './whapi-send-authorization-d056.ts';

type Env=Readonly<Record<string,string|undefined>>;
type Rol='comprador'|'proveedor';
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const CHAT=/^([1-9][0-9]{8,14})@s\.whatsapp\.net$/u;
const HMAC=/^[0-9a-f]{64}$/u;
function fail():never{throw Error('mvp068_lista_privada_no_configurada')}
function valid(x:unknown):x is string{
 return typeof x==='string'&&HMAC.test(x)&&!/^0{64}$/u.test(x);
}
export function crearListaPilotoWhatsappMvp068(
 env:Env,channel:string,identityHmac:Buffer
):Readonly<{
 permitido:(rol:Rol,canal:string,chatId:string)=>boolean;
}>{
 if(!env||typeof env!=='object'||!CH.test(channel)||
   !Buffer.isBuffer(identityHmac)||identityHmac.length!==32||
   identityHmac.every(n=>n===0))fail();
 const buyer=env.COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY;
 const raw=env.COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON;
 if(typeof raw!=='string'||raw.length>180||!valid(buyer))fail();
 let parsed:unknown;
 try{parsed=JSON.parse(raw)}catch{fail()}
 if(!Array.isArray(parsed)||parsed.length!==2||
   !parsed.every(valid))fail();
 const [supplier1,supplier2]=parsed as string[];
 const all=[buyer,supplier1,supplier2];
 if(new Set(all).size!==3)fail();
 const buyerDigest=Buffer.from(buyer,'hex');
 const supplierDigests=[Buffer.from(supplier1,'hex'),
  Buffer.from(supplier2,'hex')];
 const secret=Buffer.from(identityHmac);
 function permitido(rol:Rol,canal:string,chatId:string):boolean{
  if((rol!=='comprador'&&rol!=='proveedor')||
    canal!==channel||typeof chatId!=='string')return false;
  const m=chatId.match(CHAT);
  if(!m)return false;
  let digest:Buffer;
  try{
   digest=Buffer.from(calcularChatDestinatarioD056(channel,m[1],secret),'hex');
  }catch{return false}
  if(rol==='comprador')return timingSafeEqual(digest,buyerDigest);
  // Check both slots unconditionally; avoid timing dependent on supplier A/B.
  const a=timingSafeEqual(digest,supplierDigests[0]);
  const b=timingSafeEqual(digest,supplierDigests[1]);
  return a||b;
 }
 return Object.freeze({permitido});
}

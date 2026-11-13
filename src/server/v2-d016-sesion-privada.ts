/** D016 alternativa SIN EMAIL/SMS: sesión real privada del servidor.
 * Se crea atómicamente en PostgreSQL tras canjear el ticket Whapi; NO JWT
 * improvisado ni acceso directo a originales. Siempre se revalida en BD.
 */
import {createHmac,randomBytes} from 'node:crypto';
import {hmacTicketD016,puertaD016Lista,
 type PuertaD016} from './v2-d016-enlace-whatsapp.ts';

const SESSION_RE=/^[A-Za-z0-9_-]{43}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const BUYER=/^[a-z0-9_-]{3,100}$/u;
export const D016_SESSION_COOKIE='__Host-cotironda-v2';
export const D016_SESSION_SECONDS=8*60*60;
const HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY'
} as const;
export type SesionPrivadaPortsD016=Readonly<{
 // UNA transacción SQL: consume el ticket y crea browser_session juntos.
 reclamarYCrearSesion:(arg:Readonly<{
  ticketHmac:string;sesionHmac:string
 }>)=>Promise<boolean>;
 // Revalida sesión, rol buyer, consentimiento, canal Whapi y ronda exacta.
 verificarSesion:(arg:Readonly<{
  sesionHmac:string;rondaId:string
 }>)=>Promise<{buyerKey:string;requestId:string}|null>;
 ahora:()=>number;
}>;

export function digestSesionPrivadaD016(raw:string,claveHex:string):string|null{
 if(typeof raw!=='string'||!SESSION_RE.test(raw)||
  typeof claveHex!=='string'||!HASH.test(claveHex))return null;
 return createHmac('sha256',Buffer.from(claveHex,'hex'))
  .update('cotironda/d016/session/v1/').update(raw,'ascii')
  .digest('hex');
}
function denied():Response{
 return new Response(JSON.stringify({state:'BLOCKED'}),{
  status:403,headers:HEADERS
 });
}
export async function canjearConSesionPrivadaD016(
 gate:PuertaD016,req:Request,p:SesionPrivadaPortsD016
):Promise<Response>{
 if(!puertaD016Lista(gate)||req.method!=='POST')return denied();
 try{
  const u=new URL(req.url);
  if(u.origin!==gate.origenPortal||
   u.pathname!=='/api/piloto/v2/acceso/canjear'||
   u.search!==''||u.hash!==''||
   req.headers.get('origin')!==gate.origenPortal||
   req.headers.get('sec-fetch-site')!=='same-origin'||
   !req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return denied();
  const length=req.headers.get('content-length');
  if(length&&(!/^\d{1,3}$/u.test(length)||Number(length)>120))
   return denied();
  const body=await req.text();
  if(body.length>120)return denied();
  const j:unknown=JSON.parse(body);
  if(!j||typeof j!=='object'||Array.isArray(j))return denied();
  const obj=j as Record<string,unknown>;
  if(Object.keys(obj).length!==1||typeof obj.ticket!=='string')
   return denied();
  const ticketHmac=hmacTicketD016(obj.ticket,gate.claveHmacHex);
  if(!ticketHmac)return denied();
  const now=p.ahora();
  if(!Number.isSafeInteger(now)||now<=0)return denied();
  const raw=randomBytes(32).toString('base64url');
  const sesionHmac=digestSesionPrivadaD016(raw,gate.claveHmacHex);
  if(!sesionHmac)return denied();
  const created=await p.reclamarYCrearSesion({ticketHmac,sesionHmac});
  if(created!==true)return denied();
  // Cookie de posesión: nunca se envía al código JS ni en la URL.
  const cookie=D016_SESSION_COOKIE+'='+raw+
   '; Max-Age='+D016_SESSION_SECONDS+
   '; Path=/; Secure; HttpOnly; SameSite=Lax';
  return new Response(JSON.stringify({state:'SESSION_CREATED'}),{
   status:200,headers:{...HEADERS,'set-cookie':cookie}
  });
 }catch{return denied()}
}
/** Extrae cookie EXACTA, no permite duplicados ni valores extraños. */
export function cookieSesionD016(req:Request):string|null{
 const header=req.headers.get('cookie');
 if(!header||header.length>4096)return null;
 const entries=header.split(';');
 let result:string|null=null;
 for(const entry of entries){
  const piece=entry.trim();
  if(!piece.startsWith(D016_SESSION_COOKIE+'='))continue;
  const v=piece.slice(D016_SESSION_COOKIE.length+1);
  if(result!==null||!SESSION_RE.test(v))return null;
  result=v;
 }
 return result;
}
/** Permite autorización posterior solo contra RPC privada, no por cookie sola. */
export async function verificarAccesoSesionD016(
 gate:PuertaD016,req:Request,rondaId:string,
 ports:SesionPrivadaPortsD016
):Promise<{buyerKey:string;requestId:string}|null>{
 if(!puertaD016Lista(gate)||!UUID.test(rondaId)||req.method!=='GET')
  return null;
 const session=cookieSesionD016(req);
 if(!session)return null;
 const digest=digestSesionPrivadaD016(session,gate.claveHmacHex);
 if(!digest)return null;
 try{
  const checked=await ports.verificarSesion({sesionHmac:digest,rondaId});
  if(!checked||!BUYER.test(checked.buyerKey)||
   checked.requestId.toLowerCase()!==rondaId.toLowerCase())
   return null;
  return {buyerKey:checked.buyerKey,requestId:checked.requestId};
 }catch{return null}
}

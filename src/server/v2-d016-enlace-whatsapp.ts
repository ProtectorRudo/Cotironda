/** Cotironda D016: SOLO núcleo server-side del ticket de acceso WhatsApp.
 * NO emite sesiones, JWT ni cookies; NO reemplaza la Auth del comprador.
 * La RPC de emisión y canje DEBE ser transaccional, privada y fail-closed.
 */
import {createHmac,randomBytes} from 'node:crypto';

export const V2_D016_TTL_MS=10*60*1000;
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const TOKEN=/^[A-Za-z0-9_-]{43}$/u; // randomBytes(32).toString('base64url')
const KEY=/^[a-f0-9]{64}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const BUYER=/^[a-z0-9_-]{3,100}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export type PuertaD016=Readonly<{
 habilitada:boolean;entorno:'preview'|'production'|'development';
 proyectoUrl:string;shaDesplegado:string;shaAprobado:string;
 // URL exacta del portal tomada de configuración servidor, no del comprador.
 origenPortal:string;claveHmacHex:string;
}>;
export type IdentidadWhatsappD016=Readonly<{
 compradorKey:string;rondaId:string;chatHmac:string;
 webhookAutenticado:boolean;
}>;
export type PuertosEmisionD016=Readonly<{
 // SQL valida remitente de Whapi, consentimiento, rol buyer, canal único y ronda.
 verificarCompradorYRonda:(x:Readonly<{
  compradorKey:string;rondaId:string;chatHmac:string;
 }>)=>Promise<boolean>;
 // Persistencia privada, atómica e idempotente. Invalida el token anterior.
 registrarTicket:(x:Readonly<{
  ticketHmac:string;compradorKey:string;rondaId:string;
  chatHmac:string;venceMs:number;
 }>)=>Promise<boolean>;
 // Implementación real DEBE resolver destinatario exclusivamente en BD privada.
 // El callback recibe chatHmac: jamás acepta un número aportado por un browser.
 enviarPorWhatsapp:(x:Readonly<{
  chatHmac:string;enlace:string;
 }>)=>Promise<boolean>;
 ahora:()=>number;
}>;
export type PuertosCanjeD016=Readonly<{
 // Una sola UPDATE ... RETURNING en PostgreSQL: TTL, identidad, estado y
 // concurrencia se comprueban transaccionalmente; nunca SELECT seguido de UPDATE.
 consumirTicketAtomico:(x:Readonly<{
  ticketHmac:string;ahoraMs:number;
 }>)=>Promise<boolean>;
 ahora:()=>number;
}>;
export type ResultadoD016='BLOCKED'|'SENT'|'DELIVERY_UNCERTAIN';
export type ResultadoCanjeD016='BLOCKED'|'CLAIMED_AWAITING_AUTH';

/** La URL del portal no se acepta desde parámetros públicos ni con query/hash. */
export function origenValidoD016(s:string):boolean{
 try{
  if(typeof s!=='string'||s.length>230)return false;
  const u=new URL(s);
  return u.protocol==='https:'&&u.username===''&&u.password===''&&
   u.port===''&&u.search===''&&u.hash===''&&u.pathname==='/'&&
   u.origin===s&&
   (u.hostname.endsWith('.vercel.app')||
    u.hostname==='piloto.cotironda.com.ar');
 }catch{return false}
}
export function puertaD016Lista(g:PuertaD016):boolean{
 return !!g&&g.habilitada===true&&g.entorno==='preview'&&
  g.proyectoUrl===PILOT&&
  typeof g.shaDesplegado==='string'&&SHA.test(g.shaDesplegado)&&
  g.shaDesplegado===g.shaAprobado&&
  origenValidoD016(g.origenPortal)&&
  typeof g.claveHmacHex==='string'&&KEY.test(g.claveHmacHex);
}
/** HMAC de dominio separado, nunca guardar tokens en claro. */
export function hmacTicketD016(token:string,claveHex:string):string|null{
 if(typeof token!=='string'||!TOKEN.test(token)||typeof claveHex!=='string'||
  !KEY.test(claveHex))return null;
 return createHmac('sha256',Buffer.from(claveHex,'hex'))
  .update('cotironda/d016/acceso/v1/','utf8').update(token,'ascii')
  .digest('hex');
}
export async function emitirEnlaceD016(
 g:PuertaD016,i:IdentidadWhatsappD016,p:PuertosEmisionD016
):Promise<ResultadoD016>{
 if(!puertaD016Lista(g)||!i||i.webhookAutenticado!==true||
  !BUYER.test(i.compradorKey)||!UUID.test(i.rondaId)||
  !HASH.test(i.chatHmac))return 'BLOCKED';
 try{
  const now=p.ahora();
  if(!Number.isSafeInteger(now)||now<=0)return 'BLOCKED';
  const verified=await p.verificarCompradorYRonda({
   compradorKey:i.compradorKey,rondaId:i.rondaId,chatHmac:i.chatHmac
  });
  if(verified!==true)return 'BLOCKED';
  const token=randomBytes(32).toString('base64url');
  const ticketHmac=hmacTicketD016(token,g.claveHmacHex);
  if(!ticketHmac)return 'BLOCKED';
  // No guardar el enlace, el token ni datos personales en la tabla.
  const registrado=await p.registrarTicket({
   ticketHmac,compradorKey:i.compradorKey,rondaId:i.rondaId,
   chatHmac:i.chatHmac,venceMs:now+V2_D016_TTL_MS
  });
  if(registrado!==true)return 'BLOCKED';
  // El fragmento NO se envía al servidor por GET/previsualización.
  const enlace=g.origenPortal+'/piloto/v2/acceso#d016='+token+'&ronda='+i.rondaId;
  try{
   const enviado=await p.enviarPorWhatsapp({chatHmac:i.chatHmac,enlace});
   // Resultado incierto: NO reintentar automáticamente para evitar duplicados.
   return enviado===true?'SENT':'DELIVERY_UNCERTAIN';
  }catch{return 'DELIVERY_UNCERTAIN'}
 }catch{return 'BLOCKED'}
}
/** Núcleo privado de canje. PRECONDICIÓN: usuario abrió el portal y ejecuta
 * POST same-origin con token extraído del fragmento, nunca GET de previsualización.
 * Un CLAIM NO es una sesión: prohibido mostrar originales desde este resultado.
 */
export async function canjearEnlaceD016(
 g:PuertaD016,req:Request,p:PuertosCanjeD016
):Promise<ResultadoCanjeD016>{
 if(!puertaD016Lista(g)||req.method!=='POST')return 'BLOCKED';
 try{
  const u=new URL(req.url);
  if(u.origin!==g.origenPortal||
   u.pathname!=='/api/piloto/v2/acceso/canjear'||u.search!==''||u.hash!=='')
   return 'BLOCKED';
  if(req.headers.get('origin')!==g.origenPortal||
   req.headers.get('sec-fetch-site')!=='same-origin'||
   !req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return 'BLOCKED';
  const len=req.headers.get('content-length');
  if(len&&(!/^\d{1,3}$/u.test(len)||Number(len)>120))return 'BLOCKED';
  const raw=await req.text();
  if(raw.length>120)return 'BLOCKED';
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return 'BLOCKED';
  const obj=parsed as Record<string,unknown>;
  if(Object.keys(obj).length!==1||typeof obj.ticket!=='string')return 'BLOCKED';
  const digest=hmacTicketD016(obj.ticket,g.claveHmacHex);
  if(!digest)return 'BLOCKED';
  const now=p.ahora();
  if(!Number.isSafeInteger(now)||now<=0)return 'BLOCKED';
  // La RPC deberá corroborar comprador/ronda/canal vigentes DENTRO del UPDATE.
  const consumed=await p.consumirTicketAtomico({ticketHmac:digest,ahoraMs:now});
  // NO devolver una sesión Auth ficticia, un JWT propio ni datos de la ronda.
  return consumed===true?'CLAIMED_AWAITING_AUTH':'BLOCKED';
 }catch{return 'BLOCKED'}
}

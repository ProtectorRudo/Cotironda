/** Cotironda D016: puente SOLO SERVIDOR después de consumir ticket WhatsApp.
 * No ejecuta Admin Auth sin un comprador pre-vinculado en BD privada.
 * Un resultado de ticket canjeado NO autoriza consultar presupuestos.
 * Si este módulo falla, no se emite cookie ni se abre ninguna ronda.
 */
import {puertaD016Lista,type PuertaD016} from './v2-d016-enlace-whatsapp.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const BUYER=/^[a-z0-9_-]{3,100}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}$/u;
const TOKENHASH=/^[A-Za-z0-9_-]{32,256}$/u;
const JWT=/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u;
const REFRESH=/^[A-Za-z0-9_-]{16,512}$/u;
const MAX_SESSION_MS=24*60*60*1000;

/** Esta evidencia proviene SOLAMENTE del retorno privado SQL, nunca de req.body. */
export type TicketCanjeadoD016=Readonly<{
 state:'CLAIMED_AWAITING_AUTH';
 buyerKey:string;requestId:string;chatHmac:string;
}>;
export type UsuarioExistenteD016=Readonly<{
 userId:string;email:string;
}>;
export type AuthD016Ports=Readonly<{
 // RPC privado: usuario Auth ya existente, asociado inequívocamente al
 // comprador y su canal Whapi, jamás a un email aportado por el navegador.
 resolverAuthDeComprador:(q:Readonly<{
  buyerKey:string;requestId:string;chatHmac:string
 }>)=>Promise<UsuarioExistenteD016|null>;
 // Admin generateLink({type:'magiclink', email}); servidor, NO SMTP/SMS.
 generarMagiclink:(q:Readonly<{email:string}>)=>Promise<{
  tokenHash:string|null
 }|null>;
 // Supabase auth.verifyOtp({type:'magiclink',token_hash:...});
 // Debe ejecutarse mediante cliente servidor no persistente y de PILOTO.
 canjearMagiclink:(q:Readonly<{tokenHash:string}>)=>Promise<{
  userId:string;sessionId:string;accessToken:string;
  refreshToken:string;expiresAtMs:number;
 }|null>;
 // Consulta PRIVADA a auth.sessions y a la asociación buyer/canal actual.
 verificarSesionViva:(q:Readonly<{
  userId:string;sessionId:string;buyerKey:string;
  requestId:string;chatHmac:string;
 }>)=>Promise<boolean>;
 // Solamente implementado por Next server: HttpOnly, Secure, SameSite=Lax;
 // el navegador nunca recibe JSON con refresh/access token.
 guardarCookieHttpOnly:(q:Readonly<{
  accessToken:string;refreshToken:string;
  expiresAtMs:number;userId:string;sessionId:string;
 }>)=>Promise<boolean>;
 ahora:()=>number;
}>;
export type ResultadoSesionD016='BLOCKED'|'SESSION_STARTED';

/** El recibo del ticket nunca basta por sí solo: cadena completa verificada. */
export async function iniciarSesionDesdeWhatsappD016(
 gate:PuertaD016,claimed:TicketCanjeadoD016|null,ports:AuthD016Ports
):Promise<ResultadoSesionD016>{
 if(!puertaD016Lista(gate)||!claimed||
  claimed.state!=='CLAIMED_AWAITING_AUTH'||
  !BUYER.test(claimed.buyerKey)||!UUID.test(claimed.requestId)||
  !HASH.test(claimed.chatHmac))return 'BLOCKED';
 try{
  const now=ports.ahora();
  if(!Number.isSafeInteger(now)||now<=0)return 'BLOCKED';
  const user=await ports.resolverAuthDeComprador({
   buyerKey:claimed.buyerKey,requestId:claimed.requestId,
   chatHmac:claimed.chatHmac
  });
  if(!user||!UUID.test(user.userId)||!EMAIL.test(user.email))
   return 'BLOCKED';
  const link=await ports.generarMagiclink({email:user.email});
  if(!link||typeof link.tokenHash!=='string'||
   !TOKENHASH.test(link.tokenHash))return 'BLOCKED';
  const auth=await ports.canjearMagiclink({tokenHash:link.tokenHash});
  if(!auth||auth.userId!==user.userId||!UUID.test(auth.sessionId)||
   typeof auth.accessToken!=='string'||!JWT.test(auth.accessToken)||
   typeof auth.refreshToken!=='string'||!REFRESH.test(auth.refreshToken)||
   !Number.isSafeInteger(auth.expiresAtMs)||
   auth.expiresAtMs<=now||auth.expiresAtMs>now+MAX_SESSION_MS)
   return 'BLOCKED';
  const valid=await ports.verificarSesionViva({
   userId:user.userId,sessionId:auth.sessionId,
   buyerKey:claimed.buyerKey,requestId:claimed.requestId,
   chatHmac:claimed.chatHmac
  });
  if(valid!==true)return 'BLOCKED';
  // Último paso: sin cookie válida nunca se marca SESSION_STARTED.
  const stored=await ports.guardarCookieHttpOnly({
   accessToken:auth.accessToken,refreshToken:auth.refreshToken,
   expiresAtMs:auth.expiresAtMs,userId:user.userId,sessionId:auth.sessionId
  });
  return stored===true?'SESSION_STARTED':'BLOCKED';
 }catch{
  // Nunca registrar email, token Hash, JWT, refresh token ni errores Auth.
  return 'BLOCKED';
 }
}

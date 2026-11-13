/** Adapter de Supabase GoTrue para D016, SIN I/O hasta inyectar clientes
 * del PILOTO desde el servidor. No crea usuarios y no manda SMS ni SMTP.
 * Admin y verificación son CLIENTES DISTINTOS: el de verificación NO recibe
 * service_role, usa publishable y persistSession:false.
 */
import {claimsDeJwtValidado} from './originales-piloto-http-runtime.ts';

const HEX=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TOKENHASH=/^[A-Za-z0-9_-]{32,256}$/u;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}$/u;
const JWT=/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u;
const REFRESH=/^[A-Za-z0-9_-]{16,512}$/u;
type AdminClientD016=Readonly<{
 auth:Readonly<{admin:Readonly<{
  generateLink:(params:{type:'magiclink';email:string})=>Promise<{
   data?:{properties?:{hashed_token?:unknown}|null}|null;error?:unknown
  }>
 }>}>
}>;
type PublicAuthClientD016=Readonly<{
 auth:Readonly<{
  verifyOtp:(params:{type:'magiclink';token_hash:string})=>Promise<{
   data?:{
    user?:{id?:string}|null;
    session?:{
     access_token?:string;refresh_token?:string;
     expires_at?:number;
    }|null;
   }|null;error?:unknown
  }>;
  getUser:(accessToken:string)=>Promise<{
   data?:{user?:{id?:string}|null}|null;error?:unknown
  }>;
 }>
}>;
type VerifiedD016=Readonly<{
 userId:string;sessionId:string;accessToken:string;
 refreshToken:string;expiresAtMs:number;
}>;

/** El caller tiene que usar exclusivamente un AdminClient service_role
 * server-only. NO acepta redirectTo ni contraseña.
 */
export async function generarHashMagiclinkD016(
 admin:AdminClientD016,email:string
):Promise<{tokenHash:string|null}|null>{
 if(typeof email!=='string'||!EMAIL.test(email))return null;
 try{
  const out=await admin.auth.admin.generateLink({type:'magiclink',email});
  const hash=out?.data?.properties?.hashed_token;
  if(out?.error||typeof hash!=='string'||!TOKENHASH.test(hash))
   return null;
  return {tokenHash:hash};
 }catch{return null}
}

/** Revalidación obligatoria de JWT contra GoTrue PILOTO: nunca solo decode.
 * Además comprueba session_id, issuer y expiración con claimsDeJwtValidado.
 */
export async function verificarMagiclinkRealD016(
 client:PublicAuthClientD016,tokenHash:string,nowMs:number
):Promise<VerifiedD016|null>{
 if(typeof tokenHash!=='string'||!TOKENHASH.test(tokenHash)||
  !Number.isSafeInteger(nowMs)||nowMs<=0)return null;
 try{
  const out=await client.auth.verifyOtp({type:'magiclink',token_hash:tokenHash});
  const userId=out?.data?.user?.id;
  const session=out?.data?.session;
  if(out.error||!userId||!UUID.test(userId)||!session||
   typeof session.access_token!=='string'||!JWT.test(session.access_token)||
   typeof session.refresh_token!=='string'||!REFRESH.test(session.refresh_token))
   return null;
  const proof=await client.auth.getUser(session.access_token);
  if(proof.error||proof.data?.user?.id!==userId)return null;
  const claims=claimsDeJwtValidado(session.access_token,userId,nowMs);
  if(!claims||!Number.isSafeInteger(session.expires_at)||
   session.expires_at*1000!==claims.expiresMs)return null;
  return Object.freeze({
   userId,sessionId:claims.sessionId,
   accessToken:session.access_token,
   refreshToken:session.refresh_token,
   expiresAtMs:claims.expiresMs
  });
 }catch{return null}
}

/** Utilidad de integridad para el Hash del ticket de WhatsApp, no del token
 * de Supabase. Refusar cadenas que parezcan secretos antes de enviar a RPC.
 */
export function digestTicketPrivadoValidoD016(v:unknown):v is string{
 return typeof v==='string'&&HEX.test(v);
}

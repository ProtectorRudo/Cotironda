/**
 * PILOT original documents HTTP boundary. Never use DEV Auth, WhatsApp
 * tracking links, browser-supplied company/user/session or a signed Storage URL.
 * Supabase adapters are injected so negative cases can be tested without
 * credentials or network calls.
 */
import {Buffer} from 'node:buffer';
import type {DependenciasOriginalesPiloto,IdentidadAuthPiloto,
 ConsultaPrivadaOriginales} from './originales-piloto-conexion-segura.ts';

export const PILOT_REF='ilggkalaafhtiysyzlmg';
const PILOT_URL='https://'+PILOT_REF+'.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const COMPANY=/^[a-z0-9_-]{3,100}$/u;
const JWT_PART=/^[A-Za-z0-9_-]+$/u;
const RELEASE_SHA=/^[a-f0-9]{40}$/u;

export type PilotoEnv=Record<string,string|undefined>;
export type SupabaseUserPiloto=Readonly<{
 id:string;phone?:string|null;phone_confirmed_at?:string|null;
 is_anonymous?:boolean|null;
}>;
export type PilotoOriginalesPorts=Readonly<{
 /** MUST call PILOT auth.getUser(token) (server-to-Auth request). */
 getUser:(jwt:string)=>Promise<SupabaseUserPiloto|null>;
 /** MUST use normal buyer JWT, not service_role. */
 buyerIdentity:(jwt:string,rondaId:string)=>Promise<boolean>;
 /** MUST use server-only PILOT secret key and the PRIVATE MVP192 RPC. */
 privateOriginals:(query:ConsultaPrivadaOriginales)=>Promise<unknown>;
 /** MUST read PILOT Storage privately, not generate signed/public URLs. */
 readOriginal:(bucket:string,path:string)=>Promise<Uint8Array|null>;
 /** Mandatory persistence in the PILOT via a server-only RPC. */
 auditOriginal:(q:Readonly<{
  rondaId:string;documentoId:string;usuarioId:string;empresaId:string;
  authSessionId:string;sourceSha256:string;byteCount:number
 }>)=>Promise<boolean>;
}>;

function object(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}

/** Explicit, version-pinned, preview-only deployment activation. */
export function originalesHTTPHabilitados(env:PilotoEnv):boolean{
 const sha=env.COTIRONDA_PILOT_ORIGINALS_RELEASE_SHA;
 return env.COTIRONDA_PILOT_ORIGINALS_ENABLED==='true'&&
  env.VERCEL_ENV==='preview'&&
  env.COTIRONDA_REGISTRATION_ENABLED==='false'&&
  env.COTIRONDA_PILOT_SUPABASE_URL===PILOT_URL&&
  env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')===true&&
  env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY?.startsWith('sb_secret_')===true&&
  typeof sha==='string'&&RELEASE_SHA.test(sha)&&
  env.VERCEL_GIT_COMMIT_SHA===sha;
}

/** A bearer is never accepted from URL fragments, query, body, cookies or
 * DEV Auth. It is validated by PILOT getUser before its claims are read. */
export function bearerPiloto(req:Request):string|null{
 const auth=req.headers.get('authorization');
 if(!auth||!/^Bearer [A-Za-z0-9_.-]{120,8096}$/u.test(auth))return null;
 const token=auth.slice('Bearer '.length);
 const parts=token.split('.');
 return parts.length===3&&parts.every(x=>x.length>=8&&JWT_PART.test(x))?
  token:null;
}
type Claims=Readonly<{sub:string;sessionId:string;expiresMs:number}>;
/** Decode ONLY AFTER getUser(jwt) succeeds: never treat unverified JSON as
 * authorization. MVP191 and MVP192 recheck that auth.sessions still exists. */
export function claimsDeJwtValidado(jwt:string,usuarioId:string,nowMs:number):
 Claims|null{
 try{
  const parts=jwt.split('.');
  if(parts.length!==3||parts[1].length>8192||!JWT_PART.test(parts[1]))return null;
  const parsed:unknown=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(!object(parsed)||parsed.iss!==PILOT_URL+'/auth/v1'||
     parsed.role!=='authenticated'||parsed.aud!=='authenticated'||
     parsed.sub!==usuarioId||!UUID.test(usuarioId)||
     (typeof parsed.session_id!=='string'||!UUID.test(parsed.session_id))||!Number.isSafeInteger(parsed.exp)||
     typeof parsed.exp!=='number'||parsed.exp*1000<=nowMs||
     parsed.exp*1000>Number.MAX_SAFE_INTEGER)return null;
  return Object.freeze({
   sub:usuarioId,sessionId:parsed.session_id as string,
   expiresMs:parsed.exp*1000
  });
 }catch{return null}
}
function companyOfPrivateCatalog(raw:unknown):string|null{
 return object(raw)&&raw.state==='authorized_catalog'&&
  typeof raw.buyerKey==='string'&&COMPANY.test(raw.buyerKey)?
  raw.buyerKey:null;
}

/** Per-request callbacks, not singleton: identity and consent are rechecked
 * throughout the download; no cross-request cache of authorization. */
export function conectarOriginalesAuthPiloto(
 req:Request,rondaId:string,
 ports:PilotoOriginalesPorts,enabled:boolean,
 now:()=>number=Date.now
):DependenciasOriginalesPiloto{
 const jwt=bearerPiloto(req);
 let lockedSession:string|null=null;
 let lockedCompany:string|null=null;
 const identity=async():Promise<IdentidadAuthPiloto|null>=>{
  if(!enabled||!jwt||!UUID.test(rondaId))return null;
  try{
   const user=await ports.getUser(jwt);
   const t=now();
   if(!user||!user.phone_confirmed_at||user.is_anonymous!==false||
      typeof user.phone!=='string'||!/^\+?[1-9]\d{7,15}$/u.test(user.phone))
     return null;
   const claims=claimsDeJwtValidado(jwt,user.id,t);
   if(!claims)return null;
   if(lockedSession!==null&&lockedSession!==claims.sessionId)return null;
   const raw=await ports.privateOriginals({
    rondaId,usuarioId:claims.sub,authSessionId:claims.sessionId,
    documentoId:null
   });
   const company=companyOfPrivateCatalog(raw);
   if(!company||lockedCompany!==null&&lockedCompany!==company)return null;
   lockedSession=claims.sessionId;
   lockedCompany=company;
   return Object.freeze({
    usuarioId:claims.sub,empresaId:company,authSessionId:claims.sessionId,
    autenticada:true as const,rol:'buyer' as const,
    identidadVerificada:true as const,anonima:false as const,
    venceMs:claims.expiresMs,revocadaMs:null
   });
  }catch{return null}
 };
 return {
  habilitado:enabled,ahora:now,
  verificarSesionAutentica:identity,
  verificarVinculoPiloto:async id=>{
   if(!jwt||!UUID.test(id)||id!==rondaId)return false;
   try{return await ports.buyerIdentity(jwt,id)===true}
   catch{return false}
  },
  consultarOriginalesPrivados:q=>ports.privateOriginals(q),
  leerArchivo:async(bucket,path)=>{
   if(bucket!=='cotironda-piloto-originals'||!/^media\/[a-f0-9]{64}$/u.test(path))
    return null;
   return ports.readOriginal(bucket,path);
  },
  registrarDescarga:async event=>{
   if(!jwt||event.rondaId!==rondaId)return false;
   const user=await identity();
   if(!user||event.usuarioId!==user.usuarioId||
      event.empresaId!==user.empresaId)return false;
   try{
    if(await ports.buyerIdentity(jwt,rondaId)!==true)return false;
    return await ports.auditOriginal({
     ...event,authSessionId:user.authSessionId
    })===true;
   }catch{return false}
  }
 };
}

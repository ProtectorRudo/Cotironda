/**
 * P0: operator-only HTTPS boundary for human review of original-download terms.
 * Reuses MVP267 identity/authenticated PILOT RPCs. No service_role, cookies,
 * publicly browsable evidence, automatic consent, or WhatsApp send.
 *
 * This module has no real I/O until an approved Preview invokes a route.
 */
import {bearerPiloto,claimsDeJwtValidado}
 from './originales-piloto-http-runtime.ts';
import {operadorPilotoHabilitado}
 from './operador-piloto-http-mvp267.ts';
import {crearRevisorMfaOriginalesP0}
 from './whapi-terms-mfa-review-p0.ts';
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const PATH='/api/piloto/operador/terminos/';
const MAX_LENGTH=750;
const HEADERS={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'pragma':'no-cache','referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'",
 'vary':'Authorization, Origin',
 'x-robots-tag':'noindex, nofollow, noarchive'
};
type Env=Record<string,string|undefined>;
type Action='bandeja'|'preparar'|'decidir';
type User=Readonly<{id:string;is_anonymous?:boolean|null}>;
type Ports=Readonly<{
 getUser:(jwt:string)=>Promise<User|null>;
 authenticatedRpc:(name:string,args:Readonly<Record<string,unknown>>)=>Promise<unknown>;
}>;
function response(status:number,data:unknown):Response{
 return new Response(JSON.stringify(data),{status,headers:HEADERS});
}
function fail(status:number,state:string):Response{
 return response(status,{state});
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...keys].sort().join(',');
}
export function revisionMfaHTTPHabilitada(env:Env):boolean{
 return operadorPilotoHabilitado(env)&&
  env.COTIRONDA_P0_TERMS_REVIEW_UI_ENABLED==='true'&&
  /^sb_publishable_[A-Za-z0-9_-]{8,}$/u.test(
   env.NEXT_PUBLIC_COTIRONDA_PILOT_OPERATOR_PUBLISHABLE_KEY??'')&&
  env.NEXT_PUBLIC_COTIRONDA_PILOT_OPERATOR_PUBLISHABLE_KEY===
   env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY&&
  typeof env.COTIRONDA_P0_TERMS_INBOX_AES_HEX==='string'&&
  /^[a-fA-F0-9]{64}$/u.test(env.COTIRONDA_P0_TERMS_INBOX_AES_HEX);
}
function parse(action:Action,v:unknown){
 if(action==='bandeja')return exact(v,[])?{}:null;
 if(action==='preparar'){
  if(!exact(v,['messageHmac'])||
    typeof v.messageHmac!=='string'||!HASH.test(v.messageHmac))return null;
  return {messageHmac:v.messageHmac};
 }
 if(!exact(v,['messageHmac','noticeMessageHmac',
     'reviewedPlaintextSha256','decision','humanAttestation'])||
  typeof v.messageHmac!=='string'||!HASH.test(v.messageHmac)||
  typeof v.noticeMessageHmac!=='string'||!HASH.test(v.noticeMessageHmac)||
  typeof v.reviewedPlaintextSha256!=='string'||!HASH.test(v.reviewedPlaintextSha256)||
  !['explicit_accept','not_explicit'].includes(String(v.decision))||
  v.humanAttestation!==true)return null;
 return {messageHmac:v.messageHmac,
   noticeMessageHmac:v.noticeMessageHmac,
   reviewedPlaintextSha256:v.reviewedPlaintextSha256,
   decision:v.decision as 'explicit_accept'|'not_explicit',
   humanAttestation:true};
}
export async function responderRevisionMfaOperadorP0(
 req:Request,action:Action,env:Env,ports?:Ports
):Promise<Response>{
 if(!revisionMfaHTTPHabilitada(env))return fail(503,'revision_desactivada');
 if(req.method!=='POST')return fail(405,'metodo_no_permitido');
 const url=new URL(req.url);
 if(url.pathname!==PATH+action||url.search||url.hash||
    url.origin!==env.COTIRONDA_PILOT_OPERATOR_ORIGIN)
   return fail(400,'solicitud_invalida');
 if(req.headers.get('origin')!==url.origin)
   return fail(403,'origen_no_autorizado');
 if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
   return fail(400,'solicitud_invalida');
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^[0-9]+$/u.test(length)||
    Number(length)<1||Number(length)>MAX_LENGTH))
   return fail(400,'solicitud_invalida');
 const jwt=bearerPiloto(req);
 if(!jwt)return fail(401,'sesion_requerida');
 if(!ports)return fail(503,'revision_no_disponible');
 let body:unknown;
 try{
  const raw=await req.text();
  if(raw.length<2||raw.length>MAX_LENGTH)return fail(400,'solicitud_invalida');
  body=JSON.parse(raw);
 }catch{return fail(400,'solicitud_invalida')}
 const valid=parse(action,body);
 if(!valid)return fail(400,'solicitud_invalida');
 try{
  // getUser MUST query PILOT Auth; JWT payload is read only AFTER that succeeds.
  const user=await ports.getUser(jwt);
  if(!user||user.is_anonymous!==false||!UUID.test(user.id)||
    !claimsDeJwtValidado(jwt,user.id,Date.now()))
    return fail(401,'sesion_no_valida');
  const encoded=jwt.split('.')[1];
  const claims=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(!exactMfa(claims))return fail(403,'mfa_requerido');
  // The private SQL itself checks the LIVE Auth session and AAL2 on EACH RPC.
  if(action==='bandeja'){
   const raw=await ports.authenticatedRpc(
    'cotironda_piloto_terms_review_queue_auth_p0',{});
   if(!exact(raw,['state','items'])||raw.state!=='ready'||
     !Array.isArray(raw.items)||raw.items.length>12)
     return fail(409,'revision_no_disponible');
   const safe=[];
   for(const item of raw.items){
    if(!exact(item,['messageHmac','supplierKey','receivedAt'])||
       typeof item.messageHmac!=='string'||!HASH.test(item.messageHmac)||
       typeof item.supplierKey!=='string'||
       !/^[a-z][a-z0-9_]{2,63}$/u.test(item.supplierKey)||
       typeof item.receivedAt!=='string'||
       !Number.isFinite(Date.parse(item.receivedAt)))
       return fail(409,'revision_no_disponible');
    safe.push(item);
   }
   return response(200,{state:'ready',items:safe});
  }
  const key=Buffer.from(env.COTIRONDA_P0_TERMS_INBOX_AES_HEX!,'hex');
  const reviewer=crearRevisorMfaOriginalesP0({
   inboxAesKey:key,authenticatedRpc:ports.authenticatedRpc
  });
  if(action==='preparar'){
   if(!('messageHmac' in valid)||
      typeof valid.messageHmac!=='string')
     return fail(400,'solicitud_invalida');
   const v=await reviewer.preparar(valid.messageHmac);
   return response(200,{state:'ready',...v});
  }
  if(!('decision' in valid))return fail(400,'solicitud_invalida');
  const result=await reviewer.decidir(valid);
  return response(200,result);
 }catch{return fail(409,'revision_no_disponible')}
}
function exactMfa(v:unknown):boolean{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (v as Record<string,unknown>).aal==='aal2'&&
 (v as Record<string,unknown>).role==='authenticated';
}

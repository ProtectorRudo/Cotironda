/**
 * MVP-061: PRIVATE invitation sender tick. No background cron or send
 * unless an operator configures all OFF-by-default preview-only gates,
 * verified opt-ins, channel allowlist, quotas and a Whapi channel token.
 */
import {timingSafeEqual} from 'node:crypto';
import {crearEmisorInvitacionD070} from './whapi-invitation-sender-d070.ts';
import type {PostgresFactoryD088} from './whapi-postgres-driver-d088.ts';
import {crearSqlEmisorInvitacionesMvp061,validarSqlSenderMvp061}
 from './whapi-invite-sql-sender-mvp061.ts';

type Env=Readonly<Record<string,string|undefined>>;
const CH=/^[A-Za-z0-9_-]{4,64}$/u,HEX=/^[a-f0-9]{64}$/u;
const TOKEN=/^[A-Za-z0-9._-]{24,512}$/u;
const PHONE=/^[1-9][0-9]{8,14}$/u;
function unavailable():never{throw Error('mvp061_envio_no_disponible')}
function key(hex:unknown):Buffer{
 if(typeof hex!=='string'||!HEX.test(hex))unavailable();
 const b=Buffer.from(hex,'hex');
 if(b.every(x=>x===0))unavailable();
 return b;
}
function res(status:number,payload:Record<string,unknown>):Response{
 return new Response(JSON.stringify(payload),{
  status,headers:{
   'content-type':'application/json; charset=utf-8',
   'cache-control':'private, no-store, max-age=0',
   'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
   'x-robots-tag':'noindex, nofollow, noarchive'
  }
 });
}
export function validarEmisorInvitacionesMvp061(env:Env):Readonly<{
 channel:string;token:string;recipients:readonly string[];
 secret:string;keys:Readonly<{hmacIdentity:Buffer;recipientAes:Buffer}>;
 ackKey:Buffer;
}>{
 validarSqlSenderMvp061(env);
 if(env.COTIRONDA_INVITE_SEND_ENABLED!=='true'||
    env.COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED!=='true')unavailable();
 const channel=env.COTIRONDA_WHAPI_CHANNEL;
 const secret=env.COTIRONDA_INVITE_SEND_SECRET;
 const token=env.COTIRONDA_INVITE_SEND_WHAPI_TOKEN;
 if(typeof channel!=='string'||!CH.test(channel)||
    typeof secret!=='string'||secret.length<32||secret.length>256||
    secret===env.COTIRONDA_WHAPI_WEBHOOK_SECRET||
    secret===env.COTIRONDA_BUYER_WORKER_SECRET||
    typeof token!=='string'||!TOKEN.test(token))unavailable();
 const list=env.COTIRONDA_INVITE_SEND_ALLOWED_TO;
 if(typeof list!=='string'||list.length>65)unavailable();
 const recipients=list.split(',');
 if(recipients.length<1||recipients.length>3||
    recipients.some(x=>!PHONE.test(x))||
    new Set(recipients).size!==recipients.length)unavailable();
 const hmacIdentity=key(env.COTIRONDA_WHAPI_HMAC_ID_HEX);
 const recipientAes=key(env.COTIRONDA_WHAPI_RECIPIENT_AES_HEX);
 const ackKey=key(env.COTIRONDA_WHAPI_ACK_HMAC_HEX);
 if(hmacIdentity.equals(recipientAes)||hmacIdentity.equals(ackKey)||
    recipientAes.equals(ackKey))unavailable();
 return Object.freeze({channel,secret,token,
  recipients:Object.freeze(recipients),
  keys:{hmacIdentity,recipientAes},ackKey});
}
function equal(a:string,b:string):boolean{
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export async function atenderEnvioInvitacionMvp061(request:Request,cfg:Readonly<{
 env:Env;
 cargarSql?:()=>Promise<PostgresFactoryD088>;
 fetcher?:typeof fetch;
}>):Promise<Response>{
 if(request.method!=='POST')return res(405,{error:'metodo_no_permitido'});
 const env=cfg?.env;
 if(!env||env.VERCEL_ENV!=='preview'||
   env.VERCEL_GIT_COMMIT_REF!=='integration/mvp-piloto-20261031'||
   env.COTIRONDA_REGISTRATION_ENABLED==='true'||
   env.COTIRONDA_INVITE_SEND_ENABLED!=='true'||
   env.COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED!=='true')
   return res(503,{error:'envio_no_habilitado'});
 const secret=env.COTIRONDA_INVITE_SEND_SECRET;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||
   secret===env.COTIRONDA_WHAPI_WEBHOOK_SECRET||
   secret===env.COTIRONDA_BUYER_WORKER_SECRET)
   return res(503,{error:'emisor_no_configurado'});
 if(!equal(request.headers.get('x-cotironda-invite-key')??'',secret))
   return res(401,{error:'acceso_no_autorizado'});
 const length=request.headers.get('content-length');
 if(request.body!==null||
   (length!==null&&(!/^\d+$/u.test(length)||Number(length)!==0)))
   return res(415,{error:'cuerpo_no_admitido'});
 if(typeof cfg.cargarSql!=='function'||typeof cfg.fetcher!=='function')
   return res(503,{error:'emisor_no_configurado'});
 try{
  const settings=validarEmisorInvitacionesMvp061(env);
  // Only load postgres AFTER correct header, preview and complete config.
  const factory=await cfg.cargarSql();
  const sql=crearSqlEmisorInvitacionesMvp061(env,factory);
  const sender=crearEmisorInvitacionD070({
   habilitado:true,pilotoAutorizado:true,
   channel:settings.channel,token:settings.token,
   destinatariosPermitidos:settings.recipients,
   keys:settings.keys,ackKey:settings.ackKey,
   committedRpc:sql.committedRpc,fetcher:cfg.fetcher
  });
  const result=await sender.procesarUno();
  // No clear phone, content, recipient HMAC, token or message ID leaves API.
  return res(200,result);
 }catch{return res(503,{error:'envio_privado_no_disponible'});}
}

/**
 * MVP-048 — private Whapi HTTP entry point, preview-only and OFF by default.
 * Reuses D027 (bounded webhook), D029 (HMAC + AES-GCM) and D030/D074
 * (private SQL inbox; D082 trigger queues the committed buyer event).
 *
 * No driver/connection/credentials or HTTP sender is created here.
 * A real preview requires an explicitly injected dedicated PostgreSQL
 * gateway, backed up/restored DEV #175 and consented test chats.
 */
import {timingSafeEqual} from 'node:crypto';
import {procesarWebhookWhapiAislado} from './whapi-inbound-offline.ts';
import {construirBrokerWhapiPrivado} from './whapi-crypto-broker.ts';
import {crearPuertoPostgresWhapiDualD074} from './whapi-postgres-gateway.ts';
import {crearListaPilotoWhatsappMvp068}
 from './whapi-pilot-allowlist-mvp068.ts';
import type {PuertoPostgresD030} from './whapi-postgres-gateway.ts';

type Env=Readonly<Record<string,string|undefined>>;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const KEY_ID=/^[a-z][a-z0-9_]{2,40}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const REF='integration/mvp-piloto-20261031';
const CTYPE='application/json; charset=utf-8';
function response(status:number,code:string):Response{
 return new Response(JSON.stringify({error:code}),{
  status,headers:{
   'content-type':CTYPE,'cache-control':'private, no-store, max-age=0',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'x-robots-tag':'noindex, nofollow, noarchive'
  }
 });
}
function equalSecret(received:string,secret:string):boolean{
 const a=Buffer.from(received,'utf8'),b=Buffer.from(secret,'utf8');
 return a.length===b.length&&timingSafeEqual(a,b);
}
function key(value:unknown):Buffer|null{
 if(typeof value!=='string'||!HEX.test(value))return null;
 const b=Buffer.from(value,'hex');
 return b.every(x=>x===0)?null:b;
}
export function whapiPreviewEnabledD083(env:Env):boolean{
 return env.COTIRONDA_WHAPI_WEBHOOK_ENABLED==='true' &&
  env.COTIRONDA_WHAPI_PILOT_AUTHORIZED==='true' &&
  env.VERCEL_ENV==='preview' &&
  env.VERCEL_GIT_COMMIT_REF===REF &&
  env.COTIRONDA_REGISTRATION_ENABLED!=='true';
}
export async function atenderWebhookWhapiPreviewD083(req:Request,config:Readonly<{
 env:Env;
 // Promise must ONLY open a dedicated low-privilege SQL gateway,
 // able to EXECUTE D030 + D074, not service_role, browser or postgres.
 abrirPuertoSql?:()=>Promise<PuertoPostgresD030>;
 ahoraUnix?:()=>number;
}>):Promise<Response>{
 if(req.method!=='POST')return response(405,'metodo_no_permitido');
 if(!config||!config.env||!whapiPreviewEnabledD083(config.env))
  return response(503,'integracion_no_habilitada');
 const env=config.env;
 const channel=env.COTIRONDA_WHAPI_CHANNEL;
 const secret=env.COTIRONDA_WHAPI_WEBHOOK_SECRET;
 const keyId=env.COTIRONDA_WHAPI_AES_KEY_ID;
 if(typeof channel!=='string'||!CHANNEL.test(channel)||
  typeof secret!=='string'||secret.length<32||secret.length>256||
  typeof keyId!=='string'||!KEY_ID.test(keyId)||
  keyId==='legacy_d029')
  return response(503,'integracion_no_configurada');
 // No database connection, no JSON parsing and no logs before checking the
 // fixed custom header configured IN Whapi Settings. Whapi is not HMAC-signed.
 if(!equalSecret(req.headers.get('x-cotironda-webhook-key')??'',secret))
  return response(401,'origen_no_autorizado');
 // Cheap header checks BEFORE opening a scarce private database connection.
 // D027 still validates the actual streamed body against the same 64 KiB cap.
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')??''))
  return response(415,'formato_no_admitido');
 const contentLength=req.headers.get('content-length');
 if(contentLength!==null&&
   (!/^\d+$/u.test(contentLength)||Number(contentLength)>65536))
  return response(413,'cuerpo_invalido');
 if(typeof config.abrirPuertoSql!=='function')
  return response(503,'almacenamiento_privado_no_configurado');
 const identidadHmac=key(env.COTIRONDA_WHAPI_HMAC_ID_HEX),
  huellaHmac=key(env.COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX),
  contenidoAes=key(env.COTIRONDA_WHAPI_AES_CONTENT_HEX);
 if(!identidadHmac||!huellaHmac||!contenidoAes||
   identidadHmac.equals(huellaHmac)||identidadHmac.equals(contenidoAes)||
   huellaHmac.equals(contenidoAes))
  return response(503,'cifrado_privado_no_configurado');
 // Pilot roster consists of HMAC chat keys, never telephone numbers. Require
 // one buyer and two suppliers BEFORE opening any database connection.
 let lista:ReturnType<typeof crearListaPilotoWhatsappMvp068>;
 try{lista=crearListaPilotoWhatsappMvp068(env,channel,identidadHmac);}
 catch{return response(503,'lista_piloto_no_configurada')}
 let db:PuertoPostgresD030|undefined;
 try{
  db=await config.abrirPuertoSql();
  if(!db||typeof db.query!=='function'||
    (db.cerrar!==undefined&&typeof db.cerrar!=='function'))
   return response(503,'almacenamiento_privado_no_configurado');
  const broker=construirBrokerWhapiPrivado({
   channel,secretoWebhook:secret,habilitado:true,
   claves:{identidadHmac,huellaHmac,contenidoAes},
   contenidoKeyId:keyId,
   ahoraUnix:config.ahoraUnix??(()=>Math.floor(Date.now()/1000)),
   almacen:crearPuertoPostgresWhapiDualD074(db)
  });
  // The pilot must support BOTH registered phone roles. Its allowlist
  // narrows the SQL resolvers, it does NOT replace identity/consent/round
  // checks. Unknown contacts and crossed roles cause zero database lookups.
  const buyerResolver=broker.dependencias.resolverComprador;
  if(!buyerResolver)return response(503,'canal_doble_rol_no_configurado');
  return await procesarWebhookWhapiAislado(req,{
   ...broker.dependencias,exigirAmbosRoles:true,
   resolverProveedor:(ch,chat)=>lista.permitido('proveedor',ch,chat)?
    broker.dependencias.resolverProveedor(ch,chat):Promise.resolve(null),
   resolverComprador:(ch,chat)=>lista.permitido('comprador',ch,chat)?
    buyerResolver(ch,chat):Promise.resolve(null)
  });
 }catch{
  // Never echo database errors, message content or key material.
  return response(503,'integracion_privada_no_disponible');
 }finally{
  // Close a per-request private connection on success, rejection or failure.
  // A shared-pool adapter must inject a release callback, never pool.end().
  // After a committed inbox write a close error must not provoke replay.
  try{await db?.cerrar?.()}catch{ /* No secrets in webhook/logs. */ }
 }
}

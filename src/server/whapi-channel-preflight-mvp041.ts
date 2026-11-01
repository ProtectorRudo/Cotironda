/**
 * MVP-041 — Whapi.Cloud READ-ONLY connection preflight for isolated pilot.
 * No global fetch, env reads, QR retrieval, messages, POST, PATCH or logs.
 * A 200 /health is NOT evidence of connected WhatsApp or working webhooks.
 * https://whapi.readme.io/reference/checkhealth
 * https://whapi.readme.io/reference/getchannelsettings
 */
import {timingSafeEqual} from 'node:crypto';

const ENDPOINT='https://gate.whapi.cloud';
const TOKEN=/^[A-Za-z0-9._-]{24,512}$/u;
const SECRET=/^[a-f0-9]{64}$/u;
const MAX_BYTES=32*1024;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
function fail():never{throw new Error('mvp041_auditoria_no_disponible');}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function safeOrigin(value:unknown):value is string{
 if(typeof value!=='string'||value.length>180)return false;
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&url.origin===value&&
   !url.username&&!url.password&&!url.hash&&!url.search;
 }catch{return false;}
}
function same(a:unknown,b:string):boolean{
 if(typeof a!=='string'||a.length!==b.length)return false;
 return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
export type WhapiMvp041Config=Readonly<{
 habilitado:boolean;
 pilotoAutorizado:boolean;
 channel:string;
 token?:string;
 webhookSecretHex?:string;
 webhookUrl:string;
 fetcher?:typeof fetch;
}>;
export type AuditoriaWhapiMvp041=Readonly<{
 estado:'desactivado'|'configuracion_incompleta'|'canal_sin_verificar'|
  'webhook_incorrecto'|'configuracion_whapi_verificada_sin_envio';
 canalConectado:boolean;perfilConsultable:boolean;
 webhookValido:boolean;
 requestsGet:number;mensajesEnviados:0;ajustesModificados:false;
}>;
function result(
 estado:AuditoriaWhapiMvp041['estado'],
 channelConnected=false,profile=false,webhook=false,requests=0
):AuditoriaWhapiMvp041{
 return Object.freeze({estado,canalConectado:channelConnected,
  perfilConsultable:profile,webhookValido:webhook,
  requestsGet:requests,mensajesEnviados:0 as const,
  ajustesModificados:false as const});
}
/** Server-only proposal. Never serialize/log or expose to client. */
export function proponerWebhookWhapiMvp041(
 webhookUrl:string,webhookSecretHex:string
){
 if(!safeOrigin(new URL(webhookUrl).origin)||
  !webhookUrl.startsWith('https://')||webhookUrl.length>220||
  !SECRET.test(webhookSecretHex))fail();
 const parsed=new URL(webhookUrl);
 if(parsed.username||parsed.password||parsed.hash||parsed.search||
  parsed.pathname!=='/api/whapi/webhook'||parsed.origin==='https://gate.whapi.cloud')
  fail();
 return Object.freeze({
  callback_persist:true,
  webhooks:Object.freeze([Object.freeze({
   url:webhookUrl,mode:'body',
   headers:Object.freeze({'X-Cotironda-Webhook-Key':webhookSecretHex}),
   events:Object.freeze([Object.freeze({type:'messages',method:'post'})])
  })])
 });
}
async function limitedJson(response:Response):Promise<unknown>{
 if(response.redirected||response.status!==200||
  !/^application\/json(?:;|$)/iu.test(response.headers.get('content-type')??''))
   fail();
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>MAX_BYTES))fail();
 if(!response.body)fail();
 const reader=response.body.getReader();
 const parts:Uint8Array[]=[];
 let bytes=0;
 try{
  while(true){
   const r=await reader.read();
   if(r.done)break;
   bytes+=r.value.byteLength;
   if(bytes>MAX_BYTES){await reader.cancel();fail()}
   parts.push(r.value);
  }
 }finally{reader.releaseLock()}
 if(bytes<2)fail();
 try{
  return JSON.parse(new TextDecoder('utf-8',{fatal:true})
   .decode(Buffer.concat(parts.map(p=>Buffer.from(p)),bytes)));
 }catch{fail()}
}
function whapiWebhookMatches(settings:unknown,url:string,secret:string):boolean{
 if(!obj(settings)||settings.callback_persist!==true||
  !Array.isArray(settings.webhooks))return false;
 return settings.webhooks.some(h=>{
  if(!obj(h)||h.url!==url||
   String(h.mode).toLowerCase()!=='body'||
   !obj(h.headers)||!Array.isArray(h.events))return false;
  const headers=Object.entries(h.headers);
  // No case-insensitive duplicate secret headers, no hidden fallback.
  const matches=headers.filter(([k])=>
   k.toLowerCase()==='x-cotironda-webhook-key');
  if(matches.length!==1||!same(matches[0][1],secret))return false;
  return h.events.some(e=>obj(e)&&e.type==='messages'&&e.method==='post');
 });
}
export async function auditarCanalWhapiMvp041(
 config:WhapiMvp041Config
):Promise<AuditoriaWhapiMvp041>{
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.pilotoAutorizado!=='boolean')fail();
 if(!config.habilitado)return result('desactivado');
 if(!config.pilotoAutorizado||!CHANNEL.test(config.channel)||
  typeof config.token!=='string'||!TOKEN.test(config.token)||
  typeof config.webhookSecretHex!=='string'||
  !SECRET.test(config.webhookSecretHex)||
  typeof config.fetcher!=='function')
  return result('configuracion_incompleta');
 try{proponerWebhookWhapiMvp041(config.webhookUrl,config.webhookSecretHex)}
 catch{return result('configuracion_incompleta')}
 // Fetcher MUST be injected by trusted worker; not auto-captured global fetch.
 // Three GET requests only; wakeup=false avoids launching an inactive channel.
 let requests=0,health:unknown,settings:unknown,profile=false;
 const get=async(path:string):Promise<unknown>=>{
  requests++;
  const response=await config.fetcher!(ENDPOINT+path,{
   method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{authorization:'Bearer '+config.token,accept:'application/json'},
   signal:AbortSignal.timeout(4000)
  });
  return limitedJson(response);
 };
 try{
  health=await get('/health?wakeup=false');
  // For unknown Whapi health shape, never infer AUTH from HTTP 200 alone.
  const connected=obj(health)&&
   (health.status==='AUTH'||obj(health.channel)&&health.channel.status==='AUTH');
  if(!connected)return result('canal_sin_verificar',false,false,false,requests);
  // Only inspect status: NEVER return profile/name/number to operator output.
  const data=await get('/users/profile');
  profile=obj(data);
  if(!profile)return result('canal_sin_verificar',true,false,false,requests);
  settings=await get('/settings');
  const webhook=whapiWebhookMatches(
   settings,config.webhookUrl,config.webhookSecretHex);
  return result(webhook?'configuracion_whapi_verificada_sin_envio':
    'webhook_incorrecto',true,true,webhook,requests);
 }catch{
  // Provider error body, token and private webhook settings must not leak.
  return result('canal_sin_verificar',false,false,false,requests);
 }
}

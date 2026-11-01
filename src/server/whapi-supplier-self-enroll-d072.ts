/**
 * MVP-024: voluntary supplier opt-in through a one-tap WhatsApp link.
 * No HTTP/DB connection is opened by this module. A WHAPI-authenticated
 * D027 webhook delivers the sender's direct-chat ID to registrarAlta().
 * SQL D072 binds a 15min one-use code to the signed-in supplier's company.
 * D069 encrypts the destination after SQL commits (replay is safe).
 */
import {createHmac} from 'node:crypto';
import {calcularChatDestinatarioD056} from './whapi-send-authorization-d056.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const PHONE=/^[1-9][0-9]{8,14}$/u;
const CHAT=/^([1-9][0-9]{8,14})@s\.whatsapp\.net$/u;
const MSG=/^[a-zA-Z0-9._:-]{8,160}$/u;
const CODE=/^[a-f0-9]{32}$/u;
const ALTA=/^COTI ALTA ([a-f0-9]{32})$/u;
const ISSUE_SQL='select public.whapi_issue_supplier_code_d072($1::uuid,$2::text) as payload';
const CONSUME_SQL='select cotironda_private.whapi_consume_supplier_code_d072($1::text,$2::text,$3::text,$4::text) as payload';
function deny():never{throw Error('d072_alta_no_disponible')}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
}
export type AltaWhapiConfigD072=Readonly<{
 habilitado:boolean;channel:string;botNumber:string;
 identityHmac:Buffer;
 /** Authenticated user-scope Supabase RPC, never service_role. */
 emitir:(query:string,args:readonly unknown[])=>Promise<unknown>;
 /** Server-owned private D072 gateway. Must COMMIT before D069 enrolment. */
 consumir:(query:string,args:readonly unknown[])=>Promise<unknown>;
 /** D069 trusted broker: AES-GCM storage only for the registered supplier. */
 enrolar:(data:{channel:string;supplierOrgId:string;to:string})=>Promise<unknown>;
}>;
export type EmisorEnlaceProveedorD072=Readonly<{
 habilitado:boolean;channel:string;botNumber:string;
 /** Authenticated supplier session JWT, never service_role. */
 emitir:(query:string,args:readonly unknown[])=>Promise<unknown>;
}>;
/** This can be used in the portal without exposing webhook/HMAC/AES keys. */
export function crearEmisorEnlaceProveedorD072(config:EmisorEnlaceProveedorD072){
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.channel!=='string'||!CHANNEL.test(config.channel)||
  typeof config.botNumber!=='string'||!PHONE.test(config.botNumber)||
  typeof config.emitir!=='function')deny();
 async function enlaceParaProveedor(supplierOrgId:string){
  if(config.habilitado!==true)deny();
  if(typeof supplierOrgId!=='string'||!UUID.test(supplierOrgId))deny();
  let res:unknown;
  try{res=await config.emitir(ISSUE_SQL,[supplierOrgId,config.channel]);}
  catch{deny()}
  if(!exact(res,['payload'])||!exact(res.payload,['state','code','expiresSeconds'])||
   res.payload.state!=='issued'||res.payload.expiresSeconds!==900||
   typeof res.payload.code!=='string'||!CODE.test(res.payload.code))deny();
  const message='COTI ALTA '+res.payload.code;
  const url='https://wa.me/'+config.botNumber+'?text='+encodeURIComponent(message);
  return Object.freeze({estado:'enlace_generado' as const,url,venceEnSegundos:900});
 }
 return Object.freeze({enlaceParaProveedor});
}
export function crearAltaProveedorWhatsAppD072(config:AltaWhapiConfigD072){
 if(!config||!Buffer.isBuffer(config.identityHmac)||
  config.identityHmac.length!==32||
  typeof config.consumir!=='function'||typeof config.enrolar!=='function')deny();
 const link=crearEmisorEnlaceProveedorD072(config);
 const identityKey=Buffer.from(config.identityHmac);
 async function registrarAlta(
  channel:string,chatId:string,messageId:string,text:string,_timestamp:number
 ):Promise<'registrada'|'duplicada'>{
  if(config.habilitado!==true||channel!==config.channel||
   typeof chatId!=='string'||!CHAT.test(chatId)||
   typeof messageId!=='string'||!MSG.test(messageId)||
   typeof text!=='string'||!ALTA.test(text))deny();
  const to=CHAT.exec(chatId)?.[1];
  if(!to)deny();
  const code=ALTA.exec(text)?.[1];
  if(!code)deny();
  const chatKey=calcularChatDestinatarioD056(config.channel,to,identityKey);
  const messageKey=createHmac('sha256',identityKey)
   .update(JSON.stringify(['cotironda','msg',1,config.channel,messageId]))
   .digest('hex');
  let res:unknown;
  try{res=await config.consumir(CONSUME_SQL,[
   config.channel,code,chatKey,messageKey]);}
  catch{deny()}
  if(!exact(res,['payload'])||!exact(res.payload,['state','supplierOrgId'])||
   !['registered','already_registered'].includes(String(res.payload.state))||
   typeof res.payload.supplierOrgId!=='string'||!UUID.test(res.payload.supplierOrgId))
   deny();
  try{
   const saved=await config.enrolar({
    channel:config.channel,supplierOrgId:res.payload.supplierOrgId as string,to
   });
   if(!exact(saved,['estado'])||
    !['registrado','ya_registrado'].includes(String(saved.estado)))deny();
  }catch{deny()}
  return res.payload.state==='registered'?'registrada':'duplicada';
 }
 return Object.freeze({enlaceParaProveedor:link.enlaceParaProveedor,registrarAlta});
}

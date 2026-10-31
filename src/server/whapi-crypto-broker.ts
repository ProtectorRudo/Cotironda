/**
 * Cotironda D029: broker criptográfico OFFLINE para conectar D027 con el
 * contrato SQL privado D028, mediante puertos de confianza.
 *
 * No abre HTTP, no se conecta a Supabase/Whapi, no instala claves o rutas.
 * Todos los IDs de empresa/ronda/opt-in DEBEN provenir del backend verificado.
 */
import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import type {DependenciasWhapiEntrada,MensajeEntrantePendiente,
  VinculoProveedorVerificado} from './whapi-inbound-offline.ts';

type Tipo=MensajeEntrantePendiente['tipo'];
export type ClavesPrivadasWhapi=Readonly<{
  identidadHmac:Buffer;
  huellaHmac:Buffer;
  contenidoAes:Buffer;
}>;
export type VinculoConfiable=Readonly<{
  supplierOrgId:string;roundId:string;
  consentimientoVigente:boolean;invitacionVigente:boolean;
}>;
export type EntradaCifradaD028=Readonly<{
  channel:string;chatKey:string;messageKey:string;fingerprint:string;
  kind:Tipo;ciphertext:Buffer;nonce:Buffer;tag:Buffer;sourceUnix:number;
  cryptoKeyId?:string;
}>;
export type BajaProtegidaD028=Readonly<{
  channel:string;chatKey:string;messageKey:string;
  fingerprint:string;sourceUnix:number;
}>;
export type ResultadoD028=Readonly<{
  estado:'entrada_persistida'|'baja_registrada';repetido:boolean;
}>;
export type AlmacenWhapiPrivado=Readonly<{
  // Las operaciones SQL privadas D028 no reciben chat ni teléfono en claro.
  resolverVinculo:(channel:string,chatKey:string)=>Promise<VinculoConfiable|null>;
  registrarEntrada:(data:EntradaCifradaD028)=>Promise<ResultadoD028>;
  registrarBaja:(data:BajaProtegidaD028)=>Promise<ResultadoD028>;
}>;
export type ConfigBrokerWhapi=Readonly<{
  channel:string;secretoWebhook:string;claves:ClavesPrivadasWhapi;
  almacen:AlmacenWhapiPrivado;habilitado:boolean;ahoraUnix:()=>number;
  contenidoKeyId?:string;clavesLectura?:Readonly<Record<string,Buffer>>;
}>;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const CHAT=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/;
const MSG=/^[a-zA-Z0-9._:-]{8,160}$/;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=new Set(['text','image','document','audio','voice']);
const KEY_ID=/^[a-z][a-z0-9_]{2,40}$/;
function rechazar():never{throw new TypeError('broker_whapi_configuracion_invalida')}
function clave(raw:unknown):Buffer{
  if(!Buffer.isBuffer(raw)||raw.length!==32||raw.every(v=>v===0))rechazar();
  return Buffer.from(raw);
}
function mac(key:Buffer,values:readonly unknown[]):string{
  return createHmac('sha256',key).update(JSON.stringify(values),'utf8').digest('hex');
}
function contexto(channel:string,chatKey:string,messageKey:string,
  kind:Tipo,sourceUnix:number,keyId='legacy_d029'):Buffer{
  const fields:unknown[]=['cotironda','d029',1,channel,chatKey,messageKey,kind,sourceUnix];
  // Legado D029: mantener AAD idéntico; cifrado nuevo ata el key-id.
  if(keyId!=='legacy_d029')fields.push('key-id',keyId);
  return Buffer.from(JSON.stringify(fields),'utf8');
}
function validarIdentidad(channel:string,chatId:string,msgId:string):void{
  if(!CHANNEL.test(channel)||!CHAT.test(chatId)||!MSG.test(msgId))rechazar();
}
function autenticarClaves(keys:ClavesPrivadasWhapi):ClavesPrivadasWhapi{
  if(!keys||typeof keys!=='object')rechazar();
  const ident=clave(keys.identidadHmac),finger=clave(keys.huellaHmac),
    aes=clave(keys.contenidoAes);
  if(ident.equals(finger)||ident.equals(aes)||finger.equals(aes))rechazar();
  return {identidadHmac:ident,huellaHmac:finger,contenidoAes:aes};
}
export function construirBrokerWhapiPrivado(config:ConfigBrokerWhapi):{
  dependencias:DependenciasWhapiEntrada;
  verificarContenido:(d:EntradaCifradaD028)=>Readonly<{
    tipo:Tipo;texto:string|null;marcaTiempoUnix:number;
  }>;
}{
  if(!config||!CHANNEL.test(config.channel)||
    typeof config.secretoWebhook!=='string'||config.secretoWebhook.length<32||
    !config.almacen||typeof config.almacen.resolverVinculo!=='function'||
    typeof config.almacen.registrarEntrada!=='function'||
    typeof config.almacen.registrarBaja!=='function'||
    typeof config.ahoraUnix!=='function'||typeof config.habilitado!=='boolean')
    rechazar();
  const keys=autenticarClaves(config.claves);
  const keyId=config.contenidoKeyId??'legacy_d029';
  if(!KEY_ID.test(keyId))rechazar();
  const oldKeys=new Map<string,Buffer>();
  for(const [id,value] of Object.entries(config.clavesLectura??{})){
    if(!KEY_ID.test(id)||id===keyId||oldKeys.has(id))rechazar();
    const previous=clave(value);
    if(previous.equals(keys.contenidoAes)||
      [...oldKeys.values()].some(k=>k.equals(previous)))rechazar();
    oldKeys.set(id,previous);
  }
  function chatKey(chatId:string):string{
    if(!CHAT.test(chatId))rechazar();
    return mac(keys.identidadHmac,['cotironda','chat',1,config.channel,chatId]);
  }
  function messageKey(messageId:string):string{
    if(!MSG.test(messageId))rechazar();
    return mac(keys.identidadHmac,['cotironda','msg',1,config.channel,messageId]);
  }
  function fingerprint(chatId:string,msgId:string,tipo:string,
    texto:string|null,when:number):string{
    return mac(keys.huellaHmac,['cotironda','payload',1,config.channel,
      chatId,msgId,tipo,texto,when]);
  }
  const dependencias:DependenciasWhapiEntrada={
    habilitado:config.habilitado,canalId:config.channel,
    secretoWebhook:config.secretoWebhook,ahoraUnix:config.ahoraUnix,
    resolverProveedor:async(channel,chatId):Promise<VinculoProveedorVerificado|null>=>{
      if(channel!==config.channel||!CHAT.test(chatId))rechazar();
      // La fuente autorizada recibe exclusivamente un HMAC, jamás un teléfono.
      const verified=await config.almacen.resolverVinculo(channel,chatKey(chatId));
      if(!verified)return null;
      if(!ID.test(verified.supplierOrgId)||!ID.test(verified.roundId)||
        typeof verified.consentimientoVigente!=='boolean'||
        typeof verified.invitacionVigente!=='boolean')rechazar();
      return verified;
    },
    persistirEntrada:async(msg):Promise<'guardada'|'duplicada'>=>{
      if(msg.canalId!==config.channel)rechazar();
      validarIdentidad(msg.canalId,msg.chatId,msg.mensajeId);
      if(!TYPES.has(msg.tipo)||!Number.isSafeInteger(msg.marcaTiempoUnix)||
        msg.marcaTiempoUnix<1||!(msg.texto===null||
        (typeof msg.texto==='string'&&msg.texto.length>0&&msg.texto.length<=3000)))
        rechazar();
      // El proveedor y ronda del callback D027 NO son una autorización SQL.
      // D028 los deduce de su vínculo privado + invitación única vigente.
      const cKey=chatKey(msg.chatId),mKey=messageKey(msg.mensajeId);
      const plain=Buffer.from(JSON.stringify({tipo:msg.tipo,texto:msg.texto,
        marcaTiempoUnix:msg.marcaTiempoUnix}),'utf8');
      if(plain.length>8192)rechazar();
      const nonce=randomBytes(12);
      const cipher=createCipheriv('aes-256-gcm',keys.contenidoAes,nonce);
      cipher.setAAD(contexto(config.channel,cKey,mKey,msg.tipo,msg.marcaTiempoUnix,keyId));
      const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
      const tag=cipher.getAuthTag();
      const result=await config.almacen.registrarEntrada({
        channel:config.channel,chatKey:cKey,messageKey:mKey,
        fingerprint:fingerprint(msg.chatId,msg.mensajeId,msg.tipo,
          msg.texto,msg.marcaTiempoUnix),
        kind:msg.tipo,ciphertext,nonce,tag,sourceUnix:msg.marcaTiempoUnix,
        cryptoKeyId:keyId
      });
      if(result?.estado!=='entrada_persistida'||typeof result.repetido!=='boolean')
        throw new TypeError('broker_respuesta_almacen_invalida');
      return result.repetido?'duplicada':'guardada';
    },
    registrarBaja:async(channel,chatId,msgId,_untrustedHash,when)=>{
      if(channel!==config.channel)rechazar();
      validarIdentidad(channel,chatId,msgId);
      if(!Number.isSafeInteger(when)||when<1)rechazar();
      // La huella SHA enviada por el receptor es NO autenticada: recalcular HMAC.
      const result=await config.almacen.registrarBaja({
        channel,chatKey:chatKey(chatId),messageKey:messageKey(msgId),
        fingerprint:fingerprint(chatId,msgId,'opt_out','BAJA',when),
        sourceUnix:when
      });
      if(result?.estado!=='baja_registrada'||typeof result.repetido!=='boolean')
        throw new TypeError('broker_respuesta_baja_invalida');
      return result.repetido?'duplicada':'registrada';
    }
  };
  function verificarContenido(d:EntradaCifradaD028){
    if(!d||d.channel!==config.channel||
      !/^[0-9a-f]{64}$/.test(d.chatKey)||
      !/^[0-9a-f]{64}$/.test(d.messageKey)||
      !TYPES.has(d.kind)||!Number.isSafeInteger(d.sourceUnix)||
      !Buffer.isBuffer(d.nonce)||d.nonce.length!==12||
      !Buffer.isBuffer(d.tag)||d.tag.length!==16||
      !Buffer.isBuffer(d.ciphertext)||d.ciphertext.length<1||
      d.ciphertext.length>8192)rechazar();
    const storedId=d.cryptoKeyId??'legacy_d029';
    if(!KEY_ID.test(storedId))rechazar();
    const decryptKey=storedId===keyId?keys.contenidoAes:oldKeys.get(storedId);
    if(!decryptKey)rechazar();
    const dec=createDecipheriv('aes-256-gcm',decryptKey,d.nonce);
    dec.setAAD(contexto(d.channel,d.chatKey,d.messageKey,d.kind,d.sourceUnix,storedId));
    dec.setAuthTag(d.tag);
    const out=Buffer.concat([dec.update(d.ciphertext),dec.final()]);
    const obj:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
    if(!obj||typeof obj!=='object'||Array.isArray(obj))rechazar();
    const v=obj as Record<string,unknown>;
    if(Object.keys(v).sort().join(',')!=='marcaTiempoUnix,texto,tipo'||
      v.tipo!==d.kind||v.marcaTiempoUnix!==d.sourceUnix||
      !(v.texto===null||typeof v.texto==='string'))rechazar();
    return {tipo:d.kind,texto:v.texto as string|null,
      marcaTiempoUnix:d.sourceUnix};
  }
  return {dependencias,verificarContenido};
}

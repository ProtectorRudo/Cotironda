/**
 * P0 supplier original-terms notice sender — server-only, NOT WIRED to a route.
 * Reuses D055: no global fetch, no env lookup, no actual I/O without injected
 * trusted ports. Claim/BEGIN/FINISH must be independently committed by SQL.
 *
 * On HTTP uncertainty the lease is NEVER retried automatically. A Whapi 200
 * with a valid message ID means only API accepted, not delivered/read, and
 * never means that the supplier explicitly accepted the terms.
 */
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {crearTransporteWhapiCloudD055} from './whapi-cloud-transport-d055.ts';
import {calcularChatDestinatarioD056} from './whapi-send-authorization-d056.ts';

const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SUPPLIER=/^[a-z][a-z0-9_]{2,63}$/u;
const PHONE=/^[0-9]{9,15}$/u;
const VERSION='cotironda-originales-alta-v1';

export type AvisoClaimP0=Readonly<{
 state:'leased';jobId:string;leaseToken:string;supplierKey:string;
 channel:string;chatHmac:string;termsVersion:string;
 termsSha256:string;body:string;
}>;
export type AvisoResultadoP0=Readonly<{
 estado:'desactivado'|'sin_trabajo'|'bloqueado_preenvio'|
   'sin_envio_estado_desconocido'|'aceptado_por_transporte'|
   'incierto_sin_reenvio';
}>;
export type AvisoPersistidoP0=Readonly<{
 jobId:string;leaseToken:string;supplierKey:string;
 termsVersion:string;termsSha256:string;
 state:'api_accepted'|'uncertain';noticeMessageHmac:string|null;
 outboundBodySha256:string;
}>;
export type AvisoPortsP0=Readonly<{
 // Must return ONE lease reserved by a durable private backend; not client data.
 claim:()=>Promise<unknown>;
 // Recipient must be resolved from an independently authenticated/encrypted
 // supplier channel. Not from the incoming message or free-form AI text.
 resolveRecipient:(claim:AvisoClaimP0)=>Promise<string>;
 // Must COMMIT before a Whapi request. Unknown DB ACK means NO HTTP.
 beginCommitted:(claim:AvisoClaimP0)=>Promise<unknown>;
 // Recheck live policy, supplier BAJA, exact SHA, channel and quota AFTER begin.
 authorizeCommitted:(claim:AvisoClaimP0,chatHmac:string)=>Promise<boolean>;
 // Must atomically save state and, ONLY for a valid Whapi ACK, insert the
 // matching M364 notice row. Never insert an opt-in or consent here.
 finishCommitted:(result:AvisoPersistidoP0)=>Promise<unknown>;
}>;
export type AvisoSenderP0=Readonly<{
 habilitado:boolean;pilotoAutorizado:boolean;
 channel:string;token?:string;identityKey:Buffer;
 destinatariosPermitidos:readonly string[];
 ports:AvisoPortsP0;
 fetcher?:typeof fetch;
}>;
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return obj(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
}
function sameHash(a:string,b:string):boolean{
 const aa=Buffer.from(a,'hex'),bb=Buffer.from(b,'hex');
 return aa.length===32&&bb.length===32&&timingSafeEqual(aa,bb);
}
function validClaim(x:unknown,channel:string):x is AvisoClaimP0{
 if(!exact(x,['state','jobId','leaseToken','supplierKey',
   'channel','chatHmac','termsVersion','termsSha256','body']))return false;
 if(x.state!=='leased'||x.channel!==channel||
   typeof x.jobId!=='string'||!UUID.test(x.jobId)||
   typeof x.leaseToken!=='string'||!UUID.test(x.leaseToken)||
   typeof x.supplierKey!=='string'||!SUPPLIER.test(x.supplierKey)||
   typeof x.chatHmac!=='string'||!SHA.test(x.chatHmac)||
   x.termsVersion!==VERSION||typeof x.termsSha256!=='string'||
   !SHA.test(x.termsSha256)||typeof x.body!=='string'||
   x.body.length<200||x.body.length>1500||
   !x.body.includes(VERSION)||
   /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(x.body))return false;
 return sameHash(
   createHash('sha256').update(x.body,'utf8').digest('hex'),
   x.termsSha256);
}
function result(estado:AvisoResultadoP0['estado']):AvisoResultadoP0{
 return Object.freeze({estado});
}
export function crearEmisorAvisoTerminosP0(config:AvisoSenderP0){
 if(!config||typeof config.channel!=='string'||!CHANNEL.test(config.channel)||
   !Buffer.isBuffer(config.identityKey)||config.identityKey.length!==32||
   !config.ports||typeof config.ports.claim!=='function'||
   typeof config.ports.resolveRecipient!=='function'||
   typeof config.ports.beginCommitted!=='function'||
   typeof config.ports.authorizeCommitted!=='function'||
   typeof config.ports.finishCommitted!=='function')
   throw Error('p0_aviso_configuracion_no_valida');
 const identityKey=Buffer.from(config.identityKey);
 async function procesarUno():Promise<AvisoResultadoP0>{
   if(config.habilitado!==true||config.pilotoAutorizado!==true||
     typeof config.fetcher!=='function'||typeof config.token!=='string'||
     !Array.isArray(config.destinatariosPermitidos)||
     config.destinatariosPermitidos.length===0)
     return result('desactivado');
   let claim:AvisoClaimP0;
   try{
     const raw=await config.ports.claim();
     if(raw===null)return result('sin_trabajo');
     if(!validClaim(raw,config.channel))return result('bloqueado_preenvio');
     claim=raw;
   }catch{return result('sin_envio_estado_desconocido')}
   let to:string,computedChat:string;
   try{
     to=await config.ports.resolveRecipient(claim);
     if(!PHONE.test(to)||!config.destinatariosPermitidos.includes(to))
       return result('bloqueado_preenvio');
     computedChat=calcularChatDestinatarioD056(config.channel,to,identityKey);
     if(!sameHash(computedChat,claim.chatHmac))
       return result('bloqueado_preenvio');
   }catch{return result('bloqueado_preenvio')}
   try{
     const state=await config.ports.beginCommitted(claim);
     if(!exact(state,['state','jobId'])||
       state.state!=='in_flight'||state.jobId!==claim.jobId)
       return result('sin_envio_estado_desconocido');
   }catch{return result('sin_envio_estado_desconocido')}
   let outcome:AvisoPersistidoP0['state']='uncertain';
   let noticeMessageHmac:string|null=null;
   const transport=crearTransporteWhapiCloudD055({
     habilitado:config.habilitado,pilotoAutorizado:config.pilotoAutorizado,
     token:config.token,fetcher:config.fetcher,
     destinatariosPermitidos:config.destinatariosPermitidos,
     autorizarIntento:async request=>{
       if(request.jobId!==claim.jobId||request.to!==to||
         request.body!==claim.body)return false;
       try{return await config.ports.authorizeCommitted(claim,computedChat)===true}
       catch{return false}
     }
   });
   try{
     const response=await transport.sendText({
       jobId:claim.jobId,to,body:claim.body
     });
     noticeMessageHmac=createHmac('sha256',identityKey)
       .update(JSON.stringify(['cotironda','msg',1,
         claim.channel,response.messageId]))
       .digest('hex');
     outcome='api_accepted';
   }catch{/* Maybe delivered, never retry an in_flight notice. */}
   try{
     const saved=await config.ports.finishCommitted(Object.freeze({
       jobId:claim.jobId,leaseToken:claim.leaseToken,
       supplierKey:claim.supplierKey,termsVersion:claim.termsVersion,
       termsSha256:claim.termsSha256,state:outcome,
       noticeMessageHmac,outboundBodySha256:claim.termsSha256
     }));
     if(!exact(saved,['state'])||saved.state!==outcome)
       return result('incierto_sin_reenvio');
     return result(outcome==='api_accepted'?
       'aceptado_por_transporte':'incierto_sin_reenvio');
   }catch{return result('incierto_sin_reenvio')}
 }
 return Object.freeze({procesarUno});
}

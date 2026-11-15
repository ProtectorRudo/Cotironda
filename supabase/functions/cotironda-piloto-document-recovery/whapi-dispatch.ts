/**
 * MVP149 / Scheduled PILOT supplier PDF sender.
 * This module is only invoked from a Vault-authenticated scheduled Edge Function.
 * Same SQL leases, authorizations, HMAC recipient checks and uncertainty policy
 * as the authenticated Whapi webhook's dispatchTwo. No secrets in source/logs.
 */
import {generarSolicitudPdfMvp091} from '../cotironda-piloto-whapi/request-pdf.ts';
import {CAPTION_PEDIDO_COTIRONDA_MVP305} from '../_shared/aviso-proveedores-cierre-mvp305.ts';
import {validarSnapshotPdfMvp223} from '../cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
import {resolverDestinatarioMvp313} from '../cotironda-piloto-whapi/dynamic-recipient-mvp313.ts';
import {etiquetaReferenciaPedidoV2} from '../cotironda-piloto-whapi/referencia-pedido-v2.ts';

type RpcResult={data:unknown;error:unknown};
export type Rpc=(name:string,params?:Record<string,unknown>)=>Promise<RpcResult>;
type Post=(url:string,init:RequestInit)=>Promise<Response>;
type Config=Readonly<{
 enabled:boolean;hmacHex:string;channel:string;
 token:string;recipientsJson:string;
}>;
type IO=Readonly<{rpc:Rpc;post:Post}>;
export type DispatchResult=Readonly<{claimed:number;accepted:number;uncertain:number}>;

const ENCODER=new TextEncoder();
const HEX=/^[a-f0-9]{64}$/iu;
const PHONE=/^[1-9][0-9]{7,16}$/u;
const ID=/^[a-zA-Z0-9_-]{4,64}$/u;
const NAMES='corralon_ailin,corralon_nahuel';
function fail():never{throw Error('pilot_dispatch_configuration_invalid')}
function parseRecipients(raw:string):Record<string,string>{
 let p:unknown;
 try{p=JSON.parse(raw)}catch{fail()}
 if(!p||typeof p!=='object'||Array.isArray(p))fail();
 const r=p as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!==NAMES||
    !Object.values(r).every(x=>typeof x==='string'&&PHONE.test(x))||
    r.corralon_ailin===r.corralon_nahuel)fail();
 return r as Record<string,string>;
}
function equalSecret(a:string,b:string):boolean{
 const x=ENCODER.encode(a),y=ENCODER.encode(b);
 let diff=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
 return diff===0;
}
function b64(bytes:Uint8Array):string{
 let encoded='';
 for(const x of bytes)encoded+=String.fromCharCode(x);
 return btoa(encoded);
}
function toHex(bytes:ArrayBuffer):string{
 return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** Never run from an unauthenticated request; caller verifies cron Vault token. */
export async function dispatchPendingPilotSupplierPdfs(
 config:Config,io:IO
):Promise<DispatchResult>{
 const result={claimed:0,accepted:0,uncertain:0};
 if(!config.enabled)return result;
 if(!HEX.test(config.hmacHex)||!ID.test(config.channel)||
    config.token.length<16||config.token.length>300)fail();
 const recipients=parseRecipients(config.recipientsJson);
 const raw=Uint8Array.from(config.hmacHex.match(/.{2}/gu)!,h=>parseInt(h,16));
 const key=await crypto.subtle.importKey('raw',raw.buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=async(text:string):Promise<string>=>toHex(
  await crypto.subtle.sign('HMAC',key,ENCODER.encode(text)));

 for(let n=0;n<2;n++){
  const picked=await io.rpc('cotironda_piloto_claim_whapi_v1');
  if(picked.error)throw Error('pilot_dispatch_claim_failed');
  const c=picked.data;
  if(!c||typeof c!=='object'||Array.isArray(c))throw Error('pilot_dispatch_claim_invalid');
  const row=c as Record<string,unknown>;
  if(row.state==='empty'||row.state==='outbound_disabled')return result;
  if(row.state!=='leased'||typeof row.request_id!=='string'||
     typeof row.supplier_key!=='string'||typeof row.chat_hmac!=='string'||
     typeof row.lease_token!=='string'||typeof row.message_body!=='string')
    throw Error('pilot_dispatch_lease_invalid');
  result.claimed++;
  const args={p_request:row.request_id,p_supplier:row.supplier_key,
    p_lease:row.lease_token};
  const finish=async(state:'api_accepted'|'uncertain',id:string|null)=>{
   const done=await io.rpc('cotironda_piloto_finish_whapi_v1',{
    ...args,p_state:state,p_message_id:id
   });
   if(done.error||done.data!==true)throw Error('pilot_dispatch_finish_failed');
   if(state==='api_accepted')result.accepted++;else result.uncertain++;
  };
  const to=recipients[row.supplier_key];
  if(!to){await finish('uncertain',null);continue}
  const expected=await signed('cotironda|pilot|chat|'+config.channel+
    '|'+to+'@s.whatsapp.net');
  if(!equalSecret(row.chat_hmac,expected)){
   await finish('uncertain',null);continue;
  }
  const authorization=await io.rpc('cotironda_piloto_authorize_whapi_v1',args);
  if(authorization.error||authorization.data!==true){
   await finish('uncertain',null);continue;
  }
  let accepted=false,id:string|null=null;
  try{
   const snapshot=await io.rpc('cotironda_piloto_pdf_snapshot_mvp091',args);
   if(snapshot.error||!snapshot.data)throw Error('pilot_dispatch_snapshot_unavailable');
   const pdf=generarSolicitudPdfMvp091(snapshot.data as Parameters<typeof generarSolicitudPdfMvp091>[0]);
   if(pdf.byteLength>100000)throw Error('pilot_dispatch_pdf_too_large');
   const media='data:application/pdf;name=Solicitud-Cotironda.pdf;base64,'+b64(pdf);
   const response=await io.post('https://gate.whapi.cloud/messages/document',{
    method:'POST',
    headers:{'Authorization':'Bearer '+config.token,'Content-Type':'application/json'},
    body:JSON.stringify({to,media,mime_type:'application/pdf',
      filename:'Solicitud-Cotironda.pdf',
      caption:CAPTION_PEDIDO_COTIRONDA_MVP305}),
    signal:AbortSignal.timeout(12000)
   });
   const answer=response.ok?await response.json().catch(()=>null):null;
   accepted=Boolean(response.ok&&answer&&typeof answer==='object'&&
      (answer as Record<string,unknown>).sent===true);
   if(accepted){
    const data=answer as Record<string,unknown>;
    const message=data.message&&typeof data.message==='object'
     ?data.message as Record<string,unknown>:null;
    if(typeof message?.id==='string')id=message.id.slice(0,160);
    else if(typeof data.message_id==='string')id=data.message_id.slice(0,160);
    else if(typeof data.id==='string')id=data.id.slice(0,160);
   }
  }catch{/* A timeout may have delivered: record uncertain and never retry. */}
  await finish(accepted?'api_accepted':'uncertain',id);
 }
 return result;
}


/** V2 D013: central WhatsApp TEXT dispatch from existing Vault-authenticated cron.
 * No false V1 promise to reveal nonresponders, no PDF edits, no duplicate cron.
 * The authentic source, per-product routes, supplier invitation and buyer
 * auto-approval are all rechecked by private SQL selector and lease.
 * A Whapi error/timeout/invalid message ID becomes terminal UNCERTAIN:
 * never auto-retry a message that may have reached its supplier.
 */
export type V2ScheduledResult=Readonly<{
 state:'off'|'disabled'|'empty'|'processed'|'rate_limited'|'reconciliation';
 claimed:number;accepted:number;uncertain:number;
}>;
const V2_NOTICE='Cotizá respondiendo por este WhatsApp, sin formularios. El comprador verá solo los comercios que respondan. Los presupuestos originales identificados se comparten solo con autorización vigente y revocable.';
const V2_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const V2_NAME=/^[a-z][a-z0-9_]{2,63}$/u;
const V2_MSGID=/^[A-Za-z0-9._:-]{8,160}$/u;
const V2_SENSITIVE=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email|raz[oó]n social)\b)/iu;
const V2_UNITS:Readonly<Record<string,string>>={
 bag:'bolsas',unit:'unidades',box:'cajas',kg:'kg',g:'g',
 l:'litros',ml:'ml',m:'m',m2:'m2',m3:'m3',roll:'rollos',pack:'paquetes'
};
const v2Object=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function dispatchPendingVerifiedV2SupplierTexts(
 config:Readonly<{
  enabled:boolean;dynamicRecipientsEnabled:boolean;
  hmacHex:string;aesHex:string;channel:string;token:string;
  includeReference:boolean;
 }>,io:IO
):Promise<V2ScheduledResult>{
 const result=(state:V2ScheduledResult['state'],
  claimed=0,accepted=0,uncertain=0):V2ScheduledResult=>
  ({state,claimed,accepted,uncertain});
 if(!config.enabled)return result('off');
 // Modern supplier contacts are AES encrypted per registration, no allowlist fallback.
 if(!config.dynamicRecipientsEnabled)return result('disabled');
 if(!HEX.test(config.hmacHex)||!HEX.test(config.aesHex)||
    config.hmacHex===config.aesHex||!ID.test(config.channel)||
    config.token.length<16||config.token.length>300)fail();
 const peek=await io.rpc('cotironda_piloto_v2_d013_scheduled_dispatch_due_private');
 if(peek.error||!v2Object(peek.data))throw Error('v2_scheduled_selector_unavailable');
 if(peek.data.state==='disabled')return result('disabled');
 if(peek.data.state==='empty')return result('empty');
 const requestId=peek.data.request_id;
 if(peek.data.state!=='ready'||typeof requestId!=='string'||!V2_UUID.test(requestId))
  throw Error('v2_scheduled_selector_invalid');

 const decode=(hex:string):Uint8Array=>
  Uint8Array.from(hex.match(/.{2}/gu)!,v=>parseInt(v,16));
 const hmacBytes=new Uint8Array(32);
 hmacBytes.set(decode(config.hmacHex));
 const aesBytes=new Uint8Array(32);
 aesBytes.set(decode(config.aesHex));
 const hmacKey=await crypto.subtle.importKey('raw',hmacBytes.buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aesKey=await crypto.subtle.importKey('raw',aesBytes.buffer,'AES-GCM',false,['decrypt']);
 const rpc:Rpc=async(name,params)=>io.rpc(name,params);
 let claimed=0,accepted=0,uncertain=0;

 for(let n=0;n<2;n++){
  const pick=await rpc('cotironda_piloto_ia_claim_mvp222',{p_request:requestId});
  if(pick.error||!v2Object(pick.data))throw Error('v2_dispatch_claim_unavailable');
  const lease=pick.data;
  if(lease.state==='budget_exhausted')
   return result('rate_limited',claimed,accepted,uncertain);
  if(lease.state==='disabled'||lease.state==='empty')
   return result(claimed?'processed':'empty',claimed,accepted,uncertain);
  if(lease.state!=='leased'||lease.request_id!==requestId||
    typeof lease.supplier_key!=='string'||!V2_NAME.test(lease.supplier_key)||
    typeof lease.chat_hmac!=='string'||!HEX.test(lease.chat_hmac)||
    typeof lease.lease_token!=='string'||!V2_UUID.test(lease.lease_token))
   throw Error('v2_dispatch_invalid_lease');
  claimed++;
  let acceptedRemote=false;
  let messageId:string|null=null;
  try{
   const handle={requestId,supplierKey:lease.supplier_key,
    leaseToken:lease.lease_token,chatHmac:lease.chat_hmac};
   const credentials={hmacKey,aesKey,channel:config.channel};
   const recipient=await resolverDestinatarioMvp313(handle,credentials,rpc);
   if(!PHONE.test(recipient))throw Error('invalid_recipient');
   const verify=toHex(await crypto.subtle.sign('HMAC',hmacKey,
    ENCODER.encode('cotironda|pilot|chat|'+config.channel+
     '|'+recipient+'@s.whatsapp.net')));
   if(!equalSecret(verify,lease.chat_hmac))throw Error('recipient_hmac_mismatch');
   const snapReply=await rpc('cotironda_piloto_ia_pdf_snapshot_mvp222',{
    p_request:requestId,p_supplier:lease.supplier_key,p_lease:lease.lease_token
   });
   if(snapReply.error)throw Error('supplier_snapshot_denied');
   const snapshot=validarSnapshotPdfMvp223(snapReply.data,requestId);
   if(!snapshot||V2_SENSITIVE.test(snapshot.city)||
      snapshot.items.some(item=>V2_SENSITIVE.test(item.description)))
    throw Error('supplier_snapshot_invalid');
   const when=new Intl.DateTimeFormat('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
    hour12:false
   }).format(new Date(snapshot.deadlineIso));
   const ref=config.includeReference?etiquetaReferenciaPedidoV2(requestId):null;
   if(!ref)throw Error('buyer_round_reference_unavailable');
   const lines=snapshot.items.map(item=>{
    const unit=V2_UNITS[item.unit];
    if(!unit)throw Error('supplier_unit_unrecognized');
    return '- '+item.quantity+' '+unit+' · '+item.description;
   });
   const note=snapshot.deliveryNote?
    '\nEntrega solicitada: '+snapshot.deliveryNote:'';
   if(note&&V2_SENSITIVE.test(note))throw Error('private_delivery_note');
   const text='Cotironda · Solicitud de cotización\n'+ref+
    '\nLocalidad de entrega: '+snapshot.city+
    '\nCierre de recepción: '+when+' (hora argentina)'+note+
    '\n\nMateriales solicitados:\n'+lines.join('\n')+
    '\n\n'+V2_NOTICE;
   if(text.length>3500)throw Error('whapi_text_over_limit');
   // Revalidate the same leased encrypted recipient IMMEDIATELY before HTTP.
   if(await resolverDestinatarioMvp313(handle,credentials,rpc)!==recipient)
    throw Error('recipient_changed_before_send');
   const response=await io.post('https://gate.whapi.cloud/messages/text',{
    method:'POST',
    headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
    body:JSON.stringify({to:recipient,body:text}),
    signal:AbortSignal.timeout(12000)
   });
   const reply=response.ok?await response.json().catch(()=>null):null;
   if(response.ok&&v2Object(reply)&&reply.sent===true){
    const nested=v2Object(reply.message)?reply.message:null;
    const raw=reply.message_id??nested?.id??reply.id;
    if(typeof raw==='string'&&V2_MSGID.test(raw)){
     messageId=raw;
     acceptedRemote=true;
    }
   }
  }catch{/* A failed send may actually have arrived. Terminal UNCERTAIN. */}
  const status=acceptedRemote?'api_accepted':'uncertain';
  const fin=await rpc('cotironda_piloto_ia_finish_mvp222',{
   p_request:requestId,p_supplier:lease.supplier_key,
   p_lease:lease.lease_token,p_state:status,
   p_message_id:acceptedRemote?messageId:null
  });
  if(fin.error||fin.data!==true)
   return result('reconciliation',claimed,accepted,uncertain);
  if(acceptedRemote)accepted++;
  else uncertain++;
 }
 return result('processed',claimed,accepted,uncertain);
}

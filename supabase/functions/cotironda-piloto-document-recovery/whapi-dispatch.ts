/**
 * MVP149 / Scheduled PILOT supplier PDF sender.
 * This module is only invoked from a Vault-authenticated scheduled Edge Function.
 * Same SQL leases, authorizations, HMAC recipient checks and uncertainty policy
 * as the authenticated Whapi webhook's dispatchTwo. No secrets in source/logs.
 */
import {generarSolicitudPdfMvp091} from '../cotironda-piloto-whapi/request-pdf.ts';
import {CAPTION_PEDIDO_COTIRONDA_MVP305} from '../_shared/aviso-proveedores-cierre-mvp305.ts';

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

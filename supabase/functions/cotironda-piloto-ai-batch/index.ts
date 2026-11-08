/** MVP314 — private, bounded batch tick for pre-published IA Central jobs.
 * This endpoint does not create rounds, authorize contacts, schedule itself,
 * recover uncertain sends, or expose any buyer/supplier details.
 * Default OFF. Requires independent private secret + scoped admin key.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {authorizeRecoveryMvp294,validInternalServiceKeyMvp294,safeSameMvp294}
 from '../cotironda-piloto-auto-recovery/internal-auth-mvp294.ts';
import {continuarDespachoMvp314} from
 '../cotironda-piloto-whapi/ai-central-batch-mvp314.ts';
import {despacharSolicitudCentralMvp223} from
 '../cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
import {resolverDestinatarioMvp313} from
 '../cotironda-piloto-whapi/dynamic-recipient-mvp313.ts';
import {generarSolicitudPdfMvp091} from
 '../cotironda-piloto-whapi/request-pdf.ts';
import {CAPTION_PEDIDO_COTIRONDA_MVP305} from
 '../_shared/aviso-proveedores-cierre-mvp305.ts';

const REF='ilggkalaafhtiysyzlmg';
const URL='https://'+REF+'.supabase.co';
const ENC=new TextEncoder();
const HEX=/^[a-f0-9]{64}$/u;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const response=(status:number,result:Record<string,unknown>)=>new Response(
 JSON.stringify(result),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'
 }}
);
const deny=(status:number,state:string)=>response(status,{state});
const hex=(arr:ArrayBuffer)=>Array.from(new Uint8Array(arr),n=>n.toString(16).padStart(2,'0')).join('');
const parseHex=(value:string):Uint8Array=>
 Uint8Array.from(value.match(/.{2}/gu)!,n=>parseInt(n,16));
const base64=(bytes:Uint8Array):string=>{
 let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);
};
async function tick(req:Request):Promise<Response>{
 if(req.method!=='POST')return deny(405,'method_not_allowed');
 if(Deno.env.get('COTIRONDA_PILOT_AI_BATCH_MVP314_ENABLED')!=='true'||
    Deno.env.get('COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED')!=='true'||
    Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_DISPATCH_ENABLED')!=='true'||
    Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')
  return deny(503,'worker_disabled');
 if(!authorizeRecoveryMvp294({
  privateHeader:req.headers.get('x-cotironda-ai-batch-secret')??'',
  privateExpected:Deno.env.get('COTIRONDA_PILOT_AI_BATCH_SECRET')??'',
  apikeyHeader:req.headers.get('apikey')??'',
  authorizationHeader:req.headers.get('authorization')??'',
  legacyServiceRole:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
  secretKeysJson:Deno.env.get('SUPABASE_SECRET_KEYS')??''
 }))return deny(401,'unauthorized');
 if(req.headers.get('content-length')&&
    Number(req.headers.get('content-length'))>0)return deny(413,'body_not_allowed');
 let role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!role)try{
  const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
  if(typeof keys?.default==='string')role=keys.default;
 }catch{return deny(503,'config_unavailable')}
 const url=Deno.env.get('SUPABASE_URL')??'';
 const hmacHex=Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'';
 const aesHex=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
 const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 if(url!==URL||!validInternalServiceKeyMvp294(role)||
    !HEX.test(hmacHex)||!HEX.test(aesHex)||hmacHex===aesHex||
    !CHANNEL.test(channel)||token.length<16||token.length>300)
  return deny(503,'config_unavailable');
 const hmacKey=await crypto.subtle.importKey('raw',new Uint8Array(parseHex(hmacHex)).buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aesKey=await crypto.subtle.importKey('raw',new Uint8Array(parseHex(aesHex)).buffer,
  'AES-GCM',false,['decrypt']);
 const db=createClient(url,role,{auth:{autoRefreshToken:false,
  persistSession:false},global:{headers:{
    'x-cotironda-pilot-edge':'cotironda-piloto-ai-batch'
  }}});
 const rpc=async(name:string,params:Record<string,unknown>)=>{
  const out=await db.rpc(name,params);
  return {data:out.data,error:out.error};
 };
 const result=await continuarDespachoMvp314({
  enabled:true,rpc,
  dispatch:async requestId=>despacharSolicitudCentralMvp223({
   enabled:true,requestId,maxJobs:1,
   claimRpcName:'cotironda_piloto_ia_claim_mvp314',
   recipients:{},rpc,
   resolveRecipient:lease=>resolverDestinatarioMvp313(lease,{
    hmacKey,aesKey,channel
   },rpc),
   authorizeChatHmac:async(recipient,expected)=>{
    const actual=hex(await crypto.subtle.sign('HMAC',hmacKey,
     ENC.encode('cotironda|pilot|chat|'+channel+'|'+recipient+'@s.whatsapp.net')));
    return safeSameMvp294(actual,expected);
   },
   createPdf:generarSolicitudPdfMvp091,
   sendWhapi:async(recipient,pdf)=>{
    const remote=await fetch('https://gate.whapi.cloud/messages/document',{
     method:'POST',headers:{Authorization:'Bearer '+token,
       'Content-Type':'application/json'},
     body:JSON.stringify({
      to:recipient,
      media:'data:application/pdf;name=Solicitud-Cotironda.pdf;base64,'+base64(pdf),
      mime_type:'application/pdf',filename:'Solicitud-Cotironda.pdf',
      caption:CAPTION_PEDIDO_COTIRONDA_MVP305
     }),signal:AbortSignal.timeout(12000)
    });
    const payload=remote.ok?await remote.json().catch(()=>null):null;
    const data=payload&&typeof payload==='object'?
      payload as Record<string,unknown>:null;
    const message=data?.message&&typeof data.message==='object'?
      data.message as Record<string,unknown>:null;
    const id=data?.message_id??message?.id??data?.id;
    return {accepted:remote.ok&&data?.sent===true,
      messageId:typeof id==='string'?id:null};
   }
  })
 });
 // No request IDs, buyer phones, supplier numbers, per-company counts or secrets.
 return response(result.estado==='requiere_conciliacion'?503:200,{
   state:result.estado,reclamados:result.reclamados,
   apiAceptados:result.apiAceptados,inciertos:result.inciertos
 });
}
Deno.serve(req=>tick(req).catch((err)=>{
 console.error('cotironda_ai_batch_error:',err instanceof Error?err.name:'unknown');
 return deny(503,'temporarily_unavailable');
}));

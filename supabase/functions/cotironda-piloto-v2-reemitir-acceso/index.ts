/** Recuperación D016 aislada del Whapi LIVE v80. Sin reescribir webhook.
 * SOLO servidor del portal autenticado -> token único -> WhatsApp verificado.
 * CANDIDATO: apagado por defecto y NO DESPLEGAR hasta orden Publicalo.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HASH=/^[a-f0-9]{64}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const W=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
const MESSAGE_ID=/^[A-Za-z0-9._:-]{8,160}$/u;
const encoder=new TextEncoder();
function response(state:string,status:number){
 return new Response(JSON.stringify({state}),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff'
 }});
}
function same(a:string,b:string):boolean{
 const x=encoder.encode(a),y=encoder.encode(b);
 let diff=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
 return diff===0;
}
function keyFromHex(h:string):Uint8Array|null{
 if(!HASH.test(h))return null;
 return Uint8Array.from(h.match(/.{2}/gu)!.map(x=>parseInt(x,16)));
}
function hex(buf:ArrayBuffer):string{
 return Array.from(new Uint8Array(buf),v=>v.toString(16).padStart(2,'0')).join('');
}
async function hmac(key:CryptoKey,value:string):Promise<string>{
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
function originAllowed(o:string):boolean{
 try{
  const url=new URL(o);
  return url.protocol==='https:'&&url.origin===o&&url.pathname==='/'&&
   !url.search&&!url.hash&&!url.username&&!url.password&&
   url.hostname.startsWith('cotironda-portal-')&&
   url.hostname.endsWith('-protector-rudo-s-projects.vercel.app');
 }catch{return false}
}
function roleKey():string{
 const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(legacy.length>=20)return legacy;
 try{
  const value=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
  return typeof value.default==='string'?value.default:'';
 }catch{return ''}
}
async function decryptContact(
 aesHex:string,nonce:string,ciphertext:string,chatHmac:string
):Promise<string|null>{
 const raw=keyFromHex(aesHex);
 if(!raw||!HASH.test(chatHmac)||
  !/^[A-Za-z0-9+/]{16}$/u.test(nonce)||
  !/^[A-Za-z0-9+/=]{24,20000}$/u.test(ciphertext))return null;
 try{
  const iv=Uint8Array.from(atob(nonce),x=>x.charCodeAt(0));
  const bytes=Uint8Array.from(atob(ciphertext),x=>x.charCodeAt(0));
  if(iv.length!==12||bytes.length<17||bytes.length>10000)return null;
  const key=await crypto.subtle.importKey('raw',new Uint8Array(raw).buffer,'AES-GCM',false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,
   additionalData:encoder.encode(chatHmac+'|cotironda-contact-v1'),
   tagLength:128},key,bytes);
  const recipient=new TextDecoder('utf-8',{fatal:true}).decode(plain);
  return W.test(recipient)?recipient:null;
 }catch{return null}
}
type Packet={state:string;requestId?:string;chatHmac?:string;
 nonceB64?:string;ciphertextB64?:string;contactSha256?:string};
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return response('blocked',405);
 const u=new URL(req.url);
 if(u.search||u.hash||!u.pathname.endsWith('/cotironda-piloto-v2-reemitir-acceso'))
  return response('blocked',404);
 if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true'||
  Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')!=='true')
  return response('unavailable',503);
 const portal=Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'';
 const deployed=Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'';
 const approved=Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'';
 if(!originAllowed(portal)||!SHA.test(deployed)||deployed!==approved)
  return response('unavailable',503);
 if(!req.headers.get('content-type')?.startsWith('application/json'))
  return response('blocked',415);
 const length=req.headers.get('content-length');
 if(length&&(!/^[0-9]{1,4}$/u.test(length)||Number(length)>320))
  return response('blocked',413);
 const body=await req.text().catch(()=>'');
 if(body.length>320)return response('blocked',413);
 let input:Record<string,unknown>;
 try{
  const value:unknown=JSON.parse(body);
  if(!value||typeof value!=='object'||Array.isArray(value))
   return response('blocked',400);
  input=value as Record<string,unknown>;
 }catch{return response('blocked',400)}
 // Modo sin cookie: no recibe ID de comprador, teléfono ni ronda.
 // SOLO válido mientras la base posea un único comprador con canal verificado.
 const pilotUnique=Object.keys(input).sort().join(',')==='mode,operationId'&&
  input.mode==='pilot_unique';
 const authenticated=Object.keys(input).sort().join(',')===
  'operationId,requestId,sessionHmac';
 if(typeof input.operationId!=='string'||!UUID.test(input.operationId)||
  (!pilotUnique&&!authenticated)||
  (authenticated&&(typeof input.requestId!=='string'||!UUID.test(input.requestId)||
    typeof input.sessionHmac!=='string'||!HASH.test(input.sessionHmac))))
  return response('blocked',400);
 // Portal y Edge ya comparten el HMAC de D016. Autenticación con
 // firma de solicitud de vida corta, dominio criptográfico separado.
 const signedTime=req.headers.get('x-cotironda-time')??'';
 const receivedSign=req.headers.get('x-cotironda-signature')??'';
 const signatureKey=keyFromHex(Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'');
 if(!/^[0-9]{13}$/u.test(signedTime)||!HASH.test(receivedSign)||!signatureKey||
  Math.abs(Date.now()-Number(signedTime))>90_000)
  return response('blocked',403);
 const signedKey=await crypto.subtle.importKey('raw',new Uint8Array(signatureKey).buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expectedSign=await hmac(signedKey,
  'cotironda/d016/reissue/v1\\n'+signedTime+'\\n'+body);
 if(!same(receivedSign,expectedSign))return response('blocked',403);
 const admin=roleKey(),hmacHex=Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'';
 const idHex=Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'';
 const aesHex=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 const tokenWhapi=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
 const hmacRaw=keyFromHex(hmacHex),idRaw=keyFromHex(idHex);
 if(admin.length<20||!hmacRaw||!idRaw||!keyFromHex(aesHex)||
  !/^[A-Za-z0-9_-]{4,64}$/u.test(channel)||tokenWhapi.length<16)
  return response('unavailable',503);
 let db:ReturnType<typeof createClient>;
 try{db=createClient(PILOT,admin,{auth:{autoRefreshToken:false,persistSession:false}})}
 catch{return response('unavailable',503)}
 const raw=crypto.getRandomValues(new Uint8Array(32));
 const token=btoa(String.fromCharCode(...raw)).replace(/\+/gu,'-')
  .replace(/\//gu,'_').replace(/=+$/u,'');
 const key=await crypto.subtle.importKey('raw',new Uint8Array(hmacRaw).buffer,
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const ticketHmac=await hmac(key,'cotironda/d016/acceso/v1/'+token);
 const {data,error}=pilotUnique
  ?await db.rpc('cotironda_piloto_v2_d016_reissue_unique_pilot_private',{
   p_operation_id:input.operationId,p_ticket_hmac:ticketHmac
  })
  :await db.rpc('cotironda_piloto_v2_d016_reissue_from_session_private',{
   p_operation_id:input.operationId,p_request_id:input.requestId,
   p_sesion_hmac:input.sessionHmac,p_ticket_hmac:ticketHmac
  });
 if(error||!data||typeof data!=='object')return response('unavailable',503);
 const row=data as Packet;
 if(row.state!=='issued')return response('blocked',403);
 let accepted=false,messageId:string|null=null;
 try{
  if((!pilotUnique&&row.requestId!==input.requestId)||!UUID.test(row.requestId??'')||
   !HASH.test(row.chatHmac??'')||
   !HASH.test(row.contactSha256??''))throw Error('invalid_packet');
  const recipient=await decryptContact(aesHex,row.nonceB64??'',
   row.ciphertextB64??'',row.chatHmac!);
  if(!recipient)throw Error('invalid_contact');
  const verifyKey=await crypto.subtle.importKey('raw',new Uint8Array(idRaw).buffer,
   {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=await hmac(verifyKey,'cotironda|pilot|chat|'+channel+'|'+recipient);
  const contactSha=hex(await crypto.subtle.digest('SHA-256',encoder.encode(recipient)));
  if(!same(row.chatHmac!,expected)||!same(row.contactSha256!,contactSha))
   throw Error('contact_changed');
  const access=portal+'/piloto/v2/acceso#d016='+token+'&ronda='+row.requestId;
  const message='Cotironda ✅ Tu nuevo acceso privado a Mi Cotironda:\n'+access+
   '\n\nEste enlace se usa una sola vez y vence en 10 minutos. No lo compartas.';
  const sent=await fetch('https://gate.whapi.cloud/messages/text',{
   method:'POST',headers:{Authorization:'Bearer '+tokenWhapi,
    'Content-Type':'application/json'},
   body:JSON.stringify({to:recipient,body:message}),
   signal:AbortSignal.timeout(12000)
  });
  const answer=sent.ok?await sent.json().catch(()=>null):null;
  const payload=answer&&typeof answer==='object'?
   answer as Record<string,unknown>:null;
  const nested=payload?.message&&typeof payload.message==='object'?
   payload.message as Record<string,unknown>:null;
  const id=payload?.message_id??nested?.id??payload?.id;
  accepted=sent.ok&&payload?.sent===true&&
   typeof id==='string'&&MESSAGE_ID.test(id);
  if(accepted)messageId=id as string;
 }catch{/* No reintentar un WhatsApp incierto: evita duplicados. */}
 const finished=await db.rpc('cotironda_piloto_v2_d016_finish_session_reissue_private',{
  p_operation_id:input.operationId,p_ticket_hmac:ticketHmac,
  p_state:accepted?'api_accepted':'uncertain',p_message_id:messageId
 });
 if(finished.error||finished.data!==true)return response('unavailable',503);
 return response(accepted?'api_accepted':'uncertain',accepted?200:503);
});

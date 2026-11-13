/** MVP-073 native Whapi webhook for isolated Supabase pilot.
 * Fail-closed until Edge secrets + DB inbound flag are configured.
 * No WhatsApp outgoing; no tokens or phones in source.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {parseBuyerPilot,canPrepareBuyerPilot,validMessage,standaloneDeliveryCity,quotedWhapiMessageId} from './core.ts';
import {generarSolicitudPdfMvp091} from './request-pdf.ts';
import {CAPTION_PEDIDO_COTIRONDA_MVP305} from '../_shared/aviso-proveedores-cierre-mvp305.ts';
import {despacharSolicitudCentralMvp223} from './ai-central-dispatch-mvp223.ts';
import {resolverDestinatarioMvp313} from './dynamic-recipient-mvp313.ts';
import {procesarCompradorCentralMvp226} from './ai-central-buyer-mvp226.ts';
import {avisarRevisionSemanticaMvp286,aceptarRespuestaWhapiMvp287} from './ai-central-review-notice-mvp286.ts';
import {continuarZonaCentralMvp233} from './ai-central-zone-mvp233.ts';
import {ciudadDeRespuestaCentralMvp234,estadoClaimZonaMvp234} from './ai-central-city-mvp234.ts';
import {procesarPresupuestoCentralMvp227} from './ai-central-supplier-mvp227.ts';
import {procesarDocumentoCentralMvp245} from './ai-central-document-mvp245.ts';
import {correlacionAutomaticaMvp291} from './supplier-auto-correlation-mvp291.ts';
import {extraerMaterialesTextoMvp292} from './supplier-text-materials-mvp292.ts';
import {previsualizarDocumentoCompradorMvp275} from './ai-central-buyer-document-mvp275.ts';
import {procesarDocumentoCompradorCentralMvp276} from './ai-central-buyer-media-mvp276.ts';
import {contrastarDocumentoCompradorMvp277} from './ai-central-buyer-binary-mvp277.ts';
import {prepararDocumentoBinarioCompradorMvp278} from './ai-central-buyer-binary-broker-mvp278.ts';
import {esRespuestaConfirmacionMvp279,emitirRevisionCompradorMvp279,confirmarPedidoCompradorMvp279} from './ai-central-buyer-review-mvp279.ts';
import {notificarSeguimientoMvp289} from './buyer-tracking-confirmation-mvp289.ts';
import {notificarAccesoWhatsappD016} from './buyer-whatsapp-entry-d016.ts';
import {liberarPedidoAutomaticoMvp306} from './ai-central-buyer-auto-release-mvp306.ts';
import {proveedorConRondaCentralMvp232} from './ai-central-supplier-route-mvp232.ts';
import {esAvisoAdjuntoProveedorMvp238} from './ai-supplier-attachment-notice-mvp238.ts';
import {respuestaCitaPedidoMvp239,CONSULTA_RONDA_MVP239} from './ai-supplier-clarification-mvp239.ts';
import {makeMediaManifest} from './media-intake.ts';
import {parseDocumentClarification} from './document-clarification.ts';
import {getVerifiedWhapiMedia,storeVerifiedMedia} from './whapi-media-archive.ts';
import {isWhapiStatusEvent,parseWhapiDirectStatuses} from './delivery-status.ts';
import {checkSupplierTextSource} from './supplier-source-text.ts';
import {checkSupplierOfficeSource} from './supplier-source-office.ts';
import {checkSupplierPdfSource} from './supplier-source-pdf.ts';
import {checkSupplierImageSourceMvp251} from './supplier-source-image-mvp251.ts';
import {proposeDocumentAI,documentFailureCode} from './document-ai-draft.ts';
import {promoteVerifiedSupplierQuote} from './supplier-role-hint.ts';
import {recoverOneStoredDocument} from './private-document-recovery.ts';
import {sendDeferredSupplierAckMvp181} from './supplier-deferred-ack.ts';
import {interpretPilotBuyerWithAI} from './ai-interpreter.ts';
import {decidePilotAIAction,shortBusinessReply,type ReplyCode} from './business-ai-policy.ts';
import {crearEnlacePrivadoSeguimientoMvp212} from '../../../src/domain/enlace-seguimiento-piloto-mvp212.ts';
const REF='ilggkalaafhtiysyzlmg';
const NAME='cotironda-piloto-whapi';
const encoder=new TextEncoder();
const json=(status:number,state:string)=>new Response(status===204?null:JSON.stringify({state}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store','x-content-type-options':'nosniff'}
});
function fromHex(s:string):Uint8Array|null{
 if(!/^[a-f0-9]{64}$/iu.test(s))return null;
 return Uint8Array.from(s.match(/.{2}/gu)!,n=>parseInt(n,16));
}
function toHex(b:ArrayBuffer):string{
 return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function b64(bytes:Uint8Array):string{
 let result='';
 for(const b of bytes)result+=String.fromCharCode(b);
 return btoa(result);
}
function equalSecret(actual:string,expected:string):boolean{
 const a=encoder.encode(actual),b=encoder.encode(expected);
 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]??0)^(b[i]??0);
 return diff===0;
}
async function hmac(key:CryptoKey,value:string):Promise<string>{
 return toHex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
async function sha(text:string):Promise<string>{
 return toHex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
}
async function decryptArchivedText(
 key:CryptoKey,nonce:string,ciphertext:string,aad:string
):Promise<string>{
 if(!/^[A-Za-z0-9+/]{16}$/u.test(nonce) ||
    !/^[A-Za-z0-9+/=]{24,20000}$/u.test(ciphertext))
  throw Error('invalid_archived_envelope');
 const iv=Uint8Array.from(atob(nonce),c=>c.charCodeAt(0));
 const data=Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0));
 if(iv.length!==12||data.length<17||data.length>10000)
  throw Error('invalid_archived_bytes');
 const plain=await crypto.subtle.decrypt(
  {name:'AES-GCM',iv,additionalData:encoder.encode(aad),tagLength:128},
  key,data);
 return new TextDecoder('utf-8',{fatal:true}).decode(plain);
}
async function encrypt(key:CryptoKey,value:string,aad:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await crypto.subtle.encrypt(
  {name:'AES-GCM',iv,additionalData:encoder.encode(aad),tagLength:128},key,
  encoder.encode(value));
 return {nonce:b64(iv),ciphertext:b64(new Uint8Array(bytes))};
}
type Secrets=Readonly<{
 key:CryptoKey;aes:CryptoKey;channel:string;webhookSecret:string;url:string;roleKey:string;
 outbound:boolean;token:string;recipients:Readonly<Record<string,string>>;
 dynamicRecipients:boolean;
}>;
async function secrets():Promise<Secrets|null>{
 if(Deno.env.get('COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED')!=='true'){
  console.warn('cotironda_pilot_config: inbound_flag_not_true');
  return null;
 }
 const webhookSecret=Deno.env.get('COTIRONDA_PILOT_WEBHOOK_SECRET')??'';
 const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
 const keyRaw=Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'';
 const aesRaw=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{
   const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof keys.default==='string')roleKey=keys.default;
  }catch{
   console.warn('cotironda_pilot_config: malformed_supabase_secret_keys');
   return null;
  }
 }
 const invalidSettings=[
  ...(webhookSecret.length<32||webhookSecret.length>256?['webhook_secret']:[]),
  ...(!/^[A-Za-z0-9_-]{4,64}$/u.test(channel)?['channel_id']:[]),
  ...(url!==('https://'+REF+'.supabase.co')?['supabase_url']:[]),
  ...(roleKey.length<20?['backend_admin_key']:[])
 ];
 if(invalidSettings.length){
  // No values, lengths, contacts, request data, tokens or HMACs in logs.
  console.warn('cotironda_pilot_config_invalid:',invalidSettings.join(','));
  return null;
 }
 const raw=fromHex(keyRaw),rawAes=fromHex(aesRaw);
 if(!raw||!rawAes||keyRaw===aesRaw){
  console.warn('cotironda_pilot_config: invalid_crypto_keys');
  return null;
 }
 const outbound=Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')==='true';
 // MVP313 opt-in gate is independent of SQL dispatch, trial and Whapi gates.
 const dynamicRecipients=Deno.env.get('COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED')==='true';
 const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 let recipients:Record<string,string>={};
 if(outbound){
  if(token.length<16||token.length>300){
   console.warn('cotironda_pilot_config: outbound_token_missing');
   return null;
  }
  // The legacy fixed allowlist is only needed for its own isolated flow.
  // Dynamic mode does NOT treat missing legacy numbers as authorization.
  if(!dynamicRecipients)try{
   const parsed=JSON.parse(Deno.env.get('COTIRONDA_PILOT_RECIPIENTS_JSON')??'null');
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
      Object.keys(parsed).sort().join(',')!=='corralon_ailin,corralon_nahuel'||
      !Object.values(parsed).every(v=>typeof v==='string'&&/^[1-9][0-9]{7,16}$/u.test(v))||
      parsed.corralon_ailin===parsed.corralon_nahuel){
     console.warn('cotironda_pilot_config: outbound_allowlist_invalid');
     return null;
   }
   recipients=parsed;
  }catch{
   console.warn('cotironda_pilot_config: outbound_allowlist_json_invalid');
   return null;
  }
 }
 const key=await crypto.subtle.importKey('raw',new Uint8Array(raw).buffer,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aes=await crypto.subtle.importKey('raw',new Uint8Array(rawAes).buffer,'AES-GCM',false,['encrypt','decrypt']);
 return {key,aes,channel,webhookSecret,url,roleKey,outbound,token,recipients,dynamicRecipients};
}
function client(s:Secrets){
 return createClient(s.url,s.roleKey,{auth:{autoRefreshToken:false,persistSession:false},
  global:{headers:{'x-cotironda-pilot-edge':NAME}}});
}
function outcome(raw:unknown):string{
 if(!raw||typeof raw!=='object')throw Error('bad_rpc');
 const state=(raw as Record<string,unknown>).state;
 if(typeof state!=='string')throw Error('bad_rpc');
 return state;
}

async function dispatchTwo(sec:Secrets,db:ReturnType<typeof client>):Promise<void>{
 // Legacy job gates still name the 1+2 test people. Never lease them when
 // dynamic mode has no static allowlist: that would mark them uncertain.
 if(!sec.outbound||sec.dynamicRecipients)return;
 // At most two messages per webhook, no automatic retries of unknown outcomes.
 for(let i=0;i<2;i++){
  const claim=await db.rpc('cotironda_piloto_claim_whapi_v1');
  if(claim.error)throw Error('claim_failure');
  const c=claim.data as Record<string,unknown>|null;
  if(!c||c.state==='empty'||c.state==='outbound_disabled')return;
  if(c.state!=='leased'||typeof c.request_id!=='string'||
    typeof c.supplier_key!=='string'||typeof c.chat_hmac!=='string'||
    typeof c.message_body!=='string'||typeof c.lease_token!=='string')
    throw Error('claim_invalid');
  const args={p_request:c.request_id,p_supplier:c.supplier_key,p_lease:c.lease_token};
  const finish=async(state:'api_accepted'|'uncertain',id:string|null)=>{
   const out=await db.rpc('cotironda_piloto_finish_whapi_v1',{
    ...args,p_state:state,p_message_id:id
   });
   if(out.error||out.data!==true)throw Error('finish_failed');
  };
  const to=sec.recipients[c.supplier_key];
  if(!to){await finish('uncertain',null);continue}
  const expected=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+'|'+
    to+'@s.whatsapp.net');
  if(!equalSecret(c.chat_hmac,expected)){
   await finish('uncertain',null);continue;
  }
  const guard=await db.rpc('cotironda_piloto_authorize_whapi_v1',args);
  if(guard.error||guard.data!==true){
   await finish('uncertain',null);continue;
  }
  // Post-lease crash may leave the row leased. Never retry automatically.
  // A timeout has UNKNOWN delivery outcome; mark uncertain for human review.
  let accepted=false,messageId:string|null=null;
  try{
   // The quote request must be generated from immutable, trusted SQL lines.
   const snapshot=await db.rpc('cotironda_piloto_pdf_snapshot_mvp091',args);
   if(snapshot.error||!snapshot.data)throw Error('pdf_snapshot_unavailable');
   const pdf=generarSolicitudPdfMvp091(snapshot.data);
   if(pdf.byteLength>100000)throw Error('pdf_too_large');
   const media='data:application/pdf;name=Solicitud-Cotironda.pdf;base64,'+b64(pdf);
   const response=await fetch('https://gate.whapi.cloud/messages/document',{
    method:'POST',
    headers:{'Authorization':'Bearer '+sec.token,'Content-Type':'application/json'},
    body:JSON.stringify({to,media,mime_type:'application/pdf',
       filename:'Solicitud-Cotironda.pdf',
       caption:CAPTION_PEDIDO_COTIRONDA_MVP305}),
    signal:AbortSignal.timeout(12000)
   });
   const data=response.ok?await response.json().catch(()=>null):null;
   // Whapi document endpoint specifies {sent:boolean, message:{id}}.
   // A 2xx alone is insufficient to declare delivery accepted.
   accepted=Boolean(response.ok&&data&&typeof data==='object'&&
      (data as Record<string,unknown>).sent===true);
   if(accepted){
    const d=data as Record<string,unknown>;
    const message=d.message&&typeof d.message==='object'
      ? d.message as Record<string,unknown>:null;
    if(typeof message?.id==='string')messageId=message.id.slice(0,160);
    else if(typeof d.message_id==='string')messageId=d.message_id.slice(0,160);
    else if(typeof d.id==='string')messageId=d.id.slice(0,160);
   }
  }catch{/* network may have accepted the message: uncertain, never retry. */}
  await finish(accepted?'api_accepted':'uncertain',messageId);
 }
}

async function respond(req:Request):Promise<Response>{
 if(req.method!=='POST')return json(405,'method_not_allowed');
 const sec=await secrets();
 if(!sec)return json(503,'pilot_not_enabled');
 // The Whapi panel's "Check webhook" does not forward custom headers,
 // even when real messages are configured with them. Read a size-bounded body
 // before deciding: a non-actionable probe can get 200, but ONLY messages
 // authenticated with the configured secret can reach any database routine.
 const webhookHeader=req.headers.get('x-cotironda-webhook-key')??'';
 const authenticated=equalSecret(webhookHeader,sec.webhookSecret);
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')??''))
  return json(415,'content_type');
 const len=req.headers.get('content-length');
 if(len!==null&&(!/^\d{1,6}$/u.test(len)||Number(len)>65536))
  return json(413,'payload_too_large');
 let raw:unknown;
 try{
  // Stream-bound the body even when the sender omits Content-Length.
  const reader=req.body?.getReader();
  if(!reader)return json(400,'empty_body');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{
   while(true){
    const chunk=await reader.read();if(chunk.done)break;
    bytes+=chunk.value.length;
    if(bytes>65536){await reader.cancel();return json(413,'payload_too_large')}
    chunks.push(chunk.value);
   }
  }finally{reader.releaseLock()}
  const payload=new Uint8Array(bytes);let p=0;
  for(const chunk of chunks){payload.set(chunk,p);p+=chunk.length}
  raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
 }catch{return json(400,'invalid_json')}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  return json(400,'invalid_event');
 const event=raw as Record<string,unknown>;
 const ev=event.event as Record<string,unknown>|undefined;
 const actionable=ev?.type==='messages'&&ev?.event==='post'&&
   Array.isArray(event.messages)&&event.messages.length>0;
 const statusAction=isWhapiStatusEvent(event);
 // Whapi checks liveness without forwarding custom headers. A no-op has
 // absolutely no side effects: no database client, message, dispatch or invite.
 // The response does not prove that authenticated incoming messages work.
 if(!actionable&&!statusAction){
   if(!authenticated)console.info('cotironda_pilot_webhook_probe: no_action_no_auth');
   return json(200,'probe_only');
 }
 if(!authenticated){
  // Never echo/log header values, numbers, IDs, message content or credentials.
  console.warn(webhookHeader.length>0
    ? 'cotironda_pilot_webhook_auth: header_mismatch'
    : 'cotironda_pilot_webhook_auth: header_missing');
  return json(401,'unauthorized');
 }
 if(event.channel_id!==sec.channel)return json(403,'wrong_channel');
 if(statusAction){
  let entries:ReturnType<typeof parseWhapiDirectStatuses>;
  try{entries=parseWhapiDirectStatuses(event)}
  catch{return json(422,'invalid_status_batch')}
  if(entries.length===0)return json(200,'group_status_ignored');
  const db=client(sec);
  for(const entry of entries){
   const recipientHmac=await hmac(sec.key,
    'cotironda|pilot|chat|'+sec.channel+'|'+entry.recipientChatId);
   const receipt=await db.rpc('cotironda_piloto_record_delivery_mvp119',{
    p_whapi_message_id:entry.messageId,p_status:entry.status,
    p_status_code:entry.code,p_recipient_chat_hmac:recipientHmac,
    p_event_unix:entry.eventUnix
   });
   if(receipt.error)return json(503,'status_storage_unavailable');
   // Passive reconciliation, ONLY for an existing uncertain outbound whose
   // opaque Whapi ID is already known. The RPC verifies exact recipient,
   // unique origin and event rank. It NEVER marks an outbox resendable.
   if(receipt.data?.state==='unmatched'){
    const uncertain=await db.rpc('cotironda_piloto_observe_uncertain_whapi_mvp257',{
     p_whapi_message_id:entry.messageId,p_status:entry.status,
     p_status_code:entry.code,p_recipient_chat_hmac:recipientHmac,
     p_event_unix:entry.eventUnix
    });
    if(uncertain.error)return json(503,'status_storage_unavailable');
   }
  }
  return json(200,'statuses_processed');
 }
 if(!Array.isArray(event.messages)||event.messages.length<1||event.messages.length>10)
  return json(422,'invalid_batch');
 const ids=new Set<string>();
 const now=Math.floor(Date.now()/1000);
 const db=client(sec);
 const trialDispatchChats=new Set<string>();
 const buyerLinkRequests:{mode:'confirmed'|'recovery'|'auto';requestId:string|null;
  chatHmac:string;eventHmac:string;recipient:string}[]=[];
 let recoveryTriggerHmac:string|null=null;
 let recoveryTriggerChatId:string|null=null;
 for(const row of event.messages){
  if(row&&typeof row==='object'&&(row as Record<string,unknown>).from_me===true)continue;
  if(!validMessage(row,now))return json(422,'invalid_message');
  if(ids.has(row.id))return json(422,'duplicate_batch');
  ids.add(row.id);
  const chatHash=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+'|'+row.chat_id);
  
  const messageHash=await hmac(sec.key,'cotironda|pilot|msg|'+sec.channel+'|'+row.id);
  // Only an authenticated sender already in the two approved supplier
  // destinations may use Whapi's quoted_id to identify a supplier PDF.
  // Do NOT reinterpret a buyer's quoted reply as their delivery city.
  const quotedId=quotedWhapiMessageId(row);
  let supplierQuotedId:string|null=null;
  if(quotedId&&sec.outbound){
   if(sec.dynamicRecipients){
    // A signed Whapi sender can be matched to ANY registered supplier.
    // Supplier quote-to-round linking still verifies the quoted ID in SQL.
    const known=await db.rpc('cotironda_piloto_is_supplier_mvp313',{
      p_chat_hmac:chatHash});
    if(known.error)return json(503,'supplier_identity_unavailable');
    if(known.data===true)supplierQuotedId=quotedId;
   }else{
    for(const number of Object.values(sec.recipients)){
     const expected=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
      '|'+number+'@s.whatsapp.net');
     if(equalSecret(expected,chatHash)){supplierQuotedId=quotedId;break}
    }
   }
  }
  recoveryTriggerHmac=chatHash;
  recoveryTriggerChatId=row.chat_id;
  const media=row.type==='text'?null:makeMediaManifest(row,row.type);
  // Store media ID, size, MIME and caption in the AES-GCM encrypted
  // inbox instead of losing every attachment as an empty string.
  // This is NOT proof that its binary content was read.
  const body=row.type==='text'?row.text!.body:
    JSON.stringify(media??{state:'invalid_media_manifest',kind:row.type});
  if(row.type==='text'&&/^BAJA$/iu.test(body.trim())){
   const out=await db.rpc('cotironda_piloto_optout_whapi_v1',{p_chat_hmac:chatHash});
   if(out.error)return json(503,'storage_unavailable');
   continue;
  }
  // MVP308: UNA sola aceptación al ingresar, con texto visible de
  // condiciones según rol (buyer/supplier) antes de enviar el código.
  // El número del arquitecto nunca es autorizado para divulgación.
  const altaConContacto=row.type==='text'
    ?/^COTI ALTA ([a-f0-9]{32}) CONTACTOS SI$/u.exec(body):null;
  const altaCompradorConTerminos=row.type==='text'
    ?/^COTI ALTA ([a-f0-9]{32}) ACEPTO$/u.exec(body):null;
  if(altaConContacto||altaCompradorConTerminos){
    if(!/^[1-9][0-9]{7,16}@s[.]whatsapp[.]net$/u.test(row.chat_id))
      return json(422,'invalid_contact_channel');
    const evidence=await encrypt(sec.aes,body,
      chatHash+'|'+messageHash+'|text');
    const vault=await encrypt(sec.aes,row.chat_id,
      chatHash+'|cotironda-contact-v1');
    const registration=await db.rpc('cotironda_piloto_enroll_terms_mvp308',{
      p_role:altaConContacto?'supplier':'buyer',
      p_code:(altaConContacto??altaCompradorConTerminos)![1],
      p_chat_hmac:chatHash,p_message_hmac:messageHash,
      p_nonce_b64:evidence.nonce,p_ciphertext_b64:evidence.ciphertext,
      p_plaintext_sha256:await sha(body),p_source_unix:row.timestamp,
      p_contact_sha256:await sha(row.chat_id),
      p_contact_nonce_b64:vault.nonce,
      p_contact_ciphertext_b64:vault.ciphertext
    });
    if(registration.error)
      return json(503,'enrollment_terms_reconciliation_required');
    if(!['enrolled_with_terms','already_enrolled'].includes(registration.data?.state))
      return json(422,'enrollment_terms_not_accepted');
    // El alta ES el único consentimiento: no enviar un WhatsApp de respuesta.
    continue;
  }
  // No aceptar altas nuevas sin la versión de términos mostrada al
  // participante. El camino heredado registraba la identidad sin alcance
  // verificable y ya no es válido a partir del nuevo flujo MVP308.
  const enroll=row.type==='text'?body.trim().match(/^COTI ALTA ([a-f0-9]{32})$/iu):null;
  if(enroll)return json(422,'enrollment_terms_required');
  const textHash=await sha(body);
  const c=await encrypt(sec.aes,body,chatHash+'|'+messageHash+'|'+row.type);
  // One-time consent or revocation for the bilateral exchange of contacts.
  // Never classify this opt-in as a supplier quotation or a buyer request.
  const contactCommand=row.type==='text'&&
    /^COTI CONTACTOS (SI|NO)$/u.test(body)?body:null;
  if(contactCommand){
    if(!/^[1-9][0-9]{7,16}@s[.]whatsapp[.]net$/u.test(row.chat_id))
      return json(422,'invalid_contact_channel');
    const vault=await encrypt(sec.aes,row.chat_id,
      chatHash+'|cotironda-contact-v1');
    const permission=await db.rpc('cotironda_piloto_contact_command_mvp109',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_action:contactCommand==='COTI CONTACTOS SI'?'approve':'revoke',
      p_nonce_b64:c.nonce,p_ciphertext_b64:c.ciphertext,
      p_plaintext_sha256:textHash,p_source_unix:row.timestamp,
      p_contact_sha256:await sha(row.chat_id),
      p_contact_nonce_b64:vault.nonce,
      p_contact_ciphertext_b64:vault.ciphertext
    });
    if(permission.error)return json(503,'contact_consent_reconciliation_required');
    if(!['consented','revoked','duplicate'].includes(permission.data?.state))
      return json(422,'contact_consent_not_accepted');
    continue;
  }
  // A one-time account ownership challenge from a previously authenticated
  // web session. Never classify as a material request or a supplier quotation.
  // Only the Whapi-signed sender/chat and the persisted inbox can prove it.
  const webLinkCode=row.type==='text'
    ?/^VINCULAR ([A-F0-9]{24})$/u.exec(body)?.[1]??null:null;
  const buyerReviewCommand=row.type==='text'&&esRespuestaConfirmacionMvp279(body);
   const buyerLinkCommand=row.type==='text'&&body.trim()==='SEGUIMIENTO COTI';
  // El proveedor sigue protegido por el circuito de precios actual.
  // Solo el COMPRADOR del piloto ingresa por IA Central; sin palabras clave.
  // Configuración privada acotada por remitente, caducidad y gates SQL.
  // Nunca activar IA únicamente por un secreto de entorno.
  const trialResponse=await db.rpc('cotironda_piloto_ia_trial_flags_mvp229',{
    p_chat_hmac:chatHash
  });
  if(trialResponse.error||!trialResponse.data||
     typeof trialResponse.data!=='object')
    return json(503,'ai_trial_config_unavailable');
  const trial=trialResponse.data as Record<string,unknown>;
  const trialActive=trial.state==='active';
  const centralConfigured=sec.outbound&&trialActive&&trial.buyer===true;
  // MVP285: operator-granted database gate is OFF by default. An unset
  // deployment env variable is NOT permission by itself: SQL also needs
  // active trial + central/dispatch flags and a consented buyer identity.
  // An explicitly false env switch remains an independent kill switch.
  const pilotEnvNotDenied=(key:string):boolean=>{
    const value=Deno.env.get(key);
    return value===undefined||value==='true';
  };
  let reviewGate:Record<string,unknown>|null=null;
  if(centralConfigured){
    const operator=await db.rpc('cotironda_piloto_ia_review_launch_mvp285',{
      p_chat_hmac:chatHash
    });
    if(operator.error||!operator.data||typeof operator.data!=='object')
      return json(503,'buyer_review_operator_gate_unavailable');
    reviewGate=operator.data as Record<string,unknown>;
    if(!['active','inactive'].includes(String(reviewGate.state)))
      return json(503,'buyer_review_operator_gate_invalid');
  }
  const allowBuyerReview=reviewGate?.state==='active'&&
    reviewGate.send===true&&
    pilotEnvNotDenied('COTIRONDA_PILOT_BUYER_REVIEW_SEND_ENABLED');
  const allowBuyerConfirmation=reviewGate?.state==='active'&&
    reviewGate.confirm===true&&
    pilotEnvNotDenied('COTIRONDA_PILOT_BUYER_REVIEW_CONFIRM_ENABLED');
  const allowBuyerRelease=reviewGate?.state==='active'&&
    reviewGate.release===true&&
    pilotEnvNotDenied('COTIRONDA_PILOT_BUYER_REVIEW_RELEASE_ENABLED');
  const supplierKnown=sec.outbound&&(sec.dynamicRecipients
    ?await (async()=>{
       const found=await db.rpc('cotironda_piloto_is_supplier_mvp313',{
        p_chat_hmac:chatHash});
       if(found.error||typeof found.data!=='boolean')
        throw Error('supplier_role_lookup_failed');
       return found.data;
     })()
    :(await Promise.all(Object.values(sec.recipients).map(async recipient=>
      hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
        '|'+recipient+'@s.whatsapp.net'))))
      .some(expected=>equalSecret(expected,chatHash)));
  // La protección de una ronda YA DESPACHADA no depende de que el
  // administrador deje activada la IA de compras. Incluye archivos y
  // respuestas sin precio escrito en un formato determinado.
  let centralSupplier=false;
  if(!webLinkCode){
    const route=await db.rpc('cotironda_piloto_ia_is_supplier_mvp226',{
      p_chat_hmac:chatHash
    });
    if(route.error)return json(503,'ai_central_supplier_guard_unavailable');
    // El permiso de respuesta MVP230 sobrevive al apagado administrativo
    // del gate de NUEVOS pedidos; nunca reabre el despacho.
    centralSupplier=proveedorConRondaCentralMvp232(
      trial.quote_link,route.data?.state);
  }
  // MVP306: future rounds may be dispatched after internal source proof.
  // No CONFIRMAR COTI nor extra buyer WhatsApp when the new gate is ON.
  const emitirRevisionUnificada=async(sourceHmac:string):Promise<boolean>=>{
    if(Deno.env.get('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')==='true'){
      if(!centralConfigured||supplierKnown||centralSupplier||!allowBuyerRelease)
        return true; // No legacy review fallback: only validated auto release.
      const auto=await liberarPedidoAutomaticoMvp306({
        enabled:true,webhookAutenticado:true,compradorVerificado:true,
        chatHmac:chatHash,sourceHmac,
        rpc:async(name,params)=>{
          const r=await db.rpc(name,params);
          return {data:r.data,error:r.error};
        }
      });
      if(auto.estado==='publicado'&&auto.requestId){
        trialDispatchChats.add(chatHash);
        buyerLinkRequests.push({mode:'auto',requestId:auto.requestId,
          chatHmac:chatHash,eventHmac:sourceHmac,recipient:row.chat_id});
      }
      return auto.estado!=='conciliacion_requerida';
    }
    if(!centralConfigured||supplierKnown||centralSupplier||!allowBuyerReview)
      return true; // historical flow retained until prospective activation.
    const delivery=await emitirRevisionCompradorMvp279({
      habilitado:true,compradorAutenticado:true,
      chatHmac:chatHash,sourceHmac,destinatario:row.chat_id,
      rpc:async(name,params)=>{
        const result=await db.rpc(name,params);
        return {data:result.data,error:result.error};
      },
      send:async(recipient,reviewText)=>{
        if(recipient!==row.chat_id)throw Error('buyer_chat_changed');
        const response=await fetch('https://gate.whapi.cloud/messages/text',{
          method:'POST',
          headers:{Authorization:'Bearer '+sec.token,
            'Content-Type':'application/json'},
          body:JSON.stringify({to:recipient,body:reviewText}),
          signal:AbortSignal.timeout(12000)
        });
        const reply=response.ok?await response.json().catch(()=>null):null;
        const msg=reply&&typeof reply==='object'?
          reply as Record<string,unknown>:null;
        const nested=msg?.message&&typeof msg.message==='object'?
          msg.message as Record<string,unknown>:null;
        const id=msg?.message_id??nested?.id??null;
        return {accepted:response.ok&&msg?.sent===true,
          messageId:typeof id==='string'?id:null};
      }
    });
    return delivery.estado!=='conciliacion_requerida';
  };
  const attachmentNotice=row.type==='text'&&centralSupplier&&
    esAvisoAdjuntoProveedorMvp238(body);
  const centralBuyerText=centralConfigured&&row.type==='text'&&
    !supplierKnown&&!centralSupplier&&!webLinkCode&&
     !buyerReviewCommand&&!buyerLinkCommand;
  const local=buyerReviewCommand||buyerLinkCommand
    ?{city:'sin solicitud',items:[],unresolved:['buyer_review_command']}
    :centralBuyerText
      ?{city:'sin solicitud',items:[],unresolved:['central_message_pending']}
    :row.type==='text'&&!webLinkCode
      ?parseBuyerPilot(body):{city:null,items:[],unresolved:[]};
  let parsed=local;
  let aiReply:ReplyCode|null=null;
  let mediaClarificationBody:string|null=null;
  // The source HMAC is the ORIGINAL buyer file, even when a later
  // locality clarification is what finally makes a round eligible.
  let preparedDocumentSourceHmac:string|null=null;
  let supplierAckMode:'text_quote'|'media_quote'|null=null;
  let handledCentralZoneReply=false;
  let clarificationSourceHmac:string|null=null;
  let selectorClarification=false;
  // OpenAI is optional and off by default. The server-side DB gate is
  // durable, one-per-HMAC, buyer-only and capped at 12 calls per day.
  // Supplier quote ingestion never passes through this classifier.
  if(row.type==='text'&&!webLinkCode&&!centralBuyerText&&
     !buyerReviewCommand&&!buyerLinkCommand&&!canPrepareBuyerPilot(local)&&
     Deno.env.get('COTIRONDA_PILOT_AI_ENABLED')==='true'){
    const preflight=await db.rpc('cotironda_piloto_reserve_ai_mvp094',{
      p_chat_hmac:chatHash,p_message_hmac:messageHash
    });
    if(preflight.error){
      // Fail closed, not a silent inference using an unvalidated identity.
      parsed={city:local.city,items:[],unresolved:['ai_unavailable']};
    }else if(preflight.data===true){
      try{
        const categories=await db.rpc('cotironda_piloto_curated_families_mvp152',{
          p_buyer_chat_hmac:chatHash,p_city:local.city
        });
        if(categories.error||!Array.isArray(categories.data)||
          categories.data.length<1||categories.data.length>100||
          !categories.data.every((s:unknown)=>typeof s==='string'&&
            /^[a-z][a-z0-9_]{2,49}$/u.test(s)))
          throw Error('pilot_ai_catalogue_unavailable');
        const familyCodes=categories.data as string[];
        const model=await interpretPilotBuyerWithAI({
          text:body,apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
          enabled:true,familyCodes
        });
        const decision=decidePilotAIAction(body,model,'buyer',familyCodes);
        // Success means a structurally valid model answer, not commercial
        // authorization. Store only intent/decision codes, never content.
        const audit=await db.rpc('cotironda_piloto_finish_ai_mvp096',{
          p_message_hmac:messageHash,p_result_state:'completed',
          p_intent:model.intent,p_decision:decision.action
        });
        if(audit.error||audit.data!==true)
          return json(503,'ai_audit_reconciliation_required');
        aiReply=decision.replyCode;
        if(decision.action==='ready_to_distribute'&&decision.parsed){
          parsed=decision.parsed;
        }else{
          // A question/greeting/uncertain extraction is not a request.
          // The original is still encrypted and stored by receive_whapi.
          parsed={city:local.city??'sin solicitud',items:[],
            unresolved:[decision.reason]};
        }
      }catch(error){
        // No details, prompts or raw OpenAI responses are logged.
        const code=error instanceof Error?error.message:'';
        const category=code==='pilot_ai_key_missing'?'auth_config':
          code==='pilot_ai_quota'?'quota':
          code==='pilot_ai_transport_error'||code==='pilot_ai_http_error'
            ?'upstream':
          code.startsWith('pilot_ai_')?'bad_output':'other';
        const audit=await db.rpc('cotironda_piloto_finish_ai_mvp096',{
          p_message_hmac:messageHash,p_result_state:'failed',
          p_failure_category:category
        });
        if(audit.error||audit.data!==true)
          return json(503,'ai_audit_reconciliation_required');
        // The same HMAC may not trigger a second billable model attempt.
        parsed={city:local.city??'sin solicitud',items:[],
          unresolved:['ai_review_required']};
      }
    }else{
      // Could be a replay, exhausted budget or unauthorised sender.
      // Non-buyer quotes still enter their original immutable SQL flow.
      parsed={city:local.city??'sin solicitud',items:[],
        unresolved:['ai_not_admitted']};
    }
  }
  const out=await db.rpc('cotironda_piloto_receive_whapi_v1',{
   p_chat_hmac:chatHash,p_message_hmac:messageHash,
   p_plaintext_sha256:textHash,p_kind:row.type,
   p_nonce_b64:c.nonce,p_ciphertext_b64:c.ciphertext,
   p_source_unix:row.timestamp,
   p_plaintext:body,
   p_city:supplierQuotedId||centralSupplier
     ?'__quoted_supplier_reply__':parsed.city,
   p_items:!centralBuyerText&&canPrepareBuyerPilot(parsed)?parsed.items:null
  });
  if(out.error)return json(503,'storage_unavailable');
  if(!['recorded','duplicate','unrecognized_contact','needs_zone',
       'needs_review','quote_recorded','unmatched_quote'].includes(outcome(out.data)))
   return json(503,'storage_unavailable');
  // Recoverable sender address lives only as AES-GCM ciphertext in the
  // private vault, never as plaintext in SQL, logs or a supplier request.
  if(!['unrecognized_contact','duplicate'].includes(outcome(out.data))&&
     /^[1-9][0-9]{7,16}@s[.]whatsapp[.]net$/u.test(row.chat_id)){
    const vault=await encrypt(sec.aes,row.chat_id,
      chatHash+'|cotironda-contact-v1');
    const bound=await db.rpc('cotironda_piloto_bind_contact_mvp109',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_contact_sha256:await sha(row.chat_id),
      p_nonce_b64:vault.nonce,p_ciphertext_b64:vault.ciphertext
    });
    if(bound.error)return json(503,'contact_vault_reconciliation_required');
    if(bound.data?.state==='identity_conflict')
      return json(503,'contact_identity_reconciliation_required');
  }
  if(webLinkCode){
    // A replay cannot create a second link or trigger a false quote.
    if(!['duplicate','unrecognized_contact'].includes(outcome(out.data))){
      const bound=await db.rpc('cotironda_piloto_complete_web_link_mvp126',{
        p_chat_hmac:chatHash,p_message_hmac:messageHash,p_code:webLinkCode
      });
      if(bound.error)return json(503,'web_link_reconciliation_required');
      // Deliberately no WhatsApp echo; the verified web session refreshes
      // the dashboard to observe the linked state. Never log a linking code.
    }
    continue;
  }
  // Buyer confirmation is NOT a new material request, zone clarification,
  // supplier price or an instruction to the language model.
  if(buyerReviewCommand){
    if(!['duplicate','unrecognized_contact'].includes(outcome(out.data))&&
       allowBuyerConfirmation){
      const decision=await confirmarPedidoCompradorMvp279({
        habilitado:true,
        liberar:sec.outbound&&trialActive&&trial.buyer===true&&
          trial.dispatch===true&&allowBuyerRelease,
        compradorAutenticado:!supplierKnown&&!centralSupplier,
        chatHmac:chatHash,replyHmac:messageHash,textoOriginal:body,
        rpc:async(name,params)=>{
          const r=await db.rpc(name,params);
          return {data:r.data,error:r.error};
        }
      });
      if(decision.estado==='conciliacion_requerida')
        return json(503,'buyer_review_confirmation_reconciliation');
      if(decision.estado==='publicado'){
        trialDispatchChats.add(chatHash);
        buyerLinkRequests.push({mode:'confirmed',requestId:decision.requestId,
         chatHmac:chatHash,eventHmac:messageHash,recipient:row.chat_id});
       }
    }
    continue;
  }
  // Recuperacion solicitada explicitamente para una ronda ya confirmada.
   // Este comando NO crea rondas ni invita nuevamente a proveedores.
   if(buyerLinkCommand){
    if(!['duplicate','unrecognized_contact'].includes(outcome(out.data))&&
       trial.buyer===true&&!supplierKnown&&!centralSupplier&&sec.outbound&&
       pilotEnvNotDenied('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED'))
     buyerLinkRequests.push({mode:'recovery',requestId:null,
      chatHmac:chatHash,eventHmac:messageHash,recipient:row.chat_id});
    continue;
   }
   // La reserva SQL verifica identidad de comprador y cuota ANTES de
  // gastar tokens. El mensaje ya fue almacenado cifrado y con SHA original.
  // Un mensaje breve que aporta la localidad continúa el único pedido
  // IA Central previo, sin interpretar "La Plata" como otro presupuesto.
  // La RPC revalida autor, SHA, ventana de tiempo, trial y gates.
  if(centralBuyerText&&outcome(out.data)==='needs_review'){
    // Ciudad normalizada únicamente; atribución de contexto y permisos en SQL.
    const city=ciudadDeRespuestaCentralMvp234(body);
    if(city){
      const claimed=await db.rpc('cotironda_piloto_ia_claim_zone_mvp233',{
        p_chat_hmac:chatHash,p_reply_hmac:messageHash,
        p_reply_text:body,p_city:city
      });
      if(claimed.error)return json(503,'ai_central_zone_claim_unavailable');
      const previous=claimed.data;
      // Una respuesta de localidad, incluso duplicada o sin pedido
      // pendiente, no inicia una segunda cotización por su cuenta.
      handledCentralZoneReply=true;
      const claimState=estadoClaimZonaMvp234(previous);
      if(claimState==='inconsistent')
        return json(503,'ai_central_zone_state_reconciliation_required');
      if(claimState==='resume'){
        if(typeof previous.source_hmac!=='string'||
           typeof previous.source_sha256!=='string'||
           typeof previous.nonce!=='string'||
           typeof previous.ciphertext!=='string'||
           previous.delivery_city!==city)
          return json(503,'ai_central_zone_source_reconciliation_required');
        const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
        const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
        const resumed=await continuarZonaCentralMvp233({
          autenticadoPorWebhook:true,chatHmac:chatHash,
          sourceHmac:previous.source_hmac,
          originalSha256:previous.source_sha256,
          ciudadConfirmada:city,nonce:previous.nonce,
          ciphertext:previous.ciphertext,
          apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
          model,publicar:false, // MVP280: no dispatch before review
          decrypt:async(nonce,ciphertext)=>decryptArchivedText(
            sec.aes,nonce,ciphertext,
            chatHash+'|'+previous.source_hmac+'|text'),
          shaText:sha,
          rpc:async(name,params)=>{
            const r=await db.rpc(name,params);
            return {data:r.data,error:r.error};
          }
        });
        if(resumed.estado==='conciliacion_requerida'||
           resumed.estado==='origen_invalido')
          return json(503,'ai_central_zone_continuation_failed');
        if(resumed.estado==='ronda_publicada')
          return json(503,'buyer_review_bypassed_by_zone_continuation');
        if(resumed.estado==='ronda_en_sombra'&&
           !await emitirRevisionUnificada(previous.source_hmac))
          return json(503,'buyer_review_delivery_reconciliation_required');
      }else if(previous?.state==='ambiguous'){
        // Ninguna asignación arbitraria de localidad a pedido.
        handledCentralZoneReply=true;
      }
    }
  }
  if(centralBuyerText&&!handledCentralZoneReply&&outcome(out.data)==='needs_review'){
    const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
    const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
    const result=await procesarCompradorCentralMvp226({
      habilitado:true,publicar:false, // MVP280: buyer must approve
      autenticadoPorWebhook:true,chatHmac:chatHash,
      messageHmac:messageHash,sourceSha256:textHash,
      fuente:body,apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
      model,
      usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true',
      rpc:async(name,params)=>{
        const result=await db.rpc(name,params);
        return {data:result.data,error:result.error};
      }
    });
    if(result.estado==='conciliacion_requerida')
      return json(503,'ai_central_reconciliation_required');
    if(result.estado==='requiere_zona')aiReply='zone';
    // MVP286: a failed semantic reading must never leave a recognized
    // buyer in silence. SQL proves same signed text, consent, quotas and
    // one-time delivery before we spend one outbound Whapi attempt.
    if(result.estado==='requiere_revision'&&allowBuyerReview){
      const notice=await avisarRevisionSemanticaMvp286({
        habilitado:true,compradorAutenticado:!supplierKnown&&!centralSupplier,
        chatHmac:chatHash,messageHmac:messageHash,
        destinatario:row.chat_id,
        rpc:async(name,params)=>{
          const r=await db.rpc(name,params);
          return {data:r.data,error:r.error};
        },
        send:async(recipient,noticeBody)=>{
          if(recipient!==row.chat_id)throw Error('buyer_chat_changed');
          const response=await fetch('https://gate.whapi.cloud/messages/text',{
            method:'POST',
            headers:{Authorization:'Bearer '+sec.token,
              'Content-Type':'application/json'},
            body:JSON.stringify({to:recipient,body:noticeBody}),
            signal:AbortSignal.timeout(12000)
          });
          const reply=response.ok?await response.json().catch(()=>null):null;
          return aceptarRespuestaWhapiMvp287(response.ok,reply);
        }
      });
      if(notice.estado==='conciliacion_requerida')
        return json(503,'ai_central_review_notice_reconciliation_required');
    }
    if(result.estado==='ronda_publicada')
      return json(503,'buyer_review_bypassed_by_text_broker');
    if(result.estado==='ronda_en_sombra'&&
       !await emitirRevisionUnificada(messageHash))
      return json(503,'buyer_review_delivery_reconciliation_required');
  }
  // Aclaración breve que cita el PDF ORIGINAL de Cotironda.
  // Un mensaje «Es de este pedido» no debe entrar como cotización.
  const isClarificationAnswer=row.type==='text'&&centralSupplier&&
    respuestaCitaPedidoMvp239(body);
  selectorClarification=isClarificationAnswer&&
    trial.quote_link===true&&supplierQuotedId!==null;
  if(selectorClarification&&
     ['unmatched_quote','needs_review'].includes(outcome(out.data))){
    const settled=await db.rpc('cotironda_piloto_ia_resolve_clarification_mvp239',{
      p_reply_hmac:messageHash,p_chat_hmac:chatHash,
      p_quoted_whapi_id:supplierQuotedId,p_original_text:body
    });
    if(settled.error)return json(503,'ai_supplier_clarification_unavailable');
    const state=settled.data?.state;
    if(!['resolved','ambiguous_source','no_pending_source',
         'quoted_request_not_unique','not_authorized',
         'already_resolved','invitation_after_source',
         'invalid'].includes(state))
      return json(503,'ai_supplier_clarification_state_invalid');
    if(state==='resolved'&&settled.data?.source_kind==='text'&&
       typeof settled.data.source_hmac==='string'&&
       trial.quote_analysis===true){
      const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
      const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
      const processed=await procesarPresupuestoCentralMvp227({
       habilitado:true,webhookAutenticado:true,
       commercialMemoryEnabled:Deno.env.get('COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED')==='true',
       quoteVersioningEnabled:Deno.env.get('COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED')==='true',
       usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true',
       messageHmac:settled.data.source_hmac,chatHmac:chatHash,
       apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
       model,
       rpc:async(name,params)=>{
        const reply=await db.rpc(name,params);
        return {data:reply.data,error:reply.error};
       },
       decrypt:async(nonce,ciphertext)=>decryptArchivedText(
        sec.aes,nonce,ciphertext,
        chatHash+'|'+settled.data.source_hmac+'|text'),
       shaText:sha
      });
      if(processed.estado==='conciliacion_requerida')
        return json(503,'ai_supplier_clarification_review_required');
    }
  }
  if(outcome(out.data)==='quote_recorded')supplierAckMode='text_quote';
  // A supplier can have several open invitations. A quoted PDF ID is
  // checked against the exact accepted Whapi outbox for this same seller.
  let legacySupplierQuoteLinked=false;
  if(row.type==='text'&&supplierQuotedId&&!attachmentNotice&&
     !isClarificationAnswer&&
     outcome(out.data)==='unmatched_quote'){
    const binding=await db.rpc('cotironda_piloto_link_quoted_text_mvp151',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_quoted_id:supplierQuotedId,p_plaintext:body
    });
    if(binding.error)return json(503,'supplier_quote_context_unavailable');
    if(binding.data?.state==='linked'){
      supplierAckMode='text_quote';
      legacySupplierQuoteLinked=true;
    }
  }
  // Nueva asociación IA Central: solo texto FUENTE a ronda exacta.
  // No publica precios ni asigna ganadores; bandera OFF por defecto.
  // Un proveedor puede escribir «cemento 8500 por bolsa» sin signo $.
  // El receptor heredado lo deja needs_review: IA Central debe poder
  // asociarlo a la ronda EXACTA igual que los presupuestos formales.
  if(row.type==='text'&&centralSupplier&&!isClarificationAnswer&&
     ['unmatched_quote','needs_review'].includes(outcome(out.data))&&
     !legacySupplierQuoteLinked&&
     trial.quote_link===true){
    const linked=await db.rpc('cotironda_piloto_ia_link_supplier_mvp225',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_quoted_whapi_id:supplierQuotedId,p_original_text:body
    });
    if(linked.error)return json(503,'ai_supplier_quote_link_unavailable');
    if(linked.data?.state==='ambiguous_round'){
     clarificationSourceHmac=messageHash;
     // No preguntarle al negocio: una sola fuente firmada puede compararse
     // contra las rondas efectivamente enviadas, sin precio ni teléfono.
     if(!attachmentNotice&&!supplierQuotedId&&
        Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')==='true'&&
        Deno.env.get('COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED')==='true'){
      const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
      const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
      const apiKey=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
      const textMaterials=await extraerMaterialesTextoMvp292({
       source:body,apiKey,model
      });
      if(textMaterials){
       const linkedByEvidence=await correlacionAutomaticaMvp291({
        enabled:true,webhookAuthenticated:true,
        sourceHmac:messageHash,chatHmac:chatHash,
        textQuote:textMaterials,textSha256:textHash,
        apiKey,model,rpc:async(name,params)=>{
         const r=await db.rpc(name,params);
         return {data:r.data,error:r.error};
        }
       });
       if(linkedByEvidence.state==='reconciliation_required')
        return json(503,'supplier_text_auto_correlation_reconciliation_required');
       if(linkedByEvidence.state==='linked_private'&&trial.quote_analysis===true){
        // Consume the SAME ciphertext and SHA via the original double-read
        // commercial quote validator; association is not publication.
        const processed=await procesarPresupuestoCentralMvp227({
         habilitado:true,webhookAutenticado:true,
         commercialMemoryEnabled:Deno.env.get('COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED')==='true',
         quoteVersioningEnabled:Deno.env.get('COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED')==='true',
         usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true',
         messageHmac:messageHash,chatHmac:chatHash,
         apiKey,model,
         rpc:async(name,params)=>{
          const r=await db.rpc(name,params);
          return {data:r.data,error:r.error};
         },
         decrypt:async(nonce,ciphertext)=>decryptArchivedText(
          sec.aes,nonce,ciphertext,chatHash+'|'+messageHash+'|text'),
         shaText:sha
        });
        if(processed.estado==='conciliacion_requerida')
         return json(503,'supplier_text_auto_quote_review_required');
        if(['verificado_privado','requiere_revision'].includes(processed.estado))
         supplierAckMode='text_quote';
       }
      }
     }
    }
    if(linked.data?.state==='linked_for_semantic_review'){
      if(attachmentNotice){
        // Un aviso no es cotización. Asociar el siguiente archivo a la
        // única ronda acreditada, sin mensaje de agradecimiento ni gasto IA.
        const noted=await db.rpc('cotironda_piloto_ia_note_supplier_preamble_mvp238',{
          p_message_hmac:messageHash,p_chat_hmac:chatHash,
          p_original_text:body
        });
        if(noted.error||!['noted','already_noted'].includes(noted.data?.state))
          return json(503,'ai_supplier_preamble_reconciliation_required');
      }else{
      supplierAckMode='text_quote';
      // Solo FUENTE ya asociada, buyer/supplier comprobados por SQL.
      // La IA interpreta libremente; SQL almacena exclusivamente el
      // resumen por rubro, sin originales, ganadores ni datos privados.
      if(trial.quote_analysis===true){
        const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
        const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
        const processed=await procesarPresupuestoCentralMvp227({
          habilitado:true,webhookAutenticado:true,
          commercialMemoryEnabled:Deno.env.get('COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED')==='true',
          quoteVersioningEnabled:Deno.env.get('COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED')==='true',
          usageTraceEnabled:Deno.env.get('COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED')==='true',
          messageHmac:messageHash,chatHmac:chatHash,
          apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
          model,
          rpc:async(name,params)=>{
            const response=await db.rpc(name,params);
            return {data:response.data,error:response.error};
          },
          decrypt:async(nonce,ciphertext)=>decryptArchivedText(
            sec.aes,nonce,ciphertext,chatHash+'|'+messageHash+'|text'),
          shaText:sha
        });
        if(processed.estado==='conciliacion_requerida')
          return json(503,'ai_supplier_economy_reconciliation_required');
      }
      }
    }
  }
  // Archive original incoming PDF, Excel, Word or photo ONLY after
  // committed authenticated inbox and supplier/buyer consent SQL check.
  // No interpretation can distribute until independently reviewed.
  if(row.type!=='text'&&media?.state==='awaiting_secure_download'&&
     outcome(out.data)==='needs_review'){
    const archiveGate=await db.rpc('cotironda_piloto_media_enabled_mvp095');
    if(archiveGate.error)return json(503,'media_archive_gate_unavailable');
    if(archiveGate.data===true){
    const reservation=await db.rpc('cotironda_piloto_reserve_media_mvp095',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_media_id_sha256:await sha(media.media_id),p_mime:media.mime
    });
    if(reservation.error)return json(503,'media_reservation_unavailable');
    if(reservation.data===true){
      // Resolve supplier documents BEFORE interpreting bytes or publishing
      // any amount. A stale/wrong quote must not land on a newer round.
      if(supplierQuotedId){
        const binding=await db.rpc('cotironda_piloto_link_quoted_media_mvp151',{
          p_message_hmac:messageHash,p_chat_hmac:chatHash,
          p_quoted_id:supplierQuotedId
        });
        if(binding.error)return json(503,'supplier_media_context_unavailable');
      }
      let status:'stored'|'uncertain'='uncertain';
      let contentHash:string|null=null,contentSize:number|null=null;
      let downloadedForReview:Awaited<ReturnType<typeof getVerifiedWhapiMedia>>|null=null;
      try{
        const downloaded=await getVerifiedWhapiMedia({
          manifest:media,token:sec.token
        });
        await storeVerifiedMedia(db.storage,messageHash,downloaded);
        contentHash=downloaded.sha256;
        contentSize=downloaded.bytes.length;
        downloadedForReview=downloaded;
        status='stored';
      }catch{
        // A slow upload may have succeeded; NEVER automatically retry.
      }
      const completed=await db.rpc('cotironda_piloto_finish_media_mvp095',{
        p_message_hmac:messageHash,p_state:status,
        p_size:contentSize,p_sha:contentHash
      });
      if(completed.error||completed.data!==true)
        return json(503,'media_reconciliation_required');
      // Solo tras almacenar y verificar SHA del archivo, intentar
      // vincular la respuesta al trabajo IA Central. No adjudicar.
      if(status==='stored'&&centralSupplier&&
         trial.quote_link===true){
        let attachmentState:string|null=null;
        if(!supplierQuotedId){
          const context=await db.rpc('cotironda_piloto_ia_attach_supplier_media_mvp238',{
            p_media_hmac:messageHash,p_chat_hmac:chatHash
          });
          if(context.error)return json(503,'ai_supplier_attachment_link_unavailable');
          attachmentState=context.data?.state;
          if(!['linked_from_preamble','already_attached','no_context',
               'ambiguous','context_blocked','not_eligible',
               'context_consumed'].includes(attachmentState??''))
            return json(503,'ai_supplier_attachment_state_invalid');
        }
        // Si hay avisos ambiguos, se conserva el archivo sin asignarlo.
        // Un mensaje citado se resuelve por su propio identificador Whapi.
        if(['ambiguous','context_blocked'].includes(attachmentState??''))
          clarificationSourceHmac=messageHash;
        if(!['linked_from_preamble','already_attached',
             'ambiguous','context_blocked',
             'context_consumed'].includes(attachmentState??'')){
          const linked=await db.rpc('cotironda_piloto_ia_link_supplier_mvp225',{
            p_message_hmac:messageHash,p_chat_hmac:chatHash,
            p_quoted_whapi_id:supplierQuotedId,p_original_text:null
          });
          if(linked.error)return json(503,'ai_supplier_media_link_unavailable');
          if(linked.data?.state==='ambiguous_round')
            clarificationSourceHmac=messageHash;
        }
      }
      // The model only proposes a PRIVATE DRAFT; cannot create an invitation,
      // offer, winner or public view without separate independent verification.
      if(status==='stored'&&downloadedForReview&&
         Deno.env.get('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED')==='true'){
        const quota=await db.rpc('cotironda_piloto_reserve_document_ai_mvp095',{
          p_message_hmac:messageHash
        });
        if(!quota.error&&quota.data===true){
          let diagnosticPhase:'primary'|'storage'|'validation'='primary';
          try{
            // Two parallel readings reduce copy errors without extra
            // WhatsApp actions. Each is untrusted until source corroboration;
            // disagreement MUST NOT create a commercial invitation.
            // PILOTO: compare the already-verified sender HMAC to the two
            // configured, previously approved supplier recipients. The
            // reserve_media RPC has ALREADY checked consent + supplier invite.
            // No buyer is promoted and no phone is logged or returned.
            const verifiedSupplier=(await Promise.all(
              Object.values(sec.recipients).map(async number=>
                hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+'|'+
                  number+'@s.whatsapp.net'))))
              .some(expected=>equalSecret(expected,chatHash));
            const args={manifest:media,file:downloadedForReview,
              apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
              enabled:true,verifiedSupplier};
            const readings=await Promise.allSettled([
              proposeDocumentAI({...args,perspective:'primary'}),
              proposeDocumentAI({...args,perspective:'corroboration'})
            ]);
            // If one read fails, preserve the other's private draft, but do
            // NOT call it a corroboration or publish its economic contents.
            const proposal=readings[0].status==='fulfilled'
              ?promoteVerifiedSupplierQuote(readings[0].value,verifiedSupplier):
              readings[1].status==='fulfilled'
                ?promoteVerifiedSupplierQuote(readings[1].value,verifiedSupplier):null;
            const corroboration=readings[0].status==='fulfilled'&&
              readings[1].status==='fulfilled'
                ?promoteVerifiedSupplierQuote(readings[1].value,verifiedSupplier):null;
            if(!proposal)throw readings[0].status==='rejected'
              ?readings[0].reason:Error('doc_ai_response_incomplete');
            diagnosticPhase='storage';
            // Never store model-supplied status: server forces review_required.
            const saved=await db.rpc('cotironda_piloto_note_media_proposal_mvp095',{
              p_message_hmac:messageHash,
              p_proposal:proposal
            });
            if(!saved.error&&saved.data===true){
              const noted=await db.rpc('cotironda_piloto_note_document_draft_mvp127',{
                p_message_hmac:messageHash,p_needs_corrob:corroboration===null
              });
              if(noted.error)console.warn('cotironda_doc_draft_telemetry_unavailable');
              diagnosticPhase='validation';
              // The per-line planner is internal and NEVER sends invitations.
              // Supplier original files get a separate, unverified receipt:
              // totals and extra charges remain available in source storage.
              if(proposal.kind==='buyer_request'&&!verifiedSupplier){
                // MVP275: closed READ-ONLY preview. No legacy round may be
                // created while this experimental path is enabled; the
                // text-only SQL broker MUST NOT be bypassed for media.
                if(centralConfigured&&
                   Deno.env.get('COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_ACTIVE_ENABLED')==='true'&&
                   ['application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(
                      downloadedForReview.mime)){
                  // MVP278 verifies bytes and stages a shadow round via
                  // separately guarded SQL. Publication is HARD OFF until
                  // buyer-signed review and a distinct release are verified.
                  const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
                  const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
                  const mediaPlan=await prepararDocumentoBinarioCompradorMvp278({
                    habilitado:true,autenticadoPorWebhook:true,
                    compradorAutorizado:true,chatHmac:chatHash,
                    messageHmac:messageHash,original:downloadedForReview,
                    primera:proposal,segunda:corroboration,
                    apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
                    model,
                    rpc:async(name,params)=>{
                      const r=await db.rpc(name,params);
                      return {data:r.data,error:r.error};
                    }
                  });
                  if(mediaPlan.estado==='conciliacion_requerida')
                    console.warn('cotironda_buyer_binary_attestation_or_broker_review');
                  if(mediaPlan.estado==='ronda_en_sombra'&&
                     !await emitirRevisionUnificada(messageHash))
                    return json(503,'buyer_review_delivery_reconciliation_required');
                }else if(centralConfigured&&
                   Deno.env.get('COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_PREVIEW_ENABLED')==='true'&&
                   ['application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(
                      downloadedForReview.mime)){
                  // MVP277 private proof: independent PDF text geometry or
                  // exhaustive Office ZIP/XML rows. No rounds or dispatch,
                  // because MVP276 SQL authorizes only TXT/CSV originals.
                  // Do not log source text, buyer identity, prices or contacts.
                  const reviewed=await contrastarDocumentoCompradorMvp277({
                    habilitado:true,original:downloadedForReview,
                    primera:proposal,segunda:corroboration
                  });
                  if(reviewed.estado!=='fuente_contrastada_privada')
                    console.warn('cotironda_buyer_binary_source_review_required');
                }else if(centralConfigured&&
                   Deno.env.get('COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_ACTIVE_ENABLED')==='true'){
                  // Source bytes and both documentary readings are checked
                  // before SQL's separate media buyer authorization. No
                  // artificial kind='text' or rephrased source is accepted.
                  const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
                  const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
                  const processed=await procesarDocumentoCompradorCentralMvp276({
                    habilitado:true,
                    publicar:false, // MVP280: uniform review for TXT/CSV
                    autenticadoPorWebhook:true,compradorAutorizado:true,
                    messageHmac:messageHash,chatHmac:chatHash,
                    original:downloadedForReview,
                    primera:proposal,segunda:corroboration,
                    apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
                    model,
                    rpc:async(name,params)=>{
                      const r=await db.rpc(name,params);
                      return {data:r.data,error:r.error};
                    }
                  });
                  if(processed.estado==='ronda_publicada')
                    return json(503,'buyer_review_bypassed_by_document_broker');
                  if(processed.estado==='ronda_en_sombra'&&
                     !await emitirRevisionUnificada(messageHash))
                    return json(503,'buyer_review_delivery_reconciliation_required');
                  if(processed.estado==='conciliacion_requerida'){
                    // The source is persisted; never retry an uncertain
                    // SQL commit or send duplicate invitations.
                    console.warn('cotironda_buyer_document_sql_reconciliation_required');
                  }
                }else if(centralConfigured&&
                   Deno.env.get('COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PREVIEW_ENABLED')==='true'){
                  const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
                  const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
                  const preview=await previsualizarDocumentoCompradorMvp275({
                    habilitado:true,webhookAutenticado:true,
                    participanteComprador:true,
                    messageHmac:messageHash,chatHmac:chatHash,
                    original:downloadedForReview,
                    primera:proposal,segunda:corroboration,
                    apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
                    model,
                    rpc:async(name,params)=>{
                      const r=await db.rpc(name,params);
                      return {data:r.data,error:r.error};
                    }
                  });
                  // A successful preview stays private. The SQL authority
                  // for actual media buyer rounds does NOT exist yet.
                  // No prices, buyer details or document text in logs.
                  if(preview.estado!=='plan_privado_validado')
                    console.warn('cotironda_buyer_document_readonly_review_required');
                }else if(centralConfigured||
                   Deno.env.get('COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED')==='true'){
                  // MVP285: active central buyer may NEVER fall back to
                  // legacy document auto-invite, even if the env gate is
                  // absent. Unsupported formats remain archived for review.
                  console.warn('cotironda_buyer_document_independent_source_required');
                }else{
                const plan=await db.rpc('cotironda_piloto_plan_document_mvp098',{
                  p_message_hmac:messageHash
                });
                if(plan.error)console.warn('cotironda_media_plan_reconciliation_required');
                if(!plan.error&&corroboration!==null){
                  const agreed=await db.rpc('cotironda_piloto_record_agreement_mvp099',{
                    p_message_hmac:messageHash,
                    p_second_proposal:corroboration
                  });
                  if(agreed.error)console.warn('cotironda_document_agreement_reconciliation_required');
                  else if(agreed.data?.state==='agreed_private'){
                    const prepared=await db.rpc('cotironda_piloto_prepare_document_mvp099',{
                      p_message_hmac:messageHash
                    });
                    if(prepared.error)console.warn('cotironda_document_preparation_reconciliation_required');
                    else if(prepared.data?.state==='prepared')
                      preparedDocumentSourceHmac=messageHash;
                    else if(prepared.data?.state!=='prepared'){
                      const missing=await db.rpc('cotironda_piloto_clarification_preview_mvp100',{
                        p_message_hmac:messageHash
                      });
                      if(!missing.error&&missing.data?.state==='needs_details'&&
                         typeof missing.data?.body==='string'){
                        aiReply='zone';
                        mediaClarificationBody=missing.data.body;
                      }
                    }
                  }
                }
                // If independent reads disagree, do not ask for material
                // edits based on uncorroborated data or send suppliers.
                if(!mediaClarificationBody&&proposal.delivery_city===null&&
                   proposal.lines.length>0)aiReply='zone';
                }
              }else if(proposal.kind==='supplier_quote'){
                // MVP291: no buyer/supplier prompts. The TWO independent
                // documentary readings must first agree on all material
                // names, quantities and units. SQL enumerates only prior
                // actually-delivered requests. AI suggests physical SKU
                // matches twice; deterministic margins and SQL own binding.
                if(verifiedSupplier&&centralSupplier&&trial.quote_link===true&&
                   !supplierQuotedId&&corroboration?.kind==='supplier_quote'&&
                   Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')==='true'){
                 const a=proposal.lines,b=corroboration.lines;
                 const sameMaterials=a.length===b.length&&a.every((line,i)=>
                   line.original_description===b[i]?.original_description&&
                   line.quantity===b[i]?.quantity&&
                   line.unit===b[i]?.unit);
                 if(sameMaterials){
                  const envModel=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
                  const auto=await correlacionAutomaticaMvp291({
                   enabled:true,webhookAuthenticated:true,
                   sourceHmac:messageHash,chatHmac:chatHash,
                   apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
                   model:envModel==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna',
                   rpc:async(name,params)=>{
                    const r=await db.rpc(name,params);
                    return {data:r.data,error:r.error};
                   }
                  });
                  if(auto.state==='reconciliation_required')
                   console.warn('cotironda_supplier_auto_correlation_reconciliation_required');
                 }
                }
                // A new unquoted file may match exactly one already-sent RFQ.
                // Quoted replies (including wrong quotes) always use MVP151.
                if(!quotedId&&verifiedSupplier&&!centralSupplier){
                  const match=await db.rpc('cotironda_piloto_autolink_unquoted_media_mvp155',{
                    p_message_hmac:messageHash,p_chat_hmac:chatHash
                  });
                  if(match.error)
                    console.warn('cotironda_supplier_unquoted_match_unavailable');
                }
                const receipt=await db.rpc('cotironda_piloto_record_supplier_media_mvp098',{
                  p_message_hmac:messageHash
                });
                if(receipt.error)console.warn('cotironda_supplier_media_reconciliation_required');
                else if(receipt.data?.state==='stored_unverified'){
                  supplierAckMode='media_quote';
                  // Both calls already analyzed the exact archived bytes.
                  // A failed/missing second reading is logged as needing
                  // source review, never retried or treated as a valid price.
                  const compared=await db.rpc('cotironda_piloto_compare_supplier_readings_mvp102',{
                    p_message_hmac:messageHash,
                    p_second_proposal:corroboration
                  });
                  if(compared.error)
                    console.warn('cotironda_supplier_corroboration_reconciliation_required');
                  else if(compared.data?.state==='model_readings_match'){
                    // Exact arithmetic only: this never upgrades a quote to
                    // source-verified or sends prices/rankings to buyers.
                    const amounts=await db.rpc('cotironda_piloto_audit_supplier_amounts_mvp103',{
                      p_message_hmac:messageHash
                    });
                    if(amounts.error)
                      console.warn('cotironda_supplier_amount_audit_reconciliation_required');
                    else if(['balanced','difference','needs_review'].includes(
                      amounts.data?.state)){
                      // Independent original-source coverage. DOCX and XLSX need
                      // conservative ZIP/XML corroboration; PDF/photos still
                      // require review rather than trusting two model reads.
                      const checked=downloadedForReview.mime==='application/pdf'
                        ?await checkSupplierPdfSource(downloadedForReview,proposal)
                        :downloadedForReview.mime.startsWith('image/')
                          ?await checkSupplierImageSourceMvp251(
                            downloadedForReview,proposal,corroboration)
                        :downloadedForReview.mime.includes(
                          'openxmlformats-officedocument')
                          ?await checkSupplierOfficeSource(downloadedForReview,proposal)
                          :checkSupplierTextSource(downloadedForReview,proposal);
                      const savedCheck=await db.rpc(
                        'cotironda_piloto_record_supplier_source_check_mvp106',{
                          p_message_hmac:messageHash,
                          p_source_sha256:downloadedForReview.sha256,
                          p_state:checked.state,p_reason:checked.reason,
                          p_line_count:proposal.lines.length
                        });
                      if(savedCheck.error)
                        console.warn('cotironda_supplier_source_check_reconciliation_required');
                      else if(savedCheck.data?.state==='source_text_covered'&&
                              amounts.data?.state==='balanced'){
                        // Publish only source-vetted economic figures under
                        // narrowly scoped pilot privacy and consent gates.
                        // PDF/image and unsupported Office layouts stay private.
                        const published=await db.rpc(
                          'cotironda_piloto_publish_source_text_mvp107',{
                            p_message_hmac:messageHash
                          });
                        if(published.error)
                          console.warn('cotironda_supplier_anonymous_projection_reconciliation_required');
                        // El documento pasó lector PDF/Office/TXT independiente,
                        // HASH binario, doble lectura y conciliación económica.
                        // SQL acredita nuevamente invitación, empresa y ronda.
                        // Activación adicional OFF por defecto. Sin WhatsApp.
                        if(!published.error&&
                           ['published_anonymous','already_published'].includes(
                             published.data?.state??'')&&
                           centralSupplier&&trial.quote_link===true&&
                           trial.quote_analysis===true&&
                           Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_DOCUMENT_QUOTE_ENABLED')==='true'){
                          const modelEnv=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL');
                          const model=modelEnv==='gpt-6.1-sol'?'gpt-6.1-sol':'gpt-6-luna';
                          const semantic=await procesarDocumentoCentralMvp245({
                            habilitado:true,webhookAutenticado:true,
                            messageHmac:messageHash,chatHmac:chatHash,
                            sha256:downloadedForReview.sha256,
                            mime:downloadedForReview.mime,
                            draft:proposal,comprobacion:checked,
                            apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
                            model,rpc:async(name,params)=>{
                              const r=await db.rpc(name,params);
                              return {data:r.data,error:r.error};
                            }
                          });
                          if(semantic.estado==='conciliacion_requerida')
                            console.warn('cotironda_document_commercial_reconciliation_required');
                        }
                      }
                    }
                  }
                }
              }
            }else{
              // The source remains stored; do not claim a usable extraction.
              console.warn('cotironda_media_proposal_reconciliation_required');
              throw Error('draft_persistence_failed');
            }
          }catch(err){
            // Structured internal telemetry; never log document bytes, model
            // responses, prices, supplier identity, provider HTTP body or key.
            const note=await db.rpc('cotironda_piloto_note_document_failure_mvp127',{
              p_message_hmac:messageHash,
              p_reason_code:documentFailureCode(err),
              p_phase:diagnosticPhase
            });
            if(note.error)console.warn('cotironda_doc_failure_telemetry_unavailable');
          }
        }
      }
    }
    }
  }
  // Clarifications are associated with exactly one outstanding,
  // consented document. Never reinterpret line numbers as quantities.
  let handledDocumentReply=false;
  if(row.type==='text'&&!handledCentralZoneReply&&
     ['needs_review','needs_zone'].includes(outcome(out.data))){
    const details=parseDocumentClarification(body);
    if(details){
      const linked=await db.rpc('cotironda_piloto_apply_clarification_mvp100',{
        p_chat_hmac:chatHash,p_reply_hmac:messageHash,
        p_city:details.city,p_changes:details.changes
      });
      if(linked.error)return json(503,'document_clarification_reconciliation_required');
      if(linked.data?.state==='applied'){
        handledDocumentReply=true;
        aiReply=null;
        const ready=await db.rpc('cotironda_piloto_prepare_document_mvp099',{
          p_message_hmac:linked.data.source_message_hmac
        });
        if(ready.error)console.warn('cotironda_document_context_promotion_reconciliation_required');
        else if(ready.data?.state==='prepared')
          preparedDocumentSourceHmac=linked.data.source_message_hmac;
      }
    }
  }
  // A bare locality reply remains accepted for buyers who only owe a city.
  if(row.type==='text'&&!handledDocumentReply&&!handledCentralZoneReply&&
     ['needs_review','needs_zone'].includes(outcome(out.data))){
    const zone=standaloneDeliveryCity(body);
    if(zone){
      const linked=await db.rpc('cotironda_piloto_attach_zone_to_document_mvp097',{
        p_chat_hmac:chatHash,p_message_hmac:messageHash,p_city:zone
      });
      if(linked.error)return json(503,'zone_context_reconciliation_required');
      if(linked.data?.state==='city_attached'){
        aiReply=null;
        // Use its existing dual agreement, not a third model call.
        // Promotion is one-time, only when every requested unit and product
        // is explicit. An ambiguous document remains private.
        const ready=await db.rpc('cotironda_piloto_prepare_document_mvp099',{
          p_message_hmac:linked.data?.source_message_hmac??''
        });
        if(ready.error)console.warn('cotironda_document_zone_promotion_reconciliation_required');
        else if(ready.data?.state==='prepared')
          preparedDocumentSourceHmac=linked.data.source_message_hmac;
      }
      else if(linked.data?.state==='no_pending_document'){
        // A text-only buyer request can also be waiting for this locality.
        // Read only the ONE encrypted previous message that already received
        // an API-accepted zone question; never infer arbitrary chat history.
        const pending=await db.rpc('cotironda_piloto_text_zone_candidate_mvp122',{
          p_chat_hmac:chatHash,p_reply_hmac:messageHash
        });
        if(pending.error)return json(503,'text_zone_candidate_unavailable');
        const source=pending.data;
        if(source?.state==='pending'&&
          typeof source.source_hmac==='string'&&
          typeof source.nonce==='string'&&
          typeof source.ciphertext==='string'&&
          typeof source.sha256==='string'){
          let original:string|null=null;
          try{
            original=await decryptArchivedText(sec.aes,
              source.nonce,source.ciphertext,
              chatHash+'|'+source.source_hmac+'|text');
          }catch{/* Invalid auth tag, wrong key or damaged envelope: fail closed. */}
          if(original&&await sha(original)===source.sha256){
            const prior=parseBuyerPilot(original);
            const completed={...prior,city:zone};
            // Original lines must independently parse without ambiguity.
            // A missing zone is the ONLY field allowed to be filled here.
            if(prior.city===null&&canPrepareBuyerPilot(completed)){
              const promoted=await db.rpc(
                'cotironda_piloto_complete_text_zone_mvp122',{
                  p_chat_hmac:chatHash,p_reply_hmac:messageHash,
                  p_source_hmac:source.source_hmac,p_original_text:original,
                  p_city:zone,p_items:completed.items
                });
              if(promoted.error)return json(503,'text_zone_promotion_unavailable');
              if(promoted.data?.state==='prepared'){
                aiReply=null;
                preparedDocumentSourceHmac=source.source_hmac;
              }
            }
          }
        }
      }
    }
  }
  // The model picks an intent, never an outgoing message. A business
  // reply is pulled only from approved text, within an independent SQL
  // lease and rate limit, after receiving the authenticated message.
  if(aiReply&&sec.outbound&&
     (row.type==='text'||((row.type==='image'||row.type==='document')
       &&aiReply==='zone'))&&
     Deno.env.get('COTIRONDA_PILOT_AI_REPLIES_ENABLED')==='true'&&
     ['needs_zone','needs_review'].includes(outcome(out.data))){
    const reserve=row.type==='text'
      ?await db.rpc('cotironda_piloto_reserve_reply_mvp094',{
        p_message_hmac:messageHash,p_chat_hmac:chatHash,p_reply_code:aiReply
       })
      :(mediaClarificationBody
        ?await db.rpc('cotironda_piloto_reserve_clarification_mvp100',{
          p_message_hmac:messageHash,p_chat_hmac:chatHash
         })
        :await db.rpc('cotironda_piloto_reserve_document_zone_reply_mvp097',{
          p_message_hmac:messageHash,p_chat_hmac:chatHash
         }));
    if(!reserve.error&&reserve.data===true){
      let state:'api_accepted'|'uncertain'='uncertain';
      try{
        const response=await fetch('https://gate.whapi.cloud/messages/text',{
          method:'POST',headers:{Authorization:'Bearer '+sec.token,
            'Content-Type':'application/json'},
          body:JSON.stringify({to:row.chat_id,
            body:mediaClarificationBody??shortBusinessReply(aiReply)}),
          signal:AbortSignal.timeout(12000)
        });
        const body=response.ok?await response.json().catch(()=>null):null;
        if(response.ok&&body&&typeof body==='object'&&
          (body as Record<string,unknown>).sent===true)
          state='api_accepted';
      }catch{/* delivery unknown, no duplicate retry */}
      const finished=await db.rpc('cotironda_piloto_finish_reply_mvp094',{
        p_message_hmac:messageHash,p_state:state
      });
      if(finished.error)return json(503,'reply_reconciliation_required');
    }
  }
  // Send ONE tracking link to the authenticated buyer who just created a
  // genuine new round. The URL fragment avoids token leakage in GET logs.
  // Never send a link on replay, unrelated text, quote, or enrolment.
  const trackingSourceHmac=preparedDocumentSourceHmac??
   (row.type==='text'&&outcome(out.data)==='recorded'&&
    canPrepareBuyerPilot(parsed)?messageHash:null);
  if(sec.outbound&&trackingSourceHmac){
   const rand=crypto.getRandomValues(new Uint8Array(32));
   const token=toHex(rand.buffer);
   const tokenHash=await sha(token);
   const issue=await db.rpc('cotironda_piloto_issue_tracking_mvp091',{
    p_buyer_chat_hmac:chatHash,p_source_hmac:trackingSourceHmac,p_token_hash:tokenHash
   });
   if(issue.error)return json(503,'tracking_unavailable');
   if(issue.data?.state==='issued'){
    const link=crearEnlacePrivadoSeguimientoMvp212(token);
    if(link===null)return json(503,'tracking_link_invalid');
    // Buyer chat comes from a Whapi-signed inbound event; the SQL issue
    // independently proves buyer role, consent and source message ownership.
    try{
     const response=await fetch('https://gate.whapi.cloud/messages/text',{
      method:'POST',headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({to:row.chat_id,
       body:'Cotironda ya tiene los datos de tu pedido. Ahora nos encargamos de reunir las mejores cotizaciones. Seguí el avance acá: '+
        link+'\nLos presupuestos se mantienen cerrados hasta que termine el plazo.'}),
      signal:AbortSignal.timeout(12000)
     });
     const sent=response.ok?await response.json().catch(()=>null):null;
     const accepted=Boolean(response.ok&&sent&&typeof sent==='object'&&
        (sent as Record<string,unknown>).sent===true);
     const sentRecord=accepted?sent as Record<string,unknown>:null;
     const message=sentRecord?.message;
     const candidate=sentRecord?.message_id??
       (message&&typeof message==='object'?
        (message as Record<string,unknown>).id:null);
     const id=typeof candidate==='string'&&
       /^[A-Za-z0-9_-]{8,160}$/u.test(candidate)?candidate:null;
     const finish=await db.rpc('cotironda_piloto_finish_tracking_mvp091',{
       p_token_hash:tokenHash,p_state:accepted?'api_accepted':'uncertain'
     });
     if(finish.error||finish.data!==true)
      return json(503,'tracking_reconciliation_required');
     if(accepted&&id){
      const recorded=await db.rpc('cotironda_piloto_record_tracking_id_mvp119',{
       p_token_hash:tokenHash,p_whapi_message_id:id});
      if(recorded.error||recorded.data!==true)
       return json(503,'tracking_delivery_id_unavailable');
     }
    }catch{
     await db.rpc('cotironda_piloto_finish_tracking_mvp091',{
       p_token_hash:tokenHash,p_state:'uncertain'});
     // No automatic retry: unknown Whapi delivery is not safe to duplicate.
    }
   }
  }
 // Preguntar una única vez por la ronda, sin contactar compradores.
 // SQL valida remitente, consentimiento, cuota y fuente irresuelta.
 // OFF por defecto: habilitación separada para la prueba WhatsApp.
 if(clarificationSourceHmac&&
    // Zero-friction MVP291: never ask supplier/client to pick a round.
    // Source stays private if AI evidence cannot distinguish requests.
    Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')!=='true'&&
    sec.outbound&&trial.quote_link===true&&
    Deno.env.get('COTIRONDA_PILOT_AMBIGUITY_PROMPTS_ENABLED')==='true'){
   const reserved=await db.rpc('cotironda_piloto_ia_reserve_clarification_mvp239',{
     p_source_hmac:clarificationSourceHmac,p_chat_hmac:chatHash
   });
   if(reserved.error)return json(503,'ai_supplier_clarification_reservation_unavailable');
   if(reserved.data?.state==='reserved'){
     let sendState:'api_accepted'|'uncertain'='uncertain';
     try{
       const response=await fetch('https://gate.whapi.cloud/messages/text',{
         method:'POST',headers:{Authorization:'Bearer '+sec.token,
           'Content-Type':'application/json'},
         body:JSON.stringify({to:row.chat_id,body:CONSULTA_RONDA_MVP239}),
         signal:AbortSignal.timeout(12000)
       });
       if(response.ok){
         const data=await response.json().catch(()=>null);
         if(data&&typeof data==='object'&&
            (data as Record<string,unknown>).sent===true)
           sendState='api_accepted';
       }
     }catch{/* entrega incierta: no reintentar nunca automáticamente */}
     const finished=await db.rpc('cotironda_piloto_ia_finish_clarification_mvp239',{
       p_source_hmac:clarificationSourceHmac,p_state:sendState
     });
     if(finished.error||finished.data?.state!=='recorded')
       return json(503,'ai_supplier_clarification_finish_unavailable');
   }else if(!['already_reserved','disabled','not_eligible','daily_quota']
      .includes(reserved.data?.state))
     return json(503,'ai_supplier_clarification_reserve_invalid');
  }
 // Acknowledge a supplier ONLY after their authenticated quote was
 // durably captured. Media receipt is explicitly pending source review.
 // One ledger reservation per message; uncertain Whapi results never retry.
 if(sec.outbound&&supplierAckMode){
  const reserved=await db.rpc('cotironda_piloto_reserve_supplier_ack_mvp104',{
   p_message_hmac:messageHash,p_chat_hmac:chatHash,p_mode:supplierAckMode
  });
  if(reserved.error)return json(503,'supplier_ack_reservation_unavailable');
  if(reserved.data===true){
   let ackState:'api_accepted'|'uncertain'='uncertain';
   let ackWhapiId:string|null=null;
   try{
    const response=await fetch('https://gate.whapi.cloud/messages/text',{
     method:'POST',headers:{Authorization:'Bearer '+sec.token,
      'Content-Type':'application/json'},
     body:JSON.stringify({to:row.chat_id,
      body:'¡Gracias! Recibimos tu presupuesto. Lo estamos procesando en Cotironda.'}),
     signal:AbortSignal.timeout(12000)
    });
    const value=response.ok?await response.json().catch(()=>null):null;
    if(response.ok&&value&&typeof value==='object'&&
      (value as Record<string,unknown>).sent===true){
      ackState='api_accepted';
      const obj=value as Record<string,unknown>,msg=obj.message;
      const id=obj.message_id??(msg&&typeof msg==='object'?
       (msg as Record<string,unknown>).id:null);
      if(typeof id==='string'&&/^[A-Za-z0-9_-]{8,160}$/u.test(id))
       ackWhapiId=id;
    }
   }catch{/* uncertain is terminal until manual delivery reconciliation */}
   const finished=await db.rpc('cotironda_piloto_finish_supplier_ack_mvp104',{
    p_message_hmac:messageHash,p_state:ackState
   });
   if(finished.error||finished.data!==true)
    return json(503,'supplier_ack_reconciliation_required');
   if(ackState==='api_accepted'&&ackWhapiId){
    const recorded=await db.rpc('cotironda_piloto_record_supplier_ack_id_mvp119',{
     p_message_hmac:messageHash,p_whapi_message_id:ackWhapiId});
    if(recorded.error||recorded.data!==true)
     return json(503,'supplier_ack_delivery_id_unavailable');
   }
  }
 }
 }
 try{await dispatchTwo(sec,db)}catch{return json(503,'dispatch_reconciliation_required')}
 // Fuente firmada + lista real de proveedores + doble gate OFF por defecto.
 // Solo despacha un pedido YA preparado por SQL, sin reinterpretar materiales.
 if(sec.outbound&&trialDispatchChats.size>0){
  for(const signedChat of trialDispatchChats){
   const ready=await db.rpc('cotironda_piloto_ia_ready_for_chat_mvp223',{
    p_buyer_chat_hmac:signedChat
   });
   if(ready.error)return json(503,'ai_central_lookup_unavailable');
   if(ready.data?.state==='disabled'||ready.data?.state==='empty')continue;
   if(ready.data?.state==='ambiguous')continue;
   if(ready.data?.state!=='ready'||typeof ready.data.request_id!=='string')
    return json(503,'ai_central_lookup_inconsistent');
   const result=await despacharSolicitudCentralMvp223({
    enabled:true,requestId:ready.data.request_id,
    recipients:sec.recipients,maxJobs:2,
    resolveRecipient:sec.dynamicRecipients
      ?async lease=>resolverDestinatarioMvp313(lease,{
        hmacKey:sec.key,aesKey:sec.aes,channel:sec.channel
       },async(name,params)=>{
        const response=await db.rpc(name,params);
        return {data:response.data,error:response.error};
       }):undefined,
    rpc:async(name,params)=>{
     const response=await db.rpc(name,params);
     return {data:response.data,error:response.error};
    },
    authorizeChatHmac:async(recipient,expectedHash)=>{
     const computed=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
       '|'+recipient+'@s.whatsapp.net');
     return equalSecret(computed,expectedHash);
    },
    createPdf:generarSolicitudPdfMvp091,
    sendWhapi:async(recipient,pdf)=>{
     const response=await fetch('https://gate.whapi.cloud/messages/document',{
      method:'POST',
      headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({
       to:recipient,media:'data:application/pdf;name=Solicitud-Cotironda.pdf;base64,'+b64(pdf),
       mime_type:'application/pdf',filename:'Solicitud-Cotironda.pdf',
       caption:CAPTION_PEDIDO_COTIRONDA_MVP305
      }),
      signal:AbortSignal.timeout(12000)
     });
     const payload=response.ok?await response.json().catch(()=>null):null;
     const value=payload&&typeof payload==='object'?
       payload as Record<string,unknown>:null;
     const message=value?.message&&typeof value.message==='object'?
       value.message as Record<string,unknown>:null;
     const id=value?.message_id??message?.id??value?.id;
     return {accepted:response.ok&&value?.sent===true,
      messageId:typeof id==='string'?id:null};
    }
   });
   if(result.estado==='requiere_conciliacion')
    return json(503,'ai_central_dispatch_reconciliation_required');
  }
 }

 // MVP289: supplier dispatch finishes before the buyer link. SQL revalidates
 // all jobs and locks a single tracking token per request.
 for(const notice of buyerLinkRequests){
  if(!sec.outbound||Deno.env.get('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED')==='false')continue;
  // D016 reemplaza al aviso MVP289, no envía ambos en el mismo evento.
  if(Deno.env.get('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')==='true'){
   const access=await notificarAccesoWhatsappD016({
    enabled:true,webhookAutenticado:true,compradorVerificado:true,
    ...notice,
    portalOrigin:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_ORIGIN')??'',
    portalSha:Deno.env.get('COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA')??'',
    approvedSha:Deno.env.get('COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA')??'',
    hmacKeyHex:Deno.env.get('COTIRONDA_PILOT_D016_HMAC_KEY_HEX')??'',
    rpc:async(name,params)=>{
     const r=await db.rpc(name,params);
     return {data:r.data,error:r.error};
    },
    authorizeChat:async(recipient,expectedChatHmac)=>{
     if(recipient!==notice.recipient)return false;
     const calculated=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+
      '|'+recipient);
     return equalSecret(calculated,expectedChatHmac);
    },
    send:async(recipient,body)=>{
     if(recipient!==notice.recipient)throw Error('d016_buyer_chat_changed');
     const response=await fetch('https://gate.whapi.cloud/messages/text',{
      method:'POST',headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({to:recipient,body}),signal:AbortSignal.timeout(12000)
     });
     const payload=response.ok?await response.json().catch(()=>null):null;
     const value=payload&&typeof payload==='object'?
      payload as Record<string,unknown>:null;
     const nested=value?.message&&typeof value.message==='object'?
      value.message as Record<string,unknown>:null;
     const id=value?.message_id??nested?.id??value?.id;
     return {accepted:response.ok&&value?.sent===true,
      messageId:typeof id==='string'?id:null};
    }
   });
   if(access.estado==='conciliacion_requerida')
    return json(503,'buyer_d016_link_reconciliation_required');
   continue;
  }
  const result=await notificarSeguimientoMvp289({
   enabled:true,buyerVerified:true,...notice,
   rpc:async(name,params)=>{
    const r=await db.rpc(name,params);
    return {data:r.data,error:r.error};
   },
   send:async(recipient,body)=>{
    if(recipient!==notice.recipient)throw Error('buyer_tracking_recipient_changed');
    const response=await fetch('https://gate.whapi.cloud/messages/text',{
     method:'POST',headers:{Authorization:'Bearer '+sec.token,
      'Content-Type':'application/json'},
     body:JSON.stringify({to:recipient,body}),
     signal:AbortSignal.timeout(12000)
    });
    const value=response.ok?await response.json().catch(()=>null):null;
    const obj=value&&typeof value==='object'?value as Record<string,unknown>:null;
    const nested=obj?.message&&typeof obj.message==='object'?
     obj.message as Record<string,unknown>:null;
    const id=obj?.message_id??nested?.id??null;
    return {accepted:response.ok&&obj?.sent===true,
     messageId:typeof id==='string'?id:null};
   }
  });
  if(result.estado==='conciliacion_requerida')
   return json(503,'buyer_tracking_reconciliation_required');
 }
 // Opportunistic recovery needs a signed Whapi event, an already-consented
 // pilot participant and a DB-leased private file. Never block the user reply
 // and NEVER send supplier invitations or expose source bytes.
 if(recoveryTriggerHmac&&Deno.env.get('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED')==='true'){
  const triggerChatHmac=recoveryTriggerHmac;
  try{
   EdgeRuntime.waitUntil(recoverOneStoredDocument({
    triggerChatHmac,apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
    enabled:true,
    // A recovery ACK is only for a NEW, consented supplier document in
    // a round created after the DB activation barrier. No historical
    // backfill and no resend of uncertain Whapi delivery.
    onSupplierReceipt:async(messageHmac)=>{
     if(!sec.outbound||!recoveryTriggerChatId||
        Deno.env.get('COTIRONDA_PILOT_DEFERRED_SUPPLIER_ACK_ENABLED')!=='true')
       return;
     await sendDeferredSupplierAckMvp181({
      enabled:true,messageHmac,triggerChatHmac,
      recipientChatId:recoveryTriggerChatId,
      io:{
       rpc:async(name,params)=>{
        const r=await db.rpc(name,params);
        return {data:r.data,error:r.error};
       },
       sendText:async(to,body)=>{
        const response=await fetch('https://gate.whapi.cloud/messages/text',{
         method:'POST',headers:{Authorization:'Bearer '+sec.token,
          'Content-Type':'application/json'},
         body:JSON.stringify({to,body}),signal:AbortSignal.timeout(12000)
        });
        const data=response.ok?await response.json().catch(()=>null):null;
        const obj=data&&typeof data==='object'?
         data as Record<string,unknown>:null;
        const message=obj?.message&&typeof obj.message==='object'?
         obj.message as Record<string,unknown>:null;
        const id=obj?.message_id??message?.id;
        return {sent:response.ok&&obj?.sent===true,
         id:typeof id==='string'?id:null};
       }
      }
     });
    },
    io:{
     rpc:async(name,params)=>{
      const r=await db.rpc(name,params);
      return {data:r.data,error:r.error};
     },
     download:async(path)=>{
      const r=await db.storage.from('cotironda-piloto-originals').download(path);
      return {data:r.data,error:r.error};
     }
    }
   }).then(()=>undefined).catch(()=>undefined));
  }catch{
   console.warn('cotironda_private_document_background_unavailable');
  }
 }
 return json(200,'accepted');
}
declare const EdgeRuntime:{waitUntil(p:Promise<unknown>):void};
Deno.serve(req=>respond(req).catch((err)=>{
 // Never include messages, request bodies, headers, tokens or recipient identities in logs.
 console.error('cotironda_pilot_unexpected:',err instanceof Error?err.name:'unknown');
 return json(503,'temporarily_unavailable');
}));

/** MVP-073 native Whapi webhook for isolated Supabase pilot.
 * Fail-closed until Edge secrets + DB inbound flag are configured.
 * No WhatsApp outgoing; no tokens or phones in source.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {parseBuyerPilot,canPrepareBuyerPilot,validMessage} from './core.ts';
import {generarSolicitudPdfMvp091} from './request-pdf.ts';
import {makeMediaManifest} from './media-intake.ts';
import {getVerifiedWhapiMedia,storeVerifiedMedia} from './whapi-media-archive.ts';
import {interpretPilotBuyerWithAI} from './ai-interpreter.ts';
import {decidePilotAIAction,shortBusinessReply,type ReplyCode} from './business-ai-policy.ts';
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
 const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 let recipients:Record<string,string>={};
 if(outbound){
  if(token.length<16||token.length>300){
   console.warn('cotironda_pilot_config: outbound_token_missing');
   return null;
  }
  try{
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
 const key=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const aes=await crypto.subtle.importKey('raw',rawAes,'AES-GCM',false,['encrypt']);
 return {key,aes,channel,webhookSecret,url,roleKey,outbound,token,recipients};
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
 if(!sec.outbound)return;
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
       caption:'Cotironda · Nueva solicitud de cotización'}),
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
 // Whapi checks liveness without forwarding custom headers. A no-op has
 // absolutely no side effects: no database client, message, dispatch or invite.
 // The response does not prove that authenticated incoming messages work.
 if(!actionable){
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
 if(!Array.isArray(event.messages)||event.messages.length<1||event.messages.length>10)
  return json(422,'invalid_batch');
 const ids=new Set<string>();
 const now=Math.floor(Date.now()/1000);
 const db=client(sec);
 for(const row of event.messages){
  if(row&&typeof row==='object'&&(row as Record<string,unknown>).from_me===true)continue;
  if(!validMessage(row,now))return json(422,'invalid_message');
  if(ids.has(row.id))return json(422,'duplicate_batch');
  ids.add(row.id);
  const chatHash=await hmac(sec.key,'cotironda|pilot|chat|'+sec.channel+'|'+row.chat_id);
  const messageHash=await hmac(sec.key,'cotironda|pilot|msg|'+sec.channel+'|'+row.id);
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
  const enroll=row.type==='text'?body.trim().match(/^COTI ALTA ([a-f0-9]{32})$/iu):null;
  if(enroll){
   const out=await db.rpc('cotironda_piloto_enroll_whapi_v1',
    {p_code:enroll[1].toLowerCase(),p_chat_hmac:chatHash});
   if(out.error)return json(503,'storage_unavailable');
   continue;
  }
  const textHash=await sha(body);
  const c=await encrypt(sec.aes,body,chatHash+'|'+messageHash+'|'+row.type);
  const local=row.type==='text'?parseBuyerPilot(body):{city:null,items:[],unresolved:[]};
  let parsed=local;
  let aiReply:ReplyCode|null=null;
  // OpenAI is optional and off by default. The server-side DB gate is
  // durable, one-per-HMAC, buyer-only and capped at 12 calls per day.
  // Supplier quote ingestion never passes through this classifier.
  if(row.type==='text'&&
     Deno.env.get('COTIRONDA_PILOT_AI_ENABLED')==='true'){
    const preflight=await db.rpc('cotironda_piloto_reserve_ai_mvp094',{
      p_chat_hmac:chatHash,p_message_hmac:messageHash
    });
    if(preflight.error){
      // Fail closed, not a silent inference using an unvalidated identity.
      parsed={city:local.city,items:[],unresolved:['ai_unavailable']};
    }else if(preflight.data===true){
      try{
        const model=await interpretPilotBuyerWithAI({
          text:body,apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
          enabled:true
        });
        const decision=decidePilotAIAction(body,model,'buyer');
        aiReply=decision.replyCode;
        if(decision.action==='ready_to_distribute'&&decision.parsed){
          parsed=decision.parsed;
        }else{
          // A question/greeting/uncertain extraction is not a request.
          // The original is still encrypted and stored by receive_whapi.
          parsed={city:local.city??'sin solicitud',items:[],
            unresolved:[decision.reason]};
        }
      }catch{
        // No automatic retry; preserve original and request review instead
        // of generating a partly understood invitation.
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
   p_city:parsed.city,p_items:canPrepareBuyerPilot(parsed)?parsed.items:null
  });
  if(out.error)return json(503,'storage_unavailable');
  if(!['recorded','duplicate','unrecognized_contact','needs_zone',
       'needs_review','quote_recorded','unmatched_quote'].includes(outcome(out.data)))
   return json(503,'storage_unavailable');
  // Archive original incoming PDF, Excel, Word or photo ONLY after
  // committed authenticated inbox and supplier/buyer consent SQL check.
  // No interpretation can distribute until independently reviewed.
  if(row.type!=='text'&&media?.state==='awaiting_secure_download'&&
     outcome(out.data)==='needs_review'&&
     Deno.env.get('COTIRONDA_PILOT_MEDIA_ARCHIVE_ENABLED')==='true'){
    const reservation=await db.rpc('cotironda_piloto_reserve_media_mvp095',{
      p_message_hmac:messageHash,p_chat_hmac:chatHash,
      p_media_id_sha256:await sha(media.media_id),p_mime:media.mime
    });
    if(reservation.error)return json(503,'media_reservation_unavailable');
    if(reservation.data===true){
      let status:'stored'|'uncertain'='uncertain';
      let contentHash:string|null=null,contentSize:number|null=null;
      try{
        const downloaded=await getVerifiedWhapiMedia({
          manifest:media,token:sec.token
        });
        await storeVerifiedMedia(db.storage,messageHash,downloaded);
        contentHash=downloaded.sha256;
        contentSize=downloaded.bytes.length;
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
    }
  }
  // The model picks an intent, never an outgoing message. A business
  // reply is pulled only from approved text, within an independent SQL
  // lease and rate limit, after receiving the authenticated message.
  if(aiReply&&sec.outbound&&row.type==='text'&&
     Deno.env.get('COTIRONDA_PILOT_AI_REPLIES_ENABLED')==='true'&&
     ['needs_zone','needs_review'].includes(outcome(out.data))){
    const reserve=await db.rpc('cotironda_piloto_reserve_reply_mvp094',{
     p_message_hmac:messageHash,p_chat_hmac:chatHash,p_reply_code:aiReply
    });
    if(!reserve.error&&reserve.data===true){
      let state:'api_accepted'|'uncertain'='uncertain';
      try{
        const response=await fetch('https://gate.whapi.cloud/messages/text',{
          method:'POST',headers:{Authorization:'Bearer '+sec.token,
            'Content-Type':'application/json'},
          body:JSON.stringify({to:row.chat_id,body:shortBusinessReply(aiReply)}),
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
  if(sec.outbound&&row.type==='text'&&outcome(out.data)==='recorded'&&
     canPrepareBuyerPilot(parsed)){
   const rand=crypto.getRandomValues(new Uint8Array(32));
   const token=toHex(rand.buffer);
   const tokenHash=await sha(token);
   const issue=await db.rpc('cotironda_piloto_issue_tracking_mvp091',{
    p_buyer_chat_hmac:chatHash,p_source_hmac:messageHash,p_token_hash:tokenHash
   });
   if(issue.error)return json(503,'tracking_unavailable');
   if(issue.data?.state==='issued'){
    const link='https://'+REF+
     '.supabase.co/functions/v1/cotironda-piloto-seguimiento#'+token;
    // Buyer chat comes from a Whapi-signed inbound event; the SQL issue
    // independently proves buyer role, consent and source message ownership.
    try{
     const response=await fetch('https://gate.whapi.cloud/messages/text',{
      method:'POST',headers:{Authorization:'Bearer '+sec.token,
       'Content-Type':'application/json'},
      body:JSON.stringify({to:row.chat_id,
       body:'Cotironda recibió tu solicitud. Seguís las cotizaciones acá: '+
        link+'\nLos presupuestos se mantienen cerrados hasta que termine el plazo.'}),
      signal:AbortSignal.timeout(12000)
     });
     const sent=response.ok?await response.json().catch(()=>null):null;
     const accepted=Boolean(response.ok&&sent&&typeof sent==='object'&&
        (sent as Record<string,unknown>).sent===true);
     const finish=await db.rpc('cotironda_piloto_finish_tracking_mvp091',{
       p_token_hash:tokenHash,p_state:accepted?'api_accepted':'uncertain'
     });
     if(finish.error)return json(503,'tracking_reconciliation_required');
    }catch{
     await db.rpc('cotironda_piloto_finish_tracking_mvp091',{
       p_token_hash:tokenHash,p_state:'uncertain'});
     // No automatic retry: unknown Whapi delivery is not safe to duplicate.
    }
   }
  }
 }
 try{await dispatchTwo(sec,db)}catch{return json(503,'dispatch_reconciliation_required')}
 return json(200,'accepted');
}
Deno.serve(req=>respond(req).catch((err)=>{
 // Never include messages, request bodies, headers, tokens or recipient identities in logs.
 console.error('cotironda_pilot_unexpected:',err instanceof Error?err.name:'unknown');
 return json(503,'temporarily_unavailable');
}));

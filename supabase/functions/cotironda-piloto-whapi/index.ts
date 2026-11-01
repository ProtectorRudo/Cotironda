/** MVP-073 native Whapi webhook for isolated Supabase pilot.
 * Fail-closed until Edge secrets + DB inbound flag are configured.
 * No WhatsApp outgoing; no tokens or phones in source.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {parseBuyerPilot,validMessage} from './core.ts';
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
}>;
async function secrets():Promise<Secrets|null>{
 if(Deno.env.get('COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED')!=='true')
  return null;
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
  }catch{return null}
 }
 if(webhookSecret.length<32||webhookSecret.length>256||
   !/^[A-Za-z0-9_-]{4,64}$/u.test(channel)||
   url!==('https://'+REF+'.supabase.co')||
   roleKey.length<20)return null;
 const raw=fromHex(keyRaw),rawAes=fromHex(aesRaw);
 if(!raw||!rawAes||keyRaw===aesRaw)return null;
 const key=await crypto.subtle.importKey('raw',raw,'HMAC',false,['sign']);
 const aes=await crypto.subtle.importKey('raw',rawAes,'AES-GCM',false,['encrypt']);
 return {key,aes,channel,webhookSecret,url,roleKey};
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
async function respond(req:Request):Promise<Response>{
 if(req.method!=='POST')return json(405,'method_not_allowed');
 const sec=await secrets();
 if(!sec)return json(503,'pilot_not_enabled');
 if(!equalSecret(req.headers.get('x-cotironda-webhook-key')??'',sec.webhookSecret))
  return json(401,'unauthorized');
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
 if(event.channel_id!==sec.channel)return json(403,'wrong_channel');
 const ev=event.event as Record<string,unknown>|undefined;
 if(!ev||ev.type!=='messages'||ev.event!=='post')return json(204,'ignored');
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
  const body=row.type==='text'?row.text!.body:'';
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
  const parsed=row.type==='text'?parseBuyerPilot(body):{city:null,items:[],unresolved:[]};
  const out=await db.rpc('cotironda_piloto_receive_whapi_v1',{
   p_chat_hmac:chatHash,p_message_hmac:messageHash,
   p_plaintext_sha256:textHash,p_kind:row.type,
   p_nonce_b64:c.nonce,p_ciphertext_b64:c.ciphertext,
   p_source_unix:row.timestamp,
   p_plaintext:body,
   p_city:parsed.city,p_items:parsed.items.length?parsed.items:null
  });
  if(out.error)return json(503,'storage_unavailable');
  if(!['recorded','duplicate','unrecognized_contact','needs_zone',
       'needs_review','quote_recorded','unmatched_quote'].includes(outcome(out.data)))
   return json(503,'storage_unavailable');
 }
 return json(200,'accepted');
}
Deno.serve(req=>respond(req).catch(()=>json(503,'temporarily_unavailable')));

/** MVP292 — one-record, authenticated INTERNAL archival recovery tick.
 * Isolated from Whapi webhook, no business phone, no outbound messages.
 * Must remain OFF until approved deployment + scheduled invocation plan.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {procesarPendienteAutomaticoMvp292} from '../cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
import {procesarTextoVinculadoMvp295} from '../cotironda-piloto-whapi/supplier-linked-text-replay-mvp295.ts';
import {authorizeRecoveryMvp294} from './internal-auth-mvp294.ts';
const REF='ilggkalaafhtiysyzlmg';
const URL='https://'+REF+'.supabase.co';
const json=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'}
});
const encoder=new TextEncoder();
const HEX=/^[a-f0-9]{64}$/u;
const W=/^[A-Za-z0-9+/=]{24,20000}$/u;
function hex(bytes:Uint8Array):string{
 return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
async function digest(text:string):Promise<string>{
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));
}
async function execute(req:Request):Promise<Response>{
 if(req.method!=='POST')return json(405,'method_not_allowed');
 if(Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED')!=='true'||
    Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')!=='true')
  return json(503,'worker_disabled');
 // Do NOT rely on gateway verify_jwt for sb_secret_ (not a JWT).
 // Strictly validate an INTERNAL admin credential PLUS the independent
 // recovery secret before reading documents or invoking billable models.
 if(!authorizeRecoveryMvp294({
  privateHeader:req.headers.get('x-cotironda-recovery-secret')??'',
  privateExpected:Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_SECRET')??'',
  apikeyHeader:req.headers.get('apikey')??'',
  authorizationHeader:req.headers.get('authorization')??'',
  legacyServiceRole:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
  secretKeysJson:Deno.env.get('SUPABASE_SECRET_KEYS')??''
 }))return json(401,'unauthorized');
 if(req.headers.get('content-length')&&
    Number(req.headers.get('content-length'))>100)
  return json(413,'payload_too_large');
 const url=Deno.env.get('SUPABASE_URL')??'';
 let role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!role){
  try{const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof keys.default==='string')role=keys.default;
  }catch{return json(503,'backend_configuration_invalid')}
 }
 const aesHex=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 const apiKey=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
 if(url!==URL||role.length<20||!HEX.test(aesHex)||
    apiKey.length<18)return json(503,'backend_configuration_invalid');
 const key=await crypto.subtle.importKey('raw',
  Uint8Array.from(aesHex.match(/.{2}/gu)!,n=>parseInt(n,16)),
  'AES-GCM',false,['decrypt']);
 const decrypt=async(nonce:string,ciphertext:string,aad:string):Promise<string>=>{
  if(!/^[A-Za-z0-9+/]{16}$/u.test(nonce)||!W.test(ciphertext))
   throw Error('invalid_cipher_envelope');
  const iv=Uint8Array.from(atob(nonce),c=>c.charCodeAt(0));
  const data=Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0));
  if(iv.length!==12||data.length<17||data.length>10000)
   throw Error('invalid_cipher_size');
  const plain=await crypto.subtle.decrypt({
   name:'AES-GCM',iv,additionalData:encoder.encode(aad),tagLength:128},
   key,data);
  return new TextDecoder('utf-8',{fatal:true}).decode(plain);
 };
 const db=createClient(url,role,{auth:{autoRefreshToken:false,
  persistSession:false},global:{headers:{'x-cotironda-pilot-edge':
  'cotironda-piloto-auto-recovery'}}});
 const model=Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL')==='gpt-6.1-sol'
  ?'gpt-6.1-sol':'gpt-6-luna';
 const outcome=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey,model,
  documentSemanticEnabled:Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_DOCUMENT_QUOTE_ENABLED')==='true',
  // MVP296: historical inline text analysis (MVP292) lacked the
  // mandatory MVP264 usage and MVP261 version controls. ALL historical
  // commercial analysis goes through the isolated metered MVP295 queue.
  textCommercialEnabled:false,
  shaText:digest,decrypt,
  rpc:async(name,params)=>{
   const r=await db.rpc(name,params);
   return {data:r.data,error:r.error};
  },
  download:async(path)=>{
   const r=await db.storage.from('cotironda-piloto-originals').download(path);
   return {data:r.data,error:r.error};
  }
 });
 if(outcome.state==='reconciliation_required')
  return json(503,'reconciliation_required');
 // On an EMPTY historical-correlation queue, consume at most ONE source
 // already linked by verified IA Central. Never re-read the same source
 // twice: SQL claim ledger + MVP227 review + MVP264 usage ledger.
 // MVP296: the three user-approved correlation/text/recovery controls are
 // the runtime enablement. The SQL claim independently requires the
 // existing IA Central control (MVP226) and consented source/round guards.
 // An additional, never-configured env flag would silently suppress
 // recovery even after an authenticated accepted scheduled tick.
 if(outcome.state==='empty'&&
    Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')==='true'&&
    Deno.env.get('COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED')==='true'&&
    Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED')==='true'){
  const commercial=await procesarTextoVinculadoMvp295({
   enabled:true,trustedInternalWorker:true,
   apiKey,model,rpc:async(name,params)=>{
    const r=await db.rpc(name,params);
    return {data:r.data,error:r.error};
   },decrypt,shaText:digest
  });
  if(commercial.state==='reconciliation_required')
   return json(503,'commercial_reconciliation_required');
  return json(200,commercial.state);
 }
 return json(200,outcome.state);
}
Deno.serve((req)=>execute(req).catch(()=>{
 // Never leak exception details or data from model, Storage or supplier.
 return json(503,'worker_internal_review');
}));

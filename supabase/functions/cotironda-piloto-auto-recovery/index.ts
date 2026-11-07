/** MVP292 — one-record, authenticated INTERNAL archival recovery tick.
 * Isolated from Whapi webhook, no business phone, no outbound messages.
 * Must remain OFF until approved deployment + scheduled invocation plan.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {procesarPendienteAutomaticoMvp292} from '../cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
const REF='ilggkalaafhtiysyzlmg';
const URL='https://'+REF+'.supabase.co';
const json=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'}
});
const encoder=new TextEncoder();
const HEX=/^[a-f0-9]{64}$/u;
const W=/^[A-Za-z0-9+/=]{24,20000}$/u;
function constantTimeMatch(a:string,b:string):boolean{
 const x=encoder.encode(a),y=encoder.encode(b);
 let difference=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)
  difference|=(x[i]??0)^(y[i]??0);
 return difference===0;
}
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
 const secret=Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_SECRET')??'';
 const header=req.headers.get('x-cotironda-recovery-secret')??'';
 // Constant-time check; NO JWT fallback, query token, browser cookie, or
 // credentials in logs. Cron scheduler holds a separate rotatable secret.
 if(secret.length<32||secret.length>256||
    !constantTimeMatch(header,secret))return json(401,'unauthorized');
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
  textCommercialEnabled:Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_SUPPLIER_QUOTE_ENABLED')==='true',
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
 return json(200,outcome.state);
}
Deno.serve((req)=>execute(req).catch(()=>{
 // Never leak exception details or data from model, Storage or supplier.
 return json(503,'worker_internal_review');
}));

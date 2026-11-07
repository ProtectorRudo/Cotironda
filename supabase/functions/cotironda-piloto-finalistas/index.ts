/**
 * MVP-110 — Isolated, authenticated, scheduled finalist WhatsApp worker.
 * NO send unless feature flag + external shared secret + DB opt-in all pass.
 * Never logs contact data, ciphertext, phone numbers or message bodies.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const REF='ilggkalaafhtiysyzlmg';
import {hex,decodeContacts,prepareMessage} from '../_shared/cotironda-finalist-notice.ts';
import {prepararPlanesPrivadosMvp197} from './plan-only-mvp197.ts';
import {verificarModoWorkerMvp209} from './worker-mode-mvp209.ts';
const te=new TextEncoder();
const textResponse=(status:number,code:string)=>new Response(JSON.stringify({state:code}),{
 status,headers:{'content-type':'application/json','cache-control':'no-store',
  'x-content-type-options':'nosniff'}});
async function equalDigest(a:string,b:string):Promise<boolean>{
 const [da,db]=await Promise.all([a,b].map(async s=>
  new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s)))));
 let diff=0;for(let i=0;i<da.length;i++)diff|=da[i]^db[i];
 return diff===0;
}
function isObj(x:unknown):x is Record<string,unknown>{
 return Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
}
async function run(req:Request):Promise<Response>{
 if(req.method!=='POST')return textResponse(405,'method_not_allowed');
 if(Deno.env.get('COTIRONDA_PILOT_FINALIST_WORKER_ENABLED')!=='true')
  return textResponse(503,'worker_off');
 // Never fall back to the literal MVP159 SQL selector. A missing v9
 // worker/migration flag must fail closed, with ZERO contact disclosure.
 if(Deno.env.get('COTIRONDA_PILOT_COMMERCIAL_SELECTOR_MVP196_ENABLED')!=='true')
  return textResponse(503,'commercial_selector_off');
 const mode=await verificarModoWorkerMvp209(req.headers,{
  planOnly:Deno.env.get('COTIRONDA_PILOT_FINALIST_PLAN_SECRET')??'',
  dispatch:Deno.env.get('COTIRONDA_PILOT_FINALIST_WORKER_SECRET')??''
 },equalDigest);
 if(mode===null)return textResponse(401,'unauthorized');
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{roleKey=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}').default??''}
  catch{return textResponse(503,'database_unavailable')}
 }
 // Source-only planning has no dependency on outbound, cipher keys or Whapi.
 if(url!=='https://'+REF+'.supabase.co'||roleKey.length<20)
  return textResponse(503,'database_unavailable');
 const db=createClient(url,roleKey,{auth:{
  persistSession:false,autoRefreshToken:false}});
 // Only SQL, no HTTP, for closure and queue setup.
 const closed=await db.rpc('cotironda_piloto_close_due_v1',{p_limit:25});
 if(closed.error)return textResponse(503,'close_reconciliation_required');
 // The old SQL planner compares literal strings/units, incorrectly
 // rejecting same-material 25kg vs 50kg. NEVER invoke it from this worker.
 const planned=await prepararPlanesPrivadosMvp197(async (name,args)=>{
  const result=await db.rpc(name,args);
  return {data:result.data,error:result.error};
 });
 if(planned.state!=='planned_no_whatsapp')
  return textResponse(503,planned.state);
 // The cron-only credential can NEVER enter the dispatch branch, even if
 // an administrator independently enables all dispatch/Whapi flags.
 // Only the stronger separate worker key can authorize that branch.
 if(mode==='plan_only')return new Response(JSON.stringify(planned),{
  status:200,headers:{'content-type':'application/json',
   'cache-control':'no-store','x-content-type-options':'nosniff'}
 });
 // Staging-first requirement: source plan materialization can be tested
 // independently, but network delivery MUST remain separately OFF.
 // This flag cannot be used until prospective consent, new-round E2E,
 // protected claim RPC and release authorization are independently proven.
 if(Deno.env.get('COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED')!=='true')
  return new Response(JSON.stringify(planned),{status:200,
   headers:{'content-type':'application/json','cache-control':'no-store',
    'x-content-type-options':'nosniff'}});
 // The additional OUTBOUND flag and secrets apply ONLY to the dispatch
 // path. Do not require any WhatsApp configuration during plan-only tests.
 if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')
  return textResponse(503,'dispatch_outbound_off');
 const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 const aesBytes=hex(Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'');
 const idBytes=hex(Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'');
 const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
 if(token.length<16||!aesBytes||!idBytes||!channel)
  return textResponse(503,'dispatch_config_unavailable');
 const aes=await crypto.subtle.importKey('raw',
  Uint8Array.from(aesBytes).buffer,'AES-GCM',false,['decrypt']);
 const idKey=await crypto.subtle.importKey('raw',
  Uint8Array.from(idBytes).buffer,{
   name:'HMAC',hash:'SHA-256'},false,['sign']);
 // Even with the independent dispatch flag ON, only plans produced by
 // the source-attested V196 transaction are eligible to enter the outbox.
 // The existing queue RPC still checks all parties' explicit opt-in.
 const dueQueue=await db.rpc('cotironda_piloto_commercial_queue_due_mvp196',{
  p_limit:10
 });
 if(dueQueue.error||!isObj(dueQueue.data)||
    dueQueue.data.state!=='queue_candidates'||
    !Array.isArray(dueQueue.data.requestIds)||
    dueQueue.data.requestIds.length>10)
  return textResponse(503,'commercial_queue_unavailable');
 for(const id of dueQueue.data.requestIds){
  if(typeof id!=='string')return textResponse(503,'invalid_queue_request');
  const allowed=await db.rpc('cotironda_piloto_source_plan_sendable_mvp196',{
   p_request:id
  });
  if(allowed.error||allowed.data!==true)
   return textResponse(503,'unverified_commercial_plan');
  const queued=await db.rpc('cotironda_piloto_queue_finalists_mvp110',{
   p_request:id
  });
  if(queued.error||!isObj(queued.data))
   return textResponse(503,'consented_queue_unavailable');
  if(!['queued','consent_or_contact_missing','outbound_disabled',
        'not_eligible'].includes(String(queued.data.state)))
   return textResponse(503,'consented_queue_rejected');
 }
 let accepted=0,uncertain=0;
 // Bounded 3 outbound attempts per invocation. Never blind-retry leased rows.
 for(let i=0;i<3;i++){
  const reserved=await db.rpc('cotironda_piloto_claim_finalist_whapi_mvp110');
  if(reserved.error)return textResponse(503,'claim_reconciliation_required');
  const claim=reserved.data;
  if(!isObj(claim)||claim.state==='outbound_disabled'||claim.state==='empty')
   break;
  if(claim.state!=='leased'||typeof claim.request_id!=='string'||
    typeof claim.recipient_key!=='string'||typeof claim.lease_token!=='string')
   return textResponse(503,'claim_invalid');
  const args={p_request:claim.request_id,p_recipient:claim.recipient_key,
   p_lease:claim.lease_token};
  // A legacy unverified plan may exist in the old outbox. Claimed rows
  // must carry the V196 immutable source marker or NO network request
  // is permitted; record 'uncertain' for manual reconciliation.
  const v196=await db.rpc('cotironda_piloto_source_plan_sendable_mvp196',{
   p_request:claim.request_id
  });
  if(v196.error||v196.data!==true){
   const rejected=await db.rpc('cotironda_piloto_finish_finalist_whapi_mvp110',{
    ...args,p_state:'uncertain',p_message_id:null
   });
   if(rejected.error||rejected.data!==true)
    return textResponse(503,'unverified_claim_reconciliation_required');
   uncertain++;
   continue;
  }

  let state:'api_accepted'|'uncertain'='uncertain';
  let messageId:string|null=null;
  try{
   const permission=await db.rpc('cotironda_piloto_authorize_finalist_whapi_mvp110',
    args);
   if(permission.error||!isObj(permission.data)||
     permission.data.state!=='authorized')
    throw Error('contact_not_authorized');
   const contacts=await decodeContacts(permission.data,aes,idKey,channel);
   const msg=prepareMessage(permission.data,contacts);
   // This is the only network attempt per leased row; unknown delivery
   // remains terminal 'uncertain' and requires manual reconciliation.
   const response=await fetch('https://gate.whapi.cloud/messages/text',{
    method:'POST',headers:{
      'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(msg),signal:AbortSignal.timeout(12000)});
   const body=response.ok?await response.json().catch(()=>null):null;
   if(response.ok&&isObj(body)&&body.sent===true){
    state='api_accepted';
    const m=isObj(body.message)?body.message:null;
    const id=m?.id??body.message_id??body.id;
    if(typeof id==='string')messageId=id.slice(0,160);
   }
  }catch{/* no PII, no automatic retry if delivery is uncertain */}
  const finished=await db.rpc('cotironda_piloto_finish_finalist_whapi_mvp110',{
   ...args,p_state:state,p_message_id:messageId
  });
  if(finished.error||finished.data!==true)
   return textResponse(503,'finish_reconciliation_required');
  if(state==='api_accepted')accepted++;else uncertain++;
 }
 return new Response(JSON.stringify({state:'processed',api_accepted:accepted,
  uncertain,details_exposed:false}),{
   status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
}
Deno.serve(req=>run(req).catch(()=>textResponse(503,'worker_unavailable')));

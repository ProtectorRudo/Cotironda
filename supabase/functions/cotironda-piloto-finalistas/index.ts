/**
 * MVP-110 — Isolated, authenticated, scheduled finalist WhatsApp worker.
 * NO send unless feature flag + external shared secret + DB opt-in all pass.
 * Never logs contact data, ciphertext, phone numbers or message bodies.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
const REF='ilggkalaafhtiysyzlmg';
import {hex,decodeContacts,prepareMessage} from '../_shared/cotironda-finalist-notice.ts';
import {seleccionarComercialmenteMvp196} from
 '../../../src/domain/seleccion-finalistas-v9-mvp196.ts';
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
 const provided=req.headers.get('x-cotironda-finalist-worker-secret')??'';
 const expected=Deno.env.get('COTIRONDA_PILOT_FINALIST_WORKER_SECRET')??'';
 if(expected.length<48||provided.length>256||
   !(await equalDigest(provided,expected)))
  return textResponse(401,'unauthorized');
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{roleKey=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}').default??''}
  catch{return textResponse(503,'database_unavailable')}
 }
 const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')??'';
 const aesBytes=hex(Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'');
 const idBytes=hex(Deno.env.get('COTIRONDA_PILOT_ID_HMAC_HEX')??'');
 const channel=Deno.env.get('COTIRONDA_PILOT_WHAPI_CHANNEL')??'';
 if(url!=='https://'+REF+'.supabase.co'||roleKey.length<20||
   token.length<16||!aesBytes||!idBytes||!channel||
   Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')
  return textResponse(503,'worker_config_unavailable');
 const aes=await crypto.subtle.importKey('raw',aesBytes,'AES-GCM',false,['decrypt']);
 const idKey=await crypto.subtle.importKey('raw',idBytes,{
  name:'HMAC',hash:'SHA-256'},false,['sign']);
 const db=createClient(url,roleKey,{auth:{
  persistSession:false,autoRefreshToken:false}});
 // Only SQL, no HTTP, for closure and queue setup.
 const closed=await db.rpc('cotironda_piloto_close_due_v1',{p_limit:25});
 if(closed.error)return textResponse(503,'close_reconciliation_required');
 // The old SQL planner compares literal strings/units, incorrectly
 // rejecting same-material 25kg vs 50kg. NEVER invoke it from this worker.
 const due=await db.rpc('cotironda_piloto_commercial_due_mvp196',{
  p_limit:10
 });
 if(due.error||!isObj(due.data)||due.data.state!=='candidate_due'||
    !Array.isArray(due.data.rounds)||due.data.rounds.length>10)
  return textResponse(503,'verified_planner_unavailable');
 let plans=0,ambiguous=0;
 for(const round of due.data.rounds){
  if(!isObj(round)||round.closureChecked!==true||
     typeof round.requestId!=='string'||!isObj(round.privateInputs))
   return textResponse(503,'verified_round_invalid');
  const preview=seleccionarComercialmenteMvp196({
   closureChecked:true,
   privateInputs:round.privateInputs as
    Parameters<typeof seleccionarComercialmenteMvp196>[0]['privateInputs']
  });
  if(preview.state==='insumos_invalidos'||
     preview.requestId!==round.requestId)
   return textResponse(503,'verified_source_invalid');
  if(preview.state!=='plan_ready'){ambiguous++;continue;}
  // Insert only a private source-matched plan. SQL revalidates closure,
  // activation timestamp, current source revisions and coverage matrix.
  const committed=await db.rpc('cotironda_piloto_commit_commercial_plan_mvp196',{
   p_request:round.requestId,p_mode:preview.mode,p_sources:preview.selected
  });
  if(committed.error||!isObj(committed.data)||
     !['planned','already_planned'].includes(String(committed.data.state)))
   return textResponse(503,'verified_plan_rejected');
  if(committed.data.state==='planned')plans++;
 }
 // Staging-first requirement: source plan materialization can be tested
 // independently, but network delivery MUST remain separately OFF.
 // This flag cannot be used until prospective consent, new-round E2E,
 // protected claim RPC and release authorization are independently proven.
 if(Deno.env.get('COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED')!=='true')
  return new Response(JSON.stringify({
   state:'planned_no_whatsapp',plans_created:plans,
   without_unique_commercial_plan:ambiguous,
   api_accepted:0,uncertain:0,details_exposed:false
  }),{status:200,headers:{'content-type':'application/json',
   'cache-control':'no-store','x-content-type-options':'nosniff'}});
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

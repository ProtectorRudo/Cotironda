/** Private operational HTTP boundary. OFF by default, preview SHA pinned.
 * Auth is the PILOT Supabase project, never the portal DEV project.
 * The database RPC binds the real Auth user+session to its registered operator.
 * No service-role key, operator_ref, contact or original can enter this route.
 */
import {bearerPiloto,claimsDeJwtValidado} from './originales-piloto-http-runtime.ts';

const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const RELEASE=/^[a-f0-9]{40}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const SIGNALS=new Set(['outbound_uncertain','outbound_stalled_lease',
 'supplier_quotes_review','supplier_quotes_stale_reservation',
 'document_retry_due','document_manual_review','whapi_triage_without_note']);
const ACTIONS=new Set(['acknowledge','investigate','escalate',
 'manual_reconciliation_needed','review_resolution']);
const BASES=new Set(['provider_usage_reviewed','provider_billing_reviewed',
 'financial_exposure_accepted']);
const HEADERS={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'pragma':'no-cache','referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'",
 'vary':'Authorization'
};
type Env=Record<string,string|undefined>;
type Action='queue'|'usage'|'case'|'review';
type Rpc=(name:string,params:Record<string,unknown>)=>Promise<{
 data:unknown;error:unknown
}>;
type User=Readonly<{id:string;is_anonymous?:boolean|null}>;
type Ports=Readonly<{
 getUser:(jwt:string)=>Promise<User|null>;
 rpc:Rpc;
}>;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
function result(status:number,state:string){
 return new Response(JSON.stringify({state}),{status,headers:HEADERS});
}
export function operadorPilotoHabilitado(env:Env):boolean{
 const release=env.COTIRONDA_PILOT_OPERATOR_RELEASE_SHA;
 return env.COTIRONDA_PILOT_OPERATOR_API_ENABLED==='true'
  &&env.VERCEL_ENV==='preview'
  &&env.COTIRONDA_REGISTRATION_ENABLED==='false'
  &&env.COTIRONDA_PILOT_SUPABASE_URL===PILOT_URL
  &&env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')===true
  &&typeof release==='string'&&RELEASE.test(release)
  &&env.VERCEL_GIT_COMMIT_SHA===release
  &&typeof env.COTIRONDA_PILOT_OPERATOR_ORIGIN==='string'
  &&/^https:\/\/[a-z0-9.-]+$/u.test(env.COTIRONDA_PILOT_OPERATOR_ORIGIN);
}
function parameters(action:Action,body:unknown):Record<string,unknown>|null{
 if(!obj(body))return null;
 const keys=Object.keys(body).sort();
 if(action==='case'){
  if(keys.join(',')!=='actionCode,episodeStartedAt,evidenceSha256,signalCode'
   ||!SIGNALS.has(body.signalCode as string)
   ||!ACTIONS.has(body.actionCode as string)
   ||typeof body.episodeStartedAt!=='string'
   ||!ISO.test(body.episodeStartedAt)
   ||!Number.isFinite(Date.parse(body.episodeStartedAt))
   ||typeof body.evidenceSha256!=='string'
   ||!HASH.test(body.evidenceSha256))return null;
  return {p_signal_code:body.signalCode,
   p_episode_started_at:body.episodeStartedAt,
   p_action_code:body.actionCode,
   p_evidence_sha256:body.evidenceSha256};
 }
 if(keys.join(',')!=='basis,callNo,evidenceSha256,messageHmac'
  ||typeof body.messageHmac!=='string'||!HASH.test(body.messageHmac)
  ||!Number.isInteger(body.callNo)||!Number.isSafeInteger(body.callNo)
  ||(body.callNo as number)<1||(body.callNo as number)>8
  ||!BASES.has(body.basis as string)
  ||typeof body.evidenceSha256!=='string'
  ||!HASH.test(body.evidenceSha256))return null;
 return {p_message_hmac:body.messageHmac,p_call_no:body.callNo,
  p_basis:body.basis,p_evidence_sha256:body.evidenceSha256};
}
function safePayload(action:Action,value:unknown):Record<string,unknown>|null{
 if(!obj(value)||typeof value.state!=='string')return null;
 if(action==='queue'){
  if(value.state!=='private_operator_cases'||!Array.isArray(value.cases)||
    value.cases.length>7)return null;
  const cases=[];
  for(const raw of value.cases){
   if(!obj(raw)||typeof raw.signal_code!=='string'||
    !SIGNALS.has(raw.signal_code)||typeof raw.severity!=='string'||
    !['blocked','attention'].includes(raw.severity)||
    typeof raw.active!=='boolean'||!Number.isSafeInteger(raw.count)||
    typeof raw.opened_at!=='string'||!ISO.test(raw.opened_at)||
    !Number.isSafeInteger(raw.age_minutes)||
    !Number.isSafeInteger(raw.sla_minutes)||
    typeof raw.unacknowledged_over_sla!=='boolean'||
    typeof raw.review_state!=='string'||raw.review_state.length>40)return null;
   cases.push({signal_code:raw.signal_code,severity:raw.severity,
    active:raw.active,count:raw.count,opened_at:raw.opened_at,
    age_minutes:raw.age_minutes,sla_minutes:raw.sla_minutes,
    unacknowledged_over_sla:raw.unacknowledged_over_sla,
    review_state:raw.review_state});
  }
  return {state:value.state,cases};
 }
 if(action==='usage'){
  if(value.state!=='private_openai_usage'||!Array.isArray(value.roles)||value.roles.length>2||
   value.pricing_verified!==false||value.provider_invoice_reconciled!==false||
   value.monetary_cost!==null||value.unknown_usage_is_zero!==false)return null;
  const roles=[];
  for(const raw of value.roles){
   if(!obj(raw)||!['buyer','supplier'].includes(raw.role as string))return null;
   const metrics=['requests','usage_observed','usage_unknown','input_tokens_observed',
    'output_tokens_observed','total_tokens_observed'];
   if(metrics.some(k=>!Number.isSafeInteger(raw[k])||(raw[k] as number)<0))return null;
   roles.push({role:raw.role,requests:raw.requests,usage_observed:raw.usage_observed,
    usage_unknown:raw.usage_unknown,input_tokens_observed:raw.input_tokens_observed,
    output_tokens_observed:raw.output_tokens_observed,total_tokens_observed:raw.total_tokens_observed});
  }
  return {state:value.state,roles,monetary_cost:null,pricing_verified:false,
   provider_invoice_reconciled:false,unknown_usage_is_zero:false};
 }
 if(action==='case'){
  return ['recorded_private','already_recorded'].includes(value.state)?
    {state:value.state}:null;
 }
 if(action==='review'){
  return ['reviewed_private','already_reviewed'].includes(value.state)?
    {state:value.state,usage_observed:false,monetary_cost_verified:false}:null;
 }
 return null;
}
export async function responderOperadorPiloto(
 req:Request,action:Action,env:Env,ports?:Ports
):Promise<Response>{
 if(!operadorPilotoHabilitado(env))return result(503,'operador_desactivado');
 const method=action==='queue'||action==='usage'?'GET':'POST';
 if(req.method!==method)return result(405,'metodo_no_permitido');
 const url=new URL(req.url);
 if(url.search||url.hash||url.origin!==env.COTIRONDA_PILOT_OPERATOR_ORIGIN)
  return result(400,'solicitud_invalida');
 if(method==='POST'&&req.headers.get('origin')!==url.origin)
  return result(403,'origen_no_autorizado');
 const jwt=bearerPiloto(req);
 if(!jwt)return result(401,'sesion_requerida');
 if(!ports)return result(503,'operador_no_configurado');
 try{
  const user=await ports.getUser(jwt);
  if(!user||user.is_anonymous!==false||!UUID.test(user.id)||
   !claimsDeJwtValidado(jwt,user.id,Date.now()))
   return result(401,'sesion_no_valida');
  let params:Record<string,unknown>={};
  let methodName='cotironda_piloto_operator_queue_auth_mvp267';
  if(method==='POST'){
   const length=req.headers.get('content-length');
   if(length!==null&&(!/^[0-9]+$/u.test(length)||Number(length)<1||Number(length)>2048))
    return result(400,'solicitud_invalida');
   if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return result(400,'solicitud_invalida');
   const text=await req.text();
   if(text.length>2048)return result(400,'solicitud_invalida');
   let body:unknown;
   try{body=JSON.parse(text)}catch{return result(400,'solicitud_invalida')}
   const parsed=parameters(action,body);
   if(!parsed)return result(400,'solicitud_invalida');
   params=parsed;
   methodName=action==='case'?
    'cotironda_piloto_operator_case_action_auth_mvp267':
    'cotironda_piloto_operator_usage_review_auth_mvp267';
  }
  if(action==='usage')methodName='cotironda_piloto_operator_usage_auth_mvp267';
  const {data,error}=await ports.rpc(methodName,params);
  if(error||!obj(data))return result(503,'operador_no_disponible');
  if(data.state==='not_authorized')return result(403,'operador_no_autorizado');
  const safe=safePayload(action,data);
  if(!safe)return result(409,'operacion_no_admitida');
  return new Response(JSON.stringify(safe),{status:200,headers:HEADERS});
 }catch{return result(503,'operador_no_disponible')}
}

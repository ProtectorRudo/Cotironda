/**
 * Cotironda V2 B3: PRIVATE, manually invoked shadow recovery endpoint.
 *
 * This is NOT a public quote API. No cron, WhatsApp, buyer-facing tracking,
 * identity reveal, publication or ranking is accessible from this module.
 * The existing MVP294 two-factor guard is reused. No new secrets needed.
 *
 * The Edge env flag AND the SQL v2_shadow_settings flag are independent,
 * OFF-by-default prerequisites. This handler cannot enable either flag.
 */
import {
 authorizeRecoveryMvp294,validInternalServiceKeyMvp294
} from '../cotironda-piloto-auto-recovery/internal-auth-mvp294.ts';
import {
 procesarSombraArchivadaV2,
 type ShadowWorkerOutcomeV2
} from '../../../src/domain/presupuestos-v2/worker-archivo-sombra.ts';
import type {EvidenceReaderB5} from
 '../../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';
import type {XlsxRowReaderB5e} from
 '../../../src/domain/presupuestos-v2/evidencia-xlsx-original-b5e.ts';
import {revisarArchivosVersionadosB5d,
 type PrivateReviewOutcomeB5d} from
 '../../../src/domain/presupuestos-v2/worker-revision-archivos-b5d.ts';
import {reauditarPdfHistoricoB5g,type PdfReauditOutcomeB5g}
 from '../../../src/domain/presupuestos-v2/worker-reauditoria-pdf-b5g.ts';

const PROJECT='ilggkalaafhtiysyzlmg';
const PROJECT_URL='https://'+PROJECT+'.supabase.co';
const API_KEY=/^sk-[A-Za-z0-9_-]{16,}$/u;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type Db={rpc:(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
 storage:{from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}}};
export type EnvV2B3=Readonly<{
 COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED?:string;
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET?:string;
 COTIRONDA_PILOT_OPENAI_API_KEY?:string;
 COTIRONDA_PILOT_AI_CENTRAL_MODEL?:string;
 SUPABASE_URL?:string;
 SUPABASE_SERVICE_ROLE_KEY?:string;
 SUPABASE_SECRET_KEYS?:string;
}>;
export type EdgeDepsV2B3=Readonly<{
 createDb:(url:string,roleKey:string)=>Db;
 readPdfEvidence?:EvidenceReaderB5;
 readXlsxEvidence?:XlsxRowReaderB5e;
 /** Enabled only by the installed private Edge adapter; no user request can. */
 runB5dWhenEmpty?:boolean;
 runB5gBeforeB5d?:boolean;
 runB5g?:(args:Parameters<typeof reauditarPdfHistoricoB5g>[0])=>
  Promise<PdfReauditOutcomeB5g>;
 runB5d?:(args:Parameters<typeof revisarArchivosVersionadosB5d>[0])=>
  Promise<PrivateReviewOutcomeB5d>;
 run?:(args:Parameters<typeof procesarSombraArchivadaV2>[0])=>
 Promise<ShadowWorkerOutcomeV2>;
}>;
const json=(status:number,state:string):Response=>
 new Response(JSON.stringify({state}),{
  status,
  headers:{
   'content-type':'application/json; charset=utf-8',
   'cache-control':'no-store, private',
   'x-content-type-options':'nosniff'
  }
 });
function internalRoleKey(env:EnvV2B3):string|null{
 const legacy=env.SUPABASE_SERVICE_ROLE_KEY??'';
 // Prefer legacy service role only when it is a structurally valid JWT.
 if(validInternalServiceKeyMvp294(legacy))return legacy;
 try{
  const value:unknown=JSON.parse(env.SUPABASE_SECRET_KEYS??'{}');
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
   const key=(value as Record<string,unknown>).default;
   if(typeof key==='string'&&validInternalServiceKeyMvp294(key))
    return key;
  }
 }catch{ /* no fallback */ }
 return null;
}
/** Generic handler: dependency-injected backend, so all tests are offline.
 * Never return raw errors, headers, claim identifiers, file bytes or quotes.
 */
export async function ejecutarSolicitudSombraV2B3(
 request:Request,env:EnvV2B3,deps:EdgeDepsV2B3
):Promise<Response>{
 try{
  if(request.method!=='POST')return json(405,'method_not_allowed');
  if(env.COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED!=='true')
   return json(503,'shadow_disabled');

  // Old MVP294 security: exact secret + project service key; modern
  // sb_secret_ uses apikey alone (no Authorization), legacy JWT uses
  // Authorization alone (no apikey). No browser, JWT user or anon path.
  if(!authorizeRecoveryMvp294({
   privateHeader:request.headers.get('x-cotironda-recovery-secret')??'',
   privateExpected:env.COTIRONDA_PILOT_AUTO_RECOVERY_SECRET??'',
   apikeyHeader:request.headers.get('apikey')??'',
   authorizationHeader:request.headers.get('authorization')??'',
   legacyServiceRole:env.SUPABASE_SERVICE_ROLE_KEY??'',
   secretKeysJson:env.SUPABASE_SECRET_KEYS??''
  }))return json(401,'unauthorized');

  // No user payload, identifiers or arguments are accepted. One source per
  // DB claim, source chosen ONLY by private SQL eligibility checks.
  // Supabase's gateway may represent a truly empty POST as a non-null
  // ReadableStream / chunked transfer. Reject *bytes*, not a stream object.
  const len=request.headers.get('content-length');
  if(len!==null&&(!/^\d{1,6}$/u.test(len)||Number(len)!==0))
   return json(413,'body_not_allowed');
  if(new URL(request.url).search!=='')
   return json(400,'parameters_not_allowed');
  if(request.body!==null){
   const reader=request.body.getReader();
   try{
    const timer=AbortSignal.timeout(5000);
    const expired=new Promise<never>((_resolve,reject)=>{
     timer.addEventListener('abort',()=>reject(Error('empty_body_timeout')),
      {once:true});
    });
    let reachedEnd=false;
    for(let i=0;i<4;i++){
     const chunk=await Promise.race([reader.read(),expired]);
     if(chunk.done){reachedEnd=true;break}
     if((chunk.value?.byteLength??0)>0)return json(413,'body_not_allowed');
    }
    if(!reachedEnd)return json(413,'body_not_allowed');
   }catch{return json(413,'body_not_allowed')}
   finally{void reader.cancel().catch(()=>{})}
  }

  const role=internalRoleKey(env);
  const api=env.COTIRONDA_PILOT_OPENAI_API_KEY??'';
  const model:Model=env.COTIRONDA_PILOT_AI_CENTRAL_MODEL==='gpt-6.1-sol'
   ?'gpt-6.1-sol':'gpt-6-luna';
  if(env.SUPABASE_URL!==PROJECT_URL||!role||
     !API_KEY.test(api)||typeof deps?.createDb!=='function')
   return json(503,'backend_configuration_invalid');

  const db=deps.createDb(PROJECT_URL,role);
  const outcome=await (deps.run??procesarSombraArchivadaV2)({
   enabled:true,trustedInternalWorker:true,
   rpc:async(name,params)=>db.rpc(name,params),
   storage:db.storage,apiKey:api,model,
   readPdfEvidence:deps.readPdfEvidence
  });
  // Defense-in-depth if a worker accidentally gains publish/sending code:
  // keep external response private and flag a violation.
  if(outcome.outboundMessages!==0||outcome.publishedOffers!==0)
   return json(503,'shadow_contract_violation');
  if(outcome.state==='empty'&&deps.runB5dWhenEmpty===true){
   // B5g is a new version, rechecking only the two ALREADY-READ
   // historical PDFs. No LLM, no old ledgers touched, one original/tick.
   if(deps.runB5gBeforeB5d===true){
    const back=await (deps.runB5g??reauditarPdfHistoricoB5g)({
     enabled:true,trustedInternalWorker:true,
     rpc:async(name,params)=>db.rpc(name,params),
     storage:db.storage,readPdfEvidence:deps.readPdfEvidence
    });
    if(back.outboundMessages!==0||back.publishedOffers!==0||
       back.sourceVerified!==false||back.canRank!==false||
       back.canRevealContacts!==false)
     return json(503,'shadow_contract_violation');
    switch(back.state){
     case 'private_source_observed':return json(200,'private_source_observed');
     case 'review_required':return json(200,'review_required');
     case 'reconciliation_required':return json(503,'reconciliation_required');
     case 'empty':case 'disabled':break;
     default:return json(503,'shadow_contract_violation');
    }
   }
   // B5d reuses the existing authenticated POST and private V2 gate.
   // Claim SQL is versioned and never asks the caller for a source/round.
   const next=await (deps.runB5d??revisarArchivosVersionadosB5d)({
    enabled:true,trustedInternalWorker:true,
    rpc:async(name,params)=>db.rpc(name,params),
    storage:db.storage,apiKey:api,model,
    readPdfEvidence:deps.readPdfEvidence,
    readXlsxEvidence:deps.readXlsxEvidence
   });
   if(next.publishedOffers!==0||next.outboundMessages!==0||
      next.sourceVerified!==false)
    return json(503,'shadow_contract_violation');
   switch(next.state){
    case 'candidate_private':return json(200,'candidate_private');
    case 'review_required':return json(200,'review_required');
    case 'empty':return json(200,'queue_empty');
    case 'disabled':return json(503,'shadow_disabled');
    case 'reconciliation_required':
     return json(503,'reconciliation_required');
    default:return json(503,'shadow_contract_violation');
   }
  }
  switch(outcome.state){
   case 'candidate_private':return json(200,'candidate_private');
   case 'review_required':return json(200,'review_required');
   case 'empty':return json(200,'queue_empty');
   case 'disabled':return json(503,'shadow_disabled');
   case 'reconciliation_required':return json(503,'reconciliation_required');
   default:return json(503,'shadow_contract_violation');
  }
 }catch{
  return json(503,'shadow_internal_review');
 }
}

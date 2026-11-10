/**
 * MVP340: conecta el orquestador PRIVADO de MVP339 con dos RPC service_role.
 * No crea cliente Supabase, no introduce token público y NO se importa por
 * el webhook piloto. Las propuestas IA siguen sin autorizar publicación.
 */
import type {
 AmbitoMvp339,PresupuestoMvp339,ReservaMvp339,
 FinalizacionMvp339
} from './procesador-ia-lotes-mvp339.ts';
import type {PlanMvp337} from './ingesta-evidencia-flexible-mvp337.ts';
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
const SHA=/^[a-f0-9]{64}$/u;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const asHex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
/** The hash covers every source row and lot boundary, not just filename. */
export async function huellaPlanMvp340(plan:PlanMvp337):Promise<string>{
 if(plan?.state!=='planned'||!SHA.test(plan.sourceSha256??'')||
    !Array.isArray(plan.lots)||plan.lots.length<1||
    plan.lots.some(x=>x.sourceSha256!==plan.sourceSha256))
  throw Error('mvp340_invalid_plan');
 const encoded=JSON.stringify([
  'mvp340_plan_v1',plan.sourceSha256,plan.format,plan.totalRows,
  plan.lots.map(l=>[l.number,l.rows.map(r=>[r.position,r.section,r.literal])])
 ]);
 if(encoded.length>900000)throw Error('mvp340_plan_too_large');
 return asHex(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(encoded))));
}
export async function crearReservaSqlMvp340(args:{
 scope:AmbitoMvp339;plan:PlanMvp337;rpc:Rpc;
}):Promise<{
 budget:PresupuestoMvp339;planSha256:string;
 reserve:(v:{scope:AmbitoMvp339;sourceSha256:string})=>Promise<ReservaMvp339>;
 finish:(v:FinalizacionMvp339)=>Promise<'recorded'>;
}>{
 const {plan,scope,rpc}=args;
 if(typeof rpc!=='function'||plan?.state!=='planned')
  throw Error('mvp340_configuration_invalid');
 const planSha256=await huellaPlanMvp340(plan);
 const budget={
  maxModelCalls:plan.lots.length*2,
  maxInputChars:plan.lots.flatMap(l=>l.rows).reduce(
   (sum,r)=>sum+r.literal.length,0)*2
 };
 const sameScope=(x:AmbitoMvp339):boolean=>!!x&&
  x.roundId===scope.roundId&&x.supplierKey===scope.supplierKey&&
  x.messageHmac===scope.messageHmac&&x.chatHmac===scope.chatHmac;
 const checked=async(name:string,params:Record<string,unknown>)=>{
  const out=await rpc(name,params);
  if(out?.error!==null&&out?.error!==undefined||
     !obj(out?.data)||typeof out.data.state!=='string')
   throw Error('mvp340_sql_outcome_uncertain');
  return out.data;
 };
 return {
  budget,planSha256,
  reserve:async input=>{
   if(!sameScope(input?.scope)||input.sourceSha256!==plan.sourceSha256)
    throw Error('mvp340_scope_changed');
   const response=await checked('cotironda_piloto_reserve_supplier_lots_mvp340',{
    p_round_id:scope.roundId,p_supplier_key:scope.supplierKey,
    p_message_hmac:scope.messageHmac,p_chat_hmac:scope.chatHmac,
    p_source_sha256:input.sourceSha256,p_plan_sha256:planSha256,
    p_total_rows:plan.totalRows,p_total_lots:plan.lots.length,
    p_max_model_calls:budget.maxModelCalls,
    p_max_input_chars:budget.maxInputChars
   });
   if(response.state==='already_processed')return {state:'already_processed'};
   if(response.state==='not_eligible')return {state:'not_eligible'};
   if(response.state!=='reserved')throw Error('mvp340_reservation_uncertain');
   return response as unknown as ReservaMvp339;
  },
  finish:async input=>{
   if(!sameScope(input?.scope)||input.sourceSha256!==plan.sourceSha256||
      input.totalRows!==plan.totalRows)
    throw Error('mvp340_finish_scope_changed');
   const response=await checked('cotironda_piloto_finish_supplier_lots_mvp340',{
    p_round_id:scope.roundId,p_supplier_key:scope.supplierKey,
    p_message_hmac:scope.messageHmac,p_chat_hmac:scope.chatHmac,
    p_source_sha256:plan.sourceSha256,p_plan_sha256:planSha256,
    p_receipt:input.receipt,p_state:input.state,
    p_reason:input.reason,p_model_calls:input.modelCalls,
    p_agreed_rows:input.agreedRows,p_total_rows:input.totalRows
   });
   if(response.state!=='recorded')throw Error('mvp340_finish_uncertain');
   return 'recorded';
  }
 };
}

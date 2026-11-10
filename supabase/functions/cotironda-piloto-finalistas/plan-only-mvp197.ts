/**
 * MVP197 — reproducible source-backed planning WITHOUT WhatsApp credentials.
 *
 * The database fetches ONLY eligible new closed rounds (MVP196); this service
 * verifies commercial coverage, commits an immutable private source plan and
 * returns COUNTS. It never reads addresses, secrets, calls Whapi or discloses
 * supplier identities, source identifiers or original documents.
 */
import {seleccionarComercialmenteMvp196} from
 '../../../src/domain/seleccion-finalistas-v9-mvp196.ts';

type RpcReply=Readonly<{data:unknown;error:unknown}>;
export type PrivateRpcMvp197=(
 name:string,args:Readonly<Record<string,unknown>>
)=>Promise<RpcReply>;

export type ResultadoPlanificacionMvp197=Readonly<{
 state:'planned_no_whatsapp'|'verified_planner_unavailable'|
 'verified_round_invalid'|'verified_source_invalid'|
 'verified_plan_rejected';
 plans_created:number;without_unique_commercial_plan:number;
 api_accepted:0;uncertain:0;details_exposed:false;
}>;

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const isObject=(v:unknown):v is Record<string,unknown>=>
 Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const response=(state:ResultadoPlanificacionMvp197['state'],
 plans_created=0,without_unique_commercial_plan=0
):ResultadoPlanificacionMvp197=>Object.freeze({
 state,plans_created,without_unique_commercial_plan,
 api_accepted:0 as const,uncertain:0 as const,details_exposed:false as const
});

export async function prepararPlanesPrivadosMvp197(
 rpc:PrivateRpcMvp197
):Promise<ResultadoPlanificacionMvp197>{
 try{
  const due=await rpc('cotironda_piloto_commercial_due_mvp196',{p_limit:10});
  if(due.error||!isObject(due.data)||
     due.data.state!=='candidate_due'||!Array.isArray(due.data.rounds)||
     due.data.rounds.length>10)return response('verified_planner_unavailable');
  // Validate the ENTIRE batch before any insertion. A duplicate or
  // malformed later round must never leave an earlier plan committed.
  const seen=new Set<string>();
  for(const round of due.data.rounds){
   if(!isObject(round)||round.closureChecked!==true||
      typeof round.requestId!=='string'||!ID.test(round.requestId)||
      seen.has(round.requestId)||!isObject(round.privateInputs))
    return response('verified_round_invalid');
   seen.add(round.requestId);
  }
  let plans=0,ambiguous=0;
  for(const round of due.data.rounds){
   const result=seleccionarComercialmenteMvp196({
    closureChecked:true,
    privateInputs:round.privateInputs as
     Parameters<typeof seleccionarComercialmenteMvp196>[0]['privateInputs']
   });
   if(result.state==='insumos_invalidos'||result.requestId!==round.requestId)
    return response('verified_source_invalid',plans,ambiguous);
   if(result.state!=='plan_ready'){ambiguous++;continue;}
   const committed=await rpc('cotironda_piloto_commit_commercial_plan_mvp196',{
    p_request:round.requestId,p_mode:result.mode,p_sources:result.selected
   });
   if(committed.error||!isObject(committed.data)||
      !['planned','already_planned'].includes(String(committed.data.state)))
    return response('verified_plan_rejected',plans,ambiguous);
   if(committed.data.state==='planned')plans++;
  }
  return response('planned_no_whatsapp',plans,ambiguous);
 }catch{
  // Never expose database errors or documents in the response.
  return response('verified_planner_unavailable');
 }
}

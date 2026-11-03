/** MVP131: side-effect boundary for one service-authorized recovery only. */
export type RetryState='none'|'recovered_private'|'failed';
type Lookup={data:unknown;error:unknown};
type IO={
 lookup:()=>Promise<Lookup>;
 recover:(triggerChatHmac:string)=>Promise<RetryState>;
 review?:()=>Promise<'none'|'diagnosed_private'|'failed'>;
 reclassify?:()=>Promise<'none'|'reclassified_private'|'failed'>;
 audit?:()=>Promise<'none'|'verified_anonymous'|'needs_source_review'|'failed'>;
};
const TOKEN=/^[a-f0-9]{64}$/u;
const isRecord=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const response=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'content-type':'application/json','cache-control':'no-store',
  'x-content-type-options':'nosniff'}
});
export async function runRecoveryService(
 req:Request, flags:{enabled:boolean;modelKeyAvailable:boolean;projectMatches:boolean},io:IO
):Promise<Response>{
 if(req.method!=='POST')return response(405,'method_not_allowed');
 if(!flags.enabled)return response(503,'worker_off');
 if(!flags.projectMatches||!flags.modelKeyAvailable)
  return response(503,'configuration_unavailable');
 try{
  const x=await io.lookup();
  if(x.error||!isRecord(x.data))return response(503,'selection_unavailable');
  if(x.data.state==='none'&&io.reclassify){
   const corrected=await io.reclassify();
   if(corrected==='failed')return response(503,'reclassification_failed');
   if(corrected==='reclassified_private')return response(200,'reclassified_private');
  }
  if(x.data.state==='none'&&io.audit){
   const assessed=await io.audit();
   if(assessed==='failed')return response(503,'evidence_unavailable');
   if(assessed!=='none')return response(200,assessed);
  }
  if(x.data.state==='none'&&io.review){
   const reviewed=await io.review();
   if(reviewed==='failed')return response(503,'reconciliation_failed');
   if(reviewed==='diagnosed_private')return response(200,'reconciliation_private');
  }
  if(x.data.state==='none'||x.data.state==='disabled')
   return response(200,'no_eligible_document');
  if(x.data.state==='quota')return response(200,'quota_reached');
  if(x.data.state!=='candidate'||typeof x.data.trigger_chat_hmac!=='string'||
     !TOKEN.test(x.data.trigger_chat_hmac))
   return response(503,'selection_invalid');
  const result=await io.recover(x.data.trigger_chat_hmac);
  if(result==='failed')return response(503,'recovery_failed');
  return response(200,result);
 }catch{return response(503,'recovery_unavailable')}
}

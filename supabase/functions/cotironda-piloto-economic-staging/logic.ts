/**
 * MVP169: one-shot económico separado del recuperador de producción.
 * No WhatsApp, AI, adjudicación, ranking, cron ni publicación de originales.
 * Requiere token de Vault validado por RPC y una sola cotización por llamada.
 */
import {guardScheduledRecovery} from
 '../cotironda-piloto-document-recovery/scheduled-auth.ts';

export type OneShotResultMvp169='none'|'economic_facts_recorded'|'failed';
type Options=Readonly<{
 enabled:boolean;
 authorize:(token:string)=>Promise<boolean>;
 auditOne:()=>Promise<OneShotResultMvp169>;
}>;
function reply(status:number,state:string):Response{
 return new Response(JSON.stringify({state}),{
  status,headers:{
   'Content-Type':'application/json','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff'
  }
 });
}
/** Deliberately no identifiers or details in HTTP responses. */
export function runEconomicOneShotMvp169(req:Request,opts:Options):Promise<Response>{
 return guardScheduledRecovery(req,{
  enabled:opts.enabled,
  authorize:opts.authorize,
  run:async()=>{
   const outcome=await opts.auditOne();
   if(outcome==='failed')return reply(503,'economic_facts_unavailable');
   return reply(200,outcome);
  }
 });
}

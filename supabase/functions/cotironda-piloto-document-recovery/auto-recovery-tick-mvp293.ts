/**
 * MVP293 — bridge from the ALREADY Vault-authenticated five-minute internal
 * document-recovery cron to the isolated MVP292 historical recovery Edge.
 *
 * Authentication remains TWO-factor: Supabase service-role JWT verified by
 * Edge gateway + the separate MVP292 recovery secret checked by the worker.
 * No credentials enter pg_cron, job arguments, database tables or logs.
 * No WhatsApp calls, no customer/supplier requests, one worker tick maximum.
 */
const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const ENDPOINT=PILOT_URL+'/functions/v1/cotironda-piloto-auto-recovery';
type FetchLike=(url:string,init:RequestInit)=>Promise<Pick<Response,'ok'|'status'>>;
export type TickState='off'|'configuration_unavailable'|'accepted'|'refused'|'unavailable';
export async function invokeAutoRecoveryMvp293(args:{
 enabled:boolean;
 pilotUrl:string;
 serviceRoleJwt:string;
 recoverySecret:string;
 post:FetchLike;
}):Promise<TickState>{
 if(!args.enabled)return 'off';
 if(args.pilotUrl!==PILOT_URL||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(args.serviceRoleJwt)||
    args.serviceRoleJwt.length<80||
    args.recoverySecret.length<32||args.recoverySecret.length>256)
  return 'configuration_unavailable';
 try{
  const response=await args.post(ENDPOINT,{
   method:'POST',
   headers:{
    authorization:'Bearer '+args.serviceRoleJwt,
    'x-cotironda-recovery-secret':args.recoverySecret,
    'content-type':'application/json'
   },
   body:'{}',
   signal:AbortSignal.timeout(55000)
  });
  return response.ok?'accepted':'refused';
 }catch{
  return 'unavailable';
 }
}

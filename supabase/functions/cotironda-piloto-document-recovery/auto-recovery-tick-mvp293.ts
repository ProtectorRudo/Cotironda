/**
 * MVP293/MVP294 — one isolated archive recovery tick from the already
 * Vault-authenticated internal scheduled Edge. No new cron or messages.
 * Handles BOTH legacy Supabase JWT and new sb_secret admin keys:
 * modern keys on apikey only, never Authorization Bearer.
 */
const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const ENDPOINT=PILOT_URL+'/functions/v1/cotironda-piloto-auto-recovery';
const LEGACY=/^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}$/u;
const MODERN=/^sb_secret_[A-Za-z0-9_-]{20,}$/u;
type FetchLike=(url:string,init:RequestInit)=>Promise<Pick<Response,'ok'|'status'>>;
export type TickState='off'|'invalid_origin'|'credential_unavailable'|
 'private_secret_unavailable'|'accepted'|'refused'|'unavailable';
export async function invokeAutoRecoveryMvp293(args:{
 enabled:boolean;
 pilotUrl:string;
 serviceRoleJwt:string;
 recoverySecret:string;
 post:FetchLike;
}):Promise<TickState>{
 if(!args.enabled)return 'off';
 if(args.pilotUrl!==PILOT_URL)return 'invalid_origin';
 if(args.recoverySecret.length<32||args.recoverySecret.length>256)
  return 'private_secret_unavailable';
 const isLegacy=LEGACY.test(args.serviceRoleJwt);
 const isModern=MODERN.test(args.serviceRoleJwt);
 if(!isLegacy&&!isModern)return 'credential_unavailable';
 try{
  const response=await args.post(ENDPOINT,{
   method:'POST',
   headers:{
    ...(isLegacy?{authorization:'Bearer '+args.serviceRoleJwt}:{
     apikey:args.serviceRoleJwt}),
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

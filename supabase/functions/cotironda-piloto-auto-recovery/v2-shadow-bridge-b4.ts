/** Cotironda V2 B4 — existing 5-minute cron -> authenticated V2 B3.
 *
 * The existing auto-recovery edge is already called by the Vault-authenticated
 * document cron. This bridge is opt-in from a private READ-ONLY SQL gate.
 * No new cron, secret, WhatsApp recipient, source choice, or public routes.
 *
 * Once SQL says OFF, this function never schedules or sends any HTTP.
 * When ON, it launches an isolated Edge request as a Supabase background
 * task to avoid blocking the established MVP293 cron 55-second timeout.
 * B2 locks the source with a one-use SHA/version lease; B3 verifies two
 * independent credentials and always leaves the candidate PRIVATE.
 */
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const LEGACY=/^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}$/u;
const MODERN=/^sb_secret_[A-Za-z0-9_-]{20,}$/u;
export type V2BridgeB4State='off'|'private_not_ready'|'scheduled'|
 'scheduling_failed';
type Post=(url:string,init:RequestInit)=>Promise<Pick<Response,'ok'|'status'>>;
export async function scheduleV2ShadowB4(args:{
 enabled:boolean;pilotUrl:string;serviceRoleKey:string;
 recoverySecret:string;
 checkSqlEnabled:()=>Promise<boolean>;
 post:Post;
 schedule:(promise:Promise<void>)=>void;
 report?:(state:'accepted'|'refused'|'unavailable')=>void;
}):Promise<V2BridgeB4State>{
 if(!args.enabled||args.pilotUrl!==PILOT)return 'off';
 // No remote request when the new SQL flag is off or unavailable.
 let sqlEnabled=false;
 try{sqlEnabled=await args.checkSqlEnabled()}
 catch{return 'private_not_ready'}
 if(!sqlEnabled)return 'off';
 const isLegacy=LEGACY.test(args.serviceRoleKey);
 const isModern=MODERN.test(args.serviceRoleKey);
 if((!isLegacy&&!isModern)||
   args.recoverySecret.length<32||args.recoverySecret.length>256||
   typeof args.schedule!=='function')return 'private_not_ready';

 const work=(async()=>{
  try{
   const r=await args.post(PILOT+'/functions/v1/cotironda-piloto-v2-shadow',{
    method:'POST',
    headers:{
     ...(isLegacy?{authorization:'Bearer '+args.serviceRoleKey}
      :{apikey:args.serviceRoleKey}),
     'x-cotironda-recovery-secret':args.recoverySecret
    },
    signal:AbortSignal.timeout(110000)
   });
   args.report?.(r.ok?'accepted':'refused');
  }catch{args.report?.('unavailable')}
 })();
 try{args.schedule(work)}catch{
  // No unhandled rejection even when scheduler is unavailable.
  void work.catch(()=>{});
  return 'scheduling_failed';
 }
 return 'scheduled';
}

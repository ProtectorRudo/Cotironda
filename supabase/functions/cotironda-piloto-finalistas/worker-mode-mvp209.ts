/**
 * MVP209 — two NON-INTERCHANGEABLE worker credentials.
 * The scheduled plan-only token must NEVER authorize contact decryption,
 * delivery outbox claims or Whapi, even if dispatch flags are enabled.
 */
export type ModoWorkerMvp209='plan_only'|'dispatch';
type Secrets=Readonly<{planOnly:string;dispatch:string}>;
type Compare=(provided:string,expected:string)=>Promise<boolean>;

export async function verificarModoWorkerMvp209(
 headers:Pick<Headers,'has'|'get'>,secrets:Secrets,compare:Compare
):Promise<ModoWorkerMvp209|null>{
 try{
  const hasPlanner=headers.has('x-cotironda-finalist-plan-secret');
  const hasDispatch=headers.has('x-cotironda-finalist-worker-secret');
  // Never accept two credentials, or zero credentials, or infer the mode
  // from a user-controlled body/query parameter.
  if(hasPlanner===hasDispatch)return null;
  const plan=hasPlanner;
  const provided=headers.get(plan
   ?'x-cotironda-finalist-plan-secret'
   :'x-cotironda-finalist-worker-secret')??'';
  const expected=plan?secrets.planOnly:secrets.dispatch;
  if(expected.length<48||expected.length>256||
     provided.length<48||provided.length>256)return null;
  return await compare(provided,expected)?
   (plan?'plan_only':'dispatch'):null;
 }catch{return null}
}

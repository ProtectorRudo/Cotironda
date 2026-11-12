/** MVP357: caller-specific, least-privilege cron auth for AI batch ONLY.
 * Two independent high-entropy Edge secrets, NEVER the Supabase admin key.
 * The old admin+private path stays available only for trusted manual calls.
 */
import {safeSameMvp294} from
 '../cotironda-piloto-auto-recovery/internal-auth-mvp294.ts';
export function autorizarBatchCronMvp357(args:Readonly<{
 expectedPrivate:string;presentedPrivate:string;
 expectedCronProof:string;presentedCronProof:string;
 apikey:string;authorization:string;
}>):boolean{
 if(args.apikey||args.authorization)return false;
 if(args.expectedPrivate.length<32||args.expectedPrivate.length>256||
    args.expectedCronProof.length<32||args.expectedCronProof.length>256||
    !/^[A-Za-z0-9_-]{32,256}$/u.test(args.expectedCronProof)||
    safeSameMvp294(args.expectedPrivate,args.expectedCronProof))
  return false;
 return safeSameMvp294(args.expectedPrivate,args.presentedPrivate)&&
        safeSameMvp294(args.expectedCronProof,args.presentedCronProof);
}

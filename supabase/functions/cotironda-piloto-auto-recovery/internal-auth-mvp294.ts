/**
 * MVP294 — double-factor authorization for Edge-to-Edge internal calls.
 *
 * Supabase's NEW `sb_secret_...` keys are NOT JWTs and cannot use
 * gateway verify_jwt=true. Validate EXACT project-scoped admin secret
 * on `apikey`, or the legacy service_role JWT on Authorization, AND the
 * separate dedicated recovery secret. No bearer fallback for new keys.
 * Never log/echo secrets or request credentials.
 */
const enc=new TextEncoder();
const LEGACY=/^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}$/u;
const SB_SECRET=/^sb_secret_[A-Za-z0-9_-]{20,}$/u;
export function safeSameMvp294(a:string,b:string):boolean{
 const x=enc.encode(a),y=enc.encode(b);
 let delta=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)
  delta|=(x[i]??0)^(y[i]??0);
 return delta===0;
}
export function authorizeRecoveryMvp294(args:{
 privateHeader:string;
 privateExpected:string;
 apikeyHeader:string;
 authorizationHeader:string;
 legacyServiceRole:string;
 secretKeysJson:string;
}):boolean{
 if(args.privateExpected.length<32||args.privateExpected.length>256||
    !safeSameMvp294(args.privateHeader,args.privateExpected))return false;
 let newSecret='';
 try{
  const secrets=JSON.parse(args.secretKeysJson);
  if(secrets!==null&&typeof secrets==='object'&&!Array.isArray(secrets)&&
     typeof secrets.default==='string')
   newSecret=secrets.default;
 }catch{newSecret=''}
 const allowedModern=SB_SECRET.test(newSecret)&&
   safeSameMvp294(args.apikeyHeader,newSecret)&&
   !args.authorizationHeader;
 const presentedLegacy=args.authorizationHeader.startsWith('Bearer ')
  ?args.authorizationHeader.slice(7):'';
 const allowedLegacy=LEGACY.test(args.legacyServiceRole)&&
   safeSameMvp294(presentedLegacy,args.legacyServiceRole)&&
   !args.apikeyHeader;
 return allowedModern||allowedLegacy;
}
export function validInternalServiceKeyMvp294(value:string):boolean{
 return LEGACY.test(value)||SB_SECRET.test(value);
}

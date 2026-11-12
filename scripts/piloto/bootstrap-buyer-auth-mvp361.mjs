/**
 * MVP361 — Alta de comprador Auth SOLO por operador, servidor, proyecto PILOTO.
 * Default: DRY_RUN (zero network/changes). --check: only verified RPC.
 * --apply: explicit separate publication approval + RPC verification.
 * NEVER print the phone, admin key, raw HTTP body, buyer_key, HMAC or userId.
 * No SMS is sent; phone_confirm:false, buyer must later verify by OTP.
 */
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PILOT_HOST='ilggkalaafhtiysyzlmg.supabase.co';
const PILOT_APPROVAL='PUBLICALO_MVP361_SOLO_COTIRONDA_PILOTO';
const E164=/^\+[1-9][0-9]{7,14}$/u;

export function contactoHashParaPiloto(phone) {
 if(typeof phone!=='string'||!E164.test(phone))return null;
 return createHash('sha256').update(phone.slice(1)+'@s.whatsapp.net','utf8').digest('hex');
}
export function claveAdminPilotoValida(secret) {
 if(typeof secret!=='string'||secret.length<100)return false;
 const parts=secret.split('.');
 if(parts.length!==3||parts.some(s=>!s))return false;
 try{
  const data=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  return data?.role==='service_role';
 }catch{return false;}
}
function validarHost(url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.host!==PILOT_HOST||
    u.pathname!=='/'||u.search||u.hash||u.username||u.password)return null;
  return u;
 }catch{return null;}
}
export async function prepararCompradorAuthMvp361({
 url,phone,adminKey,mode='dry-run',approval='',fetchFn=fetch
}){
 const base=validarHost(url);
 const hash=contactoHashParaPiloto(phone);
 if(!base||!hash||!claveAdminPilotoValida(adminKey))
  return Object.freeze({status:'BLOCKED_CONFIGURATION',wrote:false});
 if(mode==='dry-run')return Object.freeze({
  status:'DRY_RUN_ONLY_NOT_VERIFIED',wrote:false
 });
 if(mode!=='check'&&mode!=='apply')
  return Object.freeze({status:'BLOCKED_MODE',wrote:false});
 if(mode==='apply'&&approval!==PILOT_APPROVAL)
  return Object.freeze({status:'BLOCKED_APPROVAL',wrote:false});

 // RPC is the ONLY authority for phone/WhatsApp identity matching.
 // It never returns source contact numbers or private business details.
 const headers={
  apikey:adminKey,Authorization:'Bearer '+adminKey,
  'Content-Type':'application/json',Accept:'application/json'
 };
 try{
  const p=await fetchFn(new URL(
   '/rest/v1/rpc/cotironda_piloto_buyer_bootstrap_allowed_mvp361',base
  ).toString(),{
   method:'POST',headers,redirect:'error',
   body:JSON.stringify({p_contact_sha256:hash}),
   signal:AbortSignal.timeout(10000)
  });
  // Exactly true, never treat an HTTP 200 with unexpected body as authorization.
  if(!p.ok)return Object.freeze({status:'BLOCKED_RPC',wrote:false});
  const ok=await p.json().catch(()=>null);
  if(ok!==true)return Object.freeze({status:'BLOCKED_IDENTITY',wrote:false});
  if(mode==='check')return Object.freeze({status:'VERIFIED_READY_NO_WRITE',wrote:false});

  // Admin createUser does not send an OTP or assert phone possession.
  // Browser login separately verifies possession with SMS OTP.
  const response=await fetchFn(new URL('/auth/v1/admin/users',base).toString(),{
   method:'POST',headers,redirect:'error',
   body:JSON.stringify({phone,phone_confirm:false}),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return Object.freeze({status:'MANUAL_REVIEW_CREATE',wrote:false});
  const user=await response.json().catch(()=>null);
  if(!user||typeof user.id!=='string'||user.id.length<30||
      user.phone!==phone||user.phone_confirmed_at!=null)
    return Object.freeze({status:'MANUAL_REVIEW_AUTH_RESPONSE',wrote:true});
  return Object.freeze({status:'CREATED_UNCONFIRMED_OTP_REQUIRED',wrote:true});
 }catch{
  // Timeout after CREATE is UNKNOWN, never blindly retry.
  return Object.freeze({status:'MANUAL_REVIEW_NETWORK_UNCERTAIN',wrote:mode==='apply'});
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 const mode=args.length===0?'dry-run':
  args.length===1&&args[0]==='--check'?'check':
  args.length===1&&args[0]==='--apply'?'apply':'invalid';
 const r=await prepararCompradorAuthMvp361({
  url:process.env.COTIRONDA_PILOT_SUPABASE_URL??'',
  phone:process.env.COTIRONDA_PILOT_BUYER_E164??'',
  adminKey:process.env.COTIRONDA_PILOT_AUTH_ADMIN_KEY??'',
  mode,
  approval:process.env.COTIRONDA_PILOT_AUTH_APPROVAL??''
 });
 process.stdout.write('MVP361 Auth comprador: '+r.status+
  '. Escritura confirmada: '+(r.wrote&&r.status==='CREATED_UNCONFIRMED_OTP_REQUIRED'?'SI':'NO/INCIERTA')+'\n');
 if(!['DRY_RUN_ONLY_NOT_VERIFIED','VERIFIED_READY_NO_WRITE',
       'CREATED_UNCONFIRMED_OTP_REQUIRED'].includes(r.status))
   process.exitCode=2;
}

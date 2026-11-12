/** Operator-only command. Run from apps/portal with Node >=22.16.
 * Default dry-run. Never echo phone, Supabase secrets, user objects or HMAC.
 * Installation, execute mode and SMS smoke need explicit "Publicalo" scope.
 */
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {bootstrapPrimerCompradorV2}
 from '../../../src/server/v2-07-primer-comprador-auth.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const HERE=fileURLToPath(import.meta.url);
const ALLOWED_ARGS=new Set(['--dry-run','--execute']);
async function main(){
 const flags=process.argv.slice(2);
 if(flags.length>1||flags.some(x=>!ALLOWED_ARGS.has(x))){
  process.stderr.write('Uso: node --experimental-strip-types scripts/v2-buyer-bootstrap.mjs [--dry-run|--execute]\n');
  process.exitCode=2;return;
 }
 const execute=flags.includes('--execute');
 const env=process.env;
 const url=env.COTIRONDA_PILOT_SUPABASE_URL??'';
 const secret=env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY??'';
 const branch=env.COTIRONDA_AUTH_BOOTSTRAP_TARGET??'';
 if(url!==PILOT||!secret.startsWith('sb_secret_')||
  secret.length<24||branch!=='preview'){
  process.stdout.write(JSON.stringify({state:'BLOCKED',
   code:'servidor_piloto_o_credenciales_no_configurados',
   userCreated:false})+'\n');
  process.exitCode=2;return;
 }
 let currentSha='';
 try{
  currentSha=execFileSync('git',['rev-parse','HEAD'],{
   cwd:resolve(HERE,'../../../..'),encoding:'utf8',
   timeout:5000,stdio:['ignore','pipe','ignore']}).trim();
 }catch{
  process.stdout.write(JSON.stringify({state:'BLOCKED',
   code:'commit_local_no_verificable',userCreated:false})+'\n');
  process.exitCode=2;return;
 }
 const client=createClient(url,secret,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const ports={
  countExistingAuthUsers:async()=>{
   const {data,error}=await client.auth.admin.listUsers({page:1,perPage:2});
   if(error||!Array.isArray(data?.users))return null;
   return data.users.length;
  },
  isVerifiedBuyerPhone:async(buyerKey,sha)=>{
   const {data,error}=await client.rpc(
    'cotironda_piloto_v2_bootstrap_buyer_check_private',{
     p_buyer_key:buyerKey,p_contact_sha256:sha
    });
   return !error&&data===true;
  },
  createUnconfirmedUser:async phone=>{
   const {data,error}=await client.auth.admin.createUser({
    phone,phone_confirm:false
   });
   return {created:!error&&!!data?.user,
    phoneConfirmed:data?.user?.phone_confirmed_at!=null};
  }
 };
 const result=await bootstrapPrimerCompradorV2({
  projectUrl:url,buyerKey:env.COTIRONDA_AUTH_BOOTSTRAP_BUYER_KEY??'',
  phoneE164:env.COTIRONDA_AUTH_BOOTSTRAP_PHONE_E164??'',
  mode:execute?'execute':'dry-run',
  previewOnly:branch==='preview',
  registrationClosed:env.COTIRONDA_REGISTRATION_ENABLED==='false',
  activeSourceSha:currentSha,
  approvedSourceSha:env.COTIRONDA_AUTH_BOOTSTRAP_RELEASE_SHA??'',
  explicitApproval:env.COTIRONDA_AUTH_BOOTSTRAP_APPROVAL
 },ports);
 // Always safe: do not serialize number, id, HMAC, JWT, secret or API error.
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.state==='BLOCKED')process.exitCode=2;
}
await main().catch(()=>{
 process.stdout.write(JSON.stringify({state:'BLOCKED',
  code:'bootstrap_inesperadamente_no_disponible',userCreated:false})+'\n');
 process.exitCode=2;
});

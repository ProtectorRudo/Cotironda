/** COTIRONDA D013 — recuperación MANUAL única de buyer, piloto aislado.
 * Reutiliza el token de 96 hex del cron de recuperación existente (Vault),
 * validado mediante la RPC MVP132. No modifica Whapi ni su cron programado.
 * Operación EXPLÍCITA solamente: {"action":"check"} o {"action":"execute"}.
 * verify_jwt=false: token Vault es aleatorio, no un JWT; guardia propia.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {guardScheduledRecovery} from
 '../cotironda-piloto-document-recovery/scheduled-auth.ts';
import {recuperarBuyerReviewD013} from
 '../../../src/domain/ia-central/recuperacion-review-v2-d013.ts';
import {ejecutarRecuperacionVaultD013} from './worker-core.ts';
const ROOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const HEX=/^[a-f0-9]{64}$/u;
const RPC_ALLOWED=new Set([
 'cotironda_piloto_v2_d013_review_source_private',
 'cotironda_piloto_v2_d013_recovery_stage_private',
 'cotironda_piloto_ia_catalogo_mvp220'
]);
function env(){
 const url=Deno.env.get('SUPABASE_URL')??'';
 let role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!role)try{
  const parsed:unknown=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
  if(parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)&&
   typeof (parsed as Record<string,unknown>).default==='string')
   role=(parsed as Record<string,string>).default;
 }catch{return null}
 const aes=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 const ai=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
 if(url!==ROOT||role.length<20||!HEX.test(aes))return null;
 return {url,role,aes,ai,model:Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL')===
  'gpt-6.1-sol'?'gpt-6.1-sol' as const:'gpt-6-luna' as const};
}
Deno.serve(async req=>{
 const config=env();
 return guardScheduledRecovery(req,{
  enabled:config!==null,
  authorize:async token=>{
   if(!config)return false;
   const db=createClient(config.url,config.role,{auth:{
    autoRefreshToken:false,persistSession:false
   }});
   const {data,error}=await db.rpc('cotironda_piloto_recovery_token_allowed_mvp132',{
    p_token:token
   });
   return !error&&data===true;
  },
  run:async()=>{
   if(!config)throw Error('private_worker_configuration_invalid');
   const db=createClient(config.url,config.role,{auth:{
    autoRefreshToken:false,persistSession:false
   }});
   return ejecutarRecuperacionVaultD013(req,{
    enabled:true,
    recover:async execute=>recuperarBuyerReviewD013({
     ejecutar:execute,habilitado:true,
     aesKeyHex:config.aes,apiKey:execute?config.ai:'',
     model:config.model,
     // Solo codigos de enum fijo; nunca texto, identidad, HMAC ni secretos.
     onDiagnostic:code=>console.warn('cotironda_d013_recovery_'+code),
     rpc:async(name,params)=>{
      if(!RPC_ALLOWED.has(name))
       return {data:null,error:'rpc_not_allowed'};
      const {data,error}=await db.rpc(name,params);
      return {data,error};
     }
    })
   });
  }
 }).catch(()=>new Response(JSON.stringify({state:'worker_unavailable'}),{
  status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
 }));
});

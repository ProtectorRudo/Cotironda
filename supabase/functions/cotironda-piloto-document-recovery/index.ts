/**
 * MVP132 — private cron scheduled document recovery.
 * Token generated inside Vault, verified by service_role SQL RPC.
 * Does not send WhatsApp, expose source bytes or return private identifiers.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {recoverOneStoredDocument} from '../cotironda-piloto-whapi/private-document-recovery.ts';
import {runRecoveryService} from './logic.ts';
import {diagnoseOneStoredQuote} from './quote-reconciliation.ts';
import {guardScheduledRecovery} from './scheduled-auth.ts';
const REF='ilggkalaafhtiysyzlmg';
const root='https://'+REF+'.supabase.co';
type Secrets={roleKey:string;apiKey:string;url:string};
function secrets():Secrets|null{
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{
   const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof keys.default==='string')roleKey=keys.default;
  }catch{return null}
 }
 const apiKey=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
 if(url!==root||roleKey.length<20)return null;
 return {url,roleKey,apiKey};
}
Deno.serve(async(req)=>{
 const s=secrets();
 return guardScheduledRecovery(req,{
  enabled:s!==null&&
   Deno.env.get('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED')==='true',
  authorize:async(token)=>{
   if(!s)return false;
   const db=createClient(s.url,s.roleKey,{auth:{
     autoRefreshToken:false,persistSession:false
   }});
   const {data,error}=await db.rpc('cotironda_piloto_recovery_token_allowed_mvp132',{
    p_token:token
   });
   return !error&&data===true;
  },
  run:async()=>{
   if(!s)throw Error('missing_backend');
   const db=createClient(s.url,s.roleKey,{auth:{
    autoRefreshToken:false,persistSession:false
   }});
   return runRecoveryService(req,{
    enabled:true,projectMatches:s.url===root,
    modelKeyAvailable:s.apiKey.length>=20
   },{
    lookup:async()=>{
     const {data,error}=await db.rpc('cotironda_piloto_system_document_trigger_mvp131');
     return {data,error};
    },
    review:async()=>diagnoseOneStoredQuote({
     lookup:async()=>{
      const {data,error}=await db.rpc('cotironda_piloto_next_reconciliation_mvp134');
      return {data,error};
     },
     download:async(path)=>{
      const {data,error}=await db.storage.from('cotironda-piloto-originals')
       .download(path);
      return {data,error};
     },
     record:async(params)=>{
      const {data,error}=await db.rpc('cotironda_piloto_record_reconciliation_mvp134',
       params);
      return {data,error};
     }
    }),
    recover:async(triggerChatHmac)=>recoverOneStoredDocument({
     triggerChatHmac,apiKey:s.apiKey,enabled:true,io:{
      rpc:async(name,params)=>{
       const {data,error}=await db.rpc(name,params);
       return {data,error};
      },
      download:async(path)=>{
       const {data,error}=await db.storage
        .from('cotironda-piloto-originals').download(path);
       return {data,error};
      }
     }
    })
   });
  }
 });
});

/**
 * MVP131: internal service-to-service recovery; never sends WhatsApp.
 * Platform verify_jwt=false, but withSupabase requires a secret apikey.
 * No body or caller-supplied file IDs are accepted.
 */
import {withSupabase} from 'npm:@supabase/server@1.9.2';
import {recoverOneStoredDocument} from '../cotironda-piloto-whapi/private-document-recovery.ts';
import {runRecoveryService} from './logic.ts';
const REF='ilggkalaafhtiysyzlmg';
Deno.serve(withSupabase({auth:'secret'},async(req,ctx)=>{
 const url=Deno.env.get('SUPABASE_URL')??'';
 const model=Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'';
 const db=ctx.supabaseAdmin;
 return runRecoveryService(req,{
  enabled:Deno.env.get('COTIRONDA_PILOT_DOCUMENT_RECOVERY_ENABLED')==='true'&&
   Deno.env.get('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED')==='true',
  modelKeyAvailable:model.length>=20,
  projectMatches:url==='https://'+REF+'.supabase.co'
 },{
  lookup:async()=>{
   const {data,error}=await db.rpc('cotironda_piloto_system_document_trigger_mvp131');
   return {data,error};
  },
  recover:async(triggerChatHmac)=>recoverOneStoredDocument({
   triggerChatHmac,apiKey:model,enabled:true,io:{
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
}));

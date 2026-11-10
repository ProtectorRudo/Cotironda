/**
 * Cotironda V2 B3 — private Edge handler, NOT connected to cron.
 * Requires explicit deployment + both independent flags before use.
 * Service role / secret keys MUST stay server-side.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {ejecutarSolicitudSombraV2B3} from './handler.ts';
Deno.serve(request=>ejecutarSolicitudSombraV2B3(request,{
 COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED:
  Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED')??'',
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:
  Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_SECRET')??'',
 COTIRONDA_PILOT_OPENAI_API_KEY:
  Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
 COTIRONDA_PILOT_AI_CENTRAL_MODEL:
  Deno.env.get('COTIRONDA_PILOT_AI_CENTRAL_MODEL')??'',
 SUPABASE_URL:Deno.env.get('SUPABASE_URL')??'',
 SUPABASE_SERVICE_ROLE_KEY:
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 SUPABASE_SECRET_KEYS:Deno.env.get('SUPABASE_SECRET_KEYS')??''
},{
 createDb:(url,roleKey)=>{
  const db=createClient(url,roleKey,{auth:{
   autoRefreshToken:false,persistSession:false
  },global:{headers:{
   'x-cotironda-pilot-edge':'cotironda-piloto-v2-shadow'
  }}});
  return {
   rpc:async(name,args)=>{
    const {data,error}=await db.rpc(name,args);
    return {data,error};
   },
   storage:{from:bucket=>({
    download:async path=>{
     const {data,error}=await db.storage.from(bucket).download(path);
     return {data,error};
    }
   })}
  };
 }
}));

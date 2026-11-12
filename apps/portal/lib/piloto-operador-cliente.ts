/** PILOT-only operator adapter. Never touches DEV, production or service role. */
import {createClient} from '@supabase/supabase-js';
const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
export function puertosOperadorSupabasePiloto(jwt:string){
 const url=process.env.COTIRONDA_PILOT_SUPABASE_URL;
 const key=process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
 if(url!==PILOT_URL||!key?.startsWith('sb_publishable_'))
  throw new Error('operador_piloto_no_configurado');
 const client=createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{headers:{Authorization:'Bearer '+jwt}}
 });
 return {
  getUser:async(token:string)=>{
   if(token!==jwt)return null;
   const {data,error}=await client.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {id:data.user.id,is_anonymous:data.user.is_anonymous??null};
  },
  rpc:async(name:string,params:Record<string,unknown>)=>{
   const methods=new Set([
    'cotironda_piloto_operator_queue_auth_mvp267',
    'cotironda_piloto_operator_usage_auth_mvp267',
    'cotironda_piloto_operator_case_action_auth_mvp267',
    'cotironda_piloto_operator_usage_review_auth_mvp267',
    'cotironda_piloto_terms_review_packet_auth_p0',
    'cotironda_piloto_terms_review_decide_auth_p0'
   ]);
   if(!methods.has(name))throw new Error('operador_rpc_no_permitida');
   const {data,error}=await client.rpc(name,params);
   return {data,error};
  }
 };
}

/**
 * MVP173 — Edge STAGING SOLO DIAGNÓSTICO, lectura SQL privada sin escritura.
 * NO utilizar el slug de recuperación vigente, ni configurar cron.
 * Acceso: token de recuperación 96-hex validado contra Vault por RPC interna.
 * La ruta no incorpora IA, WhatsApp, originales o finalistas.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {runRoundPreviewMvp173} from './logic.ts';

const PILOT_REF='ilggkalaafhtiysyzlmg';
const PILOT_URL='https://'+PILOT_REF+'.supabase.co';
function config():Readonly<{url:string;roleKey:string}>|null{
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{
   const values=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof values.default==='string')roleKey=values.default;
  }catch{return null}
 }
 if(url!==PILOT_URL||roleKey.length<20)return null;
 return {url,roleKey};
}
Deno.serve(req=>{
 const conf=config();
 const db=conf?createClient(conf.url,conf.roleKey,{
  auth:{autoRefreshToken:false,persistSession:false}
 }):null;
 return runRoundPreviewMvp173(req,{
  enabled:db!==null,
  authorize:async(token)=>{
   if(!db)return false;
   const {data,error}=await db.rpc(
    'cotironda_piloto_recovery_token_allowed_mvp132',{p_token:token}
   );
   return !error&&data===true;
  },
  lookup:async(requestId)=>{
   if(!db)return {data:null,error:true};
   const {data,error}=await db.rpc(
    'cotironda_piloto_private_round_inputs_mvp172',
    {p_request_id:requestId}
   );
   return {data,error};
  }
 });
});

/**
 * Cotironda PILOTO — trabajador económico one-shot y aislado.
 * Solo procesar UN original privado después de token Vault autenticado.
 * No importa canal Whapi, recuperación IA, outbox, finalistas ni ranking.
 * Este entrypoint NO debe reemplazar cotironda-piloto-document-recovery.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {runEconomicOneShotMvp169} from './logic.ts';
import {auditarOriginalEconomicoMvp168} from
 '../cotironda-piloto-document-recovery/source-economics-mvp168.ts';

const PILOT_REF='ilggkalaafhtiysyzlmg';
const PILOT_URL='https://'+PILOT_REF+'.supabase.co';
type Config=Readonly<{url:string;roleKey:string}>;
function config():Config|null{
 const url=Deno.env.get('SUPABASE_URL')??'';
 let roleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
 if(!roleKey){
  try{
   const values=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
   if(typeof values.default==='string')roleKey=values.default;
  }catch{return null}
 }
 return url===PILOT_URL&&roleKey.length>=20?{url,roleKey}:null;
}
Deno.serve(req=>{
 const c=config();
 const db=c?createClient(c.url,c.roleKey,{
  auth:{autoRefreshToken:false,persistSession:false}
 }):null;
 return runEconomicOneShotMvp169(req,{
  enabled:db!==null,
  authorize:async token=>{
   if(!db)return false;
   const {data,error}=await db.rpc(
    'cotironda_piloto_recovery_token_allowed_mvp132',{p_token:token}
   );
   return !error&&data===true;
  },
  auditOne:async()=>{
   if(!db)return 'failed';
   return auditarOriginalEconomicoMvp168({
    lookup:async()=>{
     const {data,error}=await db.rpc(
      'cotironda_piloto_next_economic_facts_mvp168'
     );
     return {data,error};
    },
    download:async path=>{
     const {data,error}=await db.storage
      .from('cotironda-piloto-originals').download(path);
     return {data,error};
    },
    record:async payload=>{
     const {data,error}=await db.rpc(
      'cotironda_piloto_record_economic_facts_mvp168',payload
     );
     return {data,error};
    }
   });
  }
 });
});

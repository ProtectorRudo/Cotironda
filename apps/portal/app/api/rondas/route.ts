import {clienteSupabaseServidor,entornoAuthConfigurado}
 from '@/lib/supabase/server';
import {misRondasHabilitado,procesarMisRondasMvp014}
 from '../../../../../src/server/mis-rondas-http-mvp014.ts';
import {habilitarCreacionRondaD064,procesarCreacionRondaD064}
 from '../../../../../src/server/buyer-round-create-http-d064.ts';
import type {BuyerRoundInputD064}
 from '../../../../../src/server/buyer-round-create-http-d064.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(req:Request):Promise<Response>{
 const habilitado=misRondasHabilitado(process.env)&&entornoAuthConfigurado();
 let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
 return procesarMisRondasMvp014(req,{
  habilitado,
  verificarSesion:async()=>{
   cliente=await clienteSupabaseServidor();
   const {data:{user},error}=await cliente.auth.getUser();
   if(error||!user)return null;
   return {userId:user.id,emailVerificado:Boolean(user.email_confirmed_at),
    anonimo:Boolean(user.is_anonymous)};
  },
  leer:async()=>{
   if(!cliente)throw new Error('sin_sesion');
   const {data,error}=await cliente.rpc('buyer_round_list_mvp014');
   if(error||!Array.isArray(data))throw new Error('lista_rpc_no_disponible');
   return data;
  }
 });
}

/** A request submits a reviewed material list; no provider is selected/sent. */
export async function POST(req:Request):Promise<Response>{
 const habilitado=habilitarCreacionRondaD064(process.env)&&entornoAuthConfigurado();
 let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
 return procesarCreacionRondaD064(req,{
  habilitado,
  originPermitido:process.env.COTIRONDA_SITE_ORIGIN??'',
  verificarSesion:async()=>{
   cliente=await clienteSupabaseServidor();
   const {data:{user},error}=await cliente.auth.getUser();
   if(error||!user)return null;
   return {userId:user.id,emailVerificado:Boolean(user.email_confirmed_at),
    anonimo:Boolean(user.is_anonymous)};
  },
  crear:async(input:BuyerRoundInputD064)=>{
   if(!cliente)throw new Error('auth_required');
   const {data,error}=await cliente.rpc('create_buyer_round_d064',{
    p_buyer:input.companyId??null,
    p_key:input.requestId,
    p_zone:input.deliveryZone.trim(),
    p_iva:input.vatRequest,
    p_items:input.items
   });
   if(error)throw new Error('create_round_rpc_unavailable');
   return data;
  }
 });
}

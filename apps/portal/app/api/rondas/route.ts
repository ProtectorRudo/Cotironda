import {clienteSupabaseServidor,entornoAuthConfigurado}
 from '@/lib/supabase/server';
import {misRondasHabilitado,procesarMisRondasMvp014}
 from '../../../../../src/server/mis-rondas-http-mvp014.ts';
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

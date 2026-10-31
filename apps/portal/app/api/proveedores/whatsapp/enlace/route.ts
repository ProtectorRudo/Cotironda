import {clienteSupabaseServidor,entornoAuthConfigurado}
 from '@/lib/supabase/server';
import {habilitarPantallaAltaWhatsAppD073,procesarEnlaceAltaProveedorD073}
 from '../../../../../../src/server/supplier-whatsapp-link-http-d073.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/** POST only. Never returns recipient HMAC, token by itself or supplier data. */
export async function POST(req:Request):Promise<Response>{
 const habilitado=habilitarPantallaAltaWhatsAppD073(process.env)&&
  entornoAuthConfigurado();
 let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
 return procesarEnlaceAltaProveedorD073(req,{
  habilitado,
  originPermitido:process.env.COTIRONDA_SITE_ORIGIN??'',
  channel:process.env.COTIRONDA_SUPPLIER_WA_CHANNEL??'',
  botNumber:process.env.COTIRONDA_SUPPLIER_WA_BOT_NUMBER??'',
  verificarSesion:async()=>{
   cliente=await clienteSupabaseServidor();
   const {data:{user},error}=await cliente.auth.getUser();
   if(error||!user)return null;
   return {userId:user.id,emailVerificado:Boolean(user.email_confirmed_at),
    anonimo:Boolean(user.is_anonymous)};
  },
  emitir:async(_sql,args)=>{
   if(!cliente)throw Error('sesion_no_disponible');
   // Authenticated JWT flows via SSR/PostgREST, never service_role.
   const {data,error}=await cliente.rpc('whapi_issue_supplier_code_d072',{
    p_supplier:args[0] as string,p_channel:args[1] as string
   });
   if(error)throw Error('emision_no_disponible');
   return {payload:data};
  }
 });
}
export async function GET():Promise<Response>{
 return new Response(JSON.stringify({error:'metodo_no_permitido'}),{
  status:405,headers:{'content-type':'application/json; charset=utf-8',
   'cache-control':'private, no-store','referrer-policy':'no-referrer'}
 });
}

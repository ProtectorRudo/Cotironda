import {clienteSupabaseServidor,entornoAuthConfigurado}
 from '@/lib/supabase/server';
import {puertoRondasSoloLectura} from '@/lib/rondas-read-rpc';
import {puertoPreciosDeclaradosMvp014} from '@/lib/cotizaciones-recibidas-rpc-mvp014';
import {procesarLecturaOfertasMvp014,ofertasLecturaHabilitada}
 from '../../../../../../../src/server/cotizaciones-recibidas-http-mvp014.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

export async function GET(req:Request,context:{params:Promise<{rondaId:string}>}):Promise<Response>{
 const habilitado=ofertasLecturaHabilitada(process.env)&&entornoAuthConfigurado();
 let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
 return procesarLecturaOfertasMvp014(req,(await context.params).rondaId,{
  habilitado,
  verificarSesion:async()=>{
   cliente=await clienteSupabaseServidor();
   const {data:{user},error}=await cliente.auth.getUser();
   if(error||!user)return null;
   return {userId:user.id,emailVerificado:Boolean(user.email_confirmed_at),
    anonimo:Boolean(user.is_anonymous)};
  },
  leerPropia:async id=>{
   if(!cliente)throw new Error('sin_sesion');
   return puertoRondasSoloLectura(cliente).leerPropia(id);
  },
  leerOfertas:async id=>{
   if(!cliente)throw new Error('sin_sesion');
   return puertoPreciosDeclaradosMvp014(cliente).leerOfertas(id);
  }
 });
}

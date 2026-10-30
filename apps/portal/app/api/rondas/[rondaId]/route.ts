import {clienteSupabaseServidor,entornoAuthConfigurado} from '@/lib/supabase/server';
import {puertoRondasSoloLectura} from '@/lib/rondas-read-rpc';
import {procesarLecturaRonda,rondasLecturaHabilitada} from '../../../../../../src/server/rondas-lectura-http.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

export async function GET(req:Request,context:{params:Promise<{rondaId:string}>}):Promise<Response>{
  const enabled=rondasLecturaHabilitada(process.env)&&entornoAuthConfigurado();
  let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
  return procesarLecturaRonda(req,(await context.params).rondaId,{
    habilitado:enabled,
    verificarSesion:async()=>{
      cliente=await clienteSupabaseServidor();
      const {data:{user},error}=await cliente.auth.getUser();
      if(error||!user)return null;
      return {userId:user.id,emailVerificado:Boolean(user.email_confirmed_at),
        anonimo:Boolean(user.is_anonymous)};
    },
    leerPropia:async(roundId)=>{
      if(!cliente)throw new Error('auth_faltante');
      return puertoRondasSoloLectura(cliente).leerPropia(roundId);
    }
  });
}

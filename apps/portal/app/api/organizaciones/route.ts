import { clienteSupabaseServidor } from '@/lib/supabase/server';
import { puertoRegistroRpc } from '@/lib/registro-rpc';
import { procesarAlta } from '../../../../../src/server/registro-http.ts';
import { portalHabilitado } from '../../../../../src/server/portal-entorno.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request): Promise<Response> {
  let cliente:Awaited<ReturnType<typeof clienteSupabaseServidor>>|null=null;
  return procesarAlta(req,{
    configurado:portalHabilitado(process.env),
    originPermitido:process.env.COTIRONDA_SITE_ORIGIN||'',
    verificarSesion:async()=>{
      cliente=await clienteSupabaseServidor();
      const {data:{user},error}=await cliente.auth.getUser();
      if(error||!user)return null;
      return {
        userId:user.id,
        emailVerificado:Boolean(user.email_confirmed_at),
        anonimo:Boolean(user.is_anonymous)
      };
    },
    // La función RPC asigna user_id de los claims de Supabase, no del payload.
    autorizarIntento:async()=>true,
    persistencia:{
      async crearEmpresaConPropietario(input){
        if(!cliente)throw new Error('sesion_no_disponible');
        return puertoRegistroRpc(cliente).crearEmpresaConPropietario(input);
      }
    }
  });
}

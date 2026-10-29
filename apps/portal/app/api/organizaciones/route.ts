import { clienteSupabaseServidor } from '@/lib/supabase/server';
import { puertoRegistroPostgres } from '@/lib/database';
import { procesarAlta } from '../../../../../src/server/registro-http.ts';
import { portalHabilitado } from '../../../../../src/server/portal-entorno.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const configurado = portalHabilitado(process.env);
  return procesarAlta(req,{
    configurado,
    originPermitido:process.env.COTIRONDA_SITE_ORIGIN||'',
    verificarSesion:async()=>{
      // Supabase Auth verifica la identidad contra su servidor: jamás usar userId enviado por formulario.
      const client=await clienteSupabaseServidor();
      const {data:{user},error}=await client.auth.getUser();
      if(error || !user) return null;
      return { userId:user.id, emailVerificado:Boolean(user.email_confirmed_at), anonimo:Boolean(user.is_anonymous) };
    },
    // SQL register_company aplica cuota atómica por actor tras lock, incluso con requests concurrentes.
    autorizarIntento:async()=>true,
    persistencia:puertoRegistroPostgres()
  });
}

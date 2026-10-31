import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { autenticacionPortalHabilitada, autenticacionPreviewSoloIngreso, autenticacionPreviewProveedorD074, autenticacionPreviewCompradorMvp028 } from '../../../../src/server/portal-entorno.ts';

export function entornoAuthConfigurado(): boolean {
  return autenticacionPortalHabilitada(process.env);
}
export function entornoAuthSoloIngresoPreview(): boolean {
  return autenticacionPreviewSoloIngreso(process.env)||autenticacionPreviewProveedorD074(process.env);
}
export async function clienteSupabaseServidor() {
  if (!entornoAuthConfigurado()) throw new Error('auth_no_configurada');
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions:{
        secure:process.env.NODE_ENV==='production',
        sameSite:'lax',
        path:'/'
      },
      cookies: {
        getAll() { return store.getAll(); },
        setAll(valores) {
          try { valores.forEach(({name,value,options})=>store.set(name,value,options)); }
          catch { /* Server Components de solo lectura: el Proxy refresca cookies. */ }
        }
      }
    }
  );
}

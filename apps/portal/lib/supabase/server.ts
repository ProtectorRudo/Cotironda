import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function entornoAuthConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function clienteSupabaseServidor() {
  if (!entornoAuthConfigurado()) throw new Error('auth_no_configurada');
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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

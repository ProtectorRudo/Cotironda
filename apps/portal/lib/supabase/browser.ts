'use client';
import { createBrowserClient } from '@supabase/ssr';
export function clienteSupabaseNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // El navegador y el servidor usan atributos de cookie compatibles.
  // El preview/prod de Next corre sobre HTTPS; localhost HTTP de desarrollo
  // conserva la capacidad de iniciar sesión sin una cookie Secure inválida.
  return createBrowserClient(url,key,{
    cookieOptions:{
      secure:process.env.NODE_ENV==='production',
      sameSite:'lax',
      path:'/'
    }
  });
}

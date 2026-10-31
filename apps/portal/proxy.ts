import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server.js';
import { portalHabilitado, autenticacionPortalHabilitada } from '../../src/server/portal-entorno.ts';

export async function proxy(request: NextRequest) {
  // Inactive environments never contact an unrelated Supabase installation.
  // No consultar Auth para la API de altas cuando el registro comercial está cerrado.
  const permitida=request.nextUrl.pathname==='/api/organizaciones'
    ? portalHabilitado(process.env)
    : autenticacionPortalHabilitada(process.env);
  if (!permitida) {
    const disabled = NextResponse.next({request});
    disabled.headers.set('Cache-Control','private, no-store');
    return disabled;
  }
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  let response=NextResponse.next({request});
  const supabase=createServerClient(url,key,{
    // El proxy corre detrás de HTTPS en producción. No derivar Secure de
    // headers X-Forwarded-* aportados por el usuario.
    cookieOptions:{
      secure:process.env.NODE_ENV==='production',
      sameSite:'lax',
      path:'/'
    },
    cookies:{
      getAll(){return request.cookies.getAll();},
      setAll(cookiesToSet, headersToSet){
        cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
        // Supabase SSR >=0.10 passes response headers when tokens are refreshed.
        if (headersToSet instanceof Headers) {
          headersToSet.forEach((value,name)=>response.headers.set(name,value));
        } else {
          for (const [name,value] of Object.entries(headersToSet ?? {})) {
            response.headers.set(name,value);
          }
        }
        response.headers.set('Cache-Control','private, no-store');
      }
    }
  });
  await supabase.auth.getClaims();
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/ingresar','/alta','/api/organizaciones',
 '/proveedores/whatsapp','/api/proveedores/whatsapp/enlace']};

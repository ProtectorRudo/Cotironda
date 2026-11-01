import type { NextConfig } from 'next';
import path from 'node:path';
// Solo en el build aislado de Preview, registrar un booleano del guard Git.
// No imprimir la referencia, el entorno ni secretos: una Preview de otra rama
// debe quedar sin login aunque el flag global Preview exista por el proyecto.
if(process.env.COTIRONDA_AUTH_PREVIEW_ENABLED==='true' && process.env.VERCEL_ENV==='preview'){
  console.log('COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD='+
    (['test/01-auth-only-preview','security/01-browser-cookie-cache-audit',
     'security/01-auth-signup-readonly-check'].includes(
      process.env.VERCEL_GIT_COMMIT_REF||'')?'ALLOW':'DENY'));
}
// La Preview de Auth no puede insertarse en iframes: protege el login de
// clickjacking. CSP acotada a directivas documentales; no añadir script-src
// ni style-src sin nonces por request: rompería hidratación de Next App Router.
// Headers globales independientes del refresh de cookies del Proxy SSR.
const SEGURIDAD_HTTP = [
  {key:'X-Frame-Options',value:'DENY'},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'no-referrer'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'},
  {key:'Content-Security-Policy',
   value:"frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"},
  {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}
] as const;

const config: NextConfig = {
  outputFileTracingRoot:path.resolve(__dirname,'../..'),
  poweredByHeader:false,
  async headers(){
    return [{source:'/:path*',headers:[...SEGURIDAD_HTTP]}];
  }
};
export default config;

import type { NextConfig } from 'next';
import path from 'node:path';
// Solo en el build aislado de Preview, registrar un booleano del guard Git.
// No imprimir la referencia, el entorno ni secretos: una Preview de otra rama
// debe quedar sin login aunque el flag global Preview exista por el proyecto.
if(process.env.COTIRONDA_AUTH_PREVIEW_ENABLED==='true' && process.env.VERCEL_ENV==='preview'){
  console.log('COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD='+
    (process.env.VERCEL_GIT_COMMIT_REF==='test/01-auth-only-preview'?'ALLOW':'DENY'));
}
const config: NextConfig = { outputFileTracingRoot: path.resolve(__dirname, '../..'), poweredByHeader: false };
export default config;

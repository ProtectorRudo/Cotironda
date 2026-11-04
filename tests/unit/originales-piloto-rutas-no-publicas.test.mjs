import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const catalog=file('apps/portal/app/api/piloto/originales/[rondaId]/route.ts');
const download=file('apps/portal/app/api/piloto/originales/[rondaId]/[documentoId]/route.ts');
const http=file('apps/portal/lib/piloto-originales-http.ts');
const sdk=file('apps/portal/lib/piloto-originales-cliente.ts');
const runtime=file('src/server/originales-piloto-http-runtime.ts');
const sql=file('supabase/piloto/mvp192_private_originals_catalog_and_context.sql');
const projection=file('src/server/catalogo-originales-comprador-mvp192.ts');
const env=file('apps/portal/.env.example');
const proxy=file('apps/portal/proxy.ts');

test('Las dos rutas existen en Next Node.js y son dinámicas sin revalidación',()=>{
 for(const src of [catalog,download]){
  assert.match(src,/export const runtime='nodejs'/);
  assert.match(src,/export const dynamic='force-dynamic'/);
  assert.match(src,/export const revalidate=0/);
  assert.match(src,/export async function GET/);
 }
 assert.match(catalog,/responderCatalogoOriginalesPiloto/);
 assert.match(download,/responderDescargaOriginalPiloto/);
});

test('Las rutas no acceden a DEV ni a bearer compartido de WhatsApp',()=>{
 for(const src of [catalog,download,http,sdk,runtime]){
  assert.doesNotMatch(src,/COTIRONDA_DEV_REF|qkercsoqhehbenbbncwk/u);
  assert.doesNotMatch(src,/window\.location|localStorage|document\.cookie|createSignedUrl/);
 }
 assert.match(runtime,/bearerPiloto/);
 assert.match(runtime,/claimsDeJwtValidado/);
 assert.match(runtime,/verificarSesionAutentica/);
 assert.match(runtime,/VERCEL_GIT_COMMIT_SHA===sha/);
});

test('El servicio real verifica el JWT del mismo Supabase PILOTO y usa dos clientes separados',()=>{
 assert.match(sdk,/buyer\.auth\.getUser\(jwt\)/);
 assert.match(sdk,/buyer\.rpc\('cotironda_piloto_buyer_identity_mvp191'/);
 assert.match(sdk,/privateClient\.rpc\(/);
 assert.match(sdk,/cotironda_piloto_originals_private_mvp192/);
 assert.match(sdk,/privateClient\.storage\.from\(STORAGE_BUCKET\)/);
 assert.match(sdk,/auth:\{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false\}/);
 assert.match(sdk,/sb_secret_/);
 assert.doesNotMatch(sdk,/NEXT_PUBLIC_\w*SECRET|NEXT_PUBLIC_\w*SERVICE_ROLE|createSignedUrl/);
});

test('La empresa procede de RPC SQL privado, no de encabezados ni claims editables',()=>{
 assert.match(sql,/'buyerKey',v_buyer/);
 assert.match(runtime,/raw\.buyerKey/);
 assert.match(runtime,/companyOfPrivateCatalog/);
 assert.match(projection,/documentoId:entry\.documentId/);
 assert.doesNotMatch(projection,/buyerKey|sellerPhone|supplierPhone/);
 assert.doesNotMatch(http,/p_company|p_user_id|companyId|req\.json\(/);
});

test('Flag privado apagado por defecto y entorno preview versionado explícitamente',()=>{
 assert.match(env,/^COTIRONDA_PILOT_ORIGINALS_ENABLED=false$/mu);
 assert.match(env,/^COTIRONDA_PILOT_ORIGINALS_RELEASE_SHA=$/mu);
 assert.match(env,/^COTIRONDA_PILOT_SUPABASE_SECRET_KEY=$/mu);
 assert.match(runtime,/env\.VERCEL_ENV==='preview'/);
 assert.match(runtime,/env\.COTIRONDA_REGISTRATION_ENABLED==='false'/);
 assert.match(http,/if\(!originalesHTTPHabilitados\(process\.env\)\)/);
});

test('Rutas del piloto no pasan por el middleware de Auth DEV',()=>{
 assert.doesNotMatch(proxy,/\/api\/piloto\/originales/u);
 assert.doesNotMatch(runtime,/COTIRONDA_AUTH_PREVIEW_ENABLED/);
 assert.match(http,/if\(!token\)return \{token:null,error:failure\(401\)\}/);
});

test('Sin selector o política, la ruta no puede crear un permiso ficticio',()=>{
 assert.match(runtime,/raw\.state==='authorized_catalog'/);
 assert.match(http,/if\(!catalogo\)return failure\(404\)/);
 assert.match(http,/const deps=conectarOriginalesAuthPiloto/);
 assert.match(http,/descargarOriginalPiloto/);
 assert.doesNotMatch(http,/signedUrl|supabase\.storage\.getPublicUrl/);
});

test('Headers sin caché ni detalles internos; límite de Storage y permisos privativos',()=>{
 assert.match(http,/private, no-store, no-cache/);
 assert.match(http,/x-content-type-options/);
 assert.match(http,/vary':'Authorization/);
 assert.match(sdk,/data\.size>8388608/);
 assert.match(sdk,/^const STORAGE_BUCKET='cotironda-piloto-originals'/mu);
 assert.match(sdk,/^  readOriginal:async\(bucket,path\)=>\{/mu);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
 autenticacionPreviewProveedorD074,autenticacionPortalHabilitada,
 autenticacionPreviewSoloIngreso,portalHabilitado
} from '../../src/server/portal-entorno.ts';
import {habilitarPantallaAltaWhatsAppD073}
 from '../../src/server/supplier-whatsapp-link-http-d073.ts';

const env={
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_REGISTRATION_ENABLED:'false',COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 COTIRONDA_SUPPLIER_WA_UI_ENABLED:'true',
 COTIRONDA_SUPPLIER_WA_BOT_NUMBER:'5492211234567',
 COTIRONDA_SUPPLIER_WA_CHANNEL:'mvp026_ci_channel',
 COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
 NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ci_dummy_never_valid',
 COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example'
};
test('D074 permite login existente y WhatsApp en Preview sin habilitar registro',()=>{
 assert.equal(autenticacionPreviewProveedorD074(env),true);
 assert.equal(autenticacionPortalHabilitada(env),true);
 assert.equal(habilitarPantallaAltaWhatsAppD073(env),true);
 assert.equal(portalHabilitado(env),false);
 assert.equal(autenticacionPreviewSoloIngreso(env),false);
});
test('D074 bloquea producción, registro general, otras ramas y refs',()=>{
 for(const changed of [
  {VERCEL_ENV:'production'},{VERCEL_ENV:'development'},
  {VERCEL_GIT_COMMIT_REF:'main'},
  {VERCEL_GIT_COMMIT_REF:'feat/mvp-025-ui-alta-whatsapp-proveedor'},
  {VERCEL_GIT_COMMIT_REF:''},{COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:undefined},
  {COTIRONDA_SUPPLIER_WA_UI_ENABLED:'false'},
  {COTIRONDA_SUPPLIER_WA_UI_ENABLED:undefined},
  {COTIRONDA_SUPABASE_PROJECT_REF:'otro-proyecto'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://otra.supabase.co'},
  {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_forbidden'},
  {COTIRONDA_SITE_ORIGIN:'http://evil.example'},
  {COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example/extra'},
  {SUPABASE_SERVICE_ROLE_KEY:'secret'},
  {COTIRONDA_DATABASE_URL:'postgres://hidden'}
 ]){
  const candidate={...env,...changed};
  assert.equal(autenticacionPreviewProveedorD074(candidate),false,
   'D074 fail closed for '+Object.keys(changed).join(','));
  assert.equal(habilitarPantallaAltaWhatsAppD073(candidate),false,
   'D073 fail closed for '+Object.keys(changed).join(','));
 }
});
test('D074 no permite solo con antiguo Preview de login cuando falta flag WhatsApp',()=>{
 const old={...env,COTIRONDA_SUPPLIER_WA_UI_ENABLED:'false',
  VERCEL_GIT_COMMIT_REF:'test/01-auth-only-preview'};
 assert.equal(autenticacionPreviewSoloIngreso(old),true);
 assert.equal(autenticacionPreviewProveedorD074(old),false);
 assert.equal(habilitarPantallaAltaWhatsAppD073(old),false);
 assert.equal(portalHabilitado(old),false);
});
test('D074 no habilita el registro global al entrar por proveedor',()=>{
 for(const e of [env,{...env,COTIRONDA_SUPPLIER_WA_BOT_NUMBER:''}]){
  assert.equal(portalHabilitado(e),false);
 }
});

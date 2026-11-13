import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('D016: la pantalla de ingreso no muestra SMS ni credenciales en URL query',()=>{
 const page=src('apps/portal/app/piloto/v2/acceso/page.tsx');
 const client=src('apps/portal/app/piloto/v2/acceso/acceso-whatsapp-client.tsx');
 assert.match(page,/puertaWhatsappPortalD016\(process\.env\)/u);
 assert.match(page,/notFound\(\)/u);
 assert.match(client,/window\.location\.hash\.slice\(1\)/u);
 assert.match(client,/history\.replaceState/u);
 assert.match(client,/method:'POST'/u);
 assert.match(client,/credentials:'same-origin'/u);
 assert.match(client,/estado|SESSION_CREATED/u);
 assert.doesNotMatch(client,/localStorage|signInWithOtp|password|sms|email/u);
});
test('D016: las APIs WhatsApp dependen de cookie y RPC exclusivamente privada',()=>{
 const adapter=src('apps/portal/lib/piloto-v2-d016-http.ts');
 const response=src('apps/portal/app/api/piloto/v2/rondas/[rondaId]/respuestas-whatsapp/route.ts');
 const file=src('apps/portal/app/api/piloto/v2/rondas/[rondaId]/originales-whatsapp/[documentoId]/route.ts');
 const ticket=src('apps/portal/app/api/piloto/v2/acceso/canjear/route.ts');
 assert.match(adapter,/COTIRONDA_D016_ENABLED==='true'/u);
 assert.match(adapter,/VERCEL_GIT_COMMIT_SHA/u);
 assert.match(adapter,/cookieSesionD016/u);
 assert.match(adapter,/session_context_private/u);
 assert.match(adapter,/cotironda_piloto_v2_d016_responders_with_analysis_private/u);
 assert.match(adapter,/cotironda_piloto_v2_d016_original_source_private/u);
 assert.match(adapter,/cotironda_piloto_v2_d016_record_download_private/u);
 assert.match(adapter,/privateDb/u);
 assert.doesNotMatch(adapter,/createSignedUrl|createUser|signInWithOtp/u);
 assert.match(response,/listarPorWhatsappD016/u);
 assert.match(file,/descargarOriginalPorWhatsappD016/u);
 assert.match(ticket,/canjearAccesoPortalD016/u);
 const logout=src('apps/portal/app/api/piloto/v2/acceso/salir/route.ts');
 assert.match(logout,/cerrarSesionPortalD016/u);
 assert.match(adapter,/cotironda_piloto_v2_d016_logout_private/u);
 assert.match(adapter,/sec-fetch-site/u);
 assert.doesNotMatch(response+file+ticket,/COTIRONDA_REGISTRATION_ENABLED='true'/u);
});
test('D016: archivos sólo por sesión privada, nunca por JWT de SMS',()=>{
 const core=src('src/server/v2-d016-descarga-privada.ts');
 const client=src('apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx');
 assert.match(core,/verificarSesion/u);
 assert.match(core,/fuentePrivada/u);
 assert.match(core,/leerStorage/u);
 assert.match(core,/registrarAuditoria/u);
 assert.match(core,/createHash\('sha256'\)/u);
 assert.doesNotMatch(core,/'text\/plain'\s*:/u);
 assert.match(client,/credentials:'same-origin'/u);
 assert.match(client,/respuestas-whatsapp/u);
 assert.match(client,/originales-whatsapp/u);
 assert.match(client,/api\/piloto\/v2\/acceso\/salir/u);
 assert.match(client,/Cerrar sesión/u);
 assert.match(client,/WhatsApp \(texto\)/u);
 assert.doesNotMatch(client,/Bearer |getSession\(|auth\.signOut\(|sms/u);
});
test('D016 SQL: la ruta de WhatsApp preserva relaciones V2 originales y prohíbe anon',()=>{
 const sql=src('supabase/piloto/v2_d016_respuestas_y_originales_CANDIDATE.sql');
 for(const part of [
  'v2_original_share_policy','v2_supplier_original_consents',
  'ai_dispatch_jobs_mvp222','ai_supplier_links_mvp225',
  'media_archive_mvp095','ai_supplier_unresolved_mvp237',
  'cotironda_piloto_v2_d016_session_context_private',
  'cotironda_piloto_v2_d016_original_source_private',
  'cotironda_piloto_v2_d016_record_download_private',
  'v2_d016_original_download_audit'
 ])assert.ok(sql.includes(part),part);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION/u);
 assert.doesNotMatch(sql,/p_auth_user_id|p_auth_session_id/u);
});

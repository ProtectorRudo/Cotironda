# Cotironda — publicación controlada del selector documental en PILOTO

**Fecha:** 5/11/2026 (Argentina)  
**Autorización:** usuario «Publica avanza», interpretada dentro del alcance previamente acordado: solo `cotironda-piloto`, sin habilitar WhatsApp ni revelación de contactos.  
**Fuente de verdad del código:** DEV `feat/mvp174-supplier-packaging-equivalence`, commit probado `ca0daebb2f616e5e5bfb99e36d42d4063abe17ac` (PR #579, posterior a #576–#578).  
**PRODUCCIÓN y `main`:** sin cambios. `main` observado `5987f1705ff1dba609489374531fa9e942150e7a`.

## Publicación efectuada (confirmada mediante Supabase conectado)

Proyecto exclusivo: `cotironda-piloto`, ID `ilggkalaafhtiysyzlmg`, PostgreSQL 17.11, región `sa-east-1`.

1. **Migración aplicada con éxito:** `20261105060755_mvp196_198_commercial_source_finalists_private_pilot_plan_only`, a partir de `supabase/piloto/mvp196_commercial_finalists_source_plan_off.sql` en DEV (blob `df802f89ac1ecec4f0b2b29233ad0117454b29ae`). Se instalaron cinco RPC internas `cotironda_piloto_commercial_due_mvp196`, `...commit_commercial_plan_mvp196`, `...source_plan_sendable_mvp196`, `...commercial_queue_due_mvp196`, `...tracking_source_plan_mvp196`, y la tabla privada `finalist_source_plans_mvp196`.
2. **Edge `cotironda-piloto-finalistas`: versión 1 → 2, ACTIVE**, SHA remoto `9f2b7c8a6b7df292085ab8a9517f5b99321fe27cd31b1d007f6388bde7fba5a0`. Se desplegaron el entrypoint original y sus 10 dependencias del commit DEV. Reemplaza la selección por comparación literal, planifica en modo privado mediante v9 y separa completamente despacho de WhatsApp. Mantiene `verify_jwt=false` igual que la versión anterior: su defensa sigue siendo el secreto de trabajador, las banderas y los permisos de RPC.
3. **Edge `cotironda-piloto-seguimiento`: versión 13 → 14, ACTIVE**, SHA remoto `282c704733753ff967c5aca84aa2209df644b0dc358a7bb92652403ac28743c7`. Se desplegaron el entrypoint original y sus 13 dependencias. El seguimiento no puede revelar finalistas sin la función privada v196, un token vigente, comprador autorizado y ronda cerrada. Incluye proyecciones posteriores al cierre ya validadas en DEV.
4. **Edge `cotironda-piloto-whapi`: permanece versión 45**. No se tocó la recepción, el envío ni su canal. No se publicó Next/Vercel ni se modificó la web de seguimiento existente.

## Comprobaciones realizadas

- Postmigración, las **cinco funciones** nuevas son `SECURITY DEFINER` con `search_path=''` y **`EXECUTE=false` para `anon` y `authenticated`; `EXECUTE=true` solo para `service_role`**. La tabla nueva tiene RLS activo.
- `commercial_due_mvp196(5)` y `commercial_queue_due_mvp196(5)` responden `pilot_finalist_off`. Un enlace sintético responde `false` a `tracking_source_plan_mvp196`, y un plan nulo devuelve `invalid_plan`.
- Los datos reales permanecieron: **3 solicitudes `prepared`, 0 cerradas, 4 originales, 0 planes y 0 avisos de finalistas**. La bandera SQL `finalist_activation_mvp113.enabled=false`, `activated_at=null`. No se modificó el cron existente de cierre natural.
- `list_migrations` confirma la migración instalada, y `get_edge_function` comprueba las versiones **2** y **14** `ACTIVE`, con entradas nuevas y guardias de fuente.
- En DEV: PR #576/577/578 con PostgreSQL17 aislado y Deno; PR #579 validó los **4 originales estructuralmente anonimizados**, 10 líneas y las recomendaciones comerciales de ambas rondas (2 alternativas completas para áridos/cemento, 1 para cemento/hidrófugo); **2.285/2.285 pruebas unitarias** aprobadas y **5/5 workflows** de ese último PR.
- **HTTP POST/GET realmente comprobados (05/11/2026, prueba posterior):** la red de las herramientas externas no resolvía el dominio, pero el sistema `pg_net` del MISMO proyecto sí permitió probar los endpoints públicos por HTTPS. Solicitudes `net._http_response.id` 596–600: `GET /functions/v1/cotironda-piloto-finalistas` → **405** `method_not_allowed`, `GET /functions/v1/cotironda-piloto-seguimiento` → **200 HTML**, `POST finalistas` sin secreto → **503** `worker_off`, `POST seguimiento` con token sintético de 64 caracteres → **200** `not_found`. Peticiones 601–602 con la **clave pública anon** de Supabase a `/rest/v1/rpc/cotironda_piloto_commercial_due_mvp196` y `...tracking_source_plan_mvp196` → ambas **401** `permission denied` (SQLSTATE `42501`). No se enviaron tokens privados reales ni mensajes. **Este es un smoke HTTP real** de seguridad y conectividad, **pero NO** una prueba de navegador interactivo ni un cierre E2E con comprador y proveedores.


### Smoke HTTP de la web del comprador publicada (05/11/2026)

También se probaron los archivos y la API de la web Vercel **ya publicada previamente**, sin cambiar su deployment:

- `GET https://cotironda-seguimiento-vista-piloto-iwcpjiqao.vercel.app/seguimiento` → **200 HTML** (respuesta pg_net 604).
- `GET /site.js` → **200 JavaScript** (606); inspección del código servido demuestra que el navegador consulta `POST /api/estado`, no `POST /seguimiento`.
- `GET /site.css` → **200 CSS** (608).
- `POST /api/estado` con token **sintético** de 64 caracteres hexadecimales → **200 JSON `{"state":"not_found"}`** (607). Se hizo un POST exploratorio a `/seguimiento` (605) que devolvió 405; **no es un fallo**, esa ruta HTML no es el endpoint utilizado por la app.

Las peticiones fueron hechas por HTTPS desde el proyecto Supabase con `pg_net`. No se emplearon enlaces reales, tokens, nombres o contactos de compradores. **No hay prueba de navegador con sesión real ni de ronda cerrada; solo disponibilidad de web/activos, API y rechazo de token falso.**

## Banderas y pendientes

La publicación **no habilita por sí sola las recomendaciones en rondas nuevas**: el interruptor SQL prospectivo de finalistas queda OFF, y no hay constancia de que los secretos/banderas del worker estén configurados para llamadas reales. Por diseño, el nuevo worker exige:
- `COTIRONDA_PILOT_FINALIST_WORKER_ENABLED=true`, `COTIRONDA_PILOT_COMMERCIAL_SELECTOR_MVP196_ENABLED=true`, secreto privado del worker y `finalist_activation_mvp113` prospectiva para planificar.
- `COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED=true` **adicional**, más `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED=true` y las claves, **solo** para siquiera intentar WhatsApp; no se activó ningún mecanismo de despacho aquí.
- `COTIRONDA_PILOT_FINALIST_VIEW_ENABLED=true` y consentimiento vigente para visualizar contactos; no se activó aquí.

**Siguiente control antes de activar nada:** los rechazos POST HTTP anónimos y de token ficticio ya fueron comprobados; auditar la configuración *sin leer ni publicar secretos*; preparar un caso totalmente nuevo con consentimiento prospectivo; probar plan-only sin envíos; recién después decidir por separado contacto y cierre. El comparador económico homogéneo (#524), originales de todos los proveedores (#525) y E2E WhatsApp (#523/#528/#529) siguen pendientes.

## Lints de seguridad posteriores

Supabase reportó `rls_enabled_no_policy` de nivel **INFO** en 43 tablas de esquema privado, incluida la nueva: es la configuración de denegación por defecto; la RPC definer restringida a `service_role` controla acceso. Informó dos avisos **WARN** ajenos a esta migración: extensión `pg_net` en `public` y RPC `cotironda_piloto_my_rounds_mvp126` y `cotironda_piloto_new_web_link_mvp126` ejecutables por `authenticated` como definer. Son hallazgos que ameritan auditoría puntual, no un cambio improvisado del piloto.

Referencias oficiales:
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Reversión y límites

Para detener el funcionamiento de finalistas, mantener/apagar las banderas externas de selección, envío y revelado y la activación SQL; no borrar registros históricos ni abrir ejecución pública. Ante regresión del seguimiento o worker, volver únicamente a las versiones 13/1 de PILOTO mediante una reversión controlada de Edge (código respaldado en GitHub), conservando la nueva tabla y sus guardias. No se realizó reversión ni se necesitó. Sin despliegue de producción.

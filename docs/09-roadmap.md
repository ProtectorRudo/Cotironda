# 09 — Hoja de ruta y puertas de calidad

**Estado auditado 29/10/2026:** Etapa 00 documentada; Etapa 01 en PR apilados hasta #63. Doce migraciones aplicadas solamente en `cotironda-dev`, incluida la décima de bloqueo de cargas directas, registro SQL y portal comercial cerrados. El Auth Hook está ACTIVADO en desarrollo y el propietario probó un JWT real desde Chrome con cuentas de ensayo; CI de PostgreSQL, Next y SSR/HTTP aprobado sobre datos simulados. **Las migraciones 8 y 9 de Storage privado están aplicadas en `cotironda-dev`: bucket RLS y guard de sesiones revocadas; mientras falta backend antimalware, la décima migración cierra la carga directa y la onceava prepara una cuarentena inaccesible con ledger privado, aún sin antivirus ni interfaz de carga** (la auditoría inicial encontró 0 buckets en dev); falta un ensayo real de revocación JWT, prueba HTTP 429 auténtica controlada y consolidación de PR. El dominio comprado `cotironda.com` está registrado en Hostinger pero NO apunta a Vercel; su configuración se programa en la puerta de publicación. Ver `docs/38-dominio-hostinger-vercel.md` y `docs/39-storage-privado-pendiente.md`.

| Etapa | Entregable | Criterio de aprobación |
| --- | --- | --- |
| 00 Documentación | Visión, reglas, arquitectura, pruebas, decisiones, riesgos | Documentos coherentes, abiertos registrados y revisión comercial |
| 01 Usuarios y base | Organizaciones, roles, rubros, catálogos, zonas, Storage privado | Autorización cruzada y RLS probadas con varias empresas |
| 02 IA documental | Extracción por archivo, trazabilidad, aclaraciones y confirmación | Corpus realista y casos extremos aprobados |
| 03 Licitaciones | Rondas, invitaciones, ofertas versionadas, rankings y adjudicación | Matemática determinista y casos parciales aprobados |
| 04 WhatsApp | Adaptador Whapi, webhooks, IA conversacional, colas y opt-out | Ciclo real probado con números autorizados, sin duplicados |
| 05 UX | Portales comprador/proveedor/admin, móvil y escritorio | Flujos completos usables, pruebas end-to-end |
| 06 Pagos y protección | Suscripciones, webhooks, gastos, auditoría, backups | Pagos idempotentes y restauración/pruebas de seguridad |
| 07 Piloto | Primeros compradores y proveedores voluntarios | Rondas completas, costos medidos y retroalimentación |

## Secuencia profesional por Issue
Inspección de situación actual → impacto y aceptación → rama → implementar → pruebas → auditoría → PR → revisión → merge → producción sólo autorizada.

## Prioridad
Primero flujo pequeño con datos sintéticos. Activar WhatsApp real cuando base y autorización ya sean seguras. No optimizar por número de pantallas: optimizar por ronda de cotización completa y confiable.

### Desarrollo paralelo de interfaz (sin desplegar backend)
Se creó el PR #8, apilado sobre el PR #4: portal Next.js para alta de empresas e inicio de sesión, preparado para Supabase Auth. Pasó build de Next.js y los tests HTTP/SQL, pero queda **inactivo** hasta configurar las credenciales de aplicación y completar pruebas E2E con sesión real. La base Supabase dedicada y la migración ya existen. La etapa 01 continúa abierta.

### Auditoría de identidad (29/10/2026)
La quinta migración aplicada a `cotironda-dev` movió el privilegio de la RPC pública a una función privada, eliminando la advertencia WARN. Se exige claim de correo confirmado emitido por Auth Hook basado en `auth.users` y la cerradura BD sigue `false`. La Etapa 01 **no está cerrada**: el Hook ya fue habilitado y se probó JWT real mediante Chrome; Storage privado ya configurado en desarrollo con revocación SQL, pero siguen pendientes AV, JWT revocado por HTTP real, 429 HTTP remoto y pruebas del portal completo con Auth real. Ver `docs/23-hook-correo-auditoria.md`.


### Prueba HTTP de sesión y cuotas mediante PostgREST en CI (PR #71)

Se ejecutó PostgREST real con PostgreSQL efímero y 11 migraciones, JWT HS256 de ensayo firmados dentro del runner: HTTP 429 en intento 21, JWT adulterado o expirado denegado y sesión revocada con token previo aún firmado rechazado con HTTP 403 incluso después de nuevo login. **5/5 CI SUCCESS, 142/142 unitarias.** No se usó Supabase Auth remoto, ni se habilitaron empresas, archivos ni producción. Quedan pendientes E2E con JWT emitido por Supabase Auth y cookies HTTPS, HTTP 429 remoto, WARN de contraseñas filtradas y revisión de PRs apilados. Ver `docs/48-postgrest-real-http-ci.md`.


### Auditoría HTTP multiempresa y revocación (PR #73 y #75, sin publicar)

Se comprobó por HTTP PostgREST auténtico con tokens de CI el aislamiento entre dos proveedores, dos propietarios, miembro lector y manager suspendido; el propio propietario puede escribir, pero no en otra empresa. La auditoría SQL read-only en `cotironda-dev` señaló un **bloqueo pendiente real**: las 17 políticas de cliente para las siete tablas comerciales no validaban la presencia de sesión actual en `auth.sessions`; solo Storage y registro tenían guard. En PR #75 se ensayó exclusivamente en CI una protección `AND` que invalida lectura/escritura tras revocación y no reanima tokens antiguos con un nuevo login: **149/149 unitarias, 5/5 workflows SUCCESS**. No hay migración oficial de este cambio ni aplicación a `cotironda-dev`. Antes de cerrar Etapa 01: versionar migración con CLI, reconstruir 12 migraciones, auditarla y probarla en desarrollo; completar pruebas JWT auténtico tras logout, HTTP 429 remoto, cookies HTTPS y WARN contraseñas filtradas; consolidar PRs sin publicarlos. Ver `docs/50-session-aware-rls-ci.md`.


### Migración 12 instalada en desarrollo (Issue #76 / PR #77, sin publicar)

Se cerró en SQL de `cotironda-dev` la ventana detectada en las siete tablas comerciales: 17 policies de clientes comprueban ahora sesión válida vía función privada existente. Las seis del registrador permanecen intactas; registro, Storage y negocio comercial siguen cerrados. Versionado oficial reconciliado con la base: `20261029234236_commercial_session_guard.sql`; tests PostgreSQL y PostgREST con 12 migraciones, sin uso de JWT remotos ni cambios en producción. **La Etapa 01 no está cerrada**: faltan autenticación HTTPS real tras logout/refresh, HTTP 429 del gateway Supabase remoto, habilitación de protección de contraseñas filtradas y revisión de la cadena de PR antes de habilitar clientes. Ver `docs/51-commercial-session-migration.md`.


### JWT real tras logout — protocolo reproducible, no certificado todavía (Issue #78)

La migración 12 protege `catalog_categories` mediante sesión vigente y el entorno `cotironda-dev` tiene cinco categorías activas, visibles con sesión correcta sin crear empresa. El runner local de Auth se amplió para demostrar el escenario **positivo/negativo real**: GET categorías con JWT auténtico y aún vigente **antes** del signOut y GET 200/[] **con el mismo JWT** tras signOut. No requiere levantar ninguna bandera de registro. La suite CI cubre la estructura y transporte simulado, pero **no ejecutó login real** porque los secretos de dos cuentas dedicadas permanecen fuera del repositorio. No cerrar Etapa 01 hasta tener ejecución y evidencia real, E2E HTTPS/cookies, HTTP 429 remoto y decisión sobre password protection. Ver `docs/52-auth-real-revoked-catalog-e2e.md`.


### Cookies HTTPS del portal: guard Secure corregido y CI verificadas (Issue #80 / PR #81)

La prueba HTTPS verdadera de Next.js Preview **en loopback CI** descubrió que el refresh de `@supabase/ssr` emitía cookies sin `Secure`. Se corrigieron los clientes Proxy, SSR y navegador para exigirlo en `NODE_ENV=production`, con `SameSite=Lax`, `Path=/`, verificación TLS y `no-store`. La suite pasó con **161/161 unitarias, 5/5 GitHub Actions**, incluyendo roundtrip de cookie renovada, visitante anónimo, Origin 403 y alta 503. **No significa prueba de navegador contra `cotironda.com` ni Supabase Auth genuino.** Queda pendiente E2E autenticado real, HTTPS real en despliegue autorizado, 429 remoto, WARN de contraseñas filtradas y consolidación de PRs. Ver `docs/53-https-ssr-loopback-ci.md`.


### Credenciales de ensayo aisladas y diagnóstico reproducible (PR #83)

Ante la posibilidad de dos cuentas de ensayo con contraseña reutilizada, el runner Auth ahora falla cerrado si se usa un secreto idéntico, corto (menos de 12 caracteres) o se intenta ejecutar desde GitHub Actions/CI/Vercel. Comando local Node 22 `npm run e2e:auth:dev`; CI comprueba que se niega a usar Auth real y los mensajes de errores son una lista blanca sin datos privados. **Es necesario rotar los dos secretos de prueba fuera del chat**, antes de ejecutar la comprobación pendiente de JWT auténtico tras logout. Ver `docs/54-e2e-auth-secret-preflight.md`. Etapa 01 aún abierta; sin publicación.


### Diagnóstico Auth real sin dependencia de Node, listo para ejecución (Issue #84/PR #85)

Un HTML estático descargable permite desde un navegador de confianza probar las dos cuentas de desarrollo sin transferir contraseñas al asistente ni a GitHub: login verificado, JWT original, RLS de categorías antes y después de logout y correo sin confirmar. El código se valida automáticamente con transporte simulado, incluyendo errores que deben ser FAIL; sin embargo **todavía no hay ejecución real en navegador**. La Etapa 01 sigue abierta hasta recibir el informe PASS/FAIL auténtico, HTTP429 remoto y autorización para probar cookies en HTTPS desplegado. `docs/55-browser-auth-dev-diagnostic.md`.

 
### 30/10/2026 — JWT real revocado por RLS: control COMPLETADO en cotironda-dev
El propietario ejecutó el archivo de prueba desde Chrome Android y compartió evidencia con **8 PASS / 0 FAIL**. Logout global aceptado; JWT firmado original **no vencido** pierde acceso a cinco rubros: GET catálogo **HTTP 200 + []** donde antes daba HTTP 200 con filas. Logs reales de Supabase corroboran login/logout, dos GET categoría 200, POST logout 204 y login pendiente rechazado 400. SQL read-only posterior: 0 sesiones, empresas o archivos, bandera de registro apagada, política de sesión presente. **Cierre del riesgo concreto de JWT post-logout dev**, no de toda la Etapa 01. Persisten: navegador Next Preview con cookies reales sobre HTTPS autorizado, gateway remoto 429, WARN de contraseñas filtradas, backups y consolidación de PRs. Ver docs/56-auth-real-mobile-rls-proof.md. Las menciones previas de «no ejecutado» para este test son históricas y quedan reemplazadas.


### 30/10/2026 — Preview Next real del portal en Vercel: compilación verificada (Issue #86)

Se detectó y documentó que el READY anterior pertenecía a la **demo** (`cotironda`, build vacío 46 ms) y no al portal. Nueva Preview protegida SSO del proyecto separado `cotironda-portal-dev` (deployment `dpl_EFo5qxksdsaUnUQn5cG7CEj87i3i`, target no-production, commit `31a8bd22`) ejecutó `next build` y empaquetó todas las rutas Next y el Proxy. El ambiente tiene variables de Auth dev pero no `COTIRONDA_SITE_ORIGIN`, y el código todavía liga login a apertura de registro; la compilación no equivale a prueba real de cookies. Siguiente hito: login-only Preview separado de registro empresarial, y luego E2E del navegador. Docs/57-vercel-portal-preview-audit.md.


### 30/10/2026 — modo Auth Preview sin registro, pendiente validación de navegador (Issue #88)

Separación del login y del registro comercial por banderas independientes: Auth solo para cuentas previamente creadas de ensayo, Vercel Preview con SSO, registro SQL y de portal false, nada de signUp/alta empresarial en la interfaz. /api/organizaciones sigue 503 fail-closed. TLS/SSR en CI con Auth sintético prueba cookies Secure y no-store; **falta la ejecución real de login/logout en el Preview** para cerrar ese control. No se conecta dominio ni producción. docs/58-preview-login-only-auth.md.


### Puerta de calidad — Preview SSO login-only ya desplegada, E2E real pendiente

Compilación real de `cotironda-portal-dev` en `dpl_6X6o3xzgP1aRDRVpjdUtQ9p36tyM`, commit `1c0c8b82`, target Preview y `READY`, Next/Proxy compilados; Vercel reportó `COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD=ALLOW`. Por ausencia de Git conectado al proyecto no se pudo limitar la variable a una rama: se usa env Preview + verificación **server-only** de rama exacta, bloqueando cualquier otra referencia y production. SSO activo para todo deployment. 190/190 unit y 5/5 GitHub Actions. Flag comercial **false** en Vercel y SQL; 0 sesiones/empresas/archivos. **Falta navegador real con SSO y cuentas de ensayo para validar login/logout, cookies Secure y redirecciones**, HTTP 429 remoto, backup/restauración y decisión WARN de contraseñas filtradas. Etapa 01 y PRs siguen abiertos sin publicar `main` ni dominio. docs/58-preview-login-only-auth.md.


### 30/10/2026 — logout de Preview comprobado en Auth real

Después de pulsar «Cerrar sesión de prueba», el navegador mostró nuevamente la pantalla de ingreso (captura del propietario). Logs Supabase agregados: POST `/auth/v1/logout` 204 y evento Audit logout; SQL read-only: 0 sesiones, registro false, 0 empresas y archivos. **Ingreso, vista protegida, logout remoto y retorno al ingreso acreditados.** Restan: visita directa a `/alta` tras logout para probar denegación, inspección de cookies remotas, HTTP 429, backups y control de contraseñas filtradas. Issue #88 abierto, PR #89 draft, sin producción. Docs/59.

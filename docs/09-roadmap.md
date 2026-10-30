# 09 — Hoja de ruta y puertas de calidad

**Estado auditado 29/10/2026:** Etapa 00 documentada; Etapa 01 en PR apilados hasta #63. Doce migraciones aplicadas solamente en `cotironda-dev`, incluida la décima de bloqueo de cargas directas, registro SQL y portal comercial cerrados. El Auth Hook está ACTIVADO en desarrollo y el propietario probó un JWT real desde Chrome con cuentas de ensayo; CI de PostgreSQL, Next y SSR/HTTP aprobado sobre datos simulados. **Las migraciones 8 y 9 de Storage privado están aplicadas en `cotironda-dev`: bucket RLS y guard de sesiones revocadas; mientras falta backend antimalware, la décima migración cierra la carga directa y la onceava prepara una cuarentena inaccesible con ledger privado, aún sin antivirus ni interfaz de carga** (la auditoría inicial encontró 0 buckets en dev); falta un ensayo real de revocación JWT, prueba HTTP 429 auténtica controlada y consolidación de PR. El dominio comprado `cotironda.com` está registrado en Hostinger pero NO apunta a Vercel; su configuración se programa en la puerta de publicación. Ver `docs/38-dominio-hostinger-vercel.md` y `docs/39-storage-privado-pendiente.md`.

| Etapa | Entregable | Criterio de aprobación |
| --- | --- | --- |
| 00 Documentación | Visión, reglas, arquitectura, pruebas, decisiones, riesgos | Documentos coherentes, abiertos registrados y revisión comercial |
| 01 Usuarios y base | Organizaciones, roles, rubros, catálogos, zonas, Storage privado | Autorización cruzada y RLS probadas con varias empresas |
| 02 IA documental | Extracción, trazabilidad y validación para distribución automática sin aprobación por línea | Corpus realista y filtros por producto confirmado probados |
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

 
### 30/10/2026 — Acceso privado post-logout: prueba real COMPLETADA
El propietario abrió `/alta` **sin volver a ingresar** tras logout global; la tercera captura real de Chrome mostró el formulario de ingreso y no el área privada. Ya existía evidencia Auth servidor POST logout HTTP 204 y evento Audit logout, y SQL dev continuó con 0 sesiones, 0 empresas, 0 Storage y registro false. **Se valida el circuito completo login → vista privada → logout → intento de acceso directo denegado en Preview**, criterio funcional de Issue #88. No equivale a inspección de cookies en navegador ni cierre de Etapa 01. Quedan HTTP 429 remoto, verificación de atributos HTTP reales, Auth signup remoto, backups/recuperación y consolidación de PRs. PR #89 sigue draft sin producción. Ver docs/59.

 
### 30/10/2026 — Backup/restore: mecánica SQL PG17 verificada, continuidad REAL aún bloqueante (Issue #90)
Supabase `cotironda-dev` pertenece a organización Free: no presumir backups diarios gestionados. Se ejecutó correctamente **dump custom PostgreSQL 17 de base CI sintética**, eliminación de categoría de prueba y restore transaccional en **otra base**; SHA-256 y TOC obligatorios, seed y RLS/guard/session/buckets/grants recuperados. Sin acceso ni exportación de la base dev, sin artifacts, cero cambios de producción. **Queda pendiente una copia externa cifrada de datos reales y una prueba de restauración en entorno separado**, con cobertura explícita de Auth gestionado y bytes de Storage (excluidos del backup DB); resolver costo/plan antes de piloto. Ver docs/60-backup-recovery-free-plan.md. Etapa 01 todavía abierta.

 
### 30/10/2026 — Diagnóstico privado de CookieStore/Cache-Control en Preview SSO (Issue #92)
Se agregó a `/alta` de sesión real un botón de auditoría **local**, sin leer ni enviar valores de cookies: solo atributos `Secure`, `SameSite=Lax`, `Path=/`, HTTP200 same-origin, `private,no-store`, ausencia de CDN HIT. CookieStore no soportado o atributo no observado = **INCONCLUSO**; never PASS simulado. Guard de rama Preview explícitamente limitado a la rama original y una nueva rama de ensayo. La CI hace dos builds Next con Auth simulado y pruebas adversarias; **la evidencia HTTPS de navegador auténtico todavía se debe obtener** para cerrar Issue #80. Sin modificar registro, SQL, SSO, producción, backups ni dominio. Docs/61.

 
### 30/10/2026 — El diagnóstico de cookies está probado en CI, pero aún NO desplegado
PR #93 incorpora auditoría local privada con CookieStore y cache-control, test adversarial, 217 unitarias PASS y 5 workflows GitHub verdes en revisión de código. **Vercel respondió 402 `api-deployments-free-per-day`** al intentar la Preview adicional, con espera indicada de 86400 segundos. No existe URL nueva ni resultado real de navegador para ese cambio. Mantener Issue #80 y #92 abiertos, conservar SSO, no promocionar producción. El próximo deploy permitido será **solo Preview** del proyecto correcto después de que Vercel habilite cuota y de que CI del commit exacto esté verde. Reglas/docs/61.


### 30/10/2026 — Auditoría de signup directo Supabase Auth: código preparado, estado real pendiente (Issue #94)
**Hallazgo clave:** tener `cotironda_private.registration_settings.enabled=false` y UI sin `signUp` no demuestra el bloqueo del API Auth `/auth/v1/signup`. Se verificó por SQL read-only: 2 usuarios, cero sesiones/empresas/cuotas; registro comercial false y RPC pública sin EXECUTE para anon. El limitador real de 20 intentos/60min solo se activa tras abrir registro, por lo que no se forzará HTTP429 remoto habilitando altas. Se añadió observador público GET `/auth/v1/settings` que únicamente evalúa `disable_signup` para informar PASS/FAIL/INCONCLUSO desde el navegador SSO, sin crear usuarios. **Estado Auth hospedado no observado**. Nueva Preview pendiente de cuota diaria Vercel; docs/62. No modificar Auth config, base real o producción sin autorización.


### 30/10/2026 — Defensa HTTP del portal: cabeceras anti-clickjacking en prueba CI (Issue #96)
Se incorporaron X-Frame-Options DENY, CSP documental sin directivas de scripts que requieran nonces, nosniff, no-referrer, Permissions-Policy y noindex en `next.config.ts` del portal. El contrato HTTPS Next comprueba ahora estas cabeceras en login, redirecciones, sesiones con refresh cookie y API empresarial bloqueada, además de preservar no-store y Secure/SameSite. Se mantiene CSP completa de scripts como trabajo posterior y **no se afirmó haber observado estos headers en Preview remota**. Vercel quota 402 persiste como bloqueante anterior; mantener SSO y registro cerrado. Docs/63; sin publicación de producción.


### 30/10/2026 — Verificación de `disable_signup` real SIN abrir registro (Issue #98)
Se preparó un GET read-only único desde GitHub Actions hacia `/auth/v1/settings` del Supabase dev, con publishable pública, sin JWT/correo/contraseña ni mutaciones. El control se ejecuta solo en PR autorizado y devuelve PASS si `disable_signup=true`, FAIL si `false`, INCONCLUSO ante cualquier falta de evidencia. Un **FAIL corta el gate de seguridad** aunque los unit tests estén verdes, no un problema de código. No se intentan altas reales ni se cambia configuración de Auth. Estado de la lectura remota a actualizar con su workflow. Ver docs/64.


### 30/10/2026 — Autorregistro Supabase Auth REAL habilitado: PENDIENTE CORRECCIÓN
Desde GitHub Actions (Issue #98/PR #99), GET read-only `/auth/v1/settings` devolvió `disable_signup=false`, comprobado por validador estricto y corroborado con 1 GET HTTP 200 en logs Supabase. **Auth permite autorregistro directo**, aunque UI no tenga signup y el flag SQL de empresas permanezca false. **245/245 tests de código verdes, 4/5 workflows SUCCESS y 1 FAIL de seguridad INTENCIONAL**; 2 usuarios de ensayo, 0 sesiones/empresas/archivos. Siguiente intervención necesaria: Auth → General → desactivar «Allow new users to sign up» solo en cotironda-dev (el conector de Supabase no permite esta mutación); luego volver a verificar GET PASS y cuentas existentes. Mantener Issue #94 abierto, Vercel SSO, DNS, producción y empresas cerrados. Docs/64.


### 30/10/2026 — Inicio controlado de Etapa 02 sin abrir comercialización
La incidencia de autorregistro Auth (#94) se resolvió al desactivar `Allow new users to sign up` en cotironda-dev; un nuevo GET remota de GitHub Actions confirmó `COTIRONDA_AUTH_SIGNUP=PASS / autorregistro_auth_bloqueado`, con dos cuentas preservadas, 0 empresas y 0 objetos Storage. [Control exitoso](https://github.com/ProtectorRudo/Cotironda/actions/runs/41061840605).

Se inició **trabajo de código de Etapa 02** en Issue #100 / PR #101, rama hija de PR #99: validación pura de líneas propuestas por IA, cantidades decimales como string, incertidumbre por unidad/rubro/marca, referencias y duplicados conservados; datos extra y precios descartados. **13 pruebas nuevas: 258/258 unitarias PASS; 5/5 workflows exitosos** en HEAD inicial del PR #101 `7895b748fd6a5cf24e60ab213b2a73fc8b07070a`. Esto **no** cierra Etapa 01, no procesa archivos, no activa cargas o empresas, no habilita WhatsApp/pagos ni publica. [Detalles](65-etapa02-borrador-documental.md).

**Puertas separadas:** (A) desarrollo de Etapa 02: permitido en rama aislada y con corpus sintético; (B) piloto real: requiere integración/revisión de PR apilados, respaldo offsite/restauración efectiva, cookies y Auth remoto de Preview, antivirus y cuarentena E2E, revisión de contraseñas filtradas, cuotas/costos y permiso de publicación explícito. No tratar problemas de piloto como bloqueos absolutos para escribir y probar código offline de Etapa 02.


### 30/10/2026 — Decisión D013: distribución automática sin revisión previa
El propietario anula el paso de aprobación manual por línea. Comprador autoriza al ENVIAR la lista; Cotironda distribuye automáticamente solo ítems seguros a proveedores con catálogo confirmado por producto, zona y opt-in. Dudas se retienen sin bloquear otros artículos. Primer desarrollo: planificador determinista OFFLINE en rama hija de #101; sin Whapi ni producción. Issue #102. Requisitos de antivirus, respaldo y seguridad reales siguen bloqueando piloto, no desarrollo aislado.


### 30/10/2026 — Siguiente etapa vertical de texto sintético (Issue #104)
Se conecta el parser determinista de texto con el borrador documental y el planificador selectivo por proveedor: cantidades/unidades explícitas, catálogo exacto, zona/consentimiento, líneas retenidas y consolidación por proveedor. Se agrega demo ejecutable sin credenciales (`npm run demo:texto`). **Es un simulador sin WhatsApp, OpenAI ni subida de archivos.** No sustituye la IA de documentos reales ni los requisitos de backend para catálogos/permisos, antivirus y colas. Ver docs/66. Solo rama de desarrollo, PR draft hijo de #103.


### 30/10/2026 — XLSX real de laboratorio (Issue #106)
Etapa 02 sumó un primer flujo binario limitado: ZIP/OOXML `.xlsx` con columnas explícitas → hoja y fila trazables → línea estructurada → coincidencia exacta de catálogo → planes independientes sin envío. Controles de ZIP/deflate/XML y casos adversarios. **No** habilitar cargas públicas: Issue #61 (autorización, cuarentena, AV, worker, retención y backup) sigue bloqueando la entrada de archivos de clientes. El siguiente paso es cubrir formatos arbitrarios mediante parsers profesionales e IA con costo controlado, no extender regex caseras como solución general. Ver docs/67 y PR hijo de #105.


### 30/10/2026 — Primer adaptador de OpenAI con contrato y seguridad (Issue #108)
La nueva rama hija de PR #107 implementa Responses API con modelo candidato `gpt-6-luna`, JSON Schema estricto, parámetro explícito para tráfico remoto, secreto solo servidor, `store:false`, límites de cantidad de líneas, longitud, output tokens y tiempo; prueba evidencia de cantidad y origen antes de planificar con catálogos. El corpus argentino sintético inicia evaluación de calidad. **CI usa únicamente mocks**; no ha habido inferencia real ni costo observado. El modo live se habilitará SOLO en dev privado, con credencial segura y presupuesto expresamente autorizado. Debe seguir pendiente la integración segura de archivos reales (Issue #61) y el aval para envíos WhatsApp. Detalles docs/68.


### 30/10/2026 — Evaluación medible de IA (Issue #110)
Se añadió una puerta de **seguridad comercial** separada de la **cobertura** en la Etapa 02: el scorer audita productos y sus cantidades/unidades, destinatarios por proveedor, omisiones, retenciones y multiplicidades. El comando offline `npm run benchmark:ia:offline` clasifica 12 casos sintéticos de mock API; sus resultados NO miden la precisión de GPT-6 Luna. Antes de IA live y piloto: secret DEV y presupuesto autorizados, prueba de verdad con corpus gold, luego alias de materiales y catálogos reales con autorización servidor. Sin mensajes ni datos de clientes. Docs/69.


### 30/10/2026 — Candidatos por envases alternativos (Issue #113)
Sobre PR #111 se agregó un planificador **independiente y offline** que calcula envases enteros por BigInt, verifica misma familia/especificaciones/unidades de magnitud y propone consultas funcionales solo con relación curada. No altera el matcher exacto ni invita a proveedores ni certifica producto. Faltan SKU de proveedor reales, manual de equivalencias por rubro, UI de alternativas, decisión de política de comunicación, métricas recall/seguridad integradas y costos del envase completo. Docs/70. No habilita piloto.


### 30/10/2026 — D014: producto primero (Issue #115)
Se aprueba el orden comercial identidad de producto → atributos técnicos necesarios → marca flexible → presentaciones alternativas, con marca obligatoria como restricción. Se creó `planificarPorProducto` offline como contrato nuevo que agrupa marcas/envases de SKU confirmados por proveedor bajo una sola línea, retiene dudas y calcula envases con BigInt. No cambia aún el matcher exacto ni el servicio Whapi. Antes de piloto integrar catálogo canónico y atributos auditados en backend (no confiar en IA), cotejar recall/falsos envíos, ofertas/ranking y política P007. Docs/71.


### 30/10/2026 — D015: familia de producto como puerta de invitación (Issue #117)
Se refinó D014: los proveedores que **confirmen comercializar el producto canónico** tienen oportunidad de cotizar aun con marcas/envases distintos, sin exigir tipo/clase de cemento u otros atributos que el arquitecto no escribió. La comprobación de especificación se separa de la invitación. Se añadió módulo puro que envía cero mensajes, conserva datos originales, muestra variaciones técnicas y agrupa por proveedor. Faltan catálogo canónico auténtico, backend que compruebe SKU y restricciones exclusivas, integración WhatsApp, medición recall de proveedores válidos y validación de ofertas. Docs/72 / Issue #117.


### 30/10/2026 — Taxonomía argentina y enlace salida IA → selección D015 (Issue #119)
Se agregó un diccionario curado inicial de 6 familias en 5 rubros y un orquestador aislado que vincula extracción IA validada con invitaciones por producto. Reglas negativas distinguen cemento de contacto/adhesivos, cables no eléctricos, etc.; marcas preferidas no se convierten en exclusividad automática, atributos críticos solo explícitos. Demo `npm run demo:productos` con SKU ficticios; pruebas de API MOCK (sin precisión medida). Pendientes corpus amplios de nombres argentinos, catálogo real SKU por empresa, OpenAI dev live, ingesta segura de documentos, Whapi/cola y costes. Docs/73.


### 30/10/2026 — ruta económica de extracción para listas simples (Issue #121)
Se reutilizó el parser de texto básico y taxonomía D015 para evitar pagar IA en listas muy claras: token usage local 0, selección de proveedores ficticios por producto confirmado y zona; dudas en `pendientes_ia`, sin gastar tokens ni inventar. Controles estrictos de gramática, términos, cantidad y marca exclusiva. Más adelante, solo las líneas pendientes podrán enviarse a un modelo pequeño bajo presupuesto, deduplicación y medición de precisión/costo. Docs/74, demo `npm run demo:sin-ia`.


### 30/10/2026 — D016: calidad > tokens (Issue #123)
Se reorienta la Etapa 02: el recorrido preferido de laboratorio es IA → evidencia y taxonomía curada → selección de proveedores, con línea fuente trazada, retenciones y omisiones visibles. La ruta económica #121 es candidata secundaria hasta demostrar igualdad en benchmark real. No hay inferencia remota aún; falta secret DEV, presupuesto, dataset independiente, medición por rubro y catálogos reales. Docs/75 y PR draft sobre #122.


### 30/10/2026 — detectar omisiones intralínea de IA (Issue #125)
Se incorpora segmentación explícita y trazabilidad de cada artículo dentro de una misma línea. El modelo no podrá recibir estado de éxito por reconocer cemento y omitir pintura en una línea de dos productos. Nuevos campos `segmentos_fuente` y `segmentos_sin_extraccion`; cobertura D016 distingue parciales. Pruebas sintéticas mediante MOCK, falta evaluación real y listas sin delimitadores. Docs/76.


### 30/10/2026 — benchmark comercial por producto (Issue #127)
Se creó un scorer independiente para D015/D016 que mide **recall de destinatarios comerciales correctos**, falsos proveedores y cobertura de extracción, en vez de limitarse a coincidencias exactas de marcas/envases. Corpus inicial de 12 casos sintéticos; CLI `npm run benchmark:producto:offline`; sin llamada real a OpenAI. Pendiente test live autorizado con presupuesto DEV y dataset independiente amplio por rubro. Ver docs/77.


### 30/10/2026 — Primer runner privado para benchmark LIVE D015 (Issue #129)
Se prepara una corrida manual de seis escenarios positivos con GPT-6 Luna, scorer D015/D016, costos por tokens y guardas de no ejecución en CI/producción/preview. El presupuesto soft USD 0,02 exige activación explícita y NO sustituye límite en cuenta OpenAI. Sin clave `OPENAI_API_KEY` verificada en el proyecto DEV Vercel, todavía no se han hecho inferencias ni mediciones. Falta configuración externa de OpenAI (proyecto/facturación/clave privada), runner DEV seguro y autorización de gastos. Docs/78.


### 30/10/2026 — OpenAI mediante Supabase Edge Secrets (Issue #131)
Se creó la fuente de un gateway **Cotironda DEV** exclusivo, protegido con `@supabase/server` autenticación `secret` y `verify_jwt=false` conforme a claves modernas sb_secret. OpenAI API key via `Deno.env.get('OPENAI_API_KEY')`, jamás en base, cliente o logs. Modo de estado sin gasto; smoke sintético bloqueado por defecto. Falta que propietario pegue clave en Edge Function Secrets, verificar ese hecho mediante función desplegada y completar el adaptador comercial/aislamiento empresarial. Docs/79. **No se desplegó ni gastaron créditos**.


### 30/10/2026 — laboratorio IA-first Supabase DEV (Issue #133)
Se implementa modo cerrado `quality_case` con seis casos sintéticos, motor D015/D016 compartido, verificación de módulos byte-exactos, scoring de productos/proveedores y controles de permisos separados. Todavía NO desplegado. El propietario quitó `COTIRONDA_IA_DEV_SMOKE_ENABLED` según confirmó; falta verificar vía status. Próximo paso validación Deno/CI, autorización de ensayo acotado y luego integración comercial por empresa. Docs/80.


### 30/10/2026 — D018: calidad real con máximo de seis intentos (Issue #135)
Se agrega límite persistente y atómico de una reserva por ID de caso de benchmark, para evitar que el secreto `quality` habilitado permita gasto repetitivo. Se usa registro sintético en Supabase DEV, sin documentos ni empresas; privilegios solamente para `service_role` y RLS. Antes de ensayo vivo: aplicar SQL, controlar advisors/grants, desplegar únicamente DEV con flag OFF, luego probar el modelo tras habilitación separada. Ver docs/81.

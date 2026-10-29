# Registro de cambios

## [Sin publicar] — Etapa 01 / Seguridad y registro
- Esquema multiempresa propuesto y RLS probadas en PostgreSQL 17 efímero mediante GitHub Actions.
- Registro SQL atómico de organizaciones, propietarios y proveedores; datos privados e idempotencia persistente por usuario y solicitud.
- Pruebas con A/B, usuario suspendido, rol miembro y acceso anónimo, incluido intento de escritura ajena.
- Tests de alta duplicada, cambio de payload, rollback ante usuario inexistente y dos solicitudes simultáneas.
- **50 pruebas unitarias** y pruebas reales SQL verificadas en CI. La versión final de ese conjunto aún no está integrada a main.
- Pendiente: Supabase Auth real, backend HTTP, rate limits, interfaz y Supabase aislado de desarrollo.

## Etapa 00 — Documentación
- Documentación de visión, reglas, arquitectura, clasificación, mensajería, ranking y seguridad.

## Sitio preliminar público
- Vista informativa con simulación ficticia en https://cotironda.vercel.app. NO habilita licitaciones, WhatsApp ni pagos.

## [Portal de registro en desarrollo - PR #8]
- Login y alta Next.js con cookies Supabase SSR y validación de sesión contra Auth cuando exista un proyecto exclusivo.
- API fail-closed: origen, contenido/tamaño, usuario verificado, campos, errores sin secretos.
- Cuota SQL de 5 altas nuevas por usuario/24h con bloqueo por actor; reintentos anteriores permitidos.
- 64 tests unitarios, PostgreSQL 17 con pruebas SQL y build de Next.js aprobados; producción sin modificaciones.

- Vista previa aislada y protegida en Vercel `cotironda-portal-dev`; build READY sin credenciales ni registros activos.

## [Seguridad de portal - PR #10]
- Cierre por defecto de sesiones, formulario y POST cuando falta el proyecto exclusivo o no coincide el origen/DB.
- Protección SSR contra caché compartida y reenvío de cabeceras de cookies renovadas.
- 77 tests unitarios, PostgreSQL/RLS, build Next y prueba HTTP real aprobados; sin activación productiva.

## [Conexión a Supabase — desarrollo, 29/10/2026]
- Viralio se pausó sin borrado para liberar un cupo gratuito (puede reanudarse).
- Proyecto Supabase exclusivo `cotironda-dev` creado en São Paulo, costo cotizado USD 0/mes.
- Migración inicial `20261029105736_initial_identity_catalog` aplicada en desarrollo; nueve tablas con RLS y cinco rubros.
- Pruebas reales de aislamiento por organización y registro idempotente aprobadas y revertidas, sin filas de prueba persistentes.
- Historial versionado en GitHub; continúan pendientes Supabase Auth en portal y E2E.

## [Seguridad backend sin privilegios administrativos — desarrollo]
- Rol `cotironda_app` creado en Supabase dev como NOLOGIN/NOINHERIT/NOBYPASSRLS.
- RLS explícitas permiten sólo lectura e inserción mínimas para registrar empresa/propietario/perfil; sin UPDATE, DELETE, acceso a productos, contactos ni Auth.
- Ejecución SQL `register_company` autorizada al rol propio y revocada a `service_role`.
- Migración 20261029111731 aplicada, registrada y probada en PostgreSQL de CI y Supabase real; fixtures revertidos.
- Portal rechaza conexiones con usuario `postgres` o `service_role`; el registro continúa deshabilitado.

## [Registro exclusivamente por función — desarrollo]
- Migración `20261029112947_execute_only_registration` aplicada y versionada.
- Revocados SELECT/INSERT directos del rol de API sobre empresas, membresías y solicitudes.
- Alta permitida solo por función privada de propietario NOLOGIN, sin BYPASSRLS; nueva suite SQL contra PostgreSQL y Supabase real.
- 79 unit tests, Next build y prueba SQL en CI aprobados; **sin activar usuarios reales ni publicar backend**.

## [Etapa 01 — JWT y doble bloqueo, desarrollo]
- Cuarta migración aplicada a Supabase dev: `20261029120021_jwt_bound_registration_locked`.
- RPC usa identidad derivada de JWT PostgREST, sin parámetro `user_id`; se revocó el camino privado legado.
- Interruptor adicional en PostgreSQL `registration_settings.enabled=false` impide altas por llamada directa.
- Retirados adaptador `pg`, dependencias SQL y variables `DATABASE_URL` del portal; lockfile regenerado en CI.
- Pruebas PostgreSQL, CI y Supabase real aprobadas, con fixtures revertidos.
- Advertencia Supabase `authenticated_security_definer_function_executable` pendiente de resolución. E2E Auth y correo confirmado siguen bloqueantes; sin producción.

## [Sin publicar — PR #18: correo confirmado y eliminación del WARN]
- Migración `20261029122708_invoker_verified_email_hook` aplicada en `cotironda-dev` y versionada.
- RPC pública pasó a `SECURITY INVOKER`; ejecución privilegiada relegada a función privada con propietario sin LOGIN/BYPASSRLS.
- La nueva función privada exige claim firmado `cotironda_email_verified=true`; su ausencia o valor falso bloquean el alta, incluso si la bandera de BD se habilita.
- Custom Access Token Hook `SECURITY INVOKER` obtiene confirmación de `auth.users.email_confirmed_at`, ignorando `user_metadata` manipulable. Hook no activado aún.
- Tests de correo sin confirmar, anónimo, falta de claim, repetición, permisos, RLS y rollback aprobados en CI y en Supabase dev.
- **Supabase Security Advisor: 0 WARN** tras aplicar la migración, queda solo observación INFO intencional.
- Sin activación de registros ni despliegue comercial; E2E real de Auth Hook/JWT, límites de tasa y cookies siguen pendientes.

## [Sin publicar — E2E de autenticación real, PR #20]
- Runner seguro `apps/portal/scripts/auth-real-smoke.mjs` para validar con dos cuentas de prueba JWT firmados, claim de confirmación, RPC y bloqueo SQL sin registrar empresas.
- Preflight estricto: sólo `cotironda-dev`, clave publicable, bandera específica para permitir llamadas Auth y dos cuentas distintas; nunca usa service_role.
- 9 pruebas unitarias nuevas de preflight y payload que no permite persistir datos ni con DB abierta accidentalmente.
- Procedimiento de habilitación del Auth Hook y desactivación ante errores; WAF rate-limit examinado como capa futura, no activado por costos y cobertura incompleta.
- Los tests reales con credenciales todavía no se ejecutaron. Doble bandera de registro desactivada, producción sin cambios.

## [Sin publicar — PR #22, prueba adversarial de JWT]
- Test E2E preparado: cambia el sujeto de un JWT legítimo sin modificar su firma y comprueba rechazo real en PostgREST, no solo en SQL.
- Nueve pruebas nuevas evitan falsos positivos por errores de negocio o doble bloqueo; nombre inválido impide persistencia.
- CI verifica sintaxis del runner E2E, sin enviar credenciales ni solicitudes Auth.
- Firma real, expiración y revocación aún pendientes de E2E con el hook activado; sin producción ni registros.

## [Sin publicar — PR #24: sesión actual comprobada]
- Sexta migración `20261029130907_session_revocation_and_verified_user` aplicada y versionada en Supabase dev.
- Alta exige session_id JWT y existencia de auth.sessions del mismo usuario; correo actual confirmado, no-anónimo, no-borrado y no-suspendido.
- Helper booleano exclusivamente privado; AUTH no expuesto y sin permiso de ejecución por clientes; funcion pública INVOKER sin modificación de firma.
- Pruebas PostgreSQL y Supabase reales reversibles, incluidos token sin session_id, sesión revocada, vencida y usuario suspendido. Sin producción ni usuarios reales.

## [Sin publicar — preparación de cuota y sesiones reales, Issue #27]
- El portal ya no concede intentos incondicionales: guardia HTTP fail-closed mientras no exista límite distribuido integrado en la RPC.
- Verificación estructural adicional de claims de sesión firmada; el runner E2E comprueba cierre de sesión local y no ignora fallos de signOut.
- Pruebas unitarias de no persistencia con limitador ausente y de cableado real de la ruta de Next.js.
- **Sin nuevo rate limiter ni prueba real de revocación**: estos controles siguen bloqueantes. Sin cambios SQL ni producción.

## [Sin publicar — PR #30: cuota SQL atómica de intentos]
- Migración oficial 7 `20261029140422_registration_attempt_rate_limiter` aplicada solo en cotironda-dev después de ensayos SQL reversibles.
- Cuota persistente de 20 solicitudes autenticadas por usuario/60 minutos, incluida denegación de negocio; RPC directa protegida incluso sin Vercel.
- Contador SQL atómico con saturación, RLS privada y respuestas estructuradas; no se revierte el consumo al rechazar una petición.
- Tests PostgreSQL con 40 conexiones (8 simultáneas), 20 aceptadas para validación y 20 bloqueadas; no hubo empresas creadas por esa prueba.
- **108/108 tests unitarios** y cuatro GitHub Actions verdes. Supabase Advisor 0 WARN/ERROR, 0 usuarios/empresas/sesiones/cuotas persistidas.
- **Bloqueantes vigentes:** Auth Hook auténtico, JWT/refresh/cookies E2E, verificación de HTTP 429 real y defensa contra abuso multi-cuenta/IP. Portal sigue fail-closed y producción intacta.

## [Sin publicar — PR #32: contrato HTTP 429 del SDK]
- Corregido el adaptador del registro para leer `PostgrestResponse.status`: 429 real deja de depender de `PostgrestError.status`, códigos o mensajes arbitrarios.
- CI ejecuta la librería auténtica `@supabase/supabase-js` con un `fetch` simulado, verificando 429/403/200 y ausencia de reintentos sin tráfico real.
- 109/109 pruebas unitarias y cuatro CI verdes. No hay nuevas migraciones ni cambios de Auth y el portal permanece fail-closed.
- Continúa pendiente el HTTP real PostgREST con JWT auténtico, las sesiones reales y la prueba de cookies.

## [Sin publicar — Recuperación de aislamiento del portal, Issue #33]
- Recuperado selectivamente el guard de PR #26: la configuración del portal de desarrollo solo acepta `cotironda-dev` y bloquea `VERCEL_ENV=production`.
- Nuevas pruebas que rechazan URL/ref de otro Supabase coherentes entre sí y validan Preview, Development, Production, flag apagado y permisos de configuración.
- No se alteró la cuota SQL de PR #30 ni el manejo del 429 de PR #32. No hay nueva migración, cambios a Auth ni producción.
- Detectado riesgo de autodespliegue: proyecto `cotironda` de Vercel está enlazado a GitHub. Integración de PR en `main` **no autorizada** hasta confirmar barreras de despliegue.
- Informe y lista de PR apilados: `docs/30-integracion-aislamiento-portal.md`.

## [Sin publicar — PR #36: prueba HTTP de cierre en Vercel Production simulado]
- Nueva prueba de Next.js real (segundo build completo) con `VERCEL_ENV=production` y flag de registro `true`, con URL correcta de `cotironda-dev` y clave pública ficticia sólo para CI.
- Preflight positivo de Preview evita falsos positivos por configuración inválida. En Production se exigen páginas sin formulario y POST de alta 503 sin conexión a Auth ni SQL.
- No se tocó Supabase/Vercel ni se fusionó main; el guard no sustituye barrera de despliegue. Ver `docs/31-production-guard-http-ci.md`.

## [Sin publicar — PR #39: reconstrucción segura desde migraciones]
- Nuevo ensayo CI PostgreSQL 17 desde cero usando las siete migraciones SQL versionadas, sin atajos por `schema.sql`.
- Test de integridad del historial y equivalencia del SQL efectivo de migración 1 con el esquema declarativo.
- Hallazgo: la limpieza concurrente borraba un usuario con sesión hija todavía existente, violando FK. Corregido el orden (sesión → usuario) y agregado check final de 0 datos sintéticos.
- Base real Supabase, GitHub `main` y Vercel producción sin modificaciones. Ver `docs/32-reconstruccion-migraciones.md`.

## [Sin publicar — Hook Auth habilitado y test de permisos con rol limitado]
- El propietario habilitó en `cotironda-dev` el Custom Access Token Hook configurado con `cotironda_private.email_verified_access_token`. Comprobación remota SQL read-only ante UUID inexistente devolvió claim false (NO es un JWT firmado real).
- Se agregó test PostgreSQL del hook como `supabase_auth_admin` emulado: verificado/no confirmado/anónimo/inexistente, preservación del `sub` e independencia de metadata editable.
- El runner manual Auth E2E usará `signOut({scope:'global'})` para limpiar sesiones de **cuentas exclusivamente de ensayo**. JWT anteriormente emitido puede permanecer válido hasta exp; revocación por SQL Auth real no probada.
- Registro comercial y plataforma productiva no habilitados. No se crean usuarios ni empresas; falta prueba E2E real con cuentas dedicadas y contraseñas privadas.
- Ver `docs/33-auth-hook-rol-e2e.md` y `docs/24-auth-e2e-seguridad.md`.

## [Sin publicar — Primer E2E Auth/JWT auténtico en Chrome, 29/10/2026]
- El propietario ejecutó el diagnóstico local de Auth con dos cuentas exclusivas de `cotironda-dev`. La captura muestra login confirmado, claim de JWT verdadero, identidad reconocida por `/auth/v1/user`, RPC denegada por interruptor SQL, JWT con `sub` adulterado rechazado explícitamente por autenticación, cuenta pendiente bloqueada y logout global aceptado.
- Auditoría del HTML ejecutado: SHA-256 `26c803472222efb274e94056e7a35dd5f453a822abe7cb659f432bc40f940f5f`. Se verificó qué condiciones exige cada resultado verde. **No se suben las credenciales ni el HTML al repositorio público**.
- Verificación independiente posterior (SQL read-only en `cotironda-dev`): dos usuarios Auth (uno confirmado, uno pendiente), uno con login registrado, cero sesiones, organizaciones, membresías y cuotas persistidas; `registration_settings.enabled=false`.
- Sigue sin probarse expiración legítima, cookies SSR/refresh, revocación efectiva de access token preexistente y HTTP 429 real sobre PostgREST. No representa habilitación comercial.
- Documentación `docs/34-auth-jwt-navegador-real.md`. Ningún merge, ningún despliegue, ningún cambio Auth adicional en este commit.

## [Sin publicar — PR #43: contrato de cookies y refresh SSR]
- Contrato automático del `@supabase/ssr` real: login simulado, cookie SSR, lectura en segunda request, renovación de access/refresh tokens, aislamiento entre visitantes y eliminación de cookies tras logout simulado. Todo con `fetch` local falso, sin usuarios ni claves reales.
- Probado **`proxy.ts` de Next.js**: frente a JWT ficticio vencido, renueva en Auth simulado, transmite `Set-Cookie` con `SameSite=Lax` y exige `Cache-Control: private, no-store`. Flag false no hace requests Auth.
- `getClaims` NO verifica revocación en servidor; `getUser` se prueba como control independiente. Se ajustó import `next/server.js` para ejecución del módulo Proxy también en Node ESM.
- La CI Next ejecuta el contrato antes de typecheck y los dos builds. Sin migraciones, cambios remotos, merge ni despliegue.
- Evidencia, alcances y riesgos restantes: `docs/35-ssr-cookies-refresh-proxy.md`.

## [Sin publicar — PR #46: revocación estructurada tras migración 7]
- Auditoría detectó que el test histórico 80 esperaba excepciones, mientras la RPC actual devuelve `registration_status='session_invalid'` después de la séptima migración.
- Se preservó el test 80 en su punto histórico y se añadió `93_revoked_session_status.sql`, ejecutado **en ambos jobs** de PostgreSQL después de migración 7.
- Siete escenarios de JWT simulado: faltante, revocado, sesión nueva válida, idempotencia, sesión vieja tras nuevo login, ajena y vencida. Se exige estado y columnas exactas, ningún alta por rechazos y cuota por usuario.
- Ejecución completa dentro de ROLLBACK sobre fixture CI. Sin cambios a las siete migraciones, Auth real o producción. `docs/36-revocacion-sesiones-rpc-actual.md`.

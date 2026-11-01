# Registro de cambios

## MVP-060 — Ejecutar cola de pedidos desde HTTP privado (sin habilitación)
- Ruta Node Preview `POST /api/integraciones/whapi/procesar` autenticada con secreto propio, sin body, alcance máximo de 3 trabajos; el cliente no puede seleccionar empresa/ronda/canal. Nunca envía WhatsApp.
- Driver Postgres.js reutilizado, cinco conexiones por rol D090 sin herencia/direct-table rights, CA TLS y sesión reservada, cierre garantizado ante error, criptografía D029 reutilizada; 5 URLs privadas y usuario técnico distinto por puerto.
- Test CI Node y PostgreSQL17 con rol propio; SQL instalado únicamente en laboratorio CI. Backup real #175, cron, credenciales, Whapi y catálogos reales pendientes. Docs/180, issue #333.

## MVP-059 — Worker de pedido comprador WhatsApp compuesto (sin publicar)
- Se conectaron los módulos D082 (cola durable), D077 (lectura AES y respuesta de localidad), D073 (texto WhatsApp), D081 (ronda idempotente) y D071 (match/invitaciones) sin nuevas RPC ni llamadas de red.
- Puertos SQL separados con lista cerrada por rol y parámetros, pruebas de pedido completo, falta de zona, fallo tras COMMIT/retry, revocación, AES y apagado. Sin WhatsApp enviado.
- Pendiente: base DEV recuperable #175, catálogos/consentimiento real, ejecutor por cron, envío controlado y lectura de presupuestos. Docs/179 y Issue #331.

## MVP-058 — Lista natural de WhatsApp sin obligar al comprador a usar un formato
- D073 normaliza exclusivamente separadores evidentes de lista dentro de un mensaje para D028: cantidades+unidades reconocidas, `Entrega:` y `Plazo:`; evita incluir el punto final en la localidad. No usa IA ni reescribe el parser del portal.
- Pruebas del pedido natural de 20 bolsas cemento, 10 litros hidrófugo, 5 litros látex, además de decimales, IVA/plazos, sin zona y descripciones dudosas (sin envío).
- No activa Whapi ni trabaja con contactos de producción; #175 y SQL comercial remoto aún pendientes. Docs/178, Issue #329.

## MVP-057 — Receptor Whapi Preview con driver SQL real (código, sin desplegar)
- El POST de Next D083 ya inyecta un driver Postgres.js 3.4.9, sesión reservada y cerrada por request, TLS con CA/hostname, project DEV y usuario técnico D085. Con credenciales ausentes conserva error seguro, sin conexión ni envíos.
- D089 crea LOGIN técnico sin contraseña, NOINHERIT, con SET ROLE solo D084; pruebas PG17, Node y Next. Se bloqueó integridad en npm lock.
- Falta instalar SQL/rol DEV de forma recuperable, cargar los 4 contactos/catálogos, conectar workers/IA, cotizaciones, envíos y revelar finalistas. No se activó Whapi ni Vercel producción.

## MVP-056 — Ensayo comercial consolidado WhatsApp → tres comercios (sin desplegar)
- PostgreSQL17 CI: 1 arquitecto, 2 corralones, 1 pinturería, pedido de cemento/hidrófugo/látex para La Plata, ronda de 5 días. Verifica matching por catálogo concreto y ubicación y que cada negocio reciba solo su alcance; reintentos no duplican invitaciones.
- Verificados 0 proveedores/catalogo/empresas reales cargados en Supabase DEV (solo lectura). Documento operativo docs/176, Issue #325.
- Sin envío Whapi, sin conectar API IA real, sin modificar Supabase DEV/producción ni usuarios OFI.

## MVP-055 — Canal WhatsApp central reutilizando aprendizaje de OFI (desarrollo)
- Verificado repo privado `ProtectorRudo/ofi` rama `ofi-v2`: distribución por remitente verificado sobre un único canal Whapi; se adopta el diseño, nunca las credenciales ni datos.
- Añadido test multiproveedor/comprador D083 con un solo número central, replay sin duplicados, identidad cifrada y rechazo de remitentes ilegítimos. Cotironda no impone límite artificial de 5 chats (solo Sandbox Whapi aplica ese cupo).
- Documentado onboarding Whapi, límites reales, costos por canal, cinco conversaciones piloto y bloqueo de ruta 503; docs/175, issue #323.
- No se conectó ni contrató Whapi, no se modificó OFI, Supabase DEV, DNS, main ni producción.

## MVP-054 — Reloj de cierre y finalistas anónimos por rubro (sin publicar)
- SQL D086 transiciona rondas por hora del servidor con lock y rol privado; recupera programadas vencidas sin doble cierre.
- Módulo puro de finalistas por rubro utiliza motor D039/D022, no mezcla parciales ni revela datos; pruebas PG17/Node, Issue #321 y docs/174.
- No hay cron, conexión WhatsApp, disclosure ni instalación real en DEV/producción.

## MVP-053 — Plazo comercial WhatsApp de 3–7 días, default 5 (sin publicar)
- Se corrigió el vencimiento de 2 días que D081 tenía fijo. El arquitecto puede indicar una línea opcional de plazo, conservada al preguntar localidad; sin línea son 5 días corridos.
- Node/SQL rechazan 2, 8 y directivas duplicadas; cierre se calcula con reloj PostgreSQL y duración forma parte del replay idempotente.
- D066 añade fecha límite local argentina al mensaje específico de cada proveedor, sin revelar identidades. Pruebas Node/PG17 y docs/173, Issue #319.
- Sin cambios en Supabase DEV, Whapi real, main ni producción; cierre finalistas/contactos sigue pendiente.

## MVP-052 — Identidad SQL restringida para receptor Whapi (rama de desarrollo)
- D085 prepara sesión PostgreSQL dedicada con comprobación de login/effective role y `SET ROLE` D084; limita a seis RPC existentes y cierra conexión en error.
- Tests para cuenta administrativa equivocada, SQL arbitrario, aridad, errores y cierre. Issue #317 / docs/172.
- No introduce `pg`, credenciales, webhook activo, migraciones DEV ni producción. #175 continúa bloqueando recepción real.

## MVP-051 — Preflight y cierre de conexiones del receptor WhatsApp (DEV, sin publicar)
- D083 rechaza Content-Type y Content-Length inválidos antes de abrir PostgreSQL; D027 sigue comprobando tamaño real de cuerpo.
- Puerto SQL D030 permite cierre opcional; D083 lo libera incluso ante errores, sin provocar reenvío cuando ya hubo persistencia.
- Pruebas de regresión de rechazo sin SQL, liberación y secretos no expuestos. Issue #315 y docs/171. Sin conectar Whapi ni alterar Supabase DEV/main.

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

## [Sin publicar — PR #48: E2E HTTP de Next en Preview con Auth ficticio]
- Se sumó tercer `next build` y smoke HTTP del servidor real Next.js en `VERCEL_ENV=preview`, con bandera de portal activada **solo dentro de GitHub Actions**.
- Interceptor CI en proceso Next bloquea fetch remoto externo y suplanta exclusivamente endpoints Auth esperados. La cookie SSR la genera `@supabase/ssr` instalado, con JWT de firma intencionalmente falsa.
- Contrato: /ingresar tiene formulario, /alta anónimo redirige, /alta con cookie sintética validada por Auth falso presenta formulario, cookie adulterada y POST anónimo denegados, origen ajeno 403, POST con sesión simulada 503 `limite_no_disponible`, y `no-store`.
- Supabase dev, Auth Hook, permisos, migraciones y entorno público sin modificar; registros comerciales permanecen deshabilitados.
- Ver `docs/37-preview-http-auth-aislado.md`; siguen pendientes revocación de JWT auténtico y cookies HTTPS reales, registro y 429 seguro.
\n## [Sin publicar — Auditoría de dominio y Storage de la Etapa 01]\n- Confirmado en Vercel: proyecto `cotironda` (demo) y `cotironda-portal-dev` (desarrollo) separados. Dominio `cotironda.com` adquirido por propietario en Hostinger, aún sin configurar hacia Vercel; se propuso `www` como canónico y apex como redirección al momento de `Publicalo`.\n- Revisión DNS read-only y procedimiento de conexión/HTTPS/rollback sin tocar Hostinger, Vercel, Auth o producción: `docs/38-dominio-hostinger-vercel.md`, Issue #49.\n- Auditoría Supabase dev read-only: **0 buckets y 0 policies en storage.objects**. Se identificó Storage privado como brecha pendiente y se definió contrato de RLS, uploads y retención para Issue #50; ver `docs/39-storage-privado-pendiente.md`.\n- Tests de dominio/origen estricto: HTTPS, coincidencia exacta, corte Production, origin CSRF previo a Auth. No es conexión DNS ni prueba real de despliegue.\n
## [Sin publicar — PR #52: Storage privado de borradores compradores]
- Octava migración `20261029183835_storage_private_buyer_drafts.sql`: bucket `cotironda-buyer-drafts` privado, 10 MiB, seis MIME; rutas canónicas con UUID y dos políticas RLS específicas para comprador activo, owner/manager al subir.
- Sin políticas de escritura anónima, UPDATE, DELETE ni publicación; los archivos de proveedores/ofertas requieren controles diferentes.
- Nueva emulación de Storage **solo en CI** y prueba adversarial transaccional 94: dos empresas, miembros, suspendidos, no miembros, proveedor, anónimo, paths maliciosos y operaciones prohibidas. Actualización de manifiesto de migraciones a ocho, sin modificar las siete históricas.
- No hay upload ni malware scanning, ni expiración de JWT de Storage comprobada con Auth real. Registro comercial permanece cerrado; ver `docs/40-storage-borradores-privados.md`.

- **Verificación remota de Storage (dev):** aplicada octava migración registrada por Supabase con versión `20261029183835`, después de corregir incompatibilidad con tabla gestionada `storage.objects` (se retiró ALTER TABLE redundante). Bucket privado y dos políticas reales confirmados en pg_policies; 0 objetos/empresas, flag registro=false. Nunca se alteró el owner del servicio ni se usaron credenciales de Storage.

## [Sin publicar — PR #54: validación previa a carga y contrato HTTP Storage]
- Módulo determinista `src/domain/borradores-storage.ts`: 10 MiB, MIME de bucket privado, firmas PDF/JPEG/PNG/WEBP, inspección conservadora de ZIP Office con directorio central, rutas UUID y rechazo de paquetes sospechosos. **No sustituye antivirus ni aprobación de documentos reales**.
- Adaptador de Supabase `apps/portal/lib/storage/borradores.ts`: `upload(upsert:false)` y `download` autenticados por RLS sin exponer URLs públicas ni secretos; no conectado a UI.
- Tests unitarios de documentos inválidos, macros, ZIP, extensiones y paths; contrato HTTP con SDK real y `fetch` falso, validación FormData y bloqueo 403 de rutas ajenas sin acceder a la red.
- Documentación `docs/41-storage-preflight-http-contract.md`, Issue #53, PR #54 draft. Registro y producción cerrados, sin archivos ni empresa de prueba.

## [Sin publicar — PR #56: prueba RLS Storage en Supabase real, reversible]
- Se incorporó `supabase/tests/manual/10_storage_rls_dev_rollback.sql`, que ejecuta una transacción única sobre las tablas gestionadas de `cotironda-dev`: empresas/membresías ficticias, lectura/escritura cruzada A/B, downgrade miembro, suspensión y usuario anónimo. **Todos los cambios se revierten**.
- La ejecución SQL remota devolvió `0` organizaciones, `0` membresías, `0` objetos del bucket y `registration_enabled=false`. Las dos cuentas de ensayo se seleccionan internamente sin exponer IDs ni emails; no hay HTTP ni JWT firmado.
- `tests/unit/storage-live-rollback-safety.test.mjs` impide quitar ROLLBACK o introducir DDL/COMMIT/cambios Auth por accidente. Ver `docs/42-storage-real-db-rollback.md`.
- Pendientes: E2E HTTP Storage real con miembro de empresa, antivirus, revocación access token y 429 remoto; sin merge ni deploy.

## [Sin publicar — PR #58: RLS de Storage comprueba revocación Auth por sesión]
- Se corrigió el acceso de borradores privados tras `signOut`: antes RLS verificaba membresía pero no `auth.sessions`; ahora migración 9 `20261029202610_storage_session_revocation.sql` agrega función privada `storage_session_active()` que valida claims de request, sesión existente, identidad actual y estado de usuario. Sólo `authenticated` puede ejecutar el guard; `anon`/service_role no.
- Tanto `SELECT` como `INSERT` de `cotironda-buyer-drafts` usan el guard además del aislamiento por empresa. Se conserva ausencia de UPDATE/DELETE, políticas anon y acceso público.
- Tests CI `95_storage_session_revocation.sql` y fixture histórico 94 actualizado; reconstrucción de 9 migraciones. Hubo un error inicial de expresión regular UUID con un grupo adicional, **detectado por CI y corregido** antes de instalar.
- Aplicado y validado SOLO en `cotironda-dev` con versión registrada por Supabase `20261029202610`. Test manual `11_storage_revoked_session_rollback.sql` real, con Auth sessions y organizaciones ficticias en `ROLLBACK`: sesión vigente permitida, correo no confirmado, sesión revocada y antigua tras login nuevo denegadas, nueva sesión aceptada, not_after vencido denegado; 0 datos persistidos.
- Aún falta E2E HTTP firmado y antivirus, retención/backup y consolidación de PR. Ver `docs/43-storage-session-revocation.md`.

## [Sin publicar — PR #60: bloqueo de uploads directos sin antivirus]
- Hallazgo: el módulo preflight de PDF/Excel/Word/imágenes corre del lado cliente, por lo que no evita que alguien llame a Storage API con un fichero manipulado y MIME declarado permitido. RLS de sesión/membresía no inspecciona bytes.
- 10ª migración elimina solamente la policy INSERT `cotironda_buyer_drafts_insert_manager`, mantiene SELECT privado con guard Auth; `subirBorrador()` falla localmente sin red con `carga_pendiente_revision_servidor`.
- Nuevo test 96: owner autenticado conserva lectura y **no** puede hacer INSERT; sesión revocada tampoco lee. Los tests históricos 94/95 se ejecutan antes de migración 10 en ambos recorridos CI.
- No se implementó escáner, cuarentena ni endpoint de ingreso. Ver `docs/44-storage-upload-fail-closed.md`; no habilitar carga comercial.

- **Supabase real de desarrollo:** 10ª migración aplicada con versión oficial `20261029211609`; `pg_policies` confirma **solo SELECT** por sesión vigente y empresa, sin escrituras. Test SQL manual 12 sobre tablas reales: lectura permitida, INSERT denegado, lectura revocada; ROLLBACK y 0 objetos/organizaciones/sesiones. No se hicieron uploads HTTP ni se abrió registro.

## [Sin publicar — PR #63: cuarentena privada y registro de ingestión idempotente]
- Migración 11 `20261029213755_private_quarantine_ledger.sql` aplicada exclusivamente en `cotironda-dev`: nuevo bucket `cotironda-upload-quarantine` estrictamente privado, 10 MiB y seis MIME, **sin RLS para clientes**. El bucket de borradores conserva solo lectura privada y sesiones verificadas, **sin INSERT**.
- Tabla privada `cotironda_private.document_intake_jobs` sin privilegios de usuarios, RLS activa, service_role con SELECT/INSERT/UPDATE pero no DELETE. Dedupe por empresa e idempotency key, máximo 10 MiB, estados de workflow y trigger de transiciones. `approved` exige veredicto limpio, versión de scanner, hora de análisis y hash SHA-256. No es garantía de análisis real hasta conectar scanner.
- Tests `97_quarantine_ledger.sql` en 2 jobs PostgreSQL 17, 11 migraciones; test manual `13_quarantine_ledger_dev_rollback.sql` en Supabase real pasó y dejó 0 jobs, 0 empresas y 0 archivos. Sin datos comerciales ni Auth nuevo. `tests/unit/quarantine-ledger-safety.test.mjs` bloquea regresiones.
- Hallazgo de arquitectura: Functions Vercel limitan el body a 4,5 MB frente al bucket de 10 MiB. Signed upload URLs de Supabase duran 2 horas sin nueva Auth. No emitirlas antes de resolver acceso a cuarentena, idempotencia, expiración, revocación y limpieza. Ver `docs/45-cuarentena-ledger-documentos.md`.
- Todavía no existe antivirus, worker, backend de carga, promoción, cola ni borrado programado. No habilitar archivos reales.

## [Sin publicar — Issue #68: auditoría read-only de puerta de Etapa 01]
- Consulta SQL reproducible de 17 controles de registro, sesiones, RLS/Storage, Auth Hook y permisos ejecutada con **17/17 PASS** en `cotironda-dev` usando solo lectura, sin cambios a la base ni a producción.
- Contrato unitario verifica que el script no incluya DDL/DML y que los controles fail-closed sigan presentes. Ver `supabase/tests/manual/14_etapa01_guardrails_readonly.sql` y `docs/47-etapa01-readiness-auditoria.md`.
- Auditoría Security Advisor: **1 WARN** de protección de contraseñas filtradas deshabilitada y **2 INFO** intencionales por RLS de tablas privadas sin policies. Siguen pendientes HTTP 429 real, JWT revocado por HTTP, cookies HTTPS reales, consolidación de PR. Registro y uploads deshabilitados.


## [Sin publicar — PR #71: PostgREST HTTP real, cuota y revocación en CI]
- Nuevo workflow aislado sobre PostgreSQL 17 con las **11 migraciones reales** y PostgREST Docker v12.2.12 por digest; JWT HS256 firmados con secreto aleatorio y temporal exclusivo del runner. Sin Supabase remoto ni credenciales reales.
- Contraste de extremos vía HTTP verdadero: denegación anónima, firma JWT alterada, expiración, 20 rechazos que consumen cuota y **HTTP 429 en el intento 21**, JWT todavía firmado con sesión revocada responde **HTTP 403 session_invalid**, login nuevo no revive JWT anterior y cuotas separadas. Todos los nombres de empresa son inválidos por diseño; **0 empresas creadas**, cleanup verificado.
- **5/5 workflows SUCCESS y 142/142 unitarias** sobre commit probado `4e50478480134b9de15b7de539e2dd1e6ff39659`. HTTP PostgREST: https://github.com/ProtectorRudo/Cotironda/actions/runs/40969448761
- No confundir este E2E HTTP con un JWT auténtico Supabase Auth: faltan prueba remota de logout/429 y SSR HTTPS con cookies. No hay cambios al proyecto Supabase real, main, Storage ni producción. Ver `docs/48-postgrest-real-http-ci.md`.


## [Sin publicar — PR #73: RLS multiempresa probada con HTTP verdadero]
- Fixture PostgreSQL CI con 2 proveedores y 4 personas ficticias: propietarios A/B, lector A y manager suspendido; peticiones GET/POST/PATCH/DELETE a PostgREST. Se verificó con SQL que los accesos negados no afectan filas, que el propietario modifica lo propio y que `user_metadata` falsa no eleva permisos.
- Se corrigió **únicamente** el helper `auth.uid()` simulado de CI para leer JWT JSON tal como la versión oficial de Supabase. 146/146 unitarias y 5 workflows GitHub SUCCESS en PR #73, sin datos reales ni publicación. Ver `docs/49-tenant-isolation-http-ci.md`.

## [Sin publicar — PR #75: cierre experimental de acceso comercial tras logout]
- Consulta read-only en `cotironda-dev` detectó **17 de 23** policies comerciales para `authenticated` sin guard de sesión vigente; las 6 restantes son del registrador con guard específico. Se creó Issue #74.
- `supabase/tests/ci/100_session_rls_hardening_draft.sql`: propuesta que agrega un guard `AND` en USING/WITH CHECK a las 17 policies de cliente, preservando los predicados y permisos anteriores. **SOLO se ejecutó en CI efímera, NO es migración oficial y NO se aplicó a Supabase dev.**
- PostgREST real: JWT firmado revocado no puede leer ni escribir, nueva sesión no revive el antiguo; limpieza y registro apagado confirmados. **149/149 unitarias y 5/5 workflows SUCCESS** en HEAD `5197d44c8bdf48557c9c9632ebeefa0164283868`. Ver `docs/50-session-aware-rls-ci.md`.
- Pendiente: migración formal generada por CLI, tests de 12 migraciones, revisión de rendimiento/seguridad, Auth Supabase genuino y cookies HTTPS. Sin merge, despliegue o cambios a producción.


## [Sin publicar — PR #77: migración 12 de sesión vigente en RLS comercial]
- Supabase CLI 2.122.0 generó el archivo base y la migración final endurece 17 policies authenticated en siete tablas sin ampliar roles/acciones ni modificar las seis policies del registrador; falla cerrado ante discrepancias de inventario, permisos o registro abierto.
- GitHub CI pasó reconstrucción incremental/histórica **12 migraciones**, pruebas PostgREST reales con JWT sintéticos, y 150 unitarias; correcciones del manifiesto a 12 y de un test que suponía cero sesiones en fixtures incrementales.
- **Aplicada solo en `cotironda-dev`** mediante migración Supabase; backend registró versión `20261029234236`. Archivo local y referencias CI renombrados a la misma versión para evitar drift frente al timestamp CLI inicial `20261029233650`.
- Verificación SQL remota: 23 policies totales, **17 client policies con guard de sesión**, seis policies registrador intactas (misma huella MD5), registro=false, 0 empresas, 0 sesiones, 0 objetos, 0 trabajos, 0 policies Storage de escritura. Security Advisor conserva 1 WARN previo por contraseña filtrada y 2 INFO intencionales.
- Queda sin probar con JWT genuino Supabase Auth el efecto real de logout; sin cookies HTTPS, 429 remoto, permiso de subir, merge a main, producción ni cambios de Vercel/Hostinger. Ver `docs/51-commercial-session-migration.md`.


## [Sin publicar — Issue #78: diagnóstico real de revocación JWT por catálogo]
- Se amplió `apps/portal/scripts/auth-real-smoke.mjs` para un ensayo **manual seguro** con las cuentas exclusivas de Auth dev: JWT original validado, GET de categorías activas con 200 y filas **antes** de signOut global, y 200/[] con **el mismo JWT que aún no expiró** tras signOut. El objetivo es diferenciar revocación RLS real de bloqueo global de registro.
- Se agregó `src/server/auth-e2e-catalog-revocation.ts` con URL exacta, GET único, sin caché, clave exclusivamente publicable, margen de expiración, validación de formato y fallas cerradas. Tests unitarios offline adversariales en `tests/unit/auth-real-revoked-catalog.test.mjs`.
- SQL read-only de `cotironda-dev`: **5 categorías activas**, guard RLS de sesión presente, registro false, 0 empresas, 0 sesiones y 0 objetos Storage. No se enviaron credenciales ni se iniciaron sesiones reales con herramientas de CI.
- **Falta ejecutar** el flujo con credenciales privadas en un entorno controlado; la CI verifica solo el código y mocks HTTP. No se declara E2E real exitoso. Ver `docs/52-auth-real-revoked-catalog-e2e.md`.


## [Sin publicar — PR #81: cookie Secure obligatoria en HTTPS SSR]
- Prueba Next.js compilado **sobre HTTPS verdadero loopback** con CA temporal del runner (sin `rejectUnauthorized:false`), SDK SSR real y Auth enteramente ficticio. Encontró que el Proxy renovaba cookies sin atributo `Secure`. El problema quedó reproducido mediante un test que **falló**; no se debilitó la expectativa.
- Corrección de `cookieOptions` en los tres clientes Supabase (`proxy.ts`, servidor, navegador): `secure` en `NODE_ENV=production` (Preview y Production), `sameSite=lax`, `path=/`, sin activar `HttpOnly` que impediría refresh del lado navegador. `next dev` local sigue compatible con HTTP.
- Test HTTPS completo demuestra certificación CA, rechazo de certificado sin confianza, Set-Cookie Secure, no-store, rotación y reutilización de cookie, segundo visitante anónimo, origen adversarial 403 y registro autorizado aún 503 fail-closed. **161/161 unitarias y cinco workflows CI SUCCESS** en HEAD `a089be6545e3dcea905ab544ca788cc4d3c705f6`. Ver `docs/53-https-ssr-loopback-ci.md`.
- Este test no usa Supabase Auth real, ni navegadores completos ni certificado Vercel; no se hizo merge, cambió DB ni publicó producción.


## [Sin publicar — PR #83: no reutilización de credenciales y ejecución Auth aislada]
- Preflight de E2E manual Auth niega contraseñas iguales en las dos cuentas de ensayo, exige mínimo 12 caracteres y bloquea pruebas con credenciales genuinas en `GITHUB_ACTIONS`, `CI` y `VERCEL`.
- Se incorporó `npm run e2e:auth:dev` con Node 22 `--experimental-strip-types`, evitando fallas de importación `.ts`. La CI ejecuta deliberadamente el comando y requiere el rechazo antes de la red; **no dispone de claves ni contraseñas reales**.
- Se blindó el diagnóstico para imprimir solo códigos de error permitidos de Cotironda, nunca respuestas arbitrarias de SDK/red ni secretos. Tests adversariales nuevos y `docs/54-e2e-auth-secret-preflight.md`.
- Cuentas de ensayo que reutilizaron una contraseña ya divulgada deben rotarse localmente con dos secretos nuevos y distintos; **no se incluyeron valores sensibles en código ni documentación**. No se alteraron Supabase, producción, Vercel, DNS ni `main`. Pendiente de ejecutar JWT genuino tras logout.


## [Sin publicar — PR #85: prueba remota de Auth desde navegador]
- Se incorporó `tests/manual/cotironda-auth-dev-browser.html` autocontenido y sin dependencias; permite ensayo de dos usuarios de desarrollo con entrada de credenciales solo en navegador, clave `sb_publishable_` pública y conexión restringida por CSP al origen HTTPS de `cotironda-dev`.
- Contrasta JWT emitido por Auth, `/auth/v1/user`, catálogo RLS visible antes de logout y **200 con [] tras logout** con el mismo JWT original y no vencido; prueba bloqueo de correo no confirmado. Borra campos de contraseña, hace logout de emergencia y solo copia un reporte PASS/FAIL sin JWT, emails ni contraseñas.
- `tests/unit/browser-auth-dev-diagnostic.test.mjs` ejecuta el JavaScript real en entorno simulado y valida escenarios normales y adversariales. El E2E auténtico del navegador sigue **pendiente de ejecución**, sin secretos en GitHub y sin cambios de Supabase/producción. Documentación en `docs/55-browser-auth-dev-diagnostic.md`.

 
## [Sin publicar — 30/10/2026: prueba auténtica JWT/RLS desde Chrome Android]
- Propietario ejecutó diagnóstico de dos cuentas dev con **8/8 PASS** (captura aportada directamente, no incorporada a GitHub): JWT confirmado, identidad, catálogo visible, logout global, JWT aún vigente, **mismo JWT tras logout con HTTP 200 + []**, cuenta sin confirmar rechazada, diagnóstico sin errores.
- Se corroboró **independientemente** con logs agregados Auth (login y logout), gateway (GET catálogo 2 × HTTP 200, logout POST 204, login POST 200 y 400), y SQL dev (registro falso, dos usuarios, cero sesiones/empresas/objetos, cinco categorías y política SELECT con guard de sesión). No se consultó ni guardó ningún secreto o identificador personal.
- **Control específico de revocación RLS por sesión: aceptado en cotironda-dev**, sin confundir expiración JWT/HTTP 401 con revocación. Evidencia y limitaciones: docs/56-auth-real-mobile-rls-proof.md.
- Pendientes fuera de este control: cookies HTTPS del portal desplegado con Auth auténtico, HTTP 429 remoto, decisión sobre WARN password leakage, backup/recovery y revisión de PRs. Sin publicaciones ni cambios de Supabase por esta anotación.


## [Sin publicar — Issue #86: Preview Next real en proyecto Vercel correcto]
- Se auditó `cotironda` demo: Vercel status `READY` sobre build vacío de 46 ms, framework=null. Se evitó tomarlo como prueba del portal.
- Se inspeccionó el proyecto separado `cotironda-portal-dev`: framework Next.js, SSO habilitado para todos los despliegues, proyecto `live=false`, versión antigua con target production **no tocada**.
- Se creó un **nuevo Preview protegido** del portal sobre commit `31a8bd22`, deployment `dpl_EFo5qxksdsaUnUQn5cG7CEj87i3i`, `target=null`, Next.js 16.4.3 compilado realmente y rutas /ingresar, /alta y /api/organizaciones con Proxy presente. No se habilitó registro ni se publicaron cambios.
- Guard puro `src/server/vercel-preview-audit.ts` y tests adversariales: exigen proyecto, commit, SSO, target Preview y evidencia real de `next build`; rechazan una demo READY sin Next. Detalles docs/57-vercel-portal-preview-audit.md.


## [Sin publicar — Issue #88: separación de login Preview / registro comercial]
- Nueva compuerta server-only autenticacionPreviewSoloIngreso: solo cuando VERCEL_ENV=preview, bandera explícita, registro=false, cotironda-dev exacto y publishable key, sin heredar secretos ni habilitar production.
- UI de ingreso independiente para cuentas existentes en SSO Preview; no incluye signUp ni botón Crear cuenta. /alta validada con getUser muestra únicamente confirmación de sesión y salida global; no muestra formulario de empresa.
- Proxy de Next mantiene /api/organizaciones bajo puerta comercial previa (modo login-only API continúa HTTP 503); no se expone SQL, Storage ni alta por habilitar login.
- CI prueba escenarios de producción/flag/tenant, HTTP SSR y TLS real con renovación de cookie Secure, anti-cache y separación entre sesiones, para modo completo y modo login-only. Véase docs/58-preview-login-only-auth.md; no es una certificación Auth real Vercel.


### Verificación operativa del modo Preview login-only — 30/10/2026
- Las 5 workflows GitHub Actions aprobaron el commit de código `1c0c8b82dca326eed50339d68d4bd7ba1aa8d71b` con **190/190 unitarias**, Next Full y login-only en HTTPS TLS real CI con Auth simulado, RLS/Pg17, PostgREST y sitio.
- Vercel rechazó variable de entorno restringida por rama por no existir conexión Git a nivel proyecto. Solución fail-closed: flag en **Preview solamente** y guard adicional `VERCEL_GIT_COMMIT_REF` exacto a `test/01-auth-only-preview`; prueba unitaria adversarial y build remoto mostraron `COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD=ALLOW`. No se conectó Git para evitar promover código inesperadamente.
- Nuevo deployment del proyecto correcto `cotironda-portal-dev` (`dpl_6X6o3xzgP1aRDRVpjdUtQ9p36tyM`) compiló Next 16.4.3, rutas y Proxy. `READY`, target Preview y SSO habilitado para todo despliegue; variables de Supabase verificadas por igualdad, registro false y SQL dev con 0 empresas/sesiones/archivos. **No significa E2E Auth real de Next bajo SSO verificado**. Ver docs/58.


### Ingreso auténtico verificado en Preview Android — 30/10/2026
- El propietario compartió pantalla «Sesión de prueba activa» sin formulario de alta. Supabase registra 1 login por Auth HTTP 200 y 2 comprobaciones `GET /auth/v1/user` HTTP 200.
- Login de ensayo real al portal Next y vista privada **verificados**. Pendiente pulsar logout y verificar que `/alta` redirige sin sesión; no se han inspeccionado atributos de cookies de esa Preview. Registro en `docs/59-preview-auth-real-mobile-login.md`. Sin producción ni secretos.


### Auth real de Preview — logout verificado el 30/10/2026
- Captura de Chrome confirma retorno al formulario «Ingresá a tu empresa» tras pulsar «Cerrar sesión de prueba».
- Supabase Auth gateway registra 1 POST `/auth/v1/logout` **HTTP 204** y Audit 1 `logout`. Consulta read-only: **0 sesiones Auth**, bandera de registro false, 0 empresas y 0 Storage. Esto acredita logout remoto y redirección real, pero **no** que reabrir directamente `/alta` esté protegido después; tampoco se inspeccionaron cookies de la Preview. Ver docs/59.

 
### Control funcional de sesión de Preview validado (30/10/2026)
- Tras logout global y retorno al formulario de ingreso, el propietario volvió a navegar al enlace directo **`/alta`**. Captura Chrome de escritorio muestra únicamente «Ingresá a tu empresa», sin contenido de la sesión anterior. El código de /alta protege acceso mediante `auth.getUser()` y redirección al ingreso.
- Supabase dev por SQL read-only posterior: 0 sesiones Auth, registro false, 0 empresas, 0 archivos. Se documenta **subcontrol login/logout/denegación posterior APROBADO**, con límite de que no se inspeccionaron headers/cookies en el navegador ni status HTTP exacto de redirección.
- Registrar cierre de Issue #88 sin declarar Etapa 01 finalizada. PR #89 permanece draft, sin publicación ni cambios SQL. Referencia: `docs/59-preview-auth-real-mobile-login.md`.

 
## [Sin publicar — PR #91: recuperación PG17 de ensayo y auditoría Free]
- Organización Supabase verificada en plan **Free**; la documentación oficial indica copias diarias automáticas para proyectos Pro/Team/Enterprise, no Free. No se creó, exportó ni almacenó un backup de `cotironda-dev` real.
- Nuevo `scripts/ci/pg17-backup-restore-drill.sh` usa exclusivamente PG17 de CI, dump custom con cuatro esquemas, checksum SHA-256, prueba adversarial de copia alterada, inventario exigente, eliminación simulada de una categoría ficticia y `pg_restore` transaccional en otra base CI. Se verifican seed recuperado, políticas RLS comerciales, guard JWT post-logout, buckets privados, registro bloqueado y grants. Se borran archivos temporales y base CI restaurada.
- `src/server/backup-restore-integrity.ts` y tests adversariales rechazan dumps parciales de Auth, Storage, privados, datos y funciones; workflow PG17 ejecuta restore luego de 12 migraciones y tests. Primera ejecución descubrió error sintáctico Bash en comparación de hash, **corregido** antes de repetir; siguiente ejecución obtuvo PASS completo en restore CI y 5/5 workflows.
- `docs/60-backup-recovery-free-plan.md`: diferencia entre respaldo SQL CI y respaldo real cifrado; Supabase CLI habitual excluye `auth`/`storage` gestionados y la base no respalda bytes de Storage. No se habilita registro ni piloto. **Copia externa real y recovery drill de servicios gestionados pendientes**.

 
## [Sin publicar — Issue #92 / PR #93: diagnóstico privado HTTPS en navegador]
- En `/alta` de Preview SSO, luego de `auth.getUser()` exitoso, se presenta botón «Comprobar cookies y caché». Usa CookieStore (si existe) para leer solamente nombre y atributos seguros de cookies de Cotironda; ningún token/cookie value se guarda, imprime ni transfiere. Comprueba GET de `/alta` mismo origen con `Cache-Control: private,no-store` y sin respuesta CDN HIT. Reporta PASS/FAIL/INCONCLUSO; sin CookieStore no inventa resultado positivo.
- `src/server/browser-cookie-cache-audit.ts`: evaluador puro y tests adversarios de atributos faltantes, cookies inseguras/ajenas, redirects, cache pública/CDN HIT. `apps/portal/scripts/smoke-https-ssr.mjs` exige botón solo en página SSR autenticada de ensayo y otro build CI verifica la segunda rama de Preview.
- La lista cerrada de ramas de solo ingreso ahora autoriza exactamente `test/01-auth-only-preview` y `security/01-browser-cookie-cache-audit`, manteniendo SSO, registro=false, tenant Supabase dev exacto y production bloqueada. No se agrega API, tráfico a terceros ni secretos.
- La primera ejecución del PR detectó discrepancia entre la definición DOM TypeScript de CookieStore y los metadatos de la API del navegador; corregida la conversión tipada, sin deshabilitar verificaciones.
- Doc `docs/61-real-browser-cookie-cache-diagnostic.md` explica limitación de `Set-Cookie` y `HttpOnly`, prueba real pendiente en navegador, sin enlace temporal que omita SSO.

 
### Bloqueo de despliegue de diagnóstico privado — 30/10/2026
- Vercel rechazó una **nueva Preview** de `security/01-browser-cookie-cache-audit` con HTTP 402 `api-deployments-free-per-day` (límite de despliegues Free; `retryAfter=86400`). La operación **NO creó un deployment**; no se promocionó producción, no se modificó SSO ni se contrató un plan pago.
- Los tests GitHub del código previo aprobaron **217/217 unitarias y 5/5 workflows**, incluyendo Next 16 + SSR HTTPS con Auth sintético. La prueba de atributos reales de cookies en navegador **NO fue realizada** porque la versión nueva no está desplegada.
- La documentación 61 registra exactamente qué se comprobó y cómo proceder cuando exista cuota de despliegues, sin generar enlaces temporales que omitan SSO.


## [Sin publicar — Issue #94 / PR #95: observador Auth signup público]
- Auditoría read-only detecta distinción de seguridad: el cierre de registro de **empresas** no impide necesariamente la creación de **usuarios Auth** por llamada directa a `/auth/v1/signup`. No se afirmó una configuración remota no verificada ni se intentó un POST de alta.
- Nueva rutina `comprobarRegistroAuthSoloLectura`: **GET** fijo `/auth/v1/settings` de cotironda-dev con apikey publicable, sin sesión/secretos/cookies, timeout y límite de respuesta, aceptando únicamente `disable_signup` booleano; resultados PASS/FAIL/INCONCLUSO sanitizados.
- Vista independiente `AuditoriaRegistroAuth` solo bajo `auth.getUser()` en Preview SSO de cuenta existente; agrega rama de ensayo exacta al guard del servidor y test HTTPS en Next con Auth sintético. No altera registro SQL, RPC, Storage ni producción.
- Pruebas unitarias adversarias de transportes falso, HTTP erróneo, JSON anómalo, CORS/timeout, otros proyectos, claves privadas y ruta protegida. Informe docs/62. No hay nueva Preview Vercel por cuota diaria 402; estado Auth remoto pendiente.


## [Sin publicar — Issue #96: headers anti-clickjacking en portal Next]
- `apps/portal/next.config.ts` agrega seis cabeceras explícitas: X-Frame-Options DENY, CSP documental `frame-ancestors 'none'` + base/form/object restrictions, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy sin sensores/pagos y X-Robots-Tag noindex para el portal privado.
- `apps/portal/scripts/smoke-https-ssr.mjs` verifica estos headers con **Next compilado sobre HTTPS real de loopback**, incluso en redirect anónimo, refresh de token SSR con `Set-Cookie`, GET con sesión renovada y POST de alta bloqueado. Auth sigue completamente sintético e interceptado.
- `tests/unit/http-security-headers.test.mjs` agrega regresiones para impedir CSP de scripts sin nonces, HSTS amplio, CORS público o caché global de assets. **No se proclama CSP completa/XSS ni se reemplazan los permisos SQL.** Ver `docs/63-next-http-security-headers.md`.
- Cambio exclusivo GitHub branch/PR draft, no desplegado en Vercel ni production, sin tocar Supabase, DNS ni registro comercial.


## [Sin publicar — Issue #98: prueba pública GET de Auth remoto desde GitHub Actions]
- Nuevo script `scripts/ci/auth-settings-remote-probe.mjs` reutiliza el helper de validación `disable_signup` y ejecuta **un único GET** autenticado solo con clave publishable, sin usuarios/cookies/JWT ni POST. CI acepta la ejecución únicamente en PR de rama exacta, repo propio y flag privado explícito.
- Salida exclusivamente PASS/FAIL/INCONCLUSO con códigos fijos; si Auth permite autorregistro directo (aunque empresas SQL sigan cerradas), la prueba remota termina con exit 1 y obliga a investigar. Timeout/errores/no verificable también quedan bloqueados, sin informar falso PASS.
- `tests/unit/auth-settings-remote-probe.test.mjs` intercepta totalmente el transporte y prueba estados, contextos no autorizados, destino exacto, falta de filtraciones y no ejecución de red al importar el módulo.
- **No se alteró** Auth real, SQL, usuarios, Vercel, DNS o main. Guía `docs/64-remote-gotrue-signup-audit.md`; ejecución remota pendiente de la corrida del PR.


### Auditoría real del autorregistro Auth — 30/10/2026
- En el PR #99 se verificó `GET /auth/v1/settings` auténtico en Supabase dev desde GitHub Actions, con publishable pública y sin credenciales/POST. El valor exacto `disable_signup=false` confirma que **Auth tiene habilitada la creación directa de usuarios**, aunque SQL impida registrar empresas. Es un hallazgo del entorno dev, no un ataque ni un usuario creado.
- **245/245 unitarias PASS y 4/5 workflows SUCCESS; el quinto workflow falla deliberadamente** con `COTIRONDA_AUTH_SIGNUP=FAIL / autorregistro_auth_habilitado` (run 41060813027). No ocultar ni cambiar ese exit code sin corregir Auth remoto.
- Logs Supabase confirman GET /auth/v1/settings HTTP 200; SQL read-only posterior: 2 usuarios de ensayo, 0 sesiones, organizaciones o Storage, flag comercial false. No se modificó el servicio Auth ni producción.
- Issue #98 completo por evidencia; Issue #94 permanece bloqueado hasta deshabilitar en Dashboard «Allow new users to sign up» solo en dev y repetir GET PASS. Ver docs/64.


## [Sin publicar] — Inicio de Etapa 02 / 30-10-2026 / PR #101
- La configuración alojada de Supabase Auth dev fue corregida por el propietario: `Allow new users to sign up=OFF`; CI remota reejecutada confirmó `COTIRONDA_AUTH_SIGNUP=PASS` ([run 41061840605](https://github.com/ProtectorRudo/Cotironda/actions/runs/41061840605)). Issue #94 cerrado; 2 cuentas y 0 empresas preservadas. Sin publicación.
- Nuevo validador TypeScript `src/domain/extraccion-documental.ts` para salida IA no confiable: genera exclusivamente `pendiente_confirmacion_comprador`, mantiene trazabilidad de líneas, marca incertidumbres y duplicados, jamás inventa cantidades ni devuelve precios arbitrarios.
- `tests/unit/extraccion-documental.test.mjs`: 13 casos; 258/258 unitarias y 5/5 GitHub Actions SUCCESS en PR #101 commit `7895b748fd6a5cf24e60ab213b2a73fc8b07070a`. No se ejecutaron OCR, IA remota, AV ni uploads. Documento de alcance `docs/65-etapa02-borrador-documental.md`.
- Stage 01 permanece en PRs apilados; no merge ni deploy ni registro habilitado. El próximo objetivo es extraer un corpus sintético, después conectar IA bajo contrato y controles de ingreso de archivos.


## [Sin publicar] — D013: despacho automático sin revisión por línea, 30-10-2026
- El propietario modifica el flujo: enviar lista + autorización de distribución, sin corrección/confirmación previa de cada ítem. Las dudas se retienen y se notifican, las líneas claras se encaminan automáticamente.
- Nuevo módulo puro src/domain/despacho-automatico.ts: solo selecciona productos exactos del catálogo confirmado de proveedores activos con consentimiento WhatsApp y cobertura de zona, con claves de idempotencia por ronda/proveedor. No envía nada; proveedores sin coincidencia no reciben solicitudes. Mantiene confirmación posterior de precios por proveedor y adjudicación manual.
- Se actualizó la especificación de extracción, pruebas adversariales y documentación comercial/técnica, sin cambios en Supabase, producción, Auth, pagos, DNS o WhatsApp. Issue #102.


## [Sin publicar] — Etapa 02: texto → plan de solicitudes, 30-10-2026
- Primer módulo `src/domain/flujo-texto.ts`: texto explícito en español se valida y conecta con `prepararBorradorDocumental` y `planificarDespachoAutomatico`; conserva referencias y muestra líneas retenidas por incertidumbre y catálogo sin coincidencia.
- Demo local `npm run demo:texto` con proveedores ficticios, sin llamadas externas; pruebas adversarias y de 100 líneas en `tests/unit/flujo-texto.test.mjs`. El estado de CI se confirma por ejecución, no por crear commits.
- No OCR, IA remota, carga de documentos, WhatsApp, registro comercial, migraciones, cambios en producción ni DNS. Issue #104; doc/66.


## [Sin publicar] — Etapa 02: lectura XLSX controlada en memoria (Issue #106)
- `scripts/offline/xlsx-seguro.mjs`: ZIP/OOXML real pequeño con hojas/tablas explícitas; referencias `Hoja N, fila M`; no interpreta fórmulas, macros ni contenido activo.
- Endurecimiento adversarial de archivos: validación central/local headers, CRC32, rutas, tamaño, descompresión, XML, relaciones externas, hojas ocultas, hasta 100 ítems.
- `tests/helpers/xlsx-fixture.mjs`, `tests/unit/xlsx-offline.test.mjs`, `scripts/demo/xlsx-demo.mjs`, `npm run demo:xlsx` para simulación reproducible con catálogos ficticios.
- Reutiliza pipeline de D013 y no realiza envíos ni abre endpoints públicos. Suite CI debe verificarse contra commit final del PR. Sin cambios Supabase/Whapi/Vercel/DNS.


## [Sin publicar] — Etapa 02 OpenAI Responses adapter / 30-10-2026
- `src/server/openai-extraccion.ts`: llamada preparada a Responses API (`gpt-6-luna` candidato) con schema estricto, input no confiable, validación del origen, de cantidad fuera de medidas de envase y retención de líneas dudosas, sin acciones de envío.
- `simularPlanesConIA`: consume borrador IA validado y lo cruza con catálogo confirmado/consentimiento, únicamente plan offline. Autorización de solicitud antes de gasto, sin exposición de API key.
- `tests/unit/openai-extraccion.test.mjs`: casos mock positivos/adversarios. `tests/fixtures/materiales-argentinos-ia-v1.json`: corpus sintético inicial de 12 ejemplos. `npm run eval:ia` falla cerrado/offline; modo real requiere doble autorización y secreto en DEV.
- NO se conectó una clave real ni se llamó al modelo. NO hay precisión medida ni gasto real: no confundir mocks con pruebas del modelo. Docs/68 y Issue #108. Sin merge, despliegue, WhatsApp ni cambios Supabase.


## [Sin publicar] — Etapa 02: evaluación de calidad de IA sin red (Issue #110)
- Nuevo scorer determinista `src/domain/evaluacion-ia-documental.ts` con métricas separadas de exactitud de líneas y destinatarios; puerta FAIL por cantidades/unidades incorrectas, artículos inventados o proveedores ajenos.
- `tests/fixtures/gold-despacho-ia-v1.json`: 12 casos sintéticos con salidas mock, incluidos falsos productos, cantidades inventadas, materiales omitidos, duplicados, opt-out y zonas ajenas; simulador `tests/helpers/evaluador-gold.mjs`.
- `npm run benchmark:ia:offline` y test de regresión que detecta cambios en clasificación. **Nunca invoca API real**; no mide precisión del modelo ni consume créditos. Docs/69 y Issue #110.
- Sin cambios de base, precios, Whapi, usuarios, producción ni DNS; PR draft apilado sobre #109.

- Se actualizó el script opt-in `scripts/eval/openai-texto.mjs` para cotejar 3 casos live futuros contra gold (destinatarios, artículos y cantidades) con reporte de tokens/costo estimado y bloqueo CI/producción. No se ejecutó ningún request real.


## [Sin publicar] — Etapa 02: propuestas de cotización alternativas (Issue #113)
- `src/domain/alternativas-cotizacion.ts`: cálculo decimal exacto de envases alternativos y excedentes; consultas funcionales solamente por relación curada, sin homologar ni enviar.
- `tests/unit/alternativas-cotizacion.test.mjs`: pruebas de cemento 25/50, hidrófugo 4/5 L, látex 20/18 L, familias, especificaciones, opt-in, zonas, marcas, duplicados y retenciones.
- Docs/70 y alineación de README con la decisión D013 de distribución automática. No se modificó el matcher exacto, base Supabase, Whapi ni producción; cambios en PR borrador apilado sobre #111.


## [Sin publicar] — Etapa 02 / D014: identidad de producto, variantes de marca/envase
- Se aprobó priorizar identidad canónica del producto con atributos críticos verificables antes de filtrar marcas y presentaciones; marca flexible por defecto, restrictiva únicamente si el comprador la exige.
- Nuevo planificador puro `src/domain/identidad-producto.ts`: una sola solicitud por proveedor con varias opciones de marca/envase, cantidades y excedentes decimales exactos (BigInt); datos técnicos inciertos solo como consulta, incompatibilidades excluidas.
- Pruebas `tests/unit/identidad-producto.test.mjs` y docs/71. **Sin integración con despachador existente, bases reales ni WhatsApp**; sigue pendiente P007 y evaluación IA real. Issue #115.


## [Sin publicar] — D015: invitaciones amplias por producto (Issue #117)
- `src/domain/invitaciones-por-producto.ts`: consultas offline a proveedores con producto canónico confirmado, marca y presentación flexibles; diferencia técnica explícita es consulta, nunca oferta conforme. Marca obligatoria solo cuando comprador la exige expresamente.
- Se conservan requisitos, cantidades, unidades y origen; no se infieren kg de bolsas sin tamaño ni precios; una invitación por proveedor con varios SKUs agrupados. Zona, consentimiento, baja, duplicados y seguridad documental conservados.
- Se documentó separación fase de invitación D015 vs compatibilidad D014/Oferta posterior. Tests para «cemento» genérico, Loma Negra→Avellaneda 25/35kg, pintura, placas, electricidad, envases, exclusividad. Documentación docs/72. No conexión a catálogos Supabase ni envío Whapi/producción.


## [Sin publicar] — Etapa 02: puente de taxonomía argentina a invitaciones D015 (Issue #119)
- `src/domain/taxonomia-materiales.ts`: diccionario local curado de 6 familias iniciales de 5 rubros, exclusiones para falsos positivos y atributos explícitos para cemento/placas/látex/cables; retención de artículos no identificables.
- Resolver de marcas expresamente exclusivas vs mencionadas, corrigiendo falsa exclusividad de IA y conservando originales. No inventa peso de bolsas de cemento sin tamaño especificado.
- `simularInvitacionesConIA` conecta extractor OpenAI validado → taxonomía curada → matcher de catálogo producto confirmado/consentimiento; no hace envíos y usa fetch MOCK en pruebas.
- `npm run demo:productos`, tests unitarios de terminología argentina y docs/73. Sin OpenAI real, WhatsApp, Supabase, DNS ni publicación. PR draft hijo de #118.


## [Sin publicar] — Etapa 02: vía local sin tokens para textos simples (Issue #121)
- `src/domain/entrada-economica.ts`: interpretación determinista de pedidos simples, clasificación por producto D015, propuestas sin envíos y registro de líneas pendientes para IA.
- `src/domain/flujo-texto.ts`: parser reutilizable y unidades contables adicionales (placas, latas, bidones), sin inventar tamaños de presentación.
- `tests/unit/entrada-economica.test.mjs`: pruebas de textos argentinos, varias marcas y rubros, líneas ambiguas, exclusividad, duplicados, instrucciones adversarias, opt-in y límites. `npm run demo:sin-ia` es una simulación sin red.
- 0 tokens consumidos por esta ruta local; no afirmar ahorro real antes de comparar con inferencias OpenAI. Docs/74 y PR draft hija #120; sin Supabase/Whapi/producción.


## [Sin publicar] — Etapa 02 D016: calidad y cobertura antes que ahorro de IA
- `src/server/flujo-calidad-ia.ts`: primer coordinador IA-first (mockeado en tests) con estados y contadores por línea del documento, distinguiendo omisiones, retenciones, falta de proveedor y artículos preparados.
- Verificador OpenAI admite envoltorios coloquiales seguros («Necesito 20 bolsas de…») pero mantiene evidencia textual completa de cantidad/material; no acepta peso de envase como cantidad ni descripciones recortadas.
- `tests/unit/flujo-calidad-ia.test.mjs`: normal, extremo y rechazo remoto. El camino local de Issue #121 no se adopta por defecto sin evaluación comparativa. Docs/75 y D016.
- Sin mensajes reales ni inferencia OpenAI live; sin cambios Supabase, producción ni main.


## [Sin publicar] — Etapa 02: cobertura multimaterial por línea (Issue #125)
- Verificador de evidencia IA detecta separadores inequívocos y coteja **cada segmento de producto**. Añade campos `segmentos_fuente` / `segmentos_sin_extraccion` sin cambiar el contrato de envíos (sigue desactivado).
- Coordinador D016 informa cobertura parcial cuando un material se omite dentro de la misma línea; contadores y alertas visibles, sin confundir contenido de envase con artículo.
- Tests de regresión con dos materiales en una línea, uno omitido, duplicados y separador incompleto. Documentación docs/76. Sin IA live, WhatsApp, producción ni merge.


## [Sin publicar] — Etapa 02: benchmark de proveedores por producto (Issue #127)
- Nuevo `src/domain/evaluacion-invitaciones-producto.ts` que evalúa contra gold independiente extracción, recall de invitaciones, falsos proveedores, duplicados y cantidad/unidad alteradas con dos puertas de calidad.
- Doce casos sintéticos `tests/fixtures/gold-invitaciones-producto-v1.mjs` y tests adversariales de scoring; `npm run benchmark:producto:offline` usa Responses API MOCK y cero mensajes reales.
- No atribuir resultados al desempeño de GPT-6 Luna ni autorizar envío; docs/77 y PR draft hija de #126. Sin merge, base, WhatsApp ni producción.


## [Sin publicar] — Etapa 02: evaluación LIVE por producto preparada (Issue #129)
- Nuevo runner `scripts/eval/producto-quality-live.mjs` con seis casos sintéticos positivos del gold D015, ejecución manual DEV, scorer independiente, métricas de proveedor, tokens y costo estimado. **Ninguna llamada real ejecutada**.
- `scripts/eval/guardia-live-producto.mjs` exige `--live`, autorización exacta, clave de servidor, evita GitHub Actions/CI/Vercel/producción, sin reintentos ni logs de clave/prompt. Presupuesto soft USD 0,02 **no sustituye** control de gasto en OpenAI.
- Pruebas unitarias de guardas, estimación monetaria y bloqueo CLI. Documentación docs/78 sobre configuración externa mínima y límites. Sin WhatsApp, Supabase, deploy, merge ni datos reales.


## [Sin publicar] — Etapa 02: Supabase Edge Secrets para OpenAI (Issue #131)
- Se añadió gateway Deno protegido `supabase/functions/cotironda-ia-dev`, con autenticación servidor `@supabase/server` y proyecto DEV exacto, lectura exclusiva de `OPENAI_API_KEY` desde Edge Secrets, estado seguro y smoke sintético con flag explícito.
- Tests en Node22 para bloquear producción, ausencia de secreto/flag, prompts arbitrarios, rate limits, errores y filtraciones; documentación docs/79.
- **Pendiente** propietario configure secreto en Supabase DEV, despliegue DEV autorizado y smoke real, y conectar adaptador Next al gateway para extracción completa. Sin migración SQL, despliegue, llamadas pagadas, WhatsApp ni cambios a `main`.


### 30/10/2026 — Verificación del despliegue DEV del gateway (Issue #131)
- Supabase `cotironda-dev` ref `qkercsoqhehbenbbncwk`: Edge Function `cotironda-ia-dev` versión 1 **ACTIVE**; `verify_jwt=false` + `withSupabase(auth:'secret')` según esquema oficial de API keys modernas. Archivos verificados vía conector; **ninguna otra instancia ni producción tocada**.
- El propietario confirmó haber guardado `OPENAI_API_KEY`, pero el **runtime status** aún no pudo invocarse con la key privada Supabase desde las herramientas: no se verificó el booleano del secreto ni se realizó inferencia real. Ver procedimiento Dashboard en docs/79.


## [Sin publicar] — Etapa 02: laboratorio D015/D016 con motor real en Edge DEV (Issue #133)
- Prepara modo `quality_case` por ID sintético allowlisted y autorización separada, deshabilitado por defecto. Motor original de OpenAI + verificador de evidencia + taxonomía y selección D015 + benchmark independiente de cobertura. Nunca entrega texto/respuesta IA cruda ni envía solicitudes.
- `supabase/functions/cotironda-ia-dev/core` empaqueta copias byte-exactas de módulos `src` y corpus gold; script de regeneración y test de paridad para impedir deriva.
- Nuevos tests offline de casos múltiples, cantidad inventada, permisos independientes y rechazo 429. Docs/80. **NO se desplegó ni llamó OpenAI desde este modo**.


## [Sin publicar] — D018: una única consulta IA de laboratorio por caso (Issue #135)
- Edge `quality_case` exige reserva de DB antes de consumir OpenAI, con PK por caso (máximo seis) y denegación ante repetidos, carreras, fallos de BD o falta de cliente de cuota. Ni 429 ni error de red permiten liberar/reintentar la reserva.
- SQL versionado para registro sintético en Supabase DEV, RLS y permisos solo backend `service_role`; nuevos tests de concurrencia, 429 y permisos; docs/81.
- Sin publicación de producción, sin envíos reales. Medición del modelo real pendiente de permiso y acceso privado para invocar.


## [Sin publicar] — D019: persistencia de métricas de IA, solo laboratorio DEV (Issue #137)
- Nueva tabla privada `dev_ia_quality_results` con RLS, FK a reservas D018, métricas de productos y proveedores y tokens; sin texto de clientes/credenciales.
- Edge `quality_case`: después de consumir una reserva guarda el resultado y devuelve `auditoria_persistida`; error DB jamás desencadena nuevo gasto. Source `edge_runtime` o `reported_by_owner` para distinguir evidencias.
- Nuevos tests de denegación sin auditoría, guardado correcto, fallo de DB y caso FAIL. Docs/82. Sin despliegues productivos ni WhatsApp.

## [Sin publicar — D020 / Issue #139: automatización controlada del laboratorio]
- Se preparó dispatcher cron/pg_net **solo DEV**, configuración deshabilitada de fábrica, cola de los cinco casos sintéticos pendientes, sin consumo OpenAI en GitHub CI ni en la migración.
- Un caso por despachador; lock de concurrencia; avanza solo tras PASS real persistido; falla/timeout/resultado ausente detienen la secuencia sin reintento.
- Clave Supabase para invocar Edge almacenada en Vault (pendiente configuración única), no se mueve OPENAI_API_KEY de Edge Secrets. Tablas privadas RLS y función administrativa restringida.
- Pendiente CI, prueba SQL runtime DEV con interruptor OFF y activación posterior con aprobación/credencial. No se instaló cron ni se consumieron reservas para preparar este código. Ver docs/83.

- **Verificación remota D020:** migración instalada solo en Supabase DEV, dispatcher devuelve `disabled` y, al habilitarse transaccionalmente sin Vault, `blocked_missing_dev_invoker`; rollback verificó 0 cron jobs, 1/6 claims consumidos y 5 pendientes. Permisos SQL y RLS cerrados.
- **Corrección de seguridad:** pg_net se reinstaló en esquema `extensions` (sin tráfico, trabajos ni dependencias) y desapareció el WARN nuevo `extension_in_public`. Persisten observaciones RLS informativas y advertencia Auth previa independiente. **Automatización live aún desactivada** hasta almacenar credential de invocación y activar el cron.

## [Sin publicar — D020, evaluación LIVE real y bloqueo seguro, 30/10/2026]
- Vault guarda nueva credencial de invocación DEV. Edge v8 acepta solo secret keys de nombres `default` y `cotironda_quality_lab`; se corrigió HTTP 401 de auth:'secret' y se comprobó estado HTTP 200 sin gasto. 6/6 controles CI aprobaron el commit de código `57998292805147e787a04e67be89b08787380222`.
- Mediante Supabase pg_net y dispatcher SQL privado se ejecutaron tres nuevos benchmarks reales, **uno por transacción, sin cron**. Dos PASS/PASS con 2/2 y 1/1 materiales/proveedores; el tercero `cemento_generico_sin_especificacion_inventada` dio FAIL/FAIL, retuvo línea y omitió proveedor (ver Issue #141 y docs/83).
- Detención confirmada `halted_needs_review`; control OFF, 0 cron jobs, 4/6 reservas consumidas y 2 casos sin ejecutar. No hay reintentos y no se inventa causa raíz sin respuesta IA cruda. Sin Whapi, producción, secretos expuestos ni datos comerciales.

## [Sin publicar — D021: investigación de cemento genérico, Issue #141]
- Se agregó suite MOCK de regresión para «10 bolsas de Cemento», incluyendo respuestas buenas, descripción con cantidad, unidad equivocada, material y cantidad inventados y omisiones. No hay llamadas externas.
- Prompt de extracción precisa cómo separar producto de cantidad/unidad, sin dar el gold a la IA y sin relajar validación de evidencia de origen.
- Métricas numéricas privadas por etapa (ítems propuestos, aclaraciones, origen/cantidad no verificables, segmentos sin extracción y líneas retenidas); migración DEV opcional y writer Edge, sin almacenar respuestas del modelo.
- Continúan bloqueados los 2 casos pendientes. En el FAIL histórico no se puede determinar la causa precisa porque no se guardó la respuesta cruda. Ver docs/84 y PR #142.

- **Verificación DEV D021 completada:** 6/6 checks del código `e22206aa` SUCCESS, migración `dev_quality_numeric_diagnostics_d021` aplicada únicamente en Supabase DEV, seis columnas confirmadas, cuatro registros históricos sin modificar. Edge Function DEV actualizada a v9 ACTIVE y status autenticado HTTP 200 sin llamada paga. Postflight: 4/6 claims, 2 pendientes, 1 `needs_review`, despachador OFF, 0 cron jobs. Las columnas de diagnóstico aún no fueron validadas en un nuevo `quality_case` real; investigar error histórico sigue abierto.

## [Sin publicar — Etapa 03 / D022 prototipo de comparación justa]
- Se incorporó `src/domain/comparacion-ofertas.ts`: evaluación determinista de cobertura por artículo y cantidad, precios con BigInt/IVA explícito, fletes y mínimos por proveedor, opciones completas con hasta dos proveedores y ranking solo dentro de mismas condiciones.
- Bloqueos: sin inferencia de IVA/flete/tipo de cambio, sin equivalencias técnicas IA, sin suma engañosa de presupuestos parciales, sin contactos, sin adjudicación. Rango acotado de laboratorio 8 renglones/10 cotizaciones y asignaciones por renglón íntegro; fraccionamiento aún fuera de alcance.
- Nueva suite adversarial de 18 tests y contrato docs/85. Sin cambios de Supabase, OpenAI, WhatsApp, Vercel ni producción. PR #144 draft apilado sobre #142; pendiente revisión final.

## [Sin publicar — Etapa 03 / D023: rondas y ofertas versionadas OFFLINE]
- Núcleo `src/domain/rondas-offline.ts`: programada, abierta, cerrada, cancelada; invitaciones anónimas y autorización de distribución, borradores por revisión, confirmación por proveedor con versiones históricas inmutables, idempotencia de eventos y expiración UTC.
- Cierre compone comparador D022 solo con últimas versiones confirmadas; no admite drafts como precios, contacto, adjudicación o equivalencias no verificadas. Tests de roles, stale revisions, duplicados, plazos y datos desconocidos. Sin infraestructura ni producción. PR #146 draft sobre #144.

## [Sin publicar — D024: ledger privado SQL de rondas, Issue #147]
- Se preparó `supabase/sql/rounds_private_ledger_d024.sql` con seis tablas exclusivamente en esquema privado: rondas, renglones, invitaciones, borradores, eventos y versiones confirmadas. RLS activa sin políticas cliente y privilegios revocados incluso a `service_role` sobre nuevas tablas.
- Triggers: transiciones irreversibles, clock server, freeze de ítems e invitados, revisiones incrementales, confirmación igual al borrador, versiones secuenciales y confirmaciones/eventos que no pueden actualizarse ni borrarse.
- Validador JSON de líneas cerrado (cinco campos, cantidades/IVA/precios explícitos, sin texto libre ni contactos). Prueba aislada PG17 en `supabase/tests/ci/99_rounds_private_ledger.sql` con `ROLLBACK`. CI incorpora paso adicional sin alterar historial de 12 migraciones.
- No es backend operativo: falta autorización real de actor/empresa, funciones de escritura transaccionales, verificación de equivalencia y API. Sin aplicar en Supabase DEV ni despliegues, IA, Whapi o producción. Ver docs/87, PR #148.

## [Sin publicar — D025 / Issue #149: lectura compradora de rondas]
- Endpoint `GET /api/rondas/[rondaId]` protegido con cookies SSR, `getUser`, bandera propia apagada, no-store, validación de UUID y proyección estricta sin PII. Adaptador invoca solo `buyer_round_overview_v1(p_round_id)` sin user_id/tenant inyectados.
- SQL privado de lectura con rol NOLOGIN/NOBYPASSRLS, sesión `auth.sessions` vigente y membresía activa verificada en PostgreSQL, con RLS y wrapper público invoker; no grants de contacto, invitaciones ni ofertas.
- Tests unitarios adversariales y PostgreSQL 17 de empresas cruzadas, sesión revocada y permisos; esquema SQL pendiente solo en CI, sin migración ni instalación Supabase DEV. Ver docs/88 y PR #150.

## [Sin publicar — UX-001: fundamento WhatsApp-first y cero fricción, 30/10/2026]
- Decisión aprobada por el propietario: Cotironda será **hiperintuitiva, sin cursos y con cero fricción innecesaria** para compradores, corralones y demás proveedores. WhatsApp es el canal habitual para ambos; la web complementa con seguimiento, comparación y adjudicación sin obligar al proveedor a cargar su presupuesto otra vez.
- Se agregó [docs/89](docs/89-ux-cero-friccion-whatsapp-first.md) con recorridos ideales, textos claros, estados honestos, filtro UX por PR, métricas de piloto y pruebas con personas no técnicas.
- Se elevaron las reglas de UX a **AGENTS.md**, README, docs/01, docs/02, docs/05, docs/08, docs/09 y la decisión UX-001 en docs/10, manteniendo D013 (autorización inicial sin revisión de cada línea clara), confirmación de precios por proveedor y adjudicación manual.
- No confundir esta decisión documentada con integración Whapi lista. **No hay cambios de código, base, producción, mensajes WhatsApp ni costos de IA**. Seguimiento: Issue #151.

## [Sin publicar — D026 / Issue #153: borradores y confirmación transaccional privada]
- Funciones SQL privadas `save_offer_draft_atomic_v1` y `confirm_offer_atomic_v1` para crear borradores, controlar versiones, confirmar explícitamente y preservar ofertas anteriores sin ejecutar IA. Operan con lock de ronda, CAS, SHA-256 del evento generado en la BD y reintento idéntico sin duplicados.
- Rol `cotironda_rounds_writer` NOLOGIN/NOBYPASSRLS; no se concede acceso a la API pública ni a proveedores. La futura capa WhatsApp deberá comprobar identidad/consentimiento y ofrecer confirmación breve y sin portal, según UX-001.
- Suite `supabase/tests/ci/101_round_offer_atomic_write.sql` con datos de prueba y rollback, conectada a GitHub PostgreSQL17. Sin instalación ni despliegue, WhatsApp, IA o nuevos gastos; documento docs/90 y PR #154.

## [Sin publicar — D027 / Etapa 04: adaptador Whapi inbound aislado]
- Se preparó `src/server/whapi-inbound-offline.ts` para el formato Whapi `messages.post`: secreto compartido en header privado, validación de canal, mensajes directos, opt-in/invitación verificables desde backend, lotes limitados, huella y clave de idempotencia, puerto de persistencia. HTTP 200 solo tras éxito de todo el lote; errores 503 permiten reintentar sin duplicar mediante sink transaccional futuro.
- Los mensajes de texto/imagen/documento/audio/voz solo generan `pendiente_interpretacion`; no leen URLs ni ejecutan IA o confirmación de precio. `Confirmo` nunca autoriza D026 sin vinculación de conversación/revisión.
- Suite `tests/unit/whapi-inbound-offline.test.mjs` con casos adversariales y docs/91. **Sin webhook publicado, secrets, almacenamiento real, Whapi conectado ni producción**, y no se gastaron créditos IA.

## [Sin publicar — D028 / Issue #157: inbox durable privado de WhatsApp]
- Se crearon SQL de `whapi_contacts_v1` (canal + chat HMAC, verificación, consentimiento, baja) y `whapi_inbox_v1` (mensajes HMAC, contenido cifrado, huellas, estado y deduplicación), solo en GitHub CI. Rol NOLOGIN/NOBYPASSRLS, RLS y grants denegados a roles de API; funciones internas sin ejecución pública.
- Recibir mensaje requiere una invitación única vigente y consentimiento. «BAJA» exacta tiene camino propio sin invitación, persiste de forma idempotente y no se puede reactivar silenciosamente. Tests PostgreSQL17 + casos offline de baja, reintentos, colisiones y persistencia fallida; documentación docs/92.
- No se modifica Supabase DEV, producción, Whapi real ni las reservas de IA. Se necesita broker seguro que genere HMAC/AES-GCM, autentique el canal y autorice contacto antes de habilitar HTTP. PR #158 draft.

## [Sin publicar — D029 / Etapa 04: broker criptográfico Whapi offline]
- Nuevo `src/server/whapi-crypto-broker.ts`: HMAC-SHA256 para chat y mensaje con claves server-only separadas, huella HMAC de contenido, AES-256-GCM con nonce/tag/AAD y adaptadores hacia los puertos privados de D028. Identidad/invitación solo de almacenamiento confiable. BAJA protegida sin ronda activa.
- Suite `tests/unit/whapi-crypto-broker.test.mjs`: tampering, clave equivocada, aislamiento de canales, duplicación/colisión, baja, revocación, mensajes multimedia sin descarga, rechazo de recibos falsos y claves inválidas. Sin modificar scripts de IA ni historial de migraciones.
- D029 **no** habilita almacenamiento PostgreSQL desde Node ni rutas HTTP. Falta gestor de claves con rotación, worker SQL autorizado, configuración Whapi y pruebas E2E. Docs/93; PR #160 en borrador, sin instalación DEV/producción ni mensajes reales.

## [Sin publicar — D030 / Issue #161: gateway Whapi→PostgreSQL privado]
- Nueva función privada `whapi_resolve_active_contact_v1` bajo rol limitado D028, selecciona vínculo validado por HMAC+consentimiento y **una única** invitación abierta. Nuevo rol gateway NOLOGIN/NOBYPASSRLS con exclusivamente EXECUTE de resolver, inbox y BAJA, sin SELECT directo ni permisos de Data API.
- Adaptador Node `src/server/whapi-postgres-gateway.ts` con SQL parametrizado, validación estricta de HMAC, bytea/nonce/tag y respuestas, errores genéricos sin filtrar credenciales. Pruebas unitarias con driver simulado, pruebas SQL PostgreSQL17 reales en `103_whapi_gateway_private.sql`, documentación docs/94.
- No hay driver SQL conectado a DEV, ni configuración Whapi, ni despliegues, secretos, uso de IA o llamadas comerciales. PR #162 en borrador.

## [Sin publicar — D031 / Issue #163: E2E real Node a PostgreSQL 17]
- Dependencia aislada `pg@8.23.1` para CI con driver PostgreSQL auténtico, sin añadir carga al portal.
- Job PostgreSQL17 prepara login CI de mínimo privilegio y claves HMAC/AES y webhook efímeras; prueba con Node el recorrido completo D027→D029→D030→D028 y reenvíos/bajas entre conexiones.
- Prueba que rol gateway no puede SELECT de tablas ni UPDATE de rondas; SQL administrador inspecciona registros cifrados y BAJA. Datos sintéticos eliminados al destruir el contenedor de CI, sin alterar historial de 12 migraciones ni DEV/producción.
- Requiere cerrar package-lock, CI verde y auditoría antes de habilitar nada. Docs/95, PR #164.

## [Sin publicar — D032 / Issue #165: AES-GCM con key-id persistente]
- Nueva columna privada `crypto_key_id` con etiqueta `legacy_d029` para filas antiguas, función keyed NOLOGIN con permisos EXECUTE-only y colisión de replay si cambia key-id; la ruta D028 legacy no se elimina.
- Broker D029 acepta clave activa y clave(s) antiguas solo de lectura; el nuevo key-id queda autenticado en AAD. Gateway usa sentencia SQL parametrizada distinta para inserciones versionadas.
- Pruebas Node de rotación entre generaciones, tampering AAD, IDs inválidos y lectura histórica; SQL PG17 y E2E Node→PG con dos generaciones, sin cambiar HMAC de identidad ni clave de huella.
- Sin instalación DEV, Whapi, OpenAI, secretos ni despliegue de producción. Ver docs/96, PR #166.

## [Sin publicar — D033 / Issue #168: configuración server-only de claves Whapi]
- Nuevo `src/server/whapi-secret-config.ts`: control de entorno esperado, flag seguro deshabilitado por defecto, secreto header propio, HMAC de identidades/fingerprint y AES activo de 32 bytes, key-id y claves históricas acotadas; sin secretos en GitHub y sin usar `process.env` implícitamente.
- Valida formatos, claves triviales/duplicadas y rechazo de variables `NEXT_PUBLIC_COTIRONDA_WHAPI_*`; error genérico sin fuga. Preflight de retiro AES exige inventario completo confiable con cero filas por clave.
- Tests unitarios adversariales, docs/97. Auditoría read-only Supabase DEV confirmó D025 aún no instalado; Issue #167 sigue bloqueante de deploy. Issue #169 documenta replay que falla tras rotación AES de D032: NO activar rotación real hasta resolver. Sin instalaciones, Whapi, IA o producción.

## [Sin publicar — D034 / Issue #169: replay de WhatsApp entre claves AES]
- Corregida función SQL privada versionada para que un reenvío auténtico con mismo message-key, proveedor, tipo, timestamp y HMAC de contenido sea idempotente incluso tras rotar AES; key-id/ciphertext/nonce/tag históricos no se reescriben. Cambios de precio, chat, tipo o fecha siguen siendo colisiones.
- Revisiones equivalentes de timestamp en ruta legacy y BAJA, sin alterar grants ni propiedad del rol NOLOGIN. Nuevos ensayos PG17 y E2E Node→Postgres contra un login restringido más tests Node adversariales.
- D025 hosted Auth Issue #167 sigue bloqueante; las pruebas CI no implican instalación DEV ni conexión real de Whapi. Docs/98, PR #171 draft.

## [Sin publicar — D035 / Issue #167: rol lector sin dependencia auth.uid hosted]
- La D025 no instalada se corrige para eliminar `GRANT USAGE auth` inefectivo en roles personalizados de Supabase alojado, sustituyendo `auth.uid()` por un helper privado SECURITY INVOKER que lee el ID desde claims PostgREST validados.
- Se conserva `is_session_verified()` para verificación de sesión vigente y usuario/correo, así como RLS de empresa y membresía activa. Tests PG17 refuerzan ausencia de grants al lector y rechazo por claim `sub` contradictorio, session revocada o empresa ajena.
- No se otorga SELECT directo a `auth.users/auth.sessions`, no se habilita ninguna integración y no se instala D024–D035 en DEV o producción. Ver docs/99.

## [Sin publicar — D036 / Issue #173: preflight read-only antes de Supabase DEV]
- Nuevo `supabase/sql/dev_inventory_d036.sql` exclusivamente SELECT: inventario de migraciones alojadas, estado de roles/objetos D024–D035, RLS base, checker de sesión y flags, sin tocar datos personales.
- `scripts/ci/dev-readiness-d036.mjs` exige exactamente 17 migraciones (12 base + cinco laboratorio IA D019–D021), falla cerrado ante diferencias, y jamás devuelve aprobación automática de despliegue. Suite adversarial con historial corto, drift y permisos incorrectos.
- `supabase/tests/ci/106_dev_rollout_security_gate.sql` añade auditoría POST de grants/owners/segregación y RLS sobre PG17 efímero. Runbook `docs/100` define backups, etapas de instalación D024→D035, smoke tests reales y recuperación. Nuevo default de Supabase 30/10/2026 obliga grants explícitos para nuevas tablas `public` (RPC D025 tiene EXECUTE explícito).
- Preflight ejecutado en DEV alojado **solo lectura**, baseline conforme; ninguna migración, rol, secreto, webhook o producción modificada. CI y PR draft pendientes.

## [Sin publicar — D037 / Issue #176: recuperar fuentes históricas IA DEV]
- Archivo fiel de cinco migraciones SQL D018–D021 desde `supabase_migrations.schema_migrations.statements[1]` de DEV, verificado exactamente contra GitHub y firmado mediante manifiesto SHA-256. Las versiones D020 de ramas viejas no coincidían exactamente con SQL alojado; se prioriza la versión realmente aplicada. No se coloca bajo `supabase/migrations` para evitar reaplicación automática.
- `scripts/ci/verify-dev-ai-migration-sources-d037.mjs` y tests unitarios detectan cambios, faltantes y drift. PostgreSQL17 efímero restaura **solo tres definiciones tabulares** (D018/D019/D021) y verifica RLS, permisos y ausencia de cron/automatización. Las otras dos D020 se archivan pero no ejecutan por dependencias `pg_net`/`pg_cron` y `DROP EXTENSION`.
- No hubo modificaciones Supabase DEV o producción, ni llamadas IA, ni WhatsApp real. Issue #175 sigue abierto hasta respaldo y restauración completa en entorno Supabase aislado; docs/101.

## [Sin publicar — D038 / Issue #178: ensayo inerte del despachador y bloqueos de backup]
- Auditoría solo lectura: Supabase DEV plan Free, pg_cron/pg_net/Vault instaladas, cero cron, auto IA OFF y 4/6 reservas usadas. Sin respaldo diario automático garantizado en Free; urge exportación lógica real protegida y ensayo de recuperación antes de D024.
- Nuevo generador `scripts/ci/prepare-inert-quality-d038.mjs`, hash control y flag CI: omite **únicamente** dos `CREATE EXTENSION` de D020 en PG17 descartable, sin ejecutar migración que hace DROP EXTENSION. SQL CI 108 verifica despachador original desactivado, RLS, cinco casos sintéticos, cuatro reservas ficticias y ninguna llamada de red.
- Plan en docs/102: no confundir restauración lógica inerte con restauración completa de DEV, no hacer clon físico con jobs activos, proteger/Auth/Storage/Vault, sin secretos en repositorio ni cambios a DEV/producción.

## [Sin publicar — D039 / Issue #180: verificación de integridad de backups cifrados]
- Nuevo script local offline `scripts/ops/verify-encrypted-dev-backup-d039.mjs` con modos seal/verify y manifiesto SHA256 de cinco exportaciones age (roles/esquema/datos/historial), ref DEV fija y hash independiente obligatorio. No importa credenciales, no descifra y rechaza paquete incompleto, SQL abierto, symlinks y contenido alterado.
- Doce pruebas unitarias sintéticas y procedimiento en docs/103. Un paquete PASS NO demuestra exportación correcta, cobertura Auth/Storage/Vault, descifrado ni restauración. La herramienta informa expresamente `restore_verified=false` y `gate_d024_open=false`.
- Estado de Supabase DEV verificado solo con SELECT: 17 migraciones, cron 0 y flag IA auto false. Sin cambios de datos/esquema, sin backup real ni despliegues; Issue #175 bloqueante.

## [Sin publicar — D040 / Issue #182: privacidad local del paquete de backup]
- Auditoría de D039 halló falso nivel de confianza posible: ficheros cifrados o directorios con permisos públicos podían pasar las comprobaciones SHA256. D040 exige propiedad POSIX y modos privados 0700/0600, rechaza hardlinks y symlinks en cualquier ancestro y detecta cambios de inodo/tamaño/modo/marca temporal durante lectura. Rechazo en Windows nativo sin controles POSIX equivalentes.
- Seis pruebas adversariales nuevas (total 18 sintéticas), docs/103 corregido, sin acceso a secretos ni SQL alojado, sin backup real, sin despliegue o cambios en Supabase DEV/producción. Estado de recuperación #175 bloqueante.

## [Sin publicar — D041 / Issue #184: preflight de destino DEV y comprobación offline de descifrado]
- Nuevo script local scripts/ops/check-local-dev-backup-d041.mjs: valida destino Supabase DEV estricto con parámetro sslmode seguro obligatorio y único, sin conexiones ni secretos impresos, y confirma por CLI age real que cinco archivos cifrados verificados por D039/D040 se pueden descifrar con identidad privada local. El SQL descifrado se drena sin persistencia ni salida; valida nuevamente hash tras concluir.
- Tests con URL y procesos age SIMULADOS (no pruebas criptográficas en CI). Documentación docs/104 y restricciones de claves/cobertura de Auth, Storage, Vault y extensiones. Backup real, restauración aislada y bloqueo #175 permanecen PENDIENTES. No cambios Supabase DEV ni producción, sin IA/Whapi.

## [Sin publicar — D042 / Issue #186: prueba real age con cinco archivos sintéticos]
- Workflow independiente `age-synthetic-d042.yml` con permisos mínimos, Ubuntu24.04 y age paquete de repositorio firmado; genera dos pares X25519 efímeros y cinco SQL de prueba, cifra con CLI age real y comprueba pipeline D039/D040/D041.
- Pruebas negativas contra identidad equivocada, encabezado falso con SHA256 coherente y bytes alterados después de sellar; borra temporales sin artifacts ni logs de claves/plaintext. Tests unitarios de D041 anteriores eran únicamente mocks: D042 agrega comprobación criptográfica real sintética. No es backup DEV ni recuperación de Auth/Storage/Vault, sin cambios Supabase DEV/producción; bloqueos #175 y D024 permanecen.

## [Sin publicar — D043 / Issue #188: inventario alojado y comparador de recovery]
- Auditoría SELECT-only real sobre cotironda-dev: PG17.11, 17 migraciones, 2 cuentas Auth, 2 identidades, 0 sesiones, 2 buckets privados/0 objetos, 1 entrada Vault (sin leer su contenido), 4 claims IA, cron=0 y automatizaciones/registro OFF. Edge Function IA desplegada identificada para revisión independiente de auth Issue #189 (`verify_jwt=false` no equivale a prueba de explotación).
- Nuevo SQL D043 de solo lectura, comparador offline fail-closed de inventarios origen/restaurado, pruebas adversariales sintéticas y runbook docs/106. **No se ha tomado backup ni ensayado restauración real.** El comparador nunca abre D024 ni cierra bloqueo #175; sin cambios de DEV/producción.

## [Sin publicar — D044 / Issue #191: clave de laboratorio dedicada en Edge DEV]
- Auditoría de 13 archivos de `cotironda-ia-dev` contra despliegue v9 confirmó paridad exacta previo a cambios; `verify_jwt=false` respaldado por documentación oficial Supabase para auth secret key no JWT. Hallazgo de superficie innecesaria: también acepta `secret:default`.
- Rama D044 cambia únicamente fuente `index.ts` a `secret:cotironda_quality_lab` (whitelist mínima), agrega pruebas adversariales del handler con fetch/DB de CI bloqueados y contrato estático de wrapper; docs/107. **El despliegue alojado v9 NO cambia**, validación real de llamadas y migración desde default quedan pendientes. Sin IA, sin cambios en Vault/DEV/producción; #175 y D024 bloqueados.

## [Sin publicar — D045 / Issue #193: recorrido comercial B2B integrado offline]
- Nueva demo que **reutiliza** los módulos documentales, producto canónico/invitaciones y comparación monetaria determinista para un pedido de cemento, látex y yeso, con ítem inseguro retenido, cuatro proveedores aptos y tres ofertas simuladas anónimas.
- Suite integrada verifica consentimiento, catálogo/zona/baja, marca flexible, consulta de presentación alternativa NO homologada, IVA 21% y dos fletes, ofertas parciales, estado de confirmación, flete/IVA conocidos, no adjudicación y no filtración de identidad. Montos totalmente ficticios.
- docs/108 describe qué está probado y qué falta (IA/Whapi reales, confirmación del proveedor, DB licitaciones, recuperación #175). Sin cambios en DEV, producción, migraciones ni uso de recursos pagos.

## [Sin publicar — D046 / Issue #195: borrador y confirmación de cotización por conversación]
- Nuevo módulo de transición OFFLINE de oferta de proveedor con vínculo de ronda/chat validado por futuro backend, propuesta estructurada, preguntas por faltantes, confirmación por respuesta al borrador correcto o referencia explícita, idempotencia en memoria y versiones de precio inmutables.
- Confirmación del proveedor NO homologa diferencias de marca/envase ni permite comparación hasta verificación técnica: todas las equivalencias arrancan `sin_verificar`. Pruebas normales/adversariales de replay, identidad ajena, faltantes y cierre; suite integrada con receptor Whapi simulado D027 sin entregar mensajes. No DB ni Whapi/IA reales, sin efectos en DEV/producción. Ver docs/109.

## [Sin publicar — D047 / Issue #197: outbox de respuestas WhatsApp aislada]
- SQL D047 privada con trabajo idempotente por ronda/proveedor/revisión, referencia a inbox D028 HMAC, validación de consentimiento y borrador D026, leases exclusivos SKIP LOCKED, token de acuse, backoff y máximo 3 intentos. En caso de cambio de revisión, cancela el trabajo obsoleto; si muere el worker en el último lease, pasa a exhausted tras vencer.
- Pruebas transaccionales D047 sobre PostgreSQL17 de GitHub CI, sin datos personales, sin llamadas de Whapi/OpenAI, sin envío ni publicación. `accepted_by_transport` indica aceptación del transporte, nunca leído/entregado; persistencia de conversación D046 y correlación mensaje→versión todavía pendientes. Ver docs/110; bloqueo #175 intacto.

## [Sin publicar — D048 / Issue #199: procedencia inbox→oferta para bloquear respuestas equivocadas]
- SQL PostgreSQL CI con enlace de origen D028, evento de guardado D026, revisión y proveedor/ronda en la MISMA transacción; idempotencia y rechazo de replay distinto. Un trigger en outbox D047 rechaza respuesta si sólo comparte proveedor/ronda sin vínculo causal. Seguridad de funciones con roles NOLOGIN/RLS y sin acceso cliente ni secretos en datos.
- Pruebas PG17 de falso origen, retroasociación indebida, empresa ajena, distinta revisión, opt-out y replay; documentación docs/111. No se conecta Whapi, no hay validación semántica de IA ni publicación DEV. Gate backup #175 permanece.

## [Sin publicar — D049 / Issue #201: confirmación WhatsApp durable y versionada, solo CI]
- Se añade transacción privada PostgreSQL que valida mensaje inbox, aceptación del transporte del borrador correcto, correlación con revisión D048, términos completos e idempotencia y llama al confirmador inmutable D026. Evidencia de mensaje→evento→versión bajo RLS, sin teléfonos ni texto; el hash de intención depende de futuro broker de confianza.
- Pruebas PG17 de replay, otra empresa/chat, hash diferente, intento de confirmar antes de enviar, IVA desconocido, corrección, versión obsoleta y opt-out. **No significa que WhatsApp ya esté integrado, ni que SQL compruebe que alguien escribió «Confirmo» o que la oferta sea técnicamente equivalente.** Sin DB DEV ni producción, sin IA/Whapi, backup real #175 pendiente. Docs/112.

## [Sin publicar — D050 / Issue #203: cita Whapi cifrada y verificación de respuesta]
- Receptor D027 conserva únicamente `context.quoted_id` de mensajes de texto, con validación estricta, y broker D029 lo guarda cifrado AES-256-GCM y lo liga a fingerprint HMAC sin cambiar tablas ni romper mensajes legacy. No confía en quoted_content ni quoted_author.
- Nuevo módulo offline prepara intención de confirmación D049 solo si texto es `Confirmo`, el mensaje ya fue persistido, el ID citado corresponde por HMAC a una salida aceptada D047 de igual canal/chat/proveedor/ronda, y el evento de confirmación es determinista/antiduplicado. Pruebas adversariales en tests/unit/whapi-quoted-confirmation-d050.test.mjs; docs/113. Sin worker real, sin llamadas Whapi/IA, sin merge ni despliegue, recuperación DEV #175 pendiente.

## [Sin publicar — D051 / Issue #205: puerto PostgreSQL privado de confirmación]
- Dos RPC internas SECURITY DEFINER NOLOGIN/RLS para leer mensaje entrante AES-GCM cifrado y acuse D047 aceptado más origen D048, sin texto/chat/teléfono claro; índice único de acuse por canal evita asociar un mensaje saliente a dos jobs.
- Adaptador server-only SQL parametrizado con comprobación de tipos/buffers y conexión inyectada para D029/D050/D049. Nuevas pruebas unitarias adversariales y SQL en PostgreSQL17 CI, sin worker ni conector Whapi real, sin Supabase DEV/producción ni consumo IA. Ver docs/114; recuperación real #175 sigue abierta.

## [Sin publicar — D052 / Issue #207: E2E real Node ↔ PostgreSQL17 para confirmar precios]
- Ensayo reproducible PostgreSQL17 con login aislado y llaves efímeras que ejecuta el receptor WhatsApp D027, el cifrado AES de D029, la persistencia D030, procedencia D048, cola D047, verificador de cita D050/D051 y confirmación/versionado D049. Casos negativos, replay idempotente, dos versiones, baja, auditoría final de filas, sin enviar mensajes ni tocar DEV/prod. `scripts/ci/whapi-pg/confirm-d052-e2e.mjs`, workflow CI y docs/115.
- No se usa proveedor WhatsApp real, extracción IA ni HTTP externo; #175 sigue bloqueando cualquier migración comercial en DEV y el PR no autoriza producción.

## [Sin publicar — D053 / Issue #209: evitar duplicación de salida tras timeout]
- Hallazgo: D047 reclamaba lease expirado aunque el worker podía haber comenzado HTTP, arriesgando WhatsApp duplicado. Migración D053 en PG17 CI suma fase de envío iniciada antes de red, marca incertidumbre si crash/timeout, excluye esos trabajos de reclamos automáticos, concilia por acuse/evidencia HMAC o cancela sin reenviar.
- D047 finish(true) ya no es permitido tras D053; un fallo pre-HTTP conocido puede reintentarse bajo presupuesto. SQL privado roles NOLOGIN RLS, pruebas de expiración, token incorrecto, BAJA, rollback, estado incierto y reintento sin envío. Docs/116. No conectado a Whapi real; sin cambios DEV/prod, gate #175 pendiente.

## [Sin publicar — D054 / Issue #211: worker Whapi server-only y prueba fake transport]
- Orquestador `src/server/whapi-send-worker-d054.ts` para reclamar D047, resolver mensaje desde backend confiable, confirmar D053 `begin_send` con commit antes de ejecutar un transporte inyectado, registrar HMAC del ID de salida o marcar `uncertain` sin duplicar. No se implementa cliente HTTP ni existe ruta de producción.
- Rol sender `cotironda_reply_sender_d054` NOLOGIN con permiso mínimo y sin reconciliación/SELECT, 11 casos unitarios adversariales y E2E Node/PostgreSQL17 con transporte simulado, tres escenarios e inspección SQL. Docs/117; Whapi/IA real y backup/restore DEV #175 aún pendientes.

## [Sin publicar — D055 / Issue #213: Whapi.Cloud HTTP preparado, bloqueado por defecto]
- Adaptador server-only para POST /messages/text HTTPS, Authorization Bearer inyectada, destinatarios allowlist, autorizador de cupo obligatorio, sin global fetch ni retries, deadline 5 s, redirects prohibidos, JSON respuesta limitada a 16 KiB. Acepta `sent:true` + ID externo válido de Whapi y `pending/sent/delivered/read` como acuse de transporte **sin** inferir lectura; D054 registra HMAC o `uncertain` ante timeout/ambigüedad.
- Pruebas con fetch fake de credenciales, allowlist, límites, status, HTTP 429/errores, JSON malformado y composición con D054. Ningún token, envío ni migración real. Docs/118. Gate backup/restore DEV #175 vigente.

## [Sin publicar — D056 / Issue #215: límites de WhatsApp por comprador y consentimiento persistente]
- Política privada de envío por empresa compradora + canal (apagada por defecto), cuotas diarias/mensuales y presupuesto mensual en unidades de **reserva estimada**, no precios facturados. Trigger SQL une reserva del ledger 1/job con inicio HTTP D053 **en la misma transacción** y serializa concurrentes con `FOR UPDATE` sobre la política. Proveedor sigue gratis.
- Función privada pre-HTTP comprueba vigencia de consentimiento/BAJA/revisión + reserva, y adaptador server-only calcula HMAC D029 del destinatario para evitar enviar a otro chat. Tests PG17 transaccionales y tests TS de denegación, no public RPC ni tokens/clientes. No se instaló DEV/prod ni se habilitó Whapi, #175 sigue abierto. Docs/119.

## [Sin publicar — MVP-001 / Issue #217: primera experiencia comprador navegable]
- Nueva ruta responsive `/probar` en Next.js portal, accesible desde la portada: pegar lista, analizar con motor offline existente, retener dudas, agrupar invitaciones por rubro y proveedor ficticio, mostrar texto de consultas sin enviarlas. Privacidad por procesamiento local del navegador, sin red, sin IA ni presupuesto inventado. Tests unitarios de flujo y casos adversariales; docs/120.
- Reorientación de trabajo: consolidar PR encadenados y validar UX + ronda real supervisada en lugar de seguir añadiendo infraestructura aislada. Bloqueante restauración Supabase DEV #175 vigente. Sin merge o deploy.

## [Sin publicar — MVP-002 / Issue #219: candidatura de integración del producto]
- Creada rama de integración `integration/mvp-piloto-20261031` desde el MVP-001 probado; documentación de ancestría con `main` (1145 commits a favor, 0 detrás) y riesgos de megadiff, sin merge ni reescritura ciega de historial.
- Nueva prueba transversal entre vista comprador, motor de invitaciones D045 y comparador determinista, sin inventar precios, envíos ni adjudicación. CI completo y PR a `main` en borrador. Bloqueo Supabase DEV #175 y preview Vercel 402 vigentes. Docs/121.

## [Sin publicar — MVP-003 / #175: ensayo real de dump/restore PostgreSQL 17 aislado]
- GitHub Actions prueba un `pg_dump` custom y `pg_restore` PG17 reales sobre dos bases ficticias del mismo clúster CI después de todas las pruebas SQL. Compara huellas de filas, estados de outbox, ledger de cuotas, RLS, permisos y función de comienzo HTTP. No hay DROP, copia de datos de clientes, publicación, credenciales reales ni conexión a DEV. Docs/122. **No cerrar #175**: falta copia real cifrada de DEV y restauración separada con Auth/Storage/Vault/roles.

- Corrección MVP-003 en laboratorio: el primer pg_restore falló por `CHECK` de ofertas que consultaba `round_items_v1` durante COPY; se migra la validación cruzada a triggers de escritura en CI, manteniendo exactamente el validador y pruebas de rechazo. No se instaló el parche en DEV ni prod; requiere rollout auditado (#175). Ver docs/122.

### 31/10/2026 — MVP-003 extracción cifrada DEV preparada, pendiente de ejecución auténtica
- En PR #221 se sumó `scripts/ops/export-encrypted-dev-mvp003.mjs`, una herramienta local POSIX de cinco flujos `pg_dump`/`pg_dumpall` PostgreSQL17 → age, sin SQL plaintext persistente, con lista de destinos permitidos y manifiesto D039.
- 10 pruebas unitarias sintéticas de exportación (casos positivos y de falla); documentación de uso local en `docs/123-mvp-003-exportacion-cifrada-dev-local.md`. No se ejecutaron backups reales de DEV, ni restore alojado, ni despliegue; #175 permanece abierto.

### 31/10/2026 — MVP-004, comparador visible sin falsificar cotizaciones
- Nueva pantalla de demostración `/probar/ofertas`, enlazada desde `/probar`: cobertura por artículo, totales de canastas completas con IVA/flete y combinación de hasta dos vendedores anónimos. Selección de ejemplo exclusivamente local. Sin API ni contacto ni adjudicación.
- Reutiliza `compararCotizacionesOffline` con fixtures estáticos y verifica que una oferta parcial o no confirmada no gane por un subtotal menor. PR en borrador encadenado sobre #221, sin cambios en Supabase DEV ni producción.

### 31/10/2026 — MVP-005: no presuponer IVA ni flete
- Regla de negocio del propietario registrada en docs/125: el proveedor informa en detalles si los precios son con/sin IVA y cómo se cobra el flete. Ningún dato ausente se completa con cero o «incluido».
- Pantalla de comparación con aclaraciones desplegables por proveedor; el importe visible solo se anuncia como comparable según datos declarados. Caso de ejemplo IVA y transporte no aclarados; pruebas para null vs cero expreso y smoke HTTP que impide regresar al mensaje engañoso.
- Solo desarrollo y pruebas, sin tocar Supabase DEV, producción, canales de WhatsApp ni presupuestos reales.

### 31/10/2026 — MVP-006: aclaraciones documentales e IVA solicitado por comprador
- Lector offline con citas/fila para detectar condiciones expresas de IVA y transporte en notas de presupuestos, validar propuestas IA contra evidencia y conservar «no informado» o «contradictorio» sin inventar impuestos. IA real, PDF, WhatsApp y normalización bruto/neto no conectados.
- Solicitud de comprador con exigencia textual explícita de IVA en línea independiente: se separa del listado de materiales y se incorpora una sola vez por proveedor en el mensaje de ejemplo, preservando elegibilidad/idempotencia. No envío real, sin DEV/producción.

### 31/10/2026 — MVP-007: presupuesto con evidencia → borrador D046
- Nuevo adaptador económico offline de precio citado y condiciones IVA/flete a campos estrictos del borrador D046. No netear importes brutos si la alícuota y el redondeo no están comprobados. Flete omitido permanece `null`; solo es cero cuando está expresamente incluido o sin cargo.
- Casos de regresión integrados de cita de fuente, IVA bruto/neto, alícuota faltante, importe en pesos argentinos, requisito IVA de comprador, flete adicional y confirmación D046. Sin nuevas APIs, Whapi, SQL DEV ni producción; ver docs/127.

### 31/10/2026 — MVP-008: sin confirmaciones adicionales ni fricción
- Cambio vinculante de producto: comprador envía una sola vez; preguntar localidad/zona entrega solo si falta/contradice. Cada proveedor recibe consulta preparada con materiales, zona y detalles excepcionales expresamente pedidos. No se exige revisar renglones ni confirmar cotización dos veces.
- Nueva ruta offline de recepción de oferta del proveedor desde evento validado: se registra al recibirla aunque falten IVA/flete; respuesta posterior crea versión inmutable; duplicados y remitente inválido bloqueados. Comparación sigue excluyendo IVA/flete desconocidos o equivalencias no verificadas, sin ocultar oferta parcial recibida.
- Demo del comprador pregunta una única zona si falta, y muestra mensajes ficticios consolidados sin «Confirmo». Legado D046/D049/D051 permanece por compatibilidad: requiere migración real antes del piloto. Sin envío, deploy ni cambios Supabase DEV.

### 31/10/2026 — MVP-009: SQL de recepción directa sin mensaje de confirmación
- Nuevo procedimiento privado `whapi_receive_quote_d059` que liga inbox cifrado a revisión D048 y versión inmutable D026 de manera atómica, sin intervención D047/D049. Admite ofertas parciales y datos fiscales/logísticos ausentes, conserva control de opt-in, identidad, plazos, deduplicación y correcciones.
- Recibos protegidos por RLS/rol NOLOGIN sin datos personales en claro; ensayo de casos normales y extremos en PostgreSQL 17 efímero CI. No SQL instalado en Supabase, no Whapi real, no merge/deploy. Ver docs/129.

- MVP-009 añadió también puerto **server-only** `whapi-quote-direct-postgres-d059.ts` hacia SQL D059, con validación estricta de campos, SQL parametrizado y resultados fail-closed; tests de respuesta, replay, corrección, campos maliciosos y errores internos. Aún sin endpoints ni conexión de broker real.

### 31/10/2026 — MVP-010: no perder el importe declarado si IVA no está informado
- Nuevo diseño de origen de precios D060: monto unitario original, estado de IVA, posición/hash fuente y vínculo a versión del proveedor; ingreso atómico D059 y lectura comprador autenticado por alias, solo último presupuesto vigente. Sin inventar neto/IVA/flete y sin segundo «Confirmo».
- Rol SQL privado, RLS, exactitud económica, versiones y replay, ACL por empresa; pruebas PostgreSQL 17 CI y puerto TypeScript. No se aplica a Supabase DEV ni se conecta a Whapi real; ver docs/130.

- Puente servidor MVP-010 `whapi-quote-source-builder-d060.ts` de importe citado y aclaración IVA a filas D060, con hash de cita y mapeo por línea de ronda controlada; pruebas desde presupuesto de texto hasta puerto SQL, incluyendo IVA pedido no cumplido y citas inventadas. Aún no hay worker/Whapi live.

### 31/10/2026 — MVP-011: conectar recepción cifrada a cotización directa
- Nuevo puerto de lectura PG17 privado D061 verifica contacto, invitación, ventana y snapshot por ronda; entrega cifrado AES-GCM sin exponer datos personales, y revisión correcta de versiones/replays.
- Nuevo coordinador Node/TypeScript toma mensajes de inbox D028, comprueba autenticidad del cifrado y citas del importe, confronta artículos/unidades con ledger y ejecuta escritura atómica D060 sin «Confirmo». Tests crypto real + casos malos y pruebas SQL PG17; aún sin Whapi/API IA live ni workers. Ver docs/131.

### 31/10/2026 — MVP-012: cola durable de cotizaciones entrantes
- D062 en PostgreSQL17 efímero: trigger de inbox texto a cola privada, claim concurrente con `SKIP LOCKED`, lease y recuperación, orden por proveedor/ronda, ACK sólo tras escritura D060 real, revisión interna y máximo 4 reintentos sin revelar texto. Worker Node inyectado, sin cron/Whapi/IA live.
- Pruebas SQL normales/extremas y Node; documento 132 y auditoría. Sin instalación en Supabase DEV/prod ni merge.

### 31/10/2026 — MVP-013: ensayo vertical completo Node/PostgreSQL17
- Intérprete textual conservador de precios/cantidades explícitos D063, sin llamada IA ni suposiciones fiscales. Ensayo con webhook simulado y **driver pg real sobre PostgreSQL 17 efímero** enlazando cifrado, bandeja D028, cola D062, lectura D061, escritura D060, corrección/replay, BAJA y lectura anónima de comprador autenticado.
- Rol CI de permisos EXECUTE acotados, sin acceso directo a inbox/ofertas. No instalación Supabase DEV/prod ni webhook/Whapi/IA live; backup #175 sigue pendiente. Ver docs/133.

### 31/10/2026 — MVP-014: comprador ve sus rondas y ofertas recibidas, no precios inventados
- Pantalla móvil de «Mis solicitudes» y consulta anónima de última versión de cotizaciones por ronda, sin ingresar IDs, basada en RPC D025/D060 y autenticación de sesión; listado SQL privado con RLS. D060 amplía moneda, unidad, cantidad disponible, condiciones fiscales, flete y pago sin inferir costos. Tests SQL PG17 y API Node/TypeScript/Next, flags Preview fail-closed. Sin instalación en Supabase DEV, Whapi ni despliegue. Ver docs/134.

### 31/10/2026 — MVP-015: alta real de pedido comprador como ronda privada
- Nueva RPC SQL privada de propietario/administrador autenticado y función public invoker, idempotente, zona obligatoria, IVA explícito, 1–8 materiales sin suposiciones. Inserta ronda programada y líneas en una transacción, nunca fabrica proveedores ni envía Whapi. API Next POST con origin/CSRF, validación y guard Preview apagado. Pruebas PostgreSQL17 y unitarias; documentación 135. No instalado DEV/prod, respaldo #175 pendiente.

### 31/10/2026 — MVP-016: preparación de proveedores aptos sin mensajes
- PostgreSQL17 D065 curado rubro→producto y localidad→provincia/ciudad, proveedores por categoría habilitada, área, aceptación y opt-in Whapi sin BAJA, cada invitación con scope de líneas, alias anónimo y máximo 10. Idempotencia transaccional por ronda/canal, no apertura ni WhatsApp, controles RLS y test PG17. Backup real DEV #175 sigue pendiente. Ver docs/136.

### 31/10/2026 — MVP-017: paquetes WhatsApp por proveedor con rubro y consentimiento, SIN ENVÍO
- Función privada D066 de vista previa con scope D065, etiqueta curada, zona, cantidad, IVA explícito y revalidación de contacto/BAJA, rubro y área. Generador TS sin red. Tests PostgreSQL17 con BAJA posterior y zona revocada + casos maliciosos en unitarias. No envío, no nuevas tablas en Supabase DEV, #175 pendiente. Ver docs/137.

### 31/10/2026 — MVP-018: defensa de cotización entrante fuera de rubro
- D061 restringe snapshot a líneas asignadas D065 para rondas D064. Nuevo trigger D067 impide escribir ofertas de artículos ajenos incluso por RPC directa; roles dedicados NOLOGIN/RLS y ensayos PostgreSQL17 con dos proveedores, replay y BAJA. Sin Whapi real ni instalación DEV. Ver docs/138.

### 31/10/2026 — MVP-019: vault privado de destinatarios WhatsApp cifrados (sin enviar)
- Vínculo HMAC↔destino Whapi cifrado AES-256-GCM/AAD y tabla D068 inmutable privada, functions EXECUTE-only de enrolamiento/lectura con BAJA actual y scope D066; resolver TS sin red. Tests cripto+PG17 con proveedores ficticios, manipulación, replay, rol/área y opt-out. No modifica DEV/prod ni hace envíos. Ver docs/139.

### 31/10/2026 — MVP-020: registro cifrado desde broker y onboarding verificados (sin envíos)
- Adaptador D069 solo servidor reutiliza vault D068 y SQL con consentimiento/BAJA, autorizador HMAC inyectado, flags cerrados y respuestas sin PII. Broker D029 acepta puerto opcional y revalida proveedor después de persistir entrada autenticada. Pruebas unitarias webhook sintético, SQL D068 PG17 de BAJA/replay/identidad inexistente; ejecución CI sujeta a verificación. No implica alta real de comerciantes, Whapi activo ni cambios DEV/prod. Ver docs/140.

### 31/10/2026 — MVP-021: outbox exclusiva de invitaciones (sin envíos live)
- SQL D070 roles privados, trabajo único por proveedor/ronda/canal, reserva transaccional de límites D056 compartidos con respuestas y fases no-retry tras HTTP incierto. Worker TypeScript utiliza cifrado D068 y transporte Whapi existente D055 con autorización final HMAC+consentimiento; flags deshabilitados por defecto. Tests unitarios/PG17 de casos normales y de rechazo. No se despliega ni instala Supabase DEV/prod, backup #175 pendiente. Ver docs/141.

### 31/10/2026 — MVP-022: snapshot uniforme para los fragmentos del respaldo DEV
- `export-encrypted-dev-mvp003.mjs` usa `psql pg_export_snapshot()` en transacción READ ONLY y pasa `--snapshot` único a los cuatro dumps que componen el SQL, preservando streaming a `age`. Verifica versión PostgreSQL17 de `psql`; falla cerrado ante protocolo inválido/desconexión. `pg_dumpall` roles sigue sin snapshot global y el restore auténtico de DEV sigue pendiente Issue #175. Pruebas sintéticas Node/CI, sin datos reales ni despliegue. Ver docs/142.

### 31/10/2026 — MVP-023: matching y preparación integral de ronda (sin red)
- Nueva función D071 privada PostgreSQL17 CI integra D065+D068+D070 transaccionalmente, reintentos idempotentes y pendientes cuando falten contactos verificados/etiquetas/alcance; no envía nada ni añade paso al comprador. Puerto Node con validación strict/fail-closed, tests sintéticos de dos rubros, BAJA, permisos y replays. No se desplegó y Supabase DEV #175 sigue sin respaldo auténtico. Ver docs/143.

### 31/10/2026 — MVP-024: primer proveedor puede vincular WhatsApp mediante una sola acción (solo CI)
- Nuevo D072 de token SHA256 15min/128bits para dueño/gerente Auth válido de empresa proveedor, consumo privado por webhook D027 autenticado, consentimiento explícito al enviar `COTI ALTA`, chat HMAC sin número en SQL y sellado D069 AES-GCM tras COMMIT. Broker D029 opcional y enlace `wa.me` generado sin enviar. Pruebas Node/PG17 sintéticas; no integrado en UI ni instalado DEV/prod, falta #175. Ver docs/144.

### 31/10/2026 — MVP-025: pantalla para activar WhatsApp de proveedor (solo CI)
- Nueva UI móvil `/proveedores/whatsapp` con un CTA de alta; SSR lista negocios propios autorizados y emite enlace `wa.me` mediante JWT Supabase + RPC D072. D072 ahora exporta emisor sin requerir claves HMAC/AES en Next. Nuevo controlador D073 con entorno Preview/Origin/Auth, response no-store, límite streaming 256 bytes y host wa.me exacto. Tests Node/HTTP Next sin envíos; flag OFF; no base DEV ni producción. Ver docs/145.

### 31/10/2026 — MVP-026: Preview proveedor con registro general cerrado
- Separado el modo de inicio de sesión del proveedor de `COTIRONDA_REGISTRATION_ENABLED`, ahora obligatorio OFF; flags explícitos Auth+WhatsApp, Vercel Preview, commit branch de integración y Supabase DEV exclusivo. `/alta` ofrece enlace a activación sin formulario de empresa, Next Proxy refresca SSR cookies en rutas proveedor. Nuevo HTTP E2E de Next con fake Auth/PostgREST/RLS/D072, origen, falta de sesión, empresa ajena y signup bloqueado. Sin deploy, migraciones reales ni WhatsApp live. Ver docs/146.

### 31/10/2026 — MVP-027: exportación cifrada de DEV en un comando, pendiente ejecución real
- Nuevo `scripts/ops/cotironda-private-backup-d075.mjs` para ordenador privado POSIX: preflight de conexión exclusiva DEV y binarios PG17+age; identidad age con permisos 0600, derivación `age-keygen -y` y rechazo antes de exportar si no coincide; reutiliza D003 snapshot consistente, D039 manifest y D041 descifrado sin plaintext en disco. Rechazo explícito GitHub Actions/CI/Vercel. Pruebas sin red mediante inyección sintética. No hay backup auténtico ni restore, bloqueante #175 abierto. Ver docs/147.

### 31/10/2026 — MVP-028: comprador pega lista y conserva especificaciones exactas
- Nuevo formulario móvil en `/mis-rondas` para texto y localidad con un único CTA, sin confirmaciones adicionales; captura 1–8 productos reconocidos por taxonomía curada, retiene líneas dudosas y explicita `invitationsSent:0`. D064 valida y guarda `source_description` (CPC 50 kg, marca, RH 12,5) dentro del hash idempotente; D066 usa fuente original en el mensaje privado en lugar del label genérico. Auth Preview comprador separado de WhatsApp proveedor y signup OFF. Unit tests, SQL PG17 y HTTP Next con Auth/PostgREST ficticios en CI; ningún envío, SQL DEV ni despliegue. Ver docs/148 y #269.

### 31/10/2026 — MVP-029: identidad de producto validada en SQL y HTTP, sin nuevos pasos
- La RPC D064 exige `source_description` en todas las líneas nuevas y comprueba en PostgreSQL (`valid_pilot_product_d078`, solo interno) que el código del artículo corresponde a su familia literal; evita pedidos falsificados con código cemento y texto látex. Rechaza palabras parecidas excluidas y coincidencias de dos familias. Validación HTTP temprana con taxonomía existente, pero SQL conserva la autoridad. Nuevas pruebas de SQL autenticado, unitarias y regresión CI; sin instalación DEV ni mensajes WhatsApp. Ver docs/149 e Issue #271.

### 31/10/2026 — MVP-030: mapeos curados para el primer pedido con dos corralones
- Nuevo script SQL opcional D079 para seis familias exactas de materiales, cinco rubros y localidad La Plata/Buenos Aires, con verificación de taxonomía, idempotencia y rechazo de conflictos. Nueva prueba transaccional PostgreSQL17: comprador con Auth sintético guarda una ronda D064 de 20 bolsas CPC Loma Negra 50 kg; D065 alcanza dos corralones en zona y excluye tercero fuera de zona y otro con BAJA; D066 preserva texto y cantidad; D071 sin vault devuelve dos destinatarios pendientes y cero jobs/mensajes. Nada aplicado en DEV ni enlazado a Whapi real. Ver docs/150 e Issue #273.

### 31/10/2026 — MVP-031: evitar invitaciones a proveedores sin producto de catálogo
- D080 agrega correspondencia interna entre `public.supplier_products` y familia material (SHA-256 del producto declarado), sin permisos de escritura para proveedores/usuarios/servicio y solo lectura del matcher NOLOGIN. D065 exige producto activo, del mismo comercio/rubro, y huella sin cambios; D066 revalida el catálogo antes de entregar un paquete al orquestador. CI PostgreSQL17: rubro sin producto no invita; dos corralones con producto de catálogo sí, tercer corralón sin producto no; edición o desactivación invalida paquetes; sin Whapi real, cambios DEV ni producción. Ver docs/151 e Issue #275.

### 31/10/2026 — MVP-032: decisión de dominio y control final pre-WhatsApp
- Auditoría de Vercel: el dominio propio `cotironda.com` aún no está asociado a ninguno de los dos proyectos; mantenerlo fuera de Preview hasta producción aprobada. El portal Next `cotironda-portal-dev` sí tiene Preview SSO `READY` de HEAD integrado. Identificado que D070→D068→D066→D080 ya revalida catálogo, consentimiento, localidad y huella inmediatamente antes del intento HTTP. Agregada prueba PG17 que cambia/desactiva productos y registra BAJA entre `BEGIN` y autorización, asegurando rechazo sin ampliar permisos. Sin cambios DEV, Whapi live ni DNS. Ver docs/152 y #277.

### 31/10/2026 — MVP-033: el destino se pregunta solo si falta
- La pantalla del primer pedido no presenta una segunda entrada de localidad por defecto; usa `Entrega en:` de la lista cuando es inequívoca y pregunta únicamente cuando falta o hay conflicto. Un valor anterior escrito en el campo no puede sobrescribir sin aviso un nuevo destino en el texto. Se retienen líneas ambiguas/IVA contradictorio como antes, sin cambios en D064, Whapi, RLS, Supabase DEV ni despliegue. Tests nuevos y smoke HTTP SSR; ver docs/153 e Issue #279. #175 sigue abierto.

### 31/10/2026 — MVP-034: pegar desde planillas sin reescribir materiales
- Soporte estricto para pegar tres columnas de Excel (texto TSV) en el campo comprador existente: dos órdenes reconocibles, encabezado exacto opcional, fuente literal conservada y aclaraciones por línea para filas dudosas o contenido peligroso. Sin subir archivos ni ejecutar fórmulas; reutiliza D064 y sus verificaciones. Añadida suite de regresiones, explicación de UI y docs/154. Sin tocar base DEV, WhatsApp, dominio ni producción; #175 abierto.

### 31/10/2026 — MVP-035: asistente local para obtener respaldo cifrado de DEV
- Un único comando en una PC privada prepara identidad age, pide URL sin eco y reutiliza `cotironda-private-backup-d075.mjs`; comprobación fail-closed ante cloud/CI/no-TTY, cero SQL en claro guardado. Suma pruebas offline y runbook docs/155; **no hubo dump de DEV ni restore genuino**. No cambia Supabase, Whapi, DNS, env ni producción. #175 permanece abierto.

### 31/10/2026 — MVP-036: política de ahorro de deployments Vercel DEV
- `apps/portal/vercel.json`: regla global `git.deploymentEnabled: {"**":false}` más única excepción para rama de integración, sin `ignoreCommand` que consume la cuota. Tests unitarios de alcance y configuración, docs/156. Requiere validación de Root Directory/efecto real; no elimina el 402 ya consumido, no actualiza producción, no instala SQL DEV ni activa WhatsApp.

### 31/10/2026 — MVP-037: corregir permisos de carpetas privadas en asistente de backup
- Se detectó que `mkdir -p -m 700` no asegura permisos sobre carpetas preexistentes. Preflight con Node22 comprueba propietario actual, rutas privadas sin symlinks, HOME no manipulable y bits grupo/otros de keys/backup en 0 antes de generar clave age o leer conexión. Pruebas con chmod/symlink reales sobre fixtures; sin ejecutar backup real ni modificar Supabase/Vercel/Whapi. Ver docs/157, Issue #287 y gate pendiente #175.

### 31/10/2026 — MVP-038: una ronda ficticia completa y navegable
- Ruta móvil `/probar/piloto` une pedido real escrito por el usuario con respuestas **ficticias editables** de A/B y el comparador económico ya existente, IVA/flete desconocidos sin ranking engañoso, selección solo visual y sin persistencia. CTA desde `/`, enlace desde `/probar`; pruebas de dominio y smoke SSR. Sin DB DEV, WhatsApp, producción o DNS; #175 permanece bloqueante.

### 31/10/2026 — UX-002 / MVP-039: NO adjudicación; finalistas y contacto recíproco
- El propietario rectifica expresamente D006 y UX-001: Cotironda al cierre identifica **hasta dos presupuestos finalistas comparables por rubro**; arquitecto y cada finalista autorizados conocen recíprocamente sus datos comerciales, sin click de adjudicar ni compromiso de compra en Cotironda. La negociación se acuerda por fuera.
- Nuevo contrato puro `src/domain/finalistas-automaticos-mvp039.ts`, sin contacto real, red, WhatsApp ni persistencia: elige anónimos únicamente después del vencimiento con consentimientos e identidades verificados por el caller, canasta completa, mismas condiciones, sin falsos totales parciales, empates dudosos ni contactos de no finalistas; tests unitarios asociados.
- Se rectifican AGENTS, visión, reglas, decisiones, WhatsApp, pruebas, roadmap y nota de que la demo MVP-038 de adjudicación visual es **legada/rechazada como UX**. Ver [docs/159](docs/159-ux-002-finalistas-y-contacto-mutuo.md), Issue #291. Sin publicación ni difusión de contactos; backend real requiere #175, RLS y pruebas de WhatsApp/consentimientos.

### 31/10/2026 — MVP-040: primer puente WhatsApp arquitecto → ronda → proveedores
- Consumidor privado `src/server/buyer-whatsapp-ingress-d073.ts` procesa entrada confiable y cifrada de comprador (vía puerto pendiente de conectar), extrae lista textual verificada sin pedir confirmación extra, prepara pregunta de localidad idempotente en outbox, permite continuar con respuesta posterior del mismo chat y llama creación de ronda + preparación de invitaciones D071 tras COMMIT. Rechaza adjuntos sin descarga/escaneo/extracción autorizados, identidad no vinculada y ausencia de consentimiento previo de contacto. Sin envíos/SQL DEV/Whapi live/IA de documentos: ver [docs/160](docs/160-mvp-040-ingreso-whatsapp-comprador.md) e Issue #293; bloqueos #175 y wiring real.

### 31/10/2026 — MVP-041: preparar Whapi.Cloud para QR sin activar tráfico
- Propuesta segura de webhook Body/messages.post + encabezado secreto, auditor GET-only con URL fija `/health?wakeup=false`, `/users/profile` y `/settings` (respuesta sanitaria sin teléfonos, secretos ni payload), comando local privado sin envíos ni cambio de ajustes y pruebas adversariales. **No existe webhook real montado todavía**; ni token guardado, ni Whapi vinculado, ni backend comercial instalado. Ver [docs/161](docs/161-mvp-041-conectar-whapi-qr.md); bloqueo de respaldo DEV #175 intacto.

### 01/11/2026 — MVP-042: entrada Whapi para arquitecto y negocio en un mismo número
- D027 ahora enruta mensajes entrantes de compradores **o** proveedores únicamente por vínculo privado del chat y bloquea doble rol. D029 extiende cifrado AES-GCM/AAD y HMAC con separación de comprador; BAJA independiente, duplicados y fallos fail-closed, sin confirmar, despachar ni revelar contactos. Tests con WhatsApp sintético; detalles docs/162. **Sin endpoint ni canal Whapi real habilitado**, Supabase DEV comercial sigue pendiente de #175.

### 01/11/2026 — MVP-043: inbox comprador SQL/RLS y gateway Whapi dual
- Nuevo D074 con tablas privadas de chat comprador HMAC y mensajes AES-GCM, resolución verificada, BAJA idempotente, prevención del mismo chat comprador/proveedor, RLS/EXECUTE-only y cifrado AES key-id. Adaptador JS para gateway dual sobre D030, pruebas SQL PG17 sintéticas y unitarias de permisos/parametrización. **Sin migración DEV ni Whapi real**, bloqueo #175 intacto. Ver docs/163.

### 01/11/2026 — MVP-044: lector SQL cifrado del WhatsApp comprador al procesador de pedidos
- D076 privado para recuperar inbox D074 solo con consentimiento actual y sin doble rol, permisos NOLOGIN/EXECUTE-only y RLS. Adaptador Node sin red ni secreto para validar ciphertext AES-GCM AAD del comprador y pasar texto validado al motor D073 (que prepara pregunta de zona o ronda vía puertos transaccionales). SQL PG17 CI, pruebas de eventos cifrados y regresión. **No webhooks vivos ni migraciones instaladas en DEV**. Ver docs/164, gate de respaldo #175.

### 01/11/2026 — MVP-045: continuar pedidos por WhatsApp con una sola respuesta de zona
- D077 privado: memoria HMAC del pedido original y outbox fija de consulta de localidad, sin texto ni contactos en claro, idempotencia/concurrencia, expiración 48h, revocación y lectura de dos mensajes cifrados validados por AES-GCM. Worker nuevo reutiliza D073; tests PG17 y unitarios. **No envía la pregunta, no consume pendiente al crear ronda real, no habilita Whapi ni DEV**. Ver docs/165 y backup #175.

### 01/11/2026 — MVP-046: ronda WhatsApp comprador transaccional sin usuario ficticio
- D081 privado en PG17 CI crea ronda+ítems+pedido compatible con D065/D071+origen Whapi HMAC en una transacción, conserva created_by NULL con constraint de procedencia, consume pregunta D077 al asociar respuesta exacta y evita duplicados/concurrencias. Adaptador JS compone D073 con D071 solo después de commit y jamás envía WhatsApp. Tests SQL/unitarios. Sin Supabase DEV, Whapi live, publicación ni migraciones productivas. Ver docs/166; backup real #175 pendiente.

### 01/11/2026 — MVP-047 cola durable de pedidos por WhatsApp
- D082 SQL PG17 CI: trigger de inserción cifrada comprador→cola única por canal/mensaje, lease/ACK, reintento con demora y dead-letter, RLS/roles restringidos. Worker server-only D082 conecta D077/D081, trata archivos no verificados como revisión y nunca envía WhatsApp; regresión SQL/Node. Sin instalación Supabase DEV, Whapi ni producción. Ver docs/167 y gate #175.

### 01/11/2026 — MVP-048: ruta HTTP HTTPS Whapi, segura y cerrada hasta piloto
- Nueva ruta Next `/api/integraciones/whapi` y adaptador server-only D083: Preview/branch/flags, header secreto comprobado antes de conexión, HMAC/AES mediante módulos existentes, escritura buyer/supplier sin descargar medios ni enviar mensajes. Tests HTTP/seguridad. **Sin gateway PostgreSQL real inyectado, permanece 503**, ninguna migración comercial Supabase DEV o despliegue Whapi/Vercel. Ver docs/168; backup real+restore #175 no cumplido.

### 01/11/2026 — MVP-049: ensayo de restore local aislado para desbloquear Supabase DEV
- Herramienta `restore-encrypted-dev-lab-mvp049.mjs` y wrapper `restaurar-dev-aislado.sh`: D039 valida integridad AGE y hash independiente; D041 valida clave y descifrado; crea PostgreSQL17 local Docker sin red/ports/mounts, reconstituye 5 SQL por streaming, verifica esquema y destruye contenedor. Rechaza cloud/CI/DSN externos, oculta contenido y nunca deja SQL en disco. Unitarias con procesos simulados y shell. **Todavía no hay restore real ni conexión Supabase DEV; gate #175 continúa pendiente.** Docs/169.

### 01/11/2026 — MVP-050: preparar rol técnico exclusivo para receptor Whapi HTTPS
- D084 PostgreSQL17 CI define rol de privilegios NOLOGIN/NOBYPASSRLS, seis funciones privadas de guardar/resolver mensajes comprador/proveedor y BAJA, sin lectura directa ni creación de rondas y cola. Test con login ficticio de CI bajo ROLLBACK, controlando explícitamente permisos prohibidos. Sin secret, driver DB, migración Supabase DEV, llamada Whapi ni despliegue. Ver docs/170 y gate #175.

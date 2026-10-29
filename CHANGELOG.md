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

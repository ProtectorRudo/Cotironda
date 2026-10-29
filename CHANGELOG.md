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

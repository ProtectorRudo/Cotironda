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

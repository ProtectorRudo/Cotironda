# Cotironda D016 — acceso privado del arquitecto limitado a rondas V2 (P0)

**13 de noviembre de 2026 · DESARROLLO, sin publicación comercial.** Base de trabajo: PR #842 y las migraciones anteriores verificadas en `cotironda-piloto`.

## Diagnóstico

Cotironda **ya tiene una sesión privada sin SMS ni email** implementada: `apps/portal/lib/piloto-v2-d016-http.ts` utiliza `__Host-cotironda-v2` HttpOnly/Secure/SameSite=Lax, un ticket de WhatsApp de un solo uso y una transacción SQL `claim_session_private`. Cada listado, descarga e informe comprueba sesión y ronda en PostgreSQL. Por eso NO hace falta crear un usuario en `auth.users`: en el piloto hay **0 usuarios GoTrue**, pero la alternativa privada soporta el acceso por WhatsApp.

**Hallazgo:** el SQL histórico D016 `issue_ticket_private`, `claim_ticket_private`, `claim_session_private` y `session_context_private` verificaba comprador y canal autenticado, pero no exigía `v2_business_policy.enabled=true` ni que `requests.created_at >= v2_business_policy.activated_at`. El enlace automático `prepare_whapi_link_private` sí verificaba la fecha de la política de originales, pero no la política de negocio V2. Con ello, una futura configuración incorrecta podría crear o mantener una sesión para una ronda histórica. El catálogo privado de originales contiene protecciones propias; esto añade defensa en profundidad a **todos los niveles de acceso**.

## Corrección preparada

Candidato `supabase/piloto/v2_d016_portal_prospective_session_guard_CANDIDATE.sql`:

- Reemplaza **con la misma firma y permisos** las cinco RPC anteriores para verificar, además, la política de negocio prospectiva con una fecha no nula. No borra tickets ni sesiones, no activa políticas y no necesita contacto nuevo del comprador.
- La política **OFF** impide emitir tickets, canjearlos y reutilizar una sesión válida; habilitar V2 después de crear una ronda histórica **no la habilita retroactivamente**.
- La actualización del portal sigue siendo un Preview protegida con SHA exacto aprobado. El HMAC de ticket/sesión y la clave `sb_secret_` deben permanecer **solo en servidor**.
- No se modifica el webhook v76 ni los importes/archivos; no se publican originales. La ruta actual de acceso ya consume ticket y crea sesión en un solo POST, sin SMS, email ni código manual.

## Prueba PG17

Fixture nuevo `supabase/tests/ci/v2-d016-portal-prospective-session-pg17.sql` incluye las pruebas históricas **además de**: acceso positivo con política válida, invalidez inmediata de sesión cuando negocio se apaga, no emisión ni preparación WhatsApp con política OFF, prohibición de rondas históricas después de activar la política, nueva ronda permitida y aislamiento entre rondas, fecha de activación nula, ACL de anon/auth. Usa `BEGIN/ROLLBACK` y datos totalmente sintéticos, sin enviar WhatsApp ni crear personas reales.

Workflow `.github/workflows/cotironda-d016-whatsapp-link-pg17.yml` ejecuta el fixture. **Hasta que CI sea satisfactoria no publicar la migración.**

## Dependencias pendientes para piloto al 100%

- La metadata de Vercel del proyecto exacto `cotironda-portal-dev` contiene flags D016 de Preview, pero **no se encontraron** las variables privadas `COTIRONDA_D016_HMAC_KEY_HEX` ni `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`. Se consultaron exclusivamente nombres de variables con `decrypt=false`, nunca valores. Esto impide que `puertaWhatsappPortalD016` habilite acceso, incluso cuando la pantalla se despliegue.
- Pantalla corregida f985 del PR #837 pendiente del reintento de Preview ya programado después de la cuota HTTP 402; no desplazarla a producción ni habilitar SSO globalmente.
- Integración de webhook D016 con envío seguro y recepción de originales, consentimiento/revisión legal de cesión de datos, lectura/descarga revocable, cierre de ronda y E2E real comprador + dos proveedores. La revisión de Seguridad/Autoridad debe preceder la publicación de originales.

**Criterio central:** sesión creada no equivale a autorización de compartir originales. Ninguna política/cron de originales cambia con este PR. El objetivo sigue siendo que el comprador abra su enlace por WhatsApp y vea únicamente los proveedores que realmente respondieron.

[Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [P0 original #838](https://github.com/ProtectorRudo/Cotironda/issues/838).

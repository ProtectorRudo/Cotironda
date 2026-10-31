# 99 — D035: lectura de rondas compatible con Supabase alojado

**30/10/2026 · Bloqueo #167 · Rama sobre D034/PR #171. Solo código y PostgreSQL17 CI; no se instaló en DEV.**

## Hallazgo reproducible

Supabase Knowledge Base, actualizada **14/10/2026**: en proyectos alojados, un rol PostgreSQL personalizado no puede obtener `USAGE` en el esquema gestionado `auth` con un simple `GRANT` desde `postgres`, aunque el comando no falle. `auth.uid()` puede devolver error `42501 permission denied for schema auth`. Ver [documentación oficial](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).

La D025 original creaba `cotironda_rounds_reader` sin LOGIN ni BYPASSRLS, pero intentaba concederle `USAGE ON SCHEMA auth`, llamaba `auth.uid()` desde las políticas RLS y en su función de lectura. Ese camino funcionaba en PostgreSQL17 CI emulado pero podía fallar alojado.

## Corrección mínima D035

El SQL de D025 `supabase/sql/round_buyer_overview_d025.sql` se modifica ANTES de instalarse por primera vez en DEV (D025 aún no instalada):

1. **Se eliminan** `GRANT USAGE ON SCHEMA auth TO cotironda_rounds_reader` y `GRANT EXECUTE ON FUNCTION auth.uid()`.
2. Se crea `cotironda_private.request_user_id_v035()` como función `SECURITY INVOKER`, de solo lectura, que obtiene el ID del usuario desde `request.jwt.claim.sub` o `request.jwt.claims.sub`, suministrados por PostgREST después de **validar el JWT**. Su `EXECUTE` se restringe al rol `cotironda_rounds_reader`; no se expone en `public`, ni se concede a `anon`, `authenticated` o `service_role`.
3. Las políticas RLS del lector y la función privada `buyer_round_overview_v1` usan el helper en vez de `auth.uid()`. La función sigue cotejando que `sub` de los claims JSON y el `request.jwt.claim.sub` auxiliar no difieran, rechazando inconsistencias.
4. **Se conserva** `cotironda_private.is_session_verified(v_uid,v_sid)` ya existente en la Etapa 01: usa la propiedad/privilegios restringidos de su propia función para comprobar las tablas gestionadas `auth.sessions` y `auth.users`. La D035 NO otorga SELECT de esas tablas a usuarios ni al rol de lectura.
5. Los compradores siguen necesitando correo verificado, `is_anonymous=false`, sesión vigente, membresía `active` actual y ronda de su empresa. No se exponen ofertas, contactos ni invitaciones.

**Límite de confianza:** este helper extrae un ID, no autentica un JWT por sí mismo. La firma la verifica PostgREST en la conexión de cliente; la función privada vuelve a verificar sesión, pero no se debe invocar desde un backend PostgreSQL privilegiado que permita fijar GUC arbitrarios sin validar identidad.

## Pruebas

El fixture `supabase/tests/ci/100_round_buyer_overview.sql` exige explícitamente que el lector tenga **cero USAGE en `auth`** y acceso solo al helper privado `SECURITY INVOKER`. Valida usuario legítimo, cross-tenant, líneas sin precios/contactos, membresía suspendida, sesión revocada y correo no verificado. D035 añade un caso de discrepancia entre `request.jwt.claim.sub` y `request.jwt.claims.sub` que debe rechazar 42501.

Continúan los 12 históricos y los módulos D024–D034 en el mismo CI. Estos tests simulan PostgREST y Auth con roles de PostgreSQL descartable, **no sustituyen una prueba alojada**. La base real de DEV no recibe SQL durante este incremento.

## Gate obligatorio para el piloto

Tras autorizar migración gradual a Supabase DEV:
- Aplicar D024, D025 corregida y sus dependencias en el orden revisado; **comprobar** que `has_schema_privilege('cotironda_rounds_reader','auth','usage') = false` y que los permisos de `request_user_id_v035` son mínimos.
- Verificar un RPC real PostgREST con token firmado de comprador y otro ajeno; revocar una sesión para comprobar el rechazo inmediato; cambiar una membresía activa a suspendida y volver a probar.
- Registrar esquema, versiones, rollback, logs sin PII y costo de infraestructura. No mover a producción ni activar webhook Whapi en ese paso.

**No hay cambios de credenciales, usuarios, WhatsApp, pagos, IA, DEV o producción.** Issue #167 se marca como solución propuesta y validada en CI, no cerrado definitivamente hasta prueba hosted.

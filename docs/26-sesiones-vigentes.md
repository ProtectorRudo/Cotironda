# 26 — Auditoría de sesiones activas y cuentas vigentes

**Fecha:** 29/10/2026. **Estado:** migración aplicada y comprobada en `cotironda-dev`. No se habilitaron registros ni se usaron cuentas reales.

## Riesgo corregido
Un JWT de Supabase es válido hasta que expire, incluso si el usuario cerró sesión o fue eliminado. La quinta migración validaba un claim firmado de correo y sujeto, pero no consultaba si la sesión seguía activa cuando se intentaba registrar una empresa.

Referencia: https://supabase.com/docs/guides/auth/sessions

## Solución
- Sexta migración `20261029130907_session_revocation_and_verified_user.sql`, aplicada únicamente a `cotironda-dev`.
- La rutina `cotironda_private.register_company_with_verified_claim`, cuya propiedad sigue siendo `cotironda_registrar` (NOLOGIN, NOBYPASSRLS), requiere ahora el claim `session_id` y llama a la función interna `cotironda_private.is_session_verified(user_id,session_id)`.
- Esa función retorna **solo booleano** y comprueba en `auth.sessions` que la sesión existe, corresponde al mismo usuario y no venció según `not_after`. Comprueba en `auth.users` que el correo está actualmente confirmado, la cuenta no es anónima, no está borrada y no tiene prohibición vigente.
- `cotironda_registrar` no tiene acceso directo al schema `auth`; la función booleana está deliberadamente bajo SECURITY DEFINER de `postgres`, exclusivamente dentro del esquema privado y concede EXECUTE solo a `cotironda_registrar`. Se revocó a PUBLIC, anon, authenticated, service_role y cotironda_app. Es un límite sensible: cualquier cambio a esta función exige auditoría.
- La RPC pública sigue siendo SECURITY INVOKER y no recibe user_id. Ninguna tabla de sesiones queda expuesta a navegadores.
- Las cerraduras de Vercel y BD siguen apagadas.

## Pruebas efectivamente ejecutadas
- PostgreSQL 17 CI: sesión activa propia, sesión de otra persona, correo sin confirmar, sesión vencida, usuario anónimo, usuario suspendido, usuario borrado, sesión revocada (fila eliminada), token sin session_id y token con session_id revocada; registro válido e idempotencia.
- Supabase real: primero se probó la migración dentro de una transacción con ROLLBACK. Se aplicó sólo después de superar CI, y se repitió la suite completa **después** de aplicar, dentro de otra transacción con ROLLBACK.
- Posterior: 0 usuarios Auth/empresas/membresías/altas de prueba persistidos, `registration_settings.enabled=false`, y un usuario `authenticated` no puede ejecutar el helper privado.
- Security Advisor: 0 WARN/ERROR, observación INFO sobre RLS deliberadamente sin políticas en una tabla privada.
- La versión oficial de migración coincide con la registrada en Supabase y con el SQL probado. Workflow temporal de GitHub con permiso de escritura retirado.

## Límites de esta evidencia
- El test SQL simula el contexto de JWT. **No** demuestra validación criptográfica real ni la activación del Auth Hook.
- La expiración `exp` del JWT y su firma son verificadas por el gateway; la nueva comprobación revisa la fila de `auth.sessions` y su `not_after`, que son controles distintos.
- Falta E2E de sesión auténtica en Auth, refresh/cookies y acceso directo HTTP a Supabase con un token legítimo y otro manipulado.
- Falta decidir rate limiting para intentos (la cuota de altas efectivas no limita todos los intentos rechazados).
- La prueba requiere un session_id en el JWT, tal como documenta Supabase Auth. Un token sin ese claim **no puede registrar**.
- No habilitar `registration_settings.enabled` ni `COTIRONDA_REGISTRATION_ENABLED` hasta completar los bloques anteriores.

## Fuentes
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/managing-user-data

# 25 — Auditoría adversarial del JWT

**Objetivo:** detectar un falso positivo en los controles de autenticación del registro de Cotironda.

## Hallazgo
El PR #20 verificaba el claim del JWT en el cliente y que PostgREST rechazara la RPC mientras la base estuviera cerrada. Pero eso no demostraba por sí solo que el gateway validara la **firma** ante un intento de suplantación. Un 403 producido por la cerradura SQL podía confundirse con un bloqueo criptográfico.

## Cambio implementado (PR #22)
- Módulo `src/server/auth-e2e-adversarial.ts`: recibe JWT firmado de un usuario de prueba, manipula su identificador `sub` sin resignarlo y llama directamente a la RPC a través de la URL de Supabase.
- La comprobación exige 401/403 y contenido explícito de error de JWT, firma o autenticación. Rechazos por campos inválidos o flag SQL deshabilitado se consideran **falla de la prueba**.
- La petición usa nombre inválido de un carácter y nunca transmite otros datos de identidad de una empresa.
- Exclusivo del Supabase de desarrollo `qkercsoqhehbenbbncwk`, sin claves secretas ni PostgreSQL directo.
- Nueve pruebas unitarias sin red prueban el generador de tokens adulterados, la construcción del POST y casos de falso positivo.
- El pipeline Next.js comprueba la sintaxis del script completo (`node --check`).

## Qué no se hizo
- No se habilitó el Auth Hook ni se crearon usuarios. Las pruebas HTTP con JWT real no pudieron ejecutarse y no deben presentarse como aprobadas.
- No se probó un JWT genuinamente vencido ni sesión revocada; ambos requieren una sesión real con token emitido legítimamente y escenario controlado.
- No se habilitó registro, no se tocaron otros proyectos ni se activaron reglas de WAF.

## Próxima aceptación
1. Activar Auth Hook **solo** en el Supabase dev desde el panel Auth.
2. Crear o preparar dos cuentas de prueba bajo control del proyecto, confirmar una y dejar otra pendiente sin usar cuentas comerciales.
3. Ejecutar `apps/portal/scripts/auth-real-smoke.mjs` con variables de entorno secretas locales; exigir rechazo de JWT adulterado antes del SQL.
4. Comprobar logs, expiración/refresh y rollback; mantener los dos interruptores en false.
5. Auditar rate limit por IP frente a invocaciones directas a Supabase y evaluar costos antes de abrir el registro.

Ver también `docs/24-auth-e2e-seguridad.md`.

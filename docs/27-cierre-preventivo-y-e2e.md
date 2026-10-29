# 27 — Cierre preventivo y verificaciones de sesión Auth (Etapa 01)

**29/10/2026 — sin publicar.** Rama apilada sobre PR #24. Los registros SQL/Vercel permanecen cerrados. No se instalaron credenciales, usuarios ni migraciones.

## Hallazgo y contención aplicada
La API Next.js tenía `autorizarIntento:async()=>true`: el puerto HTTP admite limitación, pero su implementación productiva era una aprobación incondicional. Esto permite intentos sin cuota en la ruta Next. La cuota de 5 **altas exitosas** por usuario/24 horas no es una cuota de intentos, y un usuario puede llamar directamente a PostgREST.

Se reemplazó por `autorizarIntentoDeRegistro` en `src/server/limite-intentos.ts`, que **lanza error deliberadamente**. `procesarAlta` lo transforma en HTTP 503 `limite_no_disponible` y nunca persiste organizaciones. Se agregó prueba de cableado real de Next y de falta de persistencia con sesión válida. **No es un rate limiter instalado**: es un bloqueo temporal seguro ante una activación accidental del portal. No confundir esto con alcanzar la cuota (HTTP 429).

No usar memoria local del proceso como limitador persistente: serverless tiene múltiples instancias y el navegador conoce la clave publishable de Supabase. **La barrera definitiva debe funcionar también en la RPC pública**, sin depender de que una solicitud pase por Vercel. Evitar contadores dentro de una transacción que luego se revierta al lanzar error: el intento fallido no quedaría registrado. Diseñar solución que confirme durablemente el consumo de cuota incluso cuando el alta sea rechazada.

## Pruebas Auth preparadas y sus límites
- Nuevo validador comprueba `sub`, `role`, `is_anonymous`, `cotironda_email_verified` y `session_id` UUID en los claims obtenidos por `getClaims()`. Se prueba con casos positivos/negativos offline.
- El runner E2E exige que el cierre de sesión local sea exitoso y que el SDK ya no retenga sesión; antes ignoraba errores del `signOut()`.
- **Aún no demuestra revocación de un JWT emitido tras `signOut()`**. Eso requiere comprobar con una sesión genuina el resultado en `auth.sessions` y el comportamiento directo de PostgREST bajo un protocolo controlado y reversible.
- El hook Custom Access Token sigue sin activar; no existen dos cuentas Auth de test. Por eso el runner continúa NO EJECUTADO contra Auth real.

## Aceptación antes de activar registros
1. Diseñar, implementar y someter a pruebas concurrentes un control distribuido en el propio camino PostgREST/RPC, que contabilice intentos permitidos y fallidos y sea resistente a reinicios, carreras e idempotencia.
2. Verificar que la RPC anterior no quede invocable sin cuota. Probar acceso directo, URL forjada, usuario A/B, 429, indisponibilidad de dependencia y límites de costos.
3. Habilitar de manera controlada en `cotironda-dev` el Custom Access Token Hook (si la configuración administrada lo permite), preparar dos cuentas no comerciales y ejecutar firma, expiración real, sesión revocada y cookies SSR.
4. Reauditar RLS, ACL, advisors, CI y costos. Mantener cerrados ambos interruptores; producción solo con autorización posterior.

## Evidencia
- [Issue #27](https://github.com/ProtectorRudo/Cotironda/issues/27)
- [PR #24 — base de seguridad de sesiones](https://github.com/ProtectorRudo/Cotironda/pull/24)
- [Documentación de Auth y revocación](https://supabase.com/docs/guides/auth/sessions)
- [Seguridad de API y RLS](https://supabase.com/docs/guides/api/securing-your-api)

**No afirmar que el control definitivo de tasa o el E2E auténtico estén completados.**

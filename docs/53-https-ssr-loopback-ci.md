# 53 — Prueba HTTPS real del portal SSR en runner efímero

**Etapa 01 · 29/10/2026 · Issue #80 / PR #81 en borrador, hijo de #79.**

## Objetivo y contexto

El portal Next.js ya tiene tests con `NextRequest('https://...')` simulado y HTTP real sobre localhost. Faltaba medir de verdad qué pasa con TLS, cookies renovadas por `@supabase/ssr`, encabezados anti-caché y la separación entre visitantes. La guía oficial de Supabase señala un riesgo específico: **cachear una respuesta que contenga `Set-Cookie` puede entregar la sesión de un usuario a otro**. Una URL con protocolo `https` falsa dentro de una prueba unitaria no equivale a TLS real.

## Ejecución sin producción ni secretos

Nuevo `apps/portal/scripts/smoke-https-ssr.mjs`, llamado en `.github/workflows/portal-ci.yml` después de compilar el entorno Preview:

1. GitHub Actions genera, solo dentro del runner, un certificado autofirmado RSA 2048/SHA-256 de validez **1 día**, con SAN `127.0.0.1` y `localhost`. Los archivos se escriben en `RUNNER_TEMP` y se restringen con `chmod 600`. **No se versiona ningún certificado ni se usa el dominio real.**
2. Se arranca el **servidor Next.js compilado** en `127.0.0.1:4176`, con el interceptor CI preexistente `ci-auth-fetch-preload.cjs` que bloquea toda comunicación Auth no simulada y cualquier otro destino remoto.
3. Un pequeño proxy TLS Node (`https.createServer`) atiende **solo en `127.0.0.1:4177`** y retransmite al Next local con `X-Forwarded-Proto: https`; el cliente hace solicitudes mediante `https.request` con `ca` explícita, `rejectUnauthorized:true`. Una conexión **sin** confiar el certificado debe fallar: nunca utilizar `-k` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`.
4. `@supabase/ssr` **auténtico** genera una cookie a partir de una sesión **ficticia**; su token se cambia a vencido, forzando la renovación por el Proxy real de Next. Las credenciales del interceptor son ficticias, nunca cuentas reales.
5. El GET HTTPS de `/alta` verifica `Set-Cookie` renovada con `Secure`, `SameSite=Lax`, `Path=/`, `Cache-Control: no-store` y página privada del usuario CI. El segundo GET con la cookie rotada debe seguir autenticado.
6. El GET HTTPS de otro visitante **sin cookies** debe redirigir a `/ingresar` y no recibir la cookie ni la página privada del primero.
7. POST HTTPS desde un `Origin` incorrecto devuelve 403; con el origen permitido y cookie ficticia continúa devolviendo **503** (registro comercial cerrado), sin llegar al SQL.
8. Al finalizar se eliminan el servidor de prueba TLS y el proceso Next. GitHub descarta certificado, clave y máquina runner.

`tests/unit/https-ssr-loopback-ci.test.mjs` asegura que la verificación TLS no se degrade a modo inseguro, que el runtime no reciba secretos y que la prueba realmente exija cookies seguras, origin y anti-caché.

## Seguridad, límites y puertas de aceptación

- Solo afecta GitHub Actions y tests. **No** se instala proxy ni TLS en Cotironda real ni se despliegan cambios. No se toca `cotironda-dev`, `main`, Vercel, DNS ni Hostinger.
- TLS es **real en loopback** pero no prueba navegadores Chrome/Firefox, certificados públicos, CDN Vercel ni cookies de `www.cotironda.com`. 
- Auth usa `@supabase/ssr` verdadero con tokens y respuestas ficticias. **No** demuestra `signOut` ni refresh de una sesión genuina de Supabase, pendientes del E2E privado de Issue #78.
- El resultado de CI se debe registrar con enlace al workflow y logs; sin verde no se marca aprobado.
- Se mantiene una advertencia de Supabase por `auth_leaked_password_protection` deshabilitada, posiblemente sujeta al plan. No se cambian ajustes comerciales ni se generan cargos.

**Documentación de referencia:** `docs/35-ssr-cookies-refresh-proxy.md`, `docs/52-auth-real-revoked-catalog-e2e.md` y guía oficial https://supabase.com/docs/guides/auth/server-side/advanced-guide.

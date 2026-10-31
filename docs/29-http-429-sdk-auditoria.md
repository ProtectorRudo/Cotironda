# 29 — Auditoría HTTP 429 del adaptador Supabase

**29/10/2026. Estado:** corregido y verificado con `@supabase/supabase-js` real + transporte HTTP simulado. PR #32 en borrador, apilado sobre #30. No se modificaron migraciones ni configuración de Auth.

## Hallazgo
La versión anterior de `apps/portal/lib/registro-rpc.ts` desestructuraba únicamente `data` y `error` de `cliente.rpc`. Buscaba `error.status===429`, `error.code==='429'` o texto `rate_limited`. **El HTTP status está en el resultado `PostgrestResponse.status`** y no es seguro depender de que exista en `PostgrestError` ni del texto de un error externo.

Impacto: bajo una respuesta HTTP 429 legítima sin estos campos adicionales, el adaptador podía traducir el límite de cuota a `registro_rpc_no_disponible` y devolver 503 desde el portal en lugar de 429. La cuota SQL no quedaba deshabilitada, pero la respuesta al usuario era engañosa.

## Corrección
- El puerto usa `const { data,error,status } = await cliente.rpc(...)` y, si `status===429`, genera `limite_intentos`. `procesarAlta` convierte ese error a HTTP 429 y respuesta pública `demasiadas_solicitudes`.
- No acepta palabras sueltas incluidas en un error remoto como señal de que se agotó la cuota. Otros errores siguen fallando cerrados sin exponer mensajes de Supabase.
- Se conserva el mapping de `registration_status` estructurado si la respuesta es exitosa HTTP 2xx, y las validaciones de payload, replay, identidad y privilegios.

## Evidencia
- CI unidad: **109/109** en https://github.com/ProtectorRudo/Cotironda/actions/runs/40889804025.
- CI Next: https://github.com/ProtectorRudo/Cotironda/actions/runs/40889804222, incluye `node scripts/postgrest-429-contract.mjs`.
- El script importa **la versión fijada de la librería real `@supabase/supabase-js`**, intercambia sólo el `fetch` por una respuesta local y verifica que la librería regresa `status=429`, `403`, `200`, con una única llamada y sin reintentos. No hay red, credenciales, usuarios ni datos comerciales.
- CI Postgres: https://github.com/ProtectorRudo/Cotironda/actions/runs/40889804092 (sin cambios SQL); sitio https://github.com/ProtectorRudo/Cotironda/actions/runs/40889804135.

## Controles de seguridad posteriores
- Supabase dev sigue con séptima migración `20261029140422_registration_attempt_rate_limiter` instalada, `registration_settings.enabled=false` y cero usuarios, sesiones, organizaciones y cuotas persistidas.
- El limitador en la RPC sigue activo, y el portal de registro mantiene su guardia HTTP fail-closed mientras falten pruebas Auth reales.
- Sin acceso de clientes a contadores privados; sin publicación a producción.

## Lo que estas pruebas NO demuestran
- **No** prueban un `429` recibido por red de PostgREST del proyecto real con JWT firmado de Supabase Auth. El transporte se simuló, aunque el cliente JS ejecutado es auténtico.
- **No** prueban el Custom Access Token Hook activado, un cierre de sesión remoto, token firmado vencido ni cookies SSR/refresh.
- No resuelven ataques con múltiples cuentas ni ataques previos a la sesión autenticada.
- Antes de abrir registros: completar Auth Hook en `cotironda-dev`, cuentas de prueba con contraseñas fuera de GitHub, JWT E2E, límite 429 real, sesión revocada y cookies, manteniendo el doble interruptor cerrado hasta una ventana de test supervisada.

## Fuentes
- https://docs.postgrest.org/en/stable/references/transactions.html
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

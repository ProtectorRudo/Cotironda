# 172 — MVP-052: identidad SQL privada para el receptor Whapi

**01/11/2026 · Issue #317 · SOLO código de desarrollo y pruebas con cliente inyectado. No conectar SQL DEV.**

## Por qué
El receptor HTTPS D083 cifra y verifica el evento, pero necesita una conexión PostgreSQL de privilegios estrictamente limitados. El rol D084, creado solo en CI, permite seis funciones privadas; por sí solo no demuestra con qué identidad se conectaría Next.js. **Nunca usar login `postgres`, `service_role` ni contraseña administrativa** en una ruta pública.

## Qué se creó
`src/server/whapi-sql-session-d085.ts`: puerto compatible con D030/D074 que acepta **un cliente PostgreSQL dedicado, de una sola solicitud, provisto por un servidor privado**. No tiene dependencia `pg` ni configura/redirige credenciales.

Orden:
1. Abrir conexión a través del cliente inyectado.
2. `SELECT session_user, current_user`: ambos tienen que ser el LOGIN dedicado exacto `cotironda_whapi_http_login_d085`.
3. `SET ROLE cotironda_whapi_http_gateway_d084` y repetir la comprobación: `session_user` debe seguir siendo el LOGIN y `current_user` el rol mínimo D084.
4. Permitir exclusivamente las **seis sentencias SQL parametrizadas literales** ya utilizadas en D030/D074 y la aridad correcta (tres para comprador, tres para proveedor).
5. `end()` sobre la conexión dedicada al completar o si falla la inicialización. Se sanitizan los errores y se bloquea cualquier consulta después de cerrar.

`tests/unit/mvp052-whapi-sql-session.test.mjs` prueba éxito con seis RPC, identidad equivocada (`postgres`, `service_role`), rol no aplicado, SQL arbitrario, RPC legada, aridad inválida, cierre idempotente y fallos de conexión/consulta.

**Decisión de aislamiento:** `SET ROLE` a nivel sesión exige usar conexión **dedicada y descartable**, nunca conexión obtenida de un pool general ni el modo *transaction pooling* con estado de sesión que puede cambiar por transacción. Esta fase NO introduce pooling. Para el primer piloto de baja concurrencia, priorizar conexiones limitadas y TLS `verify-full` con CA y hostname válidos. Supabase explica modos y usuarios custom en [conexión PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) y [SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Por qué aún no se conecta a Next.js
D083 sigue recibiendo `abrirPuertoSql` como dependencia opcional; la ruta HTTP real todavía devuelve 503. Faltan:
- **#175:** respaldo auténtico cifrado, restauración aislada suficiente de `cotironda-dev`, más conciliación de 17 migraciones; sin abrir este gate no instalar D024+, D074, D084.
- Crear cuenta LOGIN técnica `cotironda_whapi_http_login_d085` de forma privada, con contraseña fuerte y permisos `SET ROLE` únicamente D084; revocar cualquier privilegio heredado no deseado. **No generar, publicar ni enviar contraseñas a GitHub/ChatGPT**.
- Elegir e instalar cliente PostgreSQL versionado (p. ej., `pg`) en servidor, con lockfile comprobado; configurar host exacto del pooler en modo sesión o conexión directa, CA TLS, límites de conexiones, timeouts y secret manager en Preview. El puerto D085 no trae un driver.
- Inyectar la conexión **solo** en el receptor Preview autorizado, probar de extremo a extremo con identidades y permisos reales y habilitar con números voluntarios en allowlist.
- Workers separados, extracción segura y cotizaciones reales. **Ningún mensaje Whapi se envió ni recibió en esta etapa.**

No se modificó producción, `main`, Vercel, DNS, env, Supabase DEV/PROD, ni el dominio. Una prueba con cliente simulado **no acredita conexión SQL real**.

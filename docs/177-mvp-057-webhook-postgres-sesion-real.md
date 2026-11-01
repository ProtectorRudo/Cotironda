# 177 — MVP-057: Whapi HTTPS con conexión PostgreSQL real y rol mínimo (desarrollo)

**01/11/2026 · Issue #327 · PR a la rama de integración, NO desplegado.**

## Antes y ahora
Antes, la ruta HTTPS `POST /api/integraciones/whapi` siempre respondía 503 incluso en una Preview autorizada: D083 no tenía `abrirPuertoSql`.

Ahora, su POST pasa un adaptador real `src/server/whapi-postgres-driver-d088.ts` que usa **Postgres.js 3.4.9** (una dependencia exacta, fijada con hash SHA512 en lock). Solo después de que D083 verifica **Preview + rama, habilitación, cabecera secreta, Content-Type y Content-Length**, la ruta importa el paquete y abre conexión. Es un avance real hacia el webhook; no hay envío a Whapi ni activación por sí solo.

## Garantías técnicas
- Solamente Preview de `integration/mvp-piloto-20261031`, con flags dobles D083 y `COTIRONDA_WHAPI_DB_DRIVER_ENABLED=true`. Producción y otras ramas mantienen 503; GET/PUT, 405.
- Solo la **base DEV actualmente autorizada** `qkercsoqhehbenbbncwk`, sin configuraciones destinadas a producción. La referencia no es una contraseña, y se valida tanto en nombre/usuario de la conexión como por variable de entorno.
- Se admite **Supabase Session pooler por puerto 5432** (username `cotironda_whapi_http_login_d085.<project-ref>`) o conexión directa `db.<project-ref>.supabase.co:5432` (username sin sufijo), únicamente región sa-east-1 para el pooler existente. Rechaza hosts externos, direct IP, puerto 6543 (transaction pooler), URL con parámetros, login postgres/service_role y errores de configuración.
- `ssl:{ca,rejectUnauthorized:true}`, TLS con CA explícita y verificación de hostname, sin modo `sslmode=require` desprotegido. El certificado PEM se configura en secreto de Preview; no se fija ni versiona el certificado en Git.
- El driver mantiene una sesión reservada por request, sin pool global: `max=1`, `max_pipeline=1`, `prepare=false`, `fetch_types=false`, timeout corto, `reserve` y `release/end`. D085 confirma con `session_user` y `current_user` el LOGIN técnico y luego aplica `SET ROLE` a D084, que permite **solo seis RPC** de inbox/resolución/baja para compradores/proveedores. No lee Auth, no expone números sin cifrar, no crea rondas ni envía mensajes.
- `supabase/sql/whapi_http_dedicated_login_d089.sql`: rol LOGIN técnico con `PASSWORD NULL` (imposible autenticarse hasta instalación privada), NOINHERIT, NOBYPASSRLS, límite 3 conexiones y único `GRANT ... WITH INHERIT FALSE, SET TRUE` al rol D084. PostgreSQL 17 CI comprueba ausencia de contraseña/privilegios y SET ROLE real. **NO instalar todavía en Supabase DEV**.

## Cuando se habilite la prueba con teléfonos reales
1. Resolver puerta de recuperación/migraciones #175 o aprobar una nueva DEV aislada y recuperable. Instalar primero las migraciones de ledger y Webhook D024+, D074, D084 y D089 en el orden ya probado en PostgreSQL 17, con revisión de permisos y control de roles.
2. Provisionar **fuera de GitHub/ChatGPT** una contraseña exclusiva para el LOGIN `cotironda_whapi_http_login_d085` (sin permisos de escritura directa a tablas) y obtener la cadena **Session pooler** exacta desde Supabase Dashboard > Connect. Nunca utilizar usuario `postgres` de base.
3. Instalar en la Preview privada de Vercel: `COTIRONDA_WHAPI_DB_DRIVER_ENABLED=true`, `COTIRONDA_WHAPI_DB_PROJECT_REF=qkercsoqhehbenbbncwk`, `COTIRONDA_WHAPI_DB_URL` como secreto Preview, y `COTIRONDA_WHAPI_DB_ROOT_CA_PEM` con CA válida desde Supabase SSL Configuration. Configurar los flags D083, canal Whapi y claves HMAC/AES por **secret manager**, nunca como `NEXT_PUBLIC_*`.
4. Cargar un arquitecto y tres comercios voluntarios con catálogos reales de prueba, huellas de WhatsApp, consentimientos y zona de entrega. Un solo número central Whapi. Probar primero autorización de webhook, después mensajes entrantes. Habilitar el webhook en Whapi **solo tras obtener 200 en pruebas sintéticas del receptor**. Un 503 para canal aún no habilitado sigue siendo el comportamiento correcto.
5. Para recibir una consulta de presupuesto completa aún hay que conectar la **lectura del inbox** por worker, IA para archivos reales, D081/D071/D070 y el emisor con allowlist; el POST HTTPS por sí solo **guarda** mensajes cifrados pero **no crea rondas ni responde ni envía**. El cierre de finalistas y revelación también siguen pendientes.

## Pruebas de esta rama
- Node: rol técnico, sesión reservada, TLS/CA y host/puerto, POST D083 con comprador y replay, cabecera falsa y producción antes de cargar driver, fallos de DB y cierre.
- PG17: crea D089 con contraseña NULL, roles sin herencia directa, prueba SET ROLE y acceso solo a las RPC D084.
- Portal: `npm ci` contra package-lock con integridad, `tsc`, build Next 16.4.3 y smoke HTTP.
- Reportar resultados solamente después de verificar GitHub Actions, sin afirmar que DEV, Vercel o Whapi están activos.

**No se publican secretos, no se toca OFI ni la rama main, no se envía ningún WhatsApp y no se instala SQL remoto.**

Fuentes técnicas: [Conexión Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS/SSL](https://supabase.com/docs/guides/platform/ssl-enforcement), [Postgres.js 3.4.9](https://www.npmjs.com/package/postgres).

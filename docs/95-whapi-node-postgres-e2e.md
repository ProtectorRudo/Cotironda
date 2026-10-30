# 95 — D031: Node.js ↔ PostgreSQL17 REAL, E2E con usuario efímero de CI

**30/10/2026 · Issue #163 · PR sobre #162. No es deploy DEV ni producción.**

## Objetivo

Probar por primera vez la secuencia **D027 receptor simulado de Whapi → D029 cifrado y pseudonimización → D030 gateway con SQL parametrizado → D028 funciones SQL privadas en PostgreSQL17 real**. No basta con que el driver sea un MOCK ni con probar SQL aislado.

## Driver y credenciales

- `scripts/ci/whapi-pg/package.json` declara exactamente **`pg@8.23.1`**, seleccionado tras verificar la versión en npm. Es dependencia exclusiva del test E2E, no del portal ni del runtime de producción.
- GitHub Actions configura Node 22.16.0 y instala la dependencia exclusivamente en el job efímero. Se debe **commitear package-lock.json y cambiar a `npm ci`** antes de cerrar el PR.
- Las tres claves HMAC/AES y el secreto de webhook se generan aleatoriamente por ejecución con `openssl rand` y se enmascaran en los logs. La contraseña de prueba PostgreSQL es distinta de la del superusuario y también se genera aleatoriamente y enmascara.
- El rol `cotironda_whapi_ci_login` existe **solo en PostgreSQL17 descartable**, no posee BYPASSRLS ni puede asumir postgres. Hereda únicamente los EXECUTE del rol `cotironda_whapi_gateway`. El test exige que fallen SELECT en contactos/inbox, UPDATE de ronda y SET ROLE postgres.
- PostgreSQL17 de CI corre sobre 127.0.0.1, por eso este test permite `ssl:false` **exclusivamente con triple guard local+nombre BD exacto+flag CI**. Ningún código de conexión a Supabase DEV o producción existe aquí. Fuera del CI se requerirá TLS con validación del certificado CA para evitar MITM y administrar el pool de conexiones según el entorno.

## Datos sintéticos y flujo probado

`scripts/ci/whapi-pg/seed.sql` crea un comprador y dos proveedores ficticios, una sola ronda abierta para el proveedor B e invitación. El chat del proveedor C está vinculado pero no invitado. Los chats se insertan como HMAC, **no números en la tabla**; para generarlos, Node usa la clave de prueba en memoria.

`scripts/ci/whapi-pg/e2e.mjs` abre conexiones Postgres **independientes**, valida:
1. Identificación del usuario SQL como rol restringido; consultas y DML directos denegados.
2. Recepción de un presupuesto sintético y cifrado AES-GCM persistido por RPC privada D028, con comprobante honesto `entradas_persistidas` sin confirmar presupuesto.
3. Reenvío del mismo mensaje en otra conexión: `duplicada:1`; misma ID con precio distinto: se rechaza sin sobrescribir el anterior.
4. Un proveedor sin invitación no puede guardar una oferta, pero **sí puede escribir BAJA** sin ronda abierta.
5. BAJA de proveedor invitado, replay idempotente, nueva entrada posterior rechazada. No hay envíos salientes.
6. SQL administrador de CI verifica que exista exactamente un contenido cifrado y dos registros BAJA sin contenido, ambos contactos desuscriptos.

Los fixtures se guardan temporalmente **entre conexiones** para demostrar persistencia real. El contenedor PostgreSQL17 del job se destruye al finalizar. No hay datos de usuario, sesiones reales, secretos ni cambios de esquema en Supabase DEV.

## Límites y próximos gates

- **No habilita webhook Whapi ni una credencial permanente.** El recibo HTTP sigue trabajando con eventos simulados de estructura Whapi; ninguna llamada al proveedor ni a OpenAI.
- Esta prueba no demuestra todavía rotación de claves HMAC/AES, `key_id` persistente, descarga de medios, política legal de retención, antispam, control de tasa, template/outbox, consentimiento inicial real, auditoría de origen del webhook ni reconsentimiento.
- En la etapa de implementación real hay que instalar migraciones D024–D030 aprobadas en DEV de forma controlada, crear un usuario dedicado de servicio con secretos de Vault, TLS validado, política de acceso de red y pool dimensionado. Un rol SQL NOLOGIN en sí mismo no puede conectar por red: no confundir la prueba con el servicio desplegado.
- Con **dos invitaciones simultáneas** D030 sigue rechazando vinculación ambigua; no se podrá ofrecer UX completa para esa situación hasta asociar la conversación a una ronda explícita con autorización.
- Una BAJA se registra de forma definitiva en D028. Implementar reconsentimiento verificado fuera de la ruta de baja antes de habilitar un número real.

**Principio UX-001:** todo lo anterior debe ser invisible al comprador y al corralón. Ninguna pantalla ni capacitación adicional se justifica por un requisito de infraestructura.

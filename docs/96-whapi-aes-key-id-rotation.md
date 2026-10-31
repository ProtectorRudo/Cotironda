# 96 — D032: claves AES versionadas, lectura histórica y rotación controlada

**30/10/2026 · Issue #165 · Etapa 04 · PR apilado sobre #164. No instalado en DEV ni producción.**

## Problema detectado

En D029–D031 los mensajes se cifran con AES-256-GCM, pero la tabla D028 no identificaba qué clave cifró cada fila. Sustituir esa clave sin guardar metadatos podía volver ilegibles los presupuestos anteriores.

## Solución implementada y alcance

- `supabase/sql/whapi_inbox_key_id_d032.sql`: agrega `crypto_key_id` al inbox privado, valor por defecto `legacy_d029` para los mensajes antiguos. Nueva función `whapi_inbox_record_keyed_v1` recibe key-id explícito y validado. Está en esquema privado y pertenece al rol interno `cotironda_whapi_inbox_writer` NOLOGIN/NOBYPASSRLS; únicamente `cotironda_whapi_gateway` recibe EXECUTE. No se autorizan `anon`, `authenticated`, `service_role` ni consultas directas sobre la tabla.
- Reintento con mismo ID y misma huella de contenido devuelve duplicado únicamente si coincide también el key-id. Cambiar key-id con mismo ID se considera colisión y no reescribe el registro histórico. Todas las filas continúan protegidas por trigger inmutable D028.
- `src/server/whapi-crypto-broker.ts`: añade `contenidoKeyId` para nuevas escrituras, `clavesLectura` con claves de AES anteriores **solo para descifrar**. Los mensajes nuevos vinculan criptográficamente el key-id al AAD. El formato legado conserva exactamente su AAD anterior para poder leerlo.
- `src/server/whapi-postgres-gateway.ts`: usa ruta SQL antigua de 9 parámetros para `legacy_d029`, o función versionada con décimo parámetro para las escrituras nuevas. Solo SQL literal parametrizado, nunca interpolar ID o bytes de clave.
- D032 **rota únicamente AES del contenido**. Las claves HMAC para identidad de chat, identificador de mensaje y huella permanecen estables. Rotarlas sin una migración de contactos/IDs rompería el reconocimiento de la conversación, la deduplicación y la baja; ese cambio requiere un protocolo separado.
- **Nunca se almacena material AES o HMAC en PostgreSQL**: el key-id es un identificador no secreto. No se crean claves reales. La custodia de claves, secret manager, retención de claves antiguas y re-cifrado masivo todavía no están implementados.

## Pruebas

- `supabase/tests/ci/104_whapi_key_id.sql` contra PostgreSQL17 efímero: rol y grants, fila legacy, fila con key-id nuevo, replay del nuevo, colisión al cambiar key-id, impedir `legacy_d029` en ruta nueva, verificar que ambas filas conservan su etiqueta y rollback.
- `tests/unit/whapi-aes-key-rotation.test.mjs`: dos generaciones AES, lectura de ambas mediante keyring, rechazo de key-id desconocido o falsificado, AAD protegido, claves históricas copiadas, versión en SQL parametrizado, rechazo de claves repetidas.
- `scripts/ci/whapi-pg/e2e.mjs`: E2E Node→Postgres17 con driver `pg` real y login CI limitado. Genera dos claves AES distintas y registra dos presupuestos ficticios con key-id separados, reconoce replay, rechaza misma ID con otra clave, mantiene BAJA. El contenedor se destruye al terminar el job.
- La batería completa de cinco workflows se usa como puerta de calidad; no considerar aprobado hasta verificarlos.

## Límite de seguridad y despliegue

No se probó rotación de claves sobre Supabase DEV, ni lectura de datos reales históricos, ni un worker de procesamiento de ofertas. Para instalar:
1. Auditar las migraciones apiladas D024–D032 y su compatibilidad con políticas Supabase gestionadas (incluido `auth` y RLS). El PostgreSQL de CI no sustituye una comprobación de permisos sobre Supabase alojado.
2. Diseñar secret manager con key-id activo, claves antiguas protegidas, rotación por entorno, backups y procedimiento seguro de retirada de claves con comprobación de filas pendientes.
3. Añadir retención, recuperación y re-cifrado con pruebas de cortes/concurrencia; **nunca borrar una clave antigua mientras existan filas que dependan de ella**.
4. Habilitar WhatsApp DEV solo tras autenticidad del webhook, autorización de remitente, antivirus para multimedia, consentimiento y pruebas E2E con mensajes reales autorizados.

**UX-001:** la rotación de claves debe ser totalmente invisible para comprador y proveedor. No introduce login, pasos, formularios ni capacitación.

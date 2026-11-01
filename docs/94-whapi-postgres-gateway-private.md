# 94 — D030: gateway privado PostgreSQL para WhatsApp (OFFLINE)

**30/10/2026 · Issue #161 · rama `feat/04-whapi-private-pg-gateway` sobre PR #160.**

## Propósito

Avanza la conexión entre el receptor D027, el broker criptográfico D029 y las operaciones privadas del inbox SQL D028, **sin publicar webhook, credenciales ni servicios**. El principio UX-001 sigue vigente: el corralón puede responder por WhatsApp sin aprender un portal.

### Contrato SQL privado

`supabase/sql/whapi_gateway_private_d030.sql` agrega función `cotironda_private.whapi_resolve_active_contact_v1(channel,chat_key)`, bajo SECURITY DEFINER propiedad de `cotironda_whapi_inbox_writer` (NOLOGIN/NOBYPASSRLS), no de postgres.

La función:
- Busca únicamente un chat_key HMAC previamente vinculado y verificado a un proveedor, con consentimiento vigente y sin BAJA.
- Cuenta rondas de ese proveedor `abiertas` y dentro de fecha. Devuelve vínculo solo si hay **exactamente una**; cero o dos rondas devuelven `NULL` sin inferencias.
- No devuelve teléfono ni texto: solamente `supplierOrgId`, `roundId`, `consentimientoVigente=true`, `invitacionVigente=true`, para consumo interno.
- La operación posterior de guardar en D028 vuelve a revisar contacto, baja, invitación y ventana de ronda con bloqueo de fila, evitando confiar únicamente en este resultado preliminar.

Rol `cotironda_whapi_gateway`: **NOLOGIN, NOINHERIT, NOBYPASSRLS**. Tiene USAGE del esquema privado y **solo EXECUTE en tres funciones**: resolver, guardar entrada cifrada y BAJA. Sin permisos directos de SELECT, INSERT, UPDATE o DELETE sobre tablas. `anon`, `authenticated` y `service_role` NO reciben EXECUTE. Cualquier usuario/servicio futuro que actúe a través del gateway deberá ser un proceso servidor con una credencial y una membresía autorizada **que NO se crean en esta entrega**. Nunca asociarlo con una clave pública o con la Data API.

### Puerto Node estrictamente parametrizado

`src/server/whapi-postgres-gateway.ts` acepta un driver/cliente servidor inyectado con `query(sql,params)` y crea tres métodos: `resolverVinculo`, `registrarEntrada`, `registrarBaja`. Las tres sentencias SQL son **literales fijas**, con placeholders (`$1...$9`) y sin interpolar chat ni material. Solo admite HMACs de 64 caracteres hexadecimales, canal restringido, bytea de cifrado (1..8192 bytes), nonce de 12 bytes, tag de 16 bytes y timestamp entero. Verifica respuestas con claves exactas y estados correctos; rechaza payloads adicionales, incluidos teléfonos, y nunca devuelve errores de SQL a la capa HTTP.

Al usarlo con D029 se transmite únicamente `channel,chatKey,messageKey,fingerprint,kind,ciphertext,nonce,tag,sourceUnix`, nunca texto ni número en claro. Ante fallo del driver, permisos o dato inesperado, D027 responde 503 sin acuse falso. La BAJA utiliza la función privada separada aun sin ronda.

**No incluye un driver de PostgreSQL instalado ni una conexión real:** el cliente sigue siendo una interfaz inyectada para pruebas y la conexión a datos auténticos requiere credenciales de worker server-only, TLS, red restringida, manejo de pool, rotación y permisos auditados.

### Pruebas

- `supabase/tests/ci/103_whapi_gateway_private.sql`: sobre PG17 efímero y esquema D028 real, dos empresas proveedoras, invitaciones, chat HMAC, roles, ausencia de SELECT directo, ejecución permitida solo en función privada, resultado cuando ronda aún no abrió, ronda única, dos rondas ambiguas, BAJA con ronda cerrada, replay e impedimento de acceso después de baja. Fixtures con `ROLLBACK`.
- `tests/unit/whapi-postgres-gateway.test.mjs`: flujo D027→D029→D030 con driver sintético que simula las respuestas SQL, inyección de campos extra, parámetros maliciosos, buffers malformados, reintentos, IDs colisionados, BAJA, caída DB y ausencia de fuga de información.

**Límite de verificación:** PostgreSQL CI verifica en motor real las funciones y permisos; Node CI verifica el adaptador con driver simulado. Todavía **no** existe E2E de Node contra PostgreSQL real con su rol de conexión: ese ensayo debe ser otro criterio antes de instalar en DEV o activar Whapi.

### Antes de conectar Whapi real

1. Revisar y aprobar D024–D030 como migraciones, sin modificar el historial histórico hasta completar integración y decisión de deploy DEV.
2. Crear un login de servicio de uso exclusivo del worker, permisos EXECUTE-only a través del rol gateway, secretos DEV aislados y TLS/red restringida. Auditar capacidades por defecto y revocación.
3. Implementar cliente PostgreSQL real (paquete versionado con lockfile), configurador de llaves HMAC/AES desde gestor de secretos, rotación y cifrado con key-id persistente. No introducir `service_role` ni contraseñas al frontend.
4. Confirmar encabezado de autenticación de webhook en canal Whapi DEV y validar límites, reintentos, opt-out, cuotas, rate limit, datos personales, retención y registros sin PII.
5. Ejecutar E2E con un proveedor/empresa **sintéticos** y luego pilotear uso WhatsApp sin capacitación. Recién después activar un webhook DEV explícitamente autorizado, nunca producción por inferencia.

**No hay envíos, secretos instalados, base DEV modificada, automatizaciones habilitadas, IA consumida ni publicación a producción.**

# 92 — D028: buzón privado de WhatsApp y baja con cero fricción

**30/10/2026 · Issue #157 · PR sobre D027/PR #156. Solo código y CI; NO instalado ni publicado.**

## Qué resuelve

Cada mensaje de WhatsApp entrante se debe **guardar antes de reconocerlo como recibido**, con identificación de reenvíos por canal/mensaje. Un proveedor puede escribir exactamente **BAJA** sin estar cotizando ni tener una invitación vigente; la baja impide nuevas invitaciones hasta que exista un nuevo consentimiento verificado por un proceso distinto, **aún no desarrollado**.

### Diseño privado PostgreSQL D028

`supabase/sql/whapi_private_inbox_d028.sql` crea únicamente dentro de `cotironda_private`:

- `whapi_contacts_v1`: relación verificada entre canal, **HMAC-SHA256 del identificador de chat** y proveedor (FK a perfil real). Conserva momento de verificación, consentimiento y baja. No almacena teléfono, texto ni chat directo. La baja es irreversible desde las funciones y triggers disponibles; no permite reactivar silenciosamente.
- `whapi_inbox_v1`: entrada durable única por `(channel_id,message_key)`, con `message_key` HMAC-SHA256 del ID original, huella estable de contenido, proveedor/round internos, tipo y estado. Para texto y multimedia solo admite **cifrado AES-GCM generado fuera de PostgreSQL**, más nonce de 12 bytes y tag de 16; nunca texto, URLs ni metadatos de archivos en claro. La base comprueba tamaño/forma del cifrado, **no su autenticidad criptográfica** (la verificación y custodia de claves corresponden al futuro broker). Los eventos BAJA guardan solo huellas/identificadores protegidos, sin cuerpo.
- RLS activa, permisos revocados a `anon`, `authenticated`, `service_role`, `cotironda_app`, sin políticas para ellos. Rol `cotironda_whapi_inbox_writer` NOLOGIN, NOINHERIT y NOBYPASSRLS con permisos mínimos para operar sobre tablas privadas. Las funciones solo existen en esquema privado; **no se concede EXECUTE a roles de cliente ni servidor genérico**.

### Operaciones internas

`whapi_inbox_record_v1` verifica el vínculo de un chat previamente autenticado por el futuro broker; exige consentimiento sin baja y **una única ronda abierta/invitación vigente**, deducida desde tablas privadas. Con varias rondas activas, **no adivina a cuál corresponde un mensaje**: falla cerrado hasta tener asociación inequívoca de conversación. Usa bloqueos de fila, ID único por canal y huella para reconocer un reenvío idéntico (devuelve `repetido:true`) o rechazar un ID reutilizado con contenido distinto. Exige cifrado para mensajes, sin aceptar texto crudo.

`whapi_record_optout_v1` **no requiere invitación ni ronda activa**. Localiza exclusivamente un contacto ya verificado y registra atómicamente el evento BAJA y `opted_out_at`. Si se reenvía el mismo evento, no duplica la baja; si cambia la huella con el mismo ID, falla. No existe función de re-alta automática.

**Muy importante:** estas funciones privadas toman huellas calculadas y cifrado **de un broker de confianza que todavía no existe**. No verifican por sí mismas la firma nativa de Whapi ni autentican un número de teléfono. Nunca exponerlas en una RPC HTTP ni aceptar HMAC, proveedor, canal o consentimiento directamente de un mensaje sin la validación backend.

### Entrada Whapi offline

Se extendió `src/server/whapi-inbound-offline.ts`: un mensaje entrante de texto **exactamente «BAJA»** (sin distinción de mayúsculas y con espacios externos) utiliza un puerto `registrarBaja`. No ejecuta `resolverProveedor` que exige invitación; la operación futura debe vincular al contacto verificado y llamar al ledger privado D028. Si el puerto no existe o falla, devuelve HTTP 503 y **no finge que la baja fue registrada**. «¿Cómo doy de baja una línea?» no provoca baja accidental. El texto no autoriza operaciones de cotización, adjudicación ni confirmación.

## UX-001

El proveedor debe poder responder BAJA por WhatsApp en un único mensaje, sin portal ni curso. En producción será necesario reconocer también las palabras/frases de opt-out previstas por la política del canal, sin falsos positivos, y gestionar bajas aunque la persona no esté asociada a una ronda. Los mensajes de confirmación/acuse al proveedor requieren outbox durable, aprobación de plantilla/costos y consentimiento; **no están implementados**.

## Tests y límites

`supabase/tests/ci/102_whapi_private_inbox.sql` crea 2 proveedores y 2 rondas de prueba dentro de una transacción con `ROLLBACK`, verifica rol mínimo, RLS, proyección sin chat/telefono/texto, idempotencia, colisiones, falta de invitación, ambigüedad de dos rondas, cifrado obligatorio, irreversibilidad de datos/baja, rechazo de nuevos mensajes tras BAJA y persistencia de BAJA sin ronda abierta.

`tests/unit/whapi-inbound-offline.test.mjs` amplía D027 con pruebas de BAJA explícita, sin confirmar ofertas, replay, ausencia de puerto, error de persistencia y autenticación fallida.

**No probado todavía:** backend con cifrado AES-GCM y HMAC por canal, rotación de claves, límites de acceso a las claves, conexión Postgres desde un broker real, retención/borrado legal, recepción Whapi real, autenticidad de encabezados en el canal elegido, colas/outbox y E2E con el proveedor. Los tests SQL con bytes sintéticos no prueban AES-GCM. Tampoco se habilita Whapi ni se crean tablas permanentes en DEV.

**Gate:** CI 5/5 + auditoría de permisos; PR draft apilado, sin fusionar a `main`, sin desplegar a Vercel/Supabase, sin usar IA y sin enviar WhatsApp.

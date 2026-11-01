# 163 — MVP-043: buzón de arquitectos en PostgreSQL 17 (solo CI)

**01/11/2026 · Issue #299 · depende de D024/D028/D030/D032 · NO INSTALAR en DEV sin respaldo y restauración #175.**

## Qué habilita en código

Antes del MVP-043, el receptor Whapi dual MVP-042 sabía diferenciar un arquitecto de un proveedor y cifrar su mensaje, pero el puerto del comprador terminaba en un almacén sin implementación SQL. Se añadió:

- `supabase/sql/whapi_buyer_inbox_d074.sql`: tabla privada de contactos de compradores identificados por **HMAC de chat**, ID de organización, consentimientos y BAJA. Segunda tabla privada de inbox con **HMAC de mensaje, AES-GCM, nonce, tag, key-id y huella HMAC**. No existe columna de teléfono ni texto libre. La pertenencia a empresa y aceptación de la divulgación de contactos deben venir de enrolamiento autenticado previo; **un mensaje entrante nunca crea una empresa o cuenta**.
- Nuevas funciones privadas `whapi_resolve_buyer_d074`, `whapi_record_buyer_d074` y `whapi_buyer_optout_d074`. El mismo rol limitado gateway de D030 solo tiene **EXECUTE**, sin lectura de tablas. El escritor interno NOLOGIN/NOBYPASSRLS recibe permisos por tablas y RLS; `SECURITY DEFINER` pertenece a ese escritor, no a `postgres`. Ninguna RPC accesible desde API pública.
- Guardias de ambas tablas de contactos (comprador y proveedor) usan un mismo candado transaccional para impedir inscribir **el mismo chat en dos roles**; se rechaza empresa que no sea compradora. La BAJA del comprador es atómica, deja evidencia sin guardar texto y no puede revertirse por editar la fila. Reenvíos iguales devuelven resultado idempotente y mensajes con el mismo ID pero diferente huella o empresa son rechazados. Se conserva el cifrado anterior de proveedores.
- `src/server/whapi-postgres-gateway.ts`: nuevo `crearPuertoPostgresWhapiDualD074` que mantiene el adaptador proveedor D030 y agrega consultas SQL parametrizadas con validación estricta para comprador; no abre conexiones, no maneja tokens, no descarga archivos ni manda mensajes.
- `supabase/tests/ci/128_whapi_buyer_inbox_d074.sql` + `tests/unit/mvp043-buyer-whapi-postgres-gateway.test.mjs`. Se ejecutan sobre PostgreSQL 17 efímero y fixtures ficticios, sin tocar un comercio ni la base DEV.

## Pendiente para recibir un pedido real en WhatsApp

El código SQL no está instalado en Supabase DEV y el gateway no dispone de un servicio con identidad de conexión. Para la primera ronda real todavía hacen falta: #175 backup y restore independiente; instalación auditada de las migraciones comerciales; enrolamiento seguro de chats comprador/proveedor (consentimientos y contactos cifrados); endpoint HTTPS que reciba webhooks de Whapi con ACK solo después del commit; worker que lea y descifre este inbox y llame D073; extracción de PDFs, Excel, Word e imágenes; envío D071/D070 a proveedores permitidos; recepción D061/D062 y ranking determinista por rubro desde DB.

**No se habilitó Whapi.** El código aún no procesa documentos adjuntos: sus mensajes se guardan pendientes como tipos media sin URL considerada segura. El arquitecto no tiene que adjudicar dentro de Cotironda: UX-002 sigue vigente.

## Criterios de seguridad del primer piloto

Usar un único número de ensayo Whapi con uno o dos compradores y dos proveedores voluntarios. Ningún mensaje a proveedores externos sin opt-in; no dar por enviado un presupuesto antes de recibir acuse del transporte; no comparar totales de ofertas parciales o condiciones incompatibles; contactos de finalistas solo al cierre y consentimiento previo. **Sin main, DNS, Supabase DEV, Vercel ni producción** en este incremento. CI aprobará SQL, RLS, deduplicación, BAJA, rol NOLOGIN y contrato JS antes de integrar.

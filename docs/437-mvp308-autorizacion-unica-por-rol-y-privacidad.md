# Decisión 437 — MVP308: autorización inicial integral, una sola aceptación por rol

**Fecha:** 07/11/2026, Argentina. **Autorización:** «Luz verde» para consolidar y auditar los pasos 1 y 2. **Ámbito:** desarrollo, sin publicación en el piloto. **PR:** [#702](https://github.com/ProtectorRudo/Cotironda/pull/702).

## Experiencia acordada

Cada persona que se incorpora a Cotironda acepta **una sola vez**, en el mismo evento de alta, las operaciones habituales de **su rol**. No se envían códigos ni confirmaciones adicionales por cada ronda.

- **Comprador / arquitecto:** el operador muestra una política completa, después entrega un único WhatsApp prearmado `COTI ALTA <código> ACEPTO`. El mensaje vincula su número a Cotironda, registra la versión de términos y el evento cifrado. **No concede autorización para revelar su teléfono, nombre personal ni documentos originales a proveedores.** Ante pedidos completos la IA trabaja sin confirmar materiales por WhatsApp; ante datos indispensables faltantes solo hace una pregunta útil.
- **Proveedor:** el operador muestra la política del proveedor, incluyendo que el comprador verá al cierre **todos los nombres comerciales** y su **contacto de WhatsApp de negocio**, aun si ese negocio no cotizó. Acepta con un único mensaje `COTI ALTA <código> CONTACTOS SI`, que acredita alta, condiciones generales y autorización comercial simultáneamente. Puede revocar el permiso de contacto por `COTI CONTACTOS NO`, o darse de baja.
- **Participantes existentes:** no se presumen consentimientos nuevos. Si la adhesión anterior solo acreditaba usar WhatsApp para cotizar, no se interpreta como autorización retroactiva para publicar el número comercial. La actualización, cuando proceda, debe ser **una sola vez**; nunca una por licitación.
- **Otros roles futuros:** deberán tener una política de alcance propia antes de habilitar el alta. No atribuirles autorizaciones genéricas.

## Evidencia e implementación de MVP308

Se crea `enrollment_policies_mvp308`, privada e inmutable, con el **texto literal de condiciones por rol y versión**, y `enrollment_terms_proof_mvp308`, privada e inmutable, con participante, rol, versión, SHA-256 del texto vigente, HMAC de la fuente WhatsApp original, SHA-256 de la frase aceptada y fecha.

El Edge autenticado reconoce exactamente dos expresiones de un solo evento. La RPC `cotironda_piloto_enroll_terms_mvp308` valida el código emitido para **ese** rol, que no haya vencido ni sido consumido, el HMAC del mensaje y chat, el SHA del texto, la vigencia temporal, la identidad WhatsApp, AES-GCM cifrado y la existencia de las políticas. Para proveedores reutiliza transaccionalmente MVP307, para compradores el vínculo de MVP073 y la bóveda de MVP109, **sin crear consentimiento para divulgar contactos de compradores**. Todo ocurre dentro de una única transacción o se revierte completo. Una repetición del mismo mensaje ya atestado retorna estado idempotente sin volver a ejecutar el alta.

El script del operador `mvp073_onboarding_codes_operator.sql` devuelve el **texto completo de condiciones** junto al mensaje prearmado; el operador debe mostrar esas condiciones **antes** de que la persona acepte. Conservar evidencia de la versión presentada; no considerar que el envío del código antiguo sin condiciones equivalga automáticamente a aceptación de MVP308.

## Protección del arquitecto: cierre del circuito heredado

Se deshabilitan mediante funciones SQL de igual firma tres rutas antiguas:

1. `cotironda_piloto_finalist_contacts_mvp109`: antes devolvía los contactos cifrados de **comprador más finalistas** al backend.
2. `cotironda_piloto_queue_finalists_mvp110`: antes podía preparar avisos bilaterales.
3. `cotironda_piloto_authorize_finalist_whapi_mvp110`: antes podía autorizar el envío de esos contactos por WhatsApp.

Ahora retornan estados no operativos. **La ruta válida es MVP303/MVP304**: el comprador ve todos los negocios invitados al cierre y solo sus contactos comerciales consentidos, con token y plazo. No se entrega el contacto del arquitecto a los proveedores. Este bloqueo responde a la política vigente, incluso si queda una cola de finalistas heredada pendiente.

## Criterios de aceptación y límites

- Sin segundo mensaje de autorización en un alta nueva, sin `CONFIRMAR COTI` por cotización normal.
- Nunca deducir consentimiento total de estar en BD; nunca inventar opt-in para negocios existentes.
- Alta con rol incorrecto, código vencido, SHA alterado, origen ajeno, contacto cifrado inválido, duplicados o sesión revocada: **sin efecto**.
- PostgreSQL17 con transacciones sintéticas y ROLLBACK: consentimiento comprador y proveedor, idempotencia, revocación, no divulgación del arquitecto y las tres rutas heredadas bloqueadas.
- GitHub CI Deno, SQL, Next.js, tests de memoria/IA/WhatsApp y regresiones previas en verde antes de integrar a la rama de desarrollo.
- No se modifica ni activa Supabase/Whapi/Vercel en este PR. Los dos proveedores reales del piloto aún deben tener una autorización **acreditada** para publicar su WhatsApp; sin ella, el modo automático no los seleccionará. Prueba completa con Whapi operativo pendiente.

**Decisiones relacionadas:** [334](334-decision-permisos-de-alta-sin-friccion.md), [434](434-mvp306-sin-confirmacion-y-contactos-proveedor.md), [435](435-mvp307-alta-unica-consentimiento-y-ruteo.md), [436](436-politica-autorizacion-unica-al-incorporarse.md).

**Estado:** desarrollo pendiente de auditoría final de CI y del comportamiento integrado. No implica que haya existido una autorización humana real ni una cotización procesada de punta a punta.

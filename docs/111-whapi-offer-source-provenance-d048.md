# 111 — D048: procedencia transaccional de borradores desde WhatsApp

**31/10/2026 · Issue #199 · PR apilado sobre D047/#198. Solo PostgreSQL 17 de GitHub CI.**

## Problema concreto

D047 ya impide duplicar trabajos de respuesta y verifica proveedor, ronda y revisión. Faltaba probar **que la revisión que pensamos contestar fue efectivamente creada a partir de ese mensaje guardado**. Una mera coincidencia de proveedor/ronda no establece causalidad.

## Diseño

`supabase/sql/whapi_offer_source_atomic_d048.sql` agrega:

- Tabla `cotironda_private.whapi_offer_sources_d048`: relación única mensaje de D028 → evento `draft_saved` de D026 → empresa/ronda/revisión. Referencias FK, hash del pedido estructurado e índices únicos para colisiones. No contiene texto, precios, nombres, contactos, claves ni URLs.
- Función privada `whapi_save_draft_from_inbox_d048`: obtiene ronda y empresa **del inbox verificado**, no de parámetros que pudiera inventar un archivo o mensaje del proveedor. Mantiene bloqueo de contacto contra BAJA, comprueba consentimiento, evita vínculos duplicados, llama a la función D026 de guardado de borrador, y registra la relación en **la misma transacción**. Un error revierte tanto el cambio económico como su evidencia de procedencia. Un evento D026 guardado previamente por fuera no puede etiquetarse retroactivamente como procedente de D048.
- Trigger `d048_outbox_require_source` sobre `whapi_reply_jobs_d047`: cancela por error toda nueva inserción o cambio de identidad/revisión que no corresponda exactamente a una relación D048 válida. El inbox existente de un proveedor ya no alcanza para fabricar una respuesta sobre otra oferta.

Los roles internos `cotironda_source_writer` y `cotironda_source_gateway` son NOLOGIN/NOINHERIT/NOBYPASSRLS; se fijan funciones SECURITY DEFINER con `search_path=''`, RLS y EXECUTE exclusivo del rol gateway. Ningún rol cliente ni el servicio genérico recibe estas funciones. El gateway **no tiene SELECT sobre las tablas**.

## Evidencia y límites

`supabase/tests/ci/108_whapi_offer_source_atomic_d048.sql` usa un PostgreSQL 17 real con transacción ROLLBACK y organizaciones/mensajes completamente ficticios. Casos: mensaje inexistente, multimedia no interpretada, proveedor no invitado, rechazo de trabajo sin vínculo, rechazo de atribución retroactiva, link válido, replay, alteración de precio, sustitución de evento, intento de reutilizar otro mensaje para la misma revisión, segunda revisión válida y BAJA.

Este protocolo **garantiza la asociación SQL**, pero **no demuestra que la extracción del mensaje haya sido correcta o que el proveedor realmente haya dicho el precio guardado**. El broker que aún falta debe autenticar el webhook, descifrar el mensaje, verificar que es una respuesta de ese proveedor y esa ronda, interpretar sin ejecutar instrucciones del contenido, presentar el borrador legible y permitir confirmación manual del proveedor.

D048 tampoco es la confirmación de la oferta: D046 sigue siendo dominio offline, y la confirmación D026 necesita una vinculación conversacional transaccional independiente. Un trabajo en cola no significa mensaje enviado. Los registros de D047 creados antes de D048 no quedan mágicamente certificados: requerirían reconciliación o cancelación antes de una migración real.

**No se instalaron tablas en Supabase DEV ni en producción, no se llamó a IA ni se envió WhatsApp.** La restauración real de DEV #175 continúa bloqueando D024–D048. PR draft, sin merge y con resultados CI a confirmar.

# 90 — D026: escritura atómica de borradores y ofertas confirmadas (SQL PRIVADO)

**30/10/2026 · Issue #153 · rama `feat/03-private-offer-atomic-write` sobre PR #152.**

## Para qué sirve
Es el motor transaccional que permitirá a un proveedor cotizar desde WhatsApp o un portal opcional **sin repetir lo enviado**. Esta entrega **NO conecta WhatsApp, no crea una API pública ni instala ninguna función en Supabase DEV/producción**. El circuito conversacional será posterior; el operador futuro tendrá que verificar autenticidad, identidad, permisos, invitación, consentimiento y versión antes de ejecutar la operación.

## Estados honestos
- `save_offer_draft_atomic_v1`: una respuesta se almacena como borrador (o reemplaza la revisión pendiente); responde `borrador_guardado`. **No equivale a presupuesto entregado ni cotización válida.**
- `confirm_offer_atomic_v1`: solo sobre la revisión actual; guarda evento y versión inmutable en la misma transacción; responde `cotizacion_confirmada`. Requiere confirmación expresa del proveedor en la capa WhatsApp/web futura. La base **NO** interpreta mensajes «confirmo» por sí sola.
- Una corrección posterior se guarda en nueva revisión del borrador. Hasta que se confirme, el comparador D022/D023 sigue utilizando la **última versión confirmada**.

## Arquitectura y amenazas
`supabase/sql/round_offer_atomic_write_d026.sql` se ejecuta **solo en PostgreSQL 17 efímero después de los contratos D024/D025**. Declara rol `cotironda_rounds_writer` NOLOGIN, NOINHERIT, NOBYPASSRLS con GRANTs limitados y políticas RLS exclusivas, pero **SIN membresía ni clave de acceso asignada a aplicaciones**.

Las funciones privadas son SECURITY DEFINER bajo **ese rol de mínimo privilegio** (nunca `postgres` como dueño), con `search_path=''` y EXECUTE revocado a PUBLIC, anon, authenticated, service_role y cotironda_app. No existen funciones ni rutas REST públicas para escribir. La función recibe `supplier_org_id` explícito **porque es un núcleo interno**, NO porque sea seguro aceptar ese parámetro de un navegador, WhatsApp o Edge Function. El adaptador externo deberá derivarlo de credenciales válidas.

- **Bloqueo transaccional:** bloqueo de fila de ronda `FOR UPDATE` antes de mirar revisiones, eventos o versiones. Cada invocación corre en una única transacción PostgreSQL; cualquier error revierte todas sus operaciones.
- **Idempotencia:** ID externo de evento convertido a UUID por backend, único por ronda, huella SHA-256 calculada por SQL sobre payload normalizado. Repetición idéntica devuelve comprobante marcado `repetido:true`. Mismo ID con contenido diferente o otra acción/proveedor: error. Ningún evento de confirmación se agrega sin su versión definitiva en el mismo bloque transaccional.
- **Control optimista:** `p_expected_revision` protege borradores concurrentes; el primer borrador es revisión 1 y cada corrección incrementa exactamente 1. Una confirmación nueva de revisión anterior falla.
- **Oferta confirmada inmutable:** D024 conserva eventos y versiones previas con rechazo de UPDATE/DELETE, incluso cuando hay nueva corrección y versión posterior.
- **Validación de contenido:** seis claves económicas exactas (moneda, pago, días, flete final, mínimo de compra, líneas). Líneas de cinco claves estrictas D024: sin teléfonos, proveedores, textos libres, ID ajenos, unidades o IVA inventados. Precios/IVA nulos se mantienen nulos; **una cotización puede ser confirmada pero no comparable**. IA nunca firma equivalencia técnica.
- **Cierre o cancelación:** bloquea nuevos borradores y confirmaciones. Un replay idéntico de un evento ya confirmado puede devolver su recibo histórico incluso después del cierre, **sin nueva mutación**.

## Pruebas
`supabase/tests/ci/101_round_offer_atomic_write.sql`: rol y grants, empresa y proveedor invitados, proveedor no invitado, precio/IVA y campos extra maliciosos, borrador inicial, replay, colisión de evento, stale revision, confirmación explícita, versión 1/2, confirmación duplicada, historial económico preservado, cancelación, rollback de todos los datos sintéticos. El runner real está en `.github/workflows/postgres-rls.yml`, sin subir una migración oficial trece.

**Advertencias:** todavía no hay prueba HTTP/WhatsApp auténtica, identidad verificada en tiempo de mensaje, consentimiento de canal, colas/antispam, homologación técnica, comparación conectada ni control de simultaneidad distribuida entre workers (el SQL serializa sobre la ronda, pero CI aún no prueba dos conexiones concurrentes). No llamar al módulo «licitaciones funcionando». RLS y permisos de la base no sustituyen la verificación de actor del broker.

## UX-001
El proveedor contestará naturalmente por WhatsApp; Cotironda guardará borrador y responderá con un resumen breve para confirmar. El sistema no forzará login ni planillas manuales para confirmar precios; esa UX requiere desarrollar el adaptador autenticado de conversación en D027 y probar con personas no técnicas.

**Sin despliegues, sin Whapi, sin uso de OpenAI, sin nuevas reservas de IA y sin cambio en el registro de clientes.**

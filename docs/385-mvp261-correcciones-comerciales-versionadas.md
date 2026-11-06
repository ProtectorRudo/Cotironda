# Decisión 385 — MVP261: versiones de presupuestos de proveedor, sin fusionar correcciones parciales

Fecha: 06/11/2026. **Solo desarrollo**. Aprobación «Luz verde», sin publicación del PILOTO, producción ni mensajes reales.

## Hallazgo y solución

La RPC privada de seguimiento MVP227 ya se protege ante una fuente nueva: elige el último mensaje vinculado de cada proveedor, y solo lo muestra si su nueva revisión fue **verificada**. Una corrección incompleta en revisión oculta el presupuesto anterior: nunca se le suman importes históricos para aparentar cobertura completa.

Agregamos un **ledger privado de versiones de fuentes**, no un modelo de memoria con poder de reescribir una cotización. El proveedor puede responder libremente en una nueva fuente ya vinculada a la ronda: «corrijo», «ahora vale», «te cambio», una planilla o un nuevo presupuesto formal. La clasificación semántica sigue en el lector existente y la verificación de precio e ítems en MVP225/MVP227. El ledger versiona la fuente **después** de que el lector la deje en `verified` o `review`.

## Arquitectura

- `supplier_source_versions_mvp261`: tabla privada `RLS` y sin acceso directo (ni `service_role`). Cada mensaje HMAC tiene un único número de versión por `request_id` + `supplier_key`, SHA fuente, estado de revisión al cierre y puntero a la versión anterior; no contiene importes, mensajes ni contactos.
- `cotironda_piloto_record_source_version_mvp261(chat_hmac,message_hmac,source_sha256)`: deriva ronda/empresa del **mensaje recibido** y **review terminada**; valida mismo HMAC de chat, SHA, asociación SQL, rol, consentimiento y vencimiento. Bloquea la fila de participante para impedir carreras entre mensajes y bajas. Rechaza una fuente antigua si existe otra posterior, usando exactamente el orden de `whapi_inbox.received_at` de MVP227. Cap de 25 versiones por ronda-proveedor.
- No reescribe `ai_supplier_review_mvp227`, la fuente, la memoria histórica, el ranking, la adjudicación ni ninguna outbox. Un mensaje nuevo parcialmente cotizado conserva `review`; no hereda artículos ni precios previos.
- La ruta de IA del proveedor llama al ledger después de confirmar el `finish`, **solo** con `COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED === 'true'` (OFF por defecto en ambas entradas: texto directo y aclaración). Ante resultado incierto requiere conciliación; no corre nuevamente el modelo ni WhatsApp.
- Cada fuente mantiene su estado original en el ledger y los datos privados no se incluyen en la proyección del comprador.

## Pruebas y criterio de aceptación

- PostgreSQL 17 con rollback: primera versión, segunda parcial `review`, replay idempotente, fuente SHA alterada, proveedor ajeno, intento tardío desordenado, baja de consentimiento, cero mutaciones del presupuesto previo, permisos `anon`/authenticated y RLS.
- Node: bandera OFF conserva flujo MVP227/260; ON archiva después de finish; si está en revisión no hereda importes; pérdida de confirmación no reinterpreta la fuente.
- GitHub CI: test unitarios, Deno, PostgreSQL, Next.js y regresión de la web y el proveedor.

## Límites

Esta no es aún comprensión fiable de cualquier instrucción de cambio parcial: en lugar de calcular diferencias de precios de mensajes incompletos, se conserva la nueva fuente y se pide revisión si no pasa las reglas existentes. Para una corrección de un solo artículo con continuidad del resto, será necesario un mecanismo de **enmiendas por línea con cotejo individual** y consentimiento de aplicación, sin inventar el resto del presupuesto. La prueba comercial real de dos rondas simultáneas sigue pendiente. No declarar etapa 6 cerrada por este ledger.

La siguiente etapa 7 consistirá en una **supervisión solo lectura** con señales de bloqueo, costos y anomalías, sin permitir al supervisor enviar WhatsApp o decidir ganadores.

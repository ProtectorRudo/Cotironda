# Decisión 383 — Etapa 6: memoria comercial privada por ronda y participante (MVP259)

Fecha: 06/11/2026. **Desarrollo exclusivamente; ninguna actualización del PILOTO o producción.**

## Problema

Un resumen del chat completo sin límites de identidad podría mezclar dos obras del mismo arquitecto, dos conversaciones con el mismo corralón o cotizaciones ya corregidas. Tampoco puede considerarse fiable una afirmación de la IA que contradiga el documento original.

## Primer contrato integrado

`supabase/piloto/mvp259_commercial_memory_scoped.sql` usa los libros existentes de WhatsApp, rondas IA Central, catálogo de rubros y revisión verificada de presupuestos. Se agrega únicamente un registro de **punteros de procedencia**, no un almacén de conversaciones libre.

- **Clave de aislamiento:** `request_id + participant_key + message_hmac + fact_kind`, única e idempotente.
- Solo dos hechos admisibles: `buyer_delivery_city_verified` (fuente original del pedido y zona confirmada) y `supplier_quote_verified` (mensaje del proveedor ligado a esa ronda, SHA256 exacto y estado `verified` en el libro de revisión).
- `cotironda_piloto_remember_commercial_mvp259`: verifica HMAC del chat, rol comprador/proveedor, consentimiento vigente, ronda, invitación y catálogo, source SHA y el hecho concreto. Una baja posterior bloquea nuevas escrituras; se bloquea el registro de participante durante la operación para no ganar carreras. Cap de 40 fuentes por participante/ronda.
- Vencimiento máximo: fecha de cierre de la ronda +14 días y nunca más de 30 días desde el registro. La lectura ignora automáticamente entradas vencidas.
- `cotironda_piloto_commercial_context_mvp259`: snapshot **fresco**, no acumulación de texto generado por IA. El comprador solo recibe conteo por rubros del pedido; el proveedor solo los artículos de los rubros **efectivamente asignados a él**. La localidad proviene de la ronda. Para un proveedor, la cotización es «última verificada» solo si la **última revisión** en la misma ronda sigue verificada; una revisión nueva pendiente invalida la afirmación anterior.
- Los resultados no contienen mensajes, SHA, HMAC, teléfonos, nombres, valores de productos, contactos ni importes. Las banderas `contains_prices`, `contains_contacts` y `automatic_decisions_allowed` son siempre `false`.
- Tabla privada RLS, con `REVOKE` directo a PUBLIC/anon/authenticated/service_role. RPC `service_role` únicamente.

## Evidencias requeridas

- PostgreSQL 17 con `ROLLBACK` y pruebas Node: comprador A vs B, proveedor A vs B, fuente falsa, tipo de hecho no autorizado, doble registro, ciudad/rubros por rol, corrección de oferta posterior, baja de consentimiento, expiración, ACL y ausencia de PII.
- Regresión general en GitHub para asegurar que la nueva migración no modifica consultas de seguimiento, workers o WhatsApps.
- No afirmar uso real de memoria por IA Central hasta conectar explícitamente el snapshot a la orquestación con autorización de lectura, control de token, máximo de datos y respuestas no inventadas.

## Alcance pendiente de la etapa 6

Esta entrega **inicia** Memoria Comercial, pero no permite todavía una conversación de varios mensajes en la que IA Central aplique de forma segura las correcciones de cantidades, presentación o precios. Esos cambios requieren interpretación con evidencia, versionado del hecho, ámbito de proveedor y fuente documental **antes** de actualizar el contexto. Se deberán definir comandos y límites para el modelo, política de retención y auditoría de coste; nunca se reaprovecharán hechos de otra ronda ni de otra empresa.

El cierre operativo requiere conversaciones reales de dos rondas simultáneas con distintas respuestas, comprobación de que se corrige la ronda correcta y pruebas de TTL/revocación en el entorno autorizado.

El proyecto prioriza las siete etapas en desarrollo; este PR no habilita automáticamente etapa 7 ni publicación del PILOTO.

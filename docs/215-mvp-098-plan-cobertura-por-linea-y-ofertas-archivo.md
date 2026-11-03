# MVP-098 — Cada artículo se conserva, clasifica y cubre por proveedor

02/11/2026 · Issue #406 · En desarrollo **PILOTO solamente**, sin producción

## Hallazgo comercial real
La imagen del arquitecto procesada por OpenAI contenía **tres renglones**:
- `10 Cemento`, unidad **no especificada**
- `2 Arena`, unidad y variante fina/gruesa **no especificadas**
- `288 Huecos del 12`, unidad **no especificada**

El original JPG quedó archivado (127.213 bytes, SHA256 comprobado), pero **NO se creó licitación**. La localidad de entrega no constaba. No debemos suponer que cemento significa bolsas, arena significa m³ ni ladrillos significa unidades si el comprador no lo indicó. Especificaciones y unidades faltantes deben señalarse sin descartar líneas, y la pregunta por localidad debe ocurrir una sola vez mediante el módulo contextual MVP-097.

## MVP-098: entregado
1. Tabla privada `document_lines_mvp098`, una fila por cada línea del documento y por número original, con descripción, cantidad, unidad literal, evidencia textual del modelo, familia candidata y primer motivo de bloqueo. `message_hmac,line_no` es la clave idempotente. Mantiene referencia al documento original íntegro.
2. RPC `cotironda_piloto_plan_document_mvp098` recibe **solo el HMAC de un archivo ya registrado, privado y procesado por IA del comprador consentido**. Construye un plan conservador. La IA jamás crea un proveedor ni un precio por sí misma. `arena` genérica queda como familia no resuelta, no se convierte en arena fina o gruesa. Los materiales con cantidad pero unidad ausente quedan marcados `missing_unit`. La clasificación `ladrillo_hueco` a partir de «Huecos del 12» es preliminar y jamás sustituye el texto original.
3. RPC `cotironda_piloto_document_coverage_mvp098` propone **proveedores por línea** mediante categoría del catálogo y localidad de entrega, con estado explícito `catalogue_confirmed` que no puede inventarse. Actualiza la cobertura al recibir posteriormente la localidad sin reprocesar el archivo. `source_verified=false` indica que la propuesta IA requiere corroboración de fidelidad antes de distribuir y no representa stock ni oferta aceptada.
4. Tabla privada `supplier_media_quotes_mvp098` y RPC `cotironda_piloto_record_supplier_media_mvp098`: al recibir archivo PDF/imagen/Excel de proveedor consentido en **una única ronda activa**, registra el documento original por SHA256, total textual declarado y cantidad de renglones como `awaiting_fidelity_check`. El original y TODAS las líneas extraídas siguen en `media_archive_mvp095`; cargos extras como pallets jamás se eliminan. El recibo NO modifica `offer_versions` ni afirma que los importes estén verificados.
5. El receptor Whapi llama automáticamente a la planificación o al registro documental una vez que la fuente está archivada y la propuesta IA validada. Sin cambios en el despacho actual, tracking, costo, ranking ni el consentimiento.

## Pruebas y seguridad
- `mvp098_smoke_rollback.sql` simula imagen con 3 líneas originales, repetición/idempotencia, faltantes de unidad, variante arena no supuesta, localidad confirmada, cobertura real por dos proveedores, catálogos declarados pero todavía no confirmados, permisos RLS, y PDF de proveedor con cemento + pallet vacío + TOTAL literal, sin escribir cotizaciones verificadas. Revierte todos los datos sintéticos.
- `tests/unit/mvp098-ruteo-por-linea-y-archivo-proveedor.test.mjs` cubre integridad y controles en el webhook/SQL.
- Sólo `service_role` puede llamar estos RPC, sin abrir los datos de empresa al navegador.
- No hay llamadas a Whapi/OpenAI durante las migraciones o los ensayos.

## Pendiente esencial para punta a punta
- Verificar extracción visual contra el documento original sin pedir aprobación por artículo claro; cuando falta un dato vital, preguntar únicamente ese dato y conservar el resto.
- Tomar un pedido documentado y con unidad, localidad y especificaciones suficientes, convertirlo en solicitud verdadera con **subpedidos por rubro y proveedor**, sin forzar que cada proveedor cubra toda la lista.
- Catálogos confirmados por cada negocio; en el piloto los proveedores tienen categorías curadas en `catalogue_lines` pero `catalogue_confirmed_at` sigue NULL: no afirmar stock ni habilitar envíos a proveedores nuevos.
- Analizar PDF/Excel/foto de presupuesto proveedor con TODOS los renglones extras e importes literalmente, comprobar precios y total sin cambiarlo, anonimizar y comparar cobertura/competitividad sin equiparar totales parciales. Cierre 4 días y hasta dos finalistas con consentimiento y notificación auditada.
- Sin inventar avances E2E ni habilitar producción con esta etapa sola.

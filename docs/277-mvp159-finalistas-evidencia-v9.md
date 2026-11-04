# MVP159 — Finalistas con evidencia documental v9 (sin ranking engañoso)

03/11/2026 · Issue #521 · SOLO `cotironda-piloto`.

## Problema observado
El planificador `cotironda_piloto_plan_coverage_finalists_mvp108` solo buscaba PDFs publicados por el circuito antiguo `anonymous_supplier_docs_mvp107`. Los dos PDF reales de Ailín/Nahuel de la ronda 469cb459... ya están validados en `supplier_evidence_mvp138` v9 y mostrados anónimamente, pero no hay registro antiguo. El planificador los ignoraría al vencimiento. Más grave: no hay ninguna habilitación actual de notificaciones finales (`finalist_activation_mvp113.enabled=false,activated_at=null`). Eso es una protección intencional contra backfill y se mantiene sin modificar.

## Solución
Unificar **fuentes de verificación** dentro del mismo planificador: (a) documento validado por el camino histórico sin evidencia posterior y (b) evidencia moderna `supplier_evidence_mvp138` versión 2 a 9, estado `verified/covered`, `public_text` no nulo, importes comprobados, mismo SHA, comprador/proveedor consentidos, respuesta dentro de plazo. Una revisión posterior pendiente v10 invalida la anterior: nunca utilizar un documento viejo si llegó una corrección más nueva que aún no está verificada. `UNION` evita contar dos veces un archivo que figure en ambos caminos. La oferta más reciente prevalece por proveedor, incluyendo correcciones en texto.

**El nivel de cobertura no se suaviza**: familia, descripción exacta, unidad, cantidad, importe real y asociación 1:1. Por eso BIG BAG de Arena/Piedra sin especificación y unidad clara no se convierte en arena fina 1 m³/piedra partida 2 m³. Fuente fiel visible al comprador no significa coincidencia técnica ni habilita comparación total o contacto.

El plan insertado es privado e inmutable. No se envía WhatsApp, no se habilita el interruptor de finalistas, no se cierra ninguna ronda antes de plazo, no se muestran contactos ni se modifica `main`/producción. Los avisos de finalistas deberán activarse explícitamente para **una nueva ronda posterior**, cuando haya evidencia suficiente y comprobaciones de consentimiento; la actual no es elegible bajo esa barrera.

## Pruebas
SQL PG17 con `BEGIN/ROLLBACK` y archivos y rondas **sintéticos**, sin cambios persistidos: dos PDFs exclusivamente v9 equivalentes => 2 alternativas; nueva v10 `needs_source_review` invalida la respuesta previa => solo 1; BIG BAG genérico sin unidad => cero; idempotencia del plan, cero avisos en cola, activación apagada, permisos. Además pruebas unitarias y regresiones actuales, 6 CI GitHub. Verificar después de migrar que la ronda real abierta sigue `waiting` y sin selección anticipada.

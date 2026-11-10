# Acta 481 — MVP345: separar ronda asociada de oferta comercial publicada

**Fecha:** 10/11/2026. **Estado:** desarrollo, sin publicar. **Rama:** `fix/mvp345-replay-estado-comercial-honesto`. **Base:** MVP344 PR #754, dependiente de MVP343 #752 y MVP336 #742.

## Bloqueo que resuelve

El worker histórico `procesarPendienteAutomaticoMvp292` informaba `linked_private` tan pronto el correlador vinculaba el PDF con una ronda, **incluso si** `reprocesarOriginalHistoricoMvp292` había rechazado la publicación comercial por contradicción de importes, falta de fidelidad de fuente o incertidumbre. Eso podía producir un falso positivo durante el piloto.

## Cambio mínimo

- La vinculación ya verificada permanece registrada como `linked` en el ledger de correlación. No se revierte una asociación correcta solo porque el presupuesto no sea publicable.
- Si el replay confirma `published_private`, el resultado es `linked_private / archive_quote_published_anonymous`.
- Si necesita comprobación económica o de fuente, el resultado es `review_required`, con un código específico para unitario contradictorio.
- Si el replay es incierto, devuelve `reconciliation_required`, no éxito.
- Si está deshabilitado/no elegible, devuelve `review_required`, nunca publicación confirmada.
- Sin cambios en SQL de publicación, autenticación, fuente SHA, reglas de IVA/flete, ranking, permiso, integridad ni flujo de mensajes. No se llama OpenAI ni Whapi adicionalmente.

## Pruebas y criterios

Pruebas sintéticas Node para cinco resultados del replay: publicación verdadera, diferencia de precios unitarios, fuente no comprobada, reconciliación pendiente y replay no elegible. En todos los casos se exige 0 mensajes de salida, único finish del ledger y asociación privada conservada. Se requieren regresiones de MVP292, MVP343, MVP344, Deno y CI antes de considerar el cambio apto para despliegue.

## Lo que sigue impidiendo E2E

Esta mejora corrige la **visibilidad del estado**, no los importes. El PDF original privado de Ailín sigue necesitando nueva lectura económica con evidencia de columnas, precios y condiciones, y una versión corregida auditable que pase los controles MVP102/103/106/248. No hay acceso desde las herramientas actuales a los bytes del Storage privado para releerlos en este turno; ningún importe real fue reparado. Sigue prohibido publicar presupuestos con diferencias y pedir al proveedor un reenvío por una falla nuestra.

**No se ejecutó SQL de escritura, no se modificó el piloto y no hubo despliegues ni mensajes WhatsApp.** `Luz verde` no equivale a `Publicalo`.

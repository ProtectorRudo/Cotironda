# Acta 512 — Publicación controlada B5n/B4 y relectura real del PDF

**Fecha:** 11/11/2026. **Orden:** «Publicalo» para **Supabase `cotironda-piloto` exclusivamente** (ID `ilggkalaafhtiysyzlmg`). **Código publicado:** commit `ef9a3fcf273031d0ea6ba105515a279074d02c17`, [PR #783](https://github.com/ProtectorRudo/Cotironda/pull/783) (sin merge; sigue draft). **Referencia técnica:** [Acta 511](docs/511-v2-b5n-b4-una-sola-ejecucion-sin-secretos.md).

## Preflight real y controles

- Se validaron **6/6 workflows generales de GitHub** y **4/4 trabajos B5n/B4** del commit autorizado (Node, Deno/PDF.js, PostgreSQL 17 con ROLLBACK, regresión completa, build Next.js, HTTP PostgREST y seguridad).
- Piloto: Edge `cotironda-piloto-v2-shadow` **v10 ACTIVE** y cron documental `cotironda_piloto_document_recovery_5min` activo (job ID 3), con su autenticación de Vault intacta y respuesta 200 anterior a la ventana.
- Cinco flags OFF, B5k=1, B5m=1, B5n=0, leases=0. B5m anterior con `economic_total_balances=true`, `coverage_conditions=5`, `coverage_conditions_matched=3`; mismo SHA y proveedor exigido para el próximo lease.
- WhatsApp: 6 registros salientes históricos (5 `api_accepted`, 1 `cancelled`); ofertas anónimas nuevas=0; versiones de ofertas=1; mensajes de finalistas=0.
- RLS privada activa; ni `anon` ni `authenticated` pueden ejecutar las RPC internas.

## Cambios realmente publicados

1. Migración exitosa `cotironda_v2_b5n_b4_one_shot_gate_20261111`, registrada como `20261111180936`. Fuente exacta: `supabase/piloto/v2_b5n_b4_one_shot_lease_window.sql`.
2. No hubo cambios en archivos Edge, credenciales, Vault, cron, WhatsApp, Vercel, producción ni interfaz; Edge V2 permanece **v10 ACTIVE** con SHA `a4bc4dd0f42fabba725650063c4b006339ba5482f816ac630ba4120b351e533e`.
3. Se constató con flags OFF que ambos gates `cotironda_piloto_v2_shadow_enabled_b4` y `cotironda_piloto_v2_b5k_only_enabled` devolvían FALSE y que `anon/authenticated` no recibieron permisos.
4. Ventana privada armada **18:10:09 UTC** mediante actualización con guardas de fuente B5m, ausencia de B5n/leases, cron activo y ausencia de salida WhatsApp pendiente. Puente B4 devolvió TRUE. **No se accedió ni transportó un secreto de Vault**.
5. El cron ya autorizado se ejecutó a **18:15:00 UTC**, estado cron `succeeded`; la solicitud documental devolvió HTTP 200 y `no_eligible_document` para su cola habitual, lo cual NO impide la ejecución independiente de B4.
6. **A las 18:15:05 UTC**, el claim privado B5n reservó el PDF histórico y apagó **ambos flags en la misma transacción**. La función terminó con **un único diagnóstico B5n `private_diagnosed`**. Confirmaciones posteriores: 5 flags OFF, ambos gates FALSE, 0 leases, 1 B5n completo.

## Comparativa comercial real (solo indicadores, sin texto del proveedor)

| Indicador | B5k | B5m | B5n |
|---|---|---|---|
| Estado | `private_diagnosed` | idem | idem |
| Fuente SHA | misma | misma | misma |
| Materiales aritméticamente comprobados | 3 | 3 | 3 |
| Coincide subtotal de materiales | false | true | true |
| Condiciones atribuidas/total | 4/5 | 3/5 | 3/5 |
| Cobertura | `line_assignment_ambiguous` | igual | igual |
| Primera condición no atribuida (ordinal) | no disponible | no disponible | **4** |
| Motivo estricto de atribución | no disponible | no disponible | **`source_part_mixed`** |
| Económico | `fiscal_or_freight_ambiguous` | igual | igual |
| Moneda ISO corroborada | false | false | false |
| Publicación / ranking / revelación | false | false | false |

**Hallazgo nuevo:** la cuarta condición aparece mezclada con contenido de otro tipo **dentro de un mismo fragmento extraído de PDF.js**. El arreglo B5n de puntuación externa no resolvió el original. **No relajar la evidencia ni forzar substring**: distinguir con justificación espacial/fuente los fragmentos mixtos o registrar revisión conservadora; no alterar históricas B5k/B5m/B5n ni repetir el replay consumido.

**El subtotal de materiales conciliado NO es el total final pagadero.** El flete está mencionado pero sin precio acreditado y el símbolo `$` no permite deducir moneda ISO, ni que IVA esté incluido o excluido de modo general.

## Postflight real

- B5k=1, B5m=1, B5n=1; los tres comparten **un** HMAC de fuente y **un** SHA256 de archivo; cada evidencia sigue separada por `processor_version`.
- Todos los cinco flags OFF, B4 y modo B5n FALSE, 0 leases.
- `whapi_outbox=6`, `anonymous_offers_mvp091=0`, `offer_versions=1`, `finalist_whapi_outbox_mvp110=0`, B5j histórico=2, workers sombra históricos=2: sin cambios de conteo.
- RLS del ledger activa; `anon` sin SELECT ni B4; `authenticated` sin claim.
- No se modificó producción ni se enviaron WhatsApps.

## Estado del piloto y próximos hitos

La ejecución privada de B5n y el apagado automático **sí quedaron comprobados realmente**. La lectura comercial del presupuesto **sigue pendiente de cobertura plena**, por razón `source_part_mixed` en la condición 4/5. La base tenía 4 presupuestos en `awaiting_fidelity_check`, 10 líneas de cotizaciones y 1 revisión de IA en estado `review` (consulta del mismo día); la publicación anónima nueva continúa en 0.

La siguiente etapa **no** es añadir otro replay ciego. Corregir y ensayar atribución determinista de partes PDF.js mezcladas sin fabricar cargos/IVA/condiciones; después probar equivalencias, ranking comparable por rubro, preliminar del arquitecto y cierre con WhatsApp de punta a punta. No anunciar piloto E2E completo.

**Rama documental separada**, sin edición posterior del commit publicado ni integración automática.

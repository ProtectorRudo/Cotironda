# Acta 507 — Despliegue controlado y diagnóstico real B5m en cotironda-piloto

**Fecha:** 11/11/2026. **Autorización:** «Publicalo» solo para Supabase `cotironda-piloto`. **GitHub fuente de versión:** `925011712a8f15a205e276b084709cffb3717879` ([PR #778](https://github.com/ProtectorRudo/Cotironda/pull/778), todavía sin merge). **Sin producción ni WhatsApp nuevos.**

## Preflight comprobado
- 6/6 workflows `pull_request` SUCCESS en el commit de publicación (Next.js, Node, Deno, PostgreSQL 17, PostgREST, verificación sitio).
- Edge sombra V2 v8 ACTIVE, 23 archivos, SHA previo `d4adbd590a5c4381e9fabdd0fe0cb746bb651438f046f706b1c68b044376c40b`.
- Cinco flags (`enabled`, `b5h_only`, `b5i_only`, `b5j_only`, `b5k_only`) FALSE, 0 leases.
- 1 diagnóstico B5k histórico; 0 B5m; un PDF histórico elegible según cadena SHA/proveedor y los dos bloqueos ya registrados. Sin pendientes salientes Whapi (`api_accepted=5`, `cancelled=1`).
- `anonymous_offers_mvp091=0`, `offer_versions=1`, `whapi_outbox=6`, `finalist_whapi_outbox_mvp110=0`, `v2_pdf_economic_diagnostics_b5j=2`, `v2_supplier_shadow_runs=2`.

## Publicación real
1. Aplicada con éxito migración `cotironda_v2_b5m_replay_privado_versionado_20261111`, basada exactamente en `supabase/piloto/v2_b5m_private_pdf_replay_versioned.sql` del commit autorizado. Reutiliza tabla privada, amplía check de versión a B5k/B5m y reemplaza RPC privadas. No se altera la evidencia antigua.
2. Post-SQL: cinco flags OFF, RLS ON, roles `anon` sin SELECT ni claim, 1 B5k preservado, 0 B5m.
3. Edge `cotironda-piloto-v2-shadow` desplegada **v9 ACTIVE**, SHA paquete `b9ddf9f92e655920eed99e16c8f123991a548cab2fa0b88cc256b049cc6200df`. Se recuperaron los 23 archivos de la función v8 y se sustituyeron **solo** tres por el contenido GitHub del commit auditado: `reconciliacion-economica-b5j.ts`, `auditoria-cobertura-original-b5l.ts`, `worker-moneda-original-b5k.ts`. El resto quedó copiado sin alteraciones.
4. Se habilitó temporalmente solo `enabled=true,b5k_only=true`. Se realizó **una** invocación manual por el puente interno documental existente, usando el secreto de Vault únicamente dentro de la base, `pg_net` request **2498**. HTTP **200** del puente (respuesta `no_eligible_document` para la cola documental normal); en paralelo B4 invocó V2 y B5m generó una nueva evidencia privada `private_diagnosed`.
5. Los cinco flags se desactivaron inmediatamente después de observar el nuevo diagnóstico. No se crearon cron, llaves, tablas públicas ni llamadas a IA en B5m.

## Comparación real anonimizada

| Indicador | B5k anterior | B5m nuevo |
|---|---|---|
| Estado | `private_diagnosed` | `private_diagnosed` |
| Moneda | `uniform_dollar_symbol_iso_unstated` | igual |
| Moneda ISO corroborada | false | false |
| Materiales con aritmética cotejada | 3/3 | 3/3 |
| Coincidencia de suma material con importe candidato | false | **true** |
| Código económico | `fiscal_or_freight_ambiguous` | igual |
| Código de cobertura | `line_assignment_ambiguous` | igual |
| Filas PDF.js declaradas en la lectura | 13 | 13 |
| Filas atribuidas hasta detención | 8 | 8 |
| Filas no atribuidas al detenerse | 5 | 5 |
| Condiciones comprobadas hasta detención | 4/5 | **3/5** |
| Publicar / rankear / revelar contactos | false / false / false | igual |

**Conclusión:** se comprobó la mejora de subtotal de materiales aun con flete mencionado sin precio. NO se comprobó un total final pagadero, ni moneda ISO, ni cobertura completa. La caída de 4/5 a 3/5 atribuciones no demuestra por sí sola pérdida de precisión; puede reflejar un criterio más conservador. Investigar sin relajar el control en [Issue #779](https://github.com/ProtectorRudo/Cotironda/issues/779).

## Postflight comprobado
- Cinco flags OFF, **0 leases**.
- B5k histórico intacto y B5m nuevo registrado; B5j=2 y V2 fuentes sombra=2, sin cambios.
- `anonymous_offers_mvp091=0`, `offer_versions=1`, `whapi_outbox=6`, `finalist_whapi_outbox_mvp110=0`: no se crearon ofertas ni salidas nuevas.
- No se actualizaron funciones Whapi ni seguimiento, Vercel ni producción. Los estados de Vercel asociados al commit seguían afectados por límite de builds; GitHub Actions Next.js sí aprobó.
- PR #778 permanece abierto sin merge. Código/SQL publicados únicamente en piloto. **No anunciar E2E completo.**

## Próximo paso
Priorizar la fidelidad del PDF en el punto de atribución y, sin más relecturas de la misma versión, continuar con la prueba de recorrido real: arquitecto → WhatsApp proveedores → recepción por múltiples formatos → validación económica y equivalencias → vista preliminar por rubro → revelación al cierre. No inferir IVA, flete ni ISO ARS a partir del silencio o del símbolo `$`.

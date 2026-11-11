# Acta 501 — publicación piloto B5j y resultado REAL de dos PDF históricos

**Fecha:** 11/11/2026. **Autorización:** «Dale» como aceptación de la propuesta inmediata de publicar B5j **solo en el piloto** y ejecutar los dos PDF. 
**Destino exclusivo:** Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`).
**Código publicado:** `e2e7dd5fe3779636f0be7c491517a2b143e46e16`, [PR #774](https://github.com/ProtectorRudo/Cotironda/pull/774) apilado sobre #773, todavía **DRAFT, abierto, sin merge**.

## Preflight verificado

- Seis workflows de GitHub del commit de código: **SUCCESS** (Node, Deno/PDF.js, PostgreSQL 17 con rollback, Next.js, PostgREST, sitio).
- Regresión de desarrollo: **3.843 tests: 3.833 aprobados, 10 omitidos, cero fallidos**.
- Supabase piloto: Edge `cotironda-piloto-v2-shadow` versión **6 ACTIVE** antes de despliegue; flags V2/B5h/B5i OFF; no existía B5j; dos fuentes históricas B5i elegibles; B5d=3, B5g=2, B5h=2, B5i=2; cero mensajes salientes pendientes. Token interno existente validado por SQL sin exposición.

## Publicación controlada

1. Migración `cotironda_v2_b5j_private_economic_reconciliation_20261111` aplicada exitosamente **ANTES** de actualizar Edge. RLS ON y `anon/authenticated` sin lectura ni ejecución de RPC privadas; `service_role` habilitado. Nueva columna `b5j_only` con valor inicial FALSE; los cuatro flags siguieron OFF.
2. Edge privada `cotironda-piloto-v2-shadow` desplegada como **versión 7, ACTIVE**, con 20 archivos. Hash de empaquetado `36f30b0d1b5d738ac39b06c48eb14670f590bec1f203b1760a8650a0982faa13`.
3. Se reutilizó el contenido de la Edge v6 para dependencias existentes y se cargaron desde el commit exacto únicamente los cuatro módulos nuevos/modificados (index, handler, conciliador, worker B5j). La autenticación y lector firmado Whapi no cambiaron. Sin claves nuevas.
4. Activación SQL temporal y exclusiva `enabled=true,b5j_only=true,b5h_only=false,b5i_only=false`.
5. Dos llamadas al puente interno existente con token leído del Vault **dentro de Postgres**, pg_net solicitudes **2461** y **2462**, ambas HTTP **200**; se produjeron exactamente dos diagnósticos privados en B5j, ningún proceso `leased`.
6. Apagado SQL posterior obligatorio de los cuatro flags y verificación explícita **`enabled=false,b5h_only=false,b5i_only=false,b5j_only=false`**. La RPC de claim en ese estado retorna `disabled`.

## Resultados auténticos de conciliación

| Comprobación | PDF histórico 1 | PDF histórico 2 |
|---|---|---|
| Estado B5j | `private_diagnosed` | `private_diagnosed` |
| Código económico | `grand_total_balances_private` | `currency_ambiguous` |
| Materiales en la extracción | 2 | 3 |
| Materiales con aritmética cotejada por B5j | 2 | 0 (control previo) |
| Notas | 0 | 2 |
| Cargos/descuentos independientes | 0 / 0 | 0 / 0 |
| Condiciones comerciales | 3 | 5 |
| Condiciones corroboradas por B5j | 3 | 0 (control previo) |
| IVA / flete | `not_mentioned` / `not_mentioned` | `not_mentioned` / `not_mentioned` (sin llegar al control) |
| Suma coincide con cifra declarada | Sí | No comprobada |
| `source_verified`, `full_document_covered`, `can_publish`, `can_rank` | **FALSE** todas | **FALSE** todas |

**PDF 1:** dos renglones materiales fueron conciliados aritméticamente, tres condiciones corroboradas literalmente, y la suma de sus renglones coincide con el importe candidato al pie. Esto **NO** demuestra la cobertura integral del original, el rótulo final del importe ni IVA/flete; sigue siendo solo `grand_total_balances_private`.

**PDF 2:** B5j detuvo el análisis en `currency_ambiguous`, **antes** de comprobar la suma. El campo `candidate.currency_declared_raw` carece de un marcador explícito ARS/$ reconocido, aunque los **tres precios unitarios y los tres totales de renglón extraídos contienen un símbolo `$`**. Los símbolos en la extracción no prueban por sí solos que la moneda esté documentada, ni conviene inferirla por ubicación geográfica. El siguiente cambio debe cotejar la moneda directamente con todas las filas originales SHA verificadas, sin depender únicamente de un campo de cabecera de IA. **No declarar el PDF 2 económicamente incorrecto.**

## Seguridad y postflight

- V2, B5h, B5i y B5j **todos apagados**, RPC privada no operativa fuera de la ventana.
- B5j 2 registros completos, **0 leases**.
- B5d=3, B5g=2, B5h=2, B5i=2, sin cambios.
- **0** versiones nuevas de oferta desde que comenzó la ventana B5j.
- **0** ofertas anónimas públicas.
- **0** mensajes salientes WhatsApp pendientes.
- Tabla B5j: RLS activo, SELECT y RPC de escritura/claim denegados a `anon` y `authenticated`. Supabase Security Advisor informa `rls_enabled_no_policy` de nivel INFO para la tabla privada; configuración cerrada intencionalmente.
- Sin despliegue a producción, Vercel ni WhatsApp. Sin cambios de cron ni de contactos.

## Criterios siguientes

- **B5k:** diagnóstico y corroboración directa de moneda según texto/celdas originales, coherencia de símbolos en todos los ítems y condiciones, sin suponer ARS; preservar códigos de incertidumbre si hay varias monedas u omisión real. Después reauditar el PDF 2 con nuevo ledger/versionado sin reabrir B5j.
- **Cobertura integral:** auditar que la fuente y su texto extraído no tengan rubros/cargos/IVA/flete/descuentos omitidos; verificar cantidades, unidades y descuentos documentales, pagos y disponibilidad; recién entonces considerar cómo exponer ofertas anónimas y ranking.
- Ejecutar otra prueba **nueva** y completa por WhatsApp: arquitecto → proveedores → cotizaciones recibidas → lectura económica → ofertas anónimas → cierre y revelación. Nada de lo anterior equivale a E2E verificado.

**El resultado histórico permanece PRIVADO. Nunca publicar el total del PDF 1 como certificado ni inventar el total económico del PDF 2.**

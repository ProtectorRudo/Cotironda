# Acta 498 — B5i: geometría del importe sin etiqueta

Fecha: 11/11/2026. Autorización: **«Luz verde» (solo desarrollo)**.
PR [#773](https://github.com/ProtectorRudo/Cotironda/pull/773), apilado sobre el PR #772.
**NO desplegar** en piloto, producción ni Vercel sin «Publicalo».

## Evidencia real del origen del problema

La prueba B5h en `cotironda-piloto` encontró, en los dos PDF históricos:
- `unlabeled_amount_found`, exactamente una coincidencia con el importe
  que la IA había declarado total.
- 2/2 y 5/5 renglones cotejados respectivamente.
- Ninguna etiqueta de total documental reconocida.
- `source_total_unverified`, `source_verified=false` y `can_publish=false`.
- La cifra podría representar un total sin rótulo, una celda aislada, un
  concepto comercial diferente o un valor embebido. No inferir su función.

## Decisión de implementación B5i

1. `diagnosticarGeometriaTotalB5i` es determinista, sin red ni IA.
   Busca la coincidencia en la geometría original PDF.js `x/y` y
   distingue valores repetidos, celdas con texto pegado, falta de
   coordenadas, ubicación en un artículo, por encima o debajo de la tabla
   y cercanía de conceptos IVA/flete o rótulos alternativos.
   Analiza si la columna coincide con los totales de materiales, sin
   deducir por ello que sea el total final.
2. **El diagnóstico es limitado y estrictamente categórico.** Solo
   devuelve códigos enumerados, contadores pequeños y
   `source_verified=false`, `can_publish=false`, `can_rank=false`,
   `can_reveal_contacts=false`. No almacena precios, texto de PDF,
   coordenadas, datos personales ni fragmentos literales.
3. `diagnosticarGeometriaHistoricaB5i` utiliza los originales de
   Storage bajo SHA verificado, valida que coincidan todos los artículos
   mediante B5f y ejecuta una sola lectura PDF.js. No usa LLM ni
   altera la candidata histórica o sus auditorías B5d/B5g/B5h.
4. Migración nueva `v2_b5i_private_total_geometry_versioned.sql`
   añade `v2_shadow_settings.b5i_only` **FALSE** inicialmente, más
   un ledger con nueva versión y FK a B5h. Solo fuentes B5h de
   `unlabeled_amount_found` históricas, consentimiento vigente,
   ninguna ronda vinculada, tamaño y SHA verificados, máximo dos
   por hora, una vez por fuente. RLS y RPC `service_role` restringidos.
5. Constraint SQL prohíbe `b5h_only` y `b5i_only` al mismo tiempo.
   Cuando `enabled=true` y `b5i_only=true`, la Edge atiende
   únicamente B5i, **antes** de B5h/B2/B5g/B5d. Cola vacía devuelve
   `queue_empty` y jamás inicia otro flujo; cualquier incertidumbre de
   modo rechaza.
6. Se preserva el guard original de dos credenciales y la ruta normal
   de B3 cuando el modo exclusivo está apagado. Sin cambios en el
   webhook de WhatsApp, cron existente, despacho, rankings, contactos,
   cálculo económico o front-end.

## Verificación y criterios antes de futura publicación

- Node: múltiples coincidencias, importe en artículo, IVA/flete,
  coordenadas ausentes o rotas, rótulos alternativos, importe debajo,
  encima o alineado, valores embebidos y ausencia de precio.
- Worker: archivo SHA original, fuente alterada, revisión si no se
  coteja un artículo, no repetición, resultado DB confirmado, no PII.
- Edge: modo aislado B5i, B5h preexistente y B2 normal intactos;
  autenticación, clave IA ausente en modo sin IA, errores y rechazo de
  falsos permisos de publicación.
- PostgreSQL 17 ROLLBACK: RLS, roles, 2 históricos, exclusión vinculados
  y revocados, sin duplicados ni inyección de datos/PII, modos mutuamente
  excluyentes y ledgers originales intactos.
- Deno: comprobar el lector real `unpdf` y la Edge completa.
- CI de toda la aplicación y build Next.js.
- Para publicar: SQL **primero** y Edge después, ambos flags OFF;
  ventana 2 ticks autenticados, apagad o de ambos flags, lectura de
  códigos reales; cero ofertas nuevas, cero WhatsApp y sin cambios en
  las otras auditorías.

## Límite expreso

**B5i no certifica importes ni resuelve todavía IVA, flete o cobertura
documental.** Un único importe situado debajo de materiales y alineado
con una columna puede ser una pista fuerte, pero **no** habilita
ranking, publicación ni adjudicación. La acreditación final necesita
interpretación inequívoca de la fuente y cotejo económico integral.

Estado del piloto a la fecha del desarrollo: Edge V2 v5, ambos flags
`enabled=false` y `b5h_only=false`, 2 B5h privados existentes.
B5i aún no instalado.

# Acta 509 — B5n: relectura privada versionada para comprobar condiciones PDF.js

**Fecha:** 11/11/2026 · **Autorización:** «Luz verde» = solo desarrollo/CI, **no instalar ni ejecutar en Supabase piloto**. **PR:** [#781](https://github.com/ProtectorRudo/Cotironda/pull/781), apilado sobre [#778](https://github.com/ProtectorRudo/Cotironda/pull/778). **Origen:** [Acta 507](507-v2-b5m-publicacion-y-resultados-reales-piloto.md) (en PR documental #780) y [Acta 508](508-v2-b5n-puntuacion-pdf-condiciones.md).

## Hecho real y objetivo limitado
B5m ya procesó una vez el PDF histórico y quedó con 3/5 condiciones atribuidas, a pesar de verificar 3/3 materiales y coincidencia del subtotal. El primer término no corroborado fue el ordinal 4, `precios en efectivo`. La modificación B5n prueba la **hipótesis** de que el original podría contener únicamente puntuación de borde (p. ej. `precios en efectivo:`); no se puede afirmar esto del PDF real sin volver a leer el original y comparar fragmentos.

## Mecanismo B5n para una sola prueba futura
- Archivo SQL: `supabase/piloto/v2_b5n_private_pdf_replay_versioned.sql`. **No está aplicado en piloto.** Amplía el check de `processor_version` para `v2_b5k_20261111`, `v2_b5m_20261111`, `v2_b5n_20261111` en la **misma** tabla privada RLS con RPC `service_role`, sin nueva tabla o cola.
- Exige preflight con los cinco flags V2 en FALSE y **ningún lease**.
- Repite la elegibilidad histórica B5d/B5i/B5j + Storage archivado y SHA256 + chat/proveedor autorizado + tipo PDF + intervalo de 14 días. Además exige un resultado B5m previo con la misma fuente, proveedor y SHA, `currency_code=uniform_dollar_symbol_iso_unstated`, `economic_code=fiscal_or_freight_ambiguous`, `coverage_code=line_assignment_ambiguous`, `economic_total_balances=true`, `coverage_conditions=5`, `coverage_conditions_matched=3`, `can_publish=false`.
- La clave única `(source_hmac,processor_version)` impide reprocesar la misma fuente como B5n incluso vencida la cuota horaria; las RPC de cierre no pueden escribir en B5k/B5m.
- Worker `worker-moneda-original-b5k.ts` usa el nuevo `VERSION=v2_b5n_20261111`: rechaza reclamos de B5k/B5m **antes de leer Storage**. Sigue sin LLM, mensajes ni ofertas.
- `source_verified=false`, `full_document_covered=false`, `can_publish=false`, `can_rank=false`, `can_reveal_contacts=false`; se preservan las reglas de flete sin precio, IVA y moneda ISO.

## Criterios de prueba y seguridad
1. Node y PDF.js/Deno: puntuación inocua al borde de una condición completa en un segmento independiente es corroborable; IVA, importes, tasas, material+condición en una misma parte o duplicación mantienen bloqueo.
2. Caso secuencial sintético con cinco condiciones: un quinto término realmente independiente puede contar 5/5; si está mezclado con material o cargos, debe detenerse aunque la cuarta condición tenga puntuación externa.
3. PostgreSQL 17 **transacción completa ROLLBACK** en `supabase/tests/ci/v2-b5n-private-replay-pg17-rollback.sql`: replica fixtures B5g–B5m, prepara diagnóstico sintético B5m 3/5, prueba que 2/5 no es elegible, que un único SHA correcto sí, y que SHA errado, doble cierre y reclamo tras cuota no pueden pasar; compara evidencias antiguas antes/después.
4. RLS, roles `anon/authenticated`, modo exclusivo y flags OFF verificados; 0 cambios en la base real, Whapi, Vercel, cron o interfaz.
5. No publicar el código bajo «Luz verde» ni modificar historial de PR #778. La futura prueba real requiere «Publicalo» **solo para `cotironda-piloto`**.

## Plan para una publicación futura autorizada
- Confirmar 6 workflows generales SUCCESS + 4 trabajos B5n SUCCESS, origen GitHub exacto, Edge piloto v9, flags OFF, 0 leases, B5k=1 B5m=1 B5n=0, cero WhatsApps pendientes.
- Aplicar SQL B5n con los flags OFF; confirmar versiones, permisos y evidencia previa intacta.
- Desplegar únicamente Edge `cotironda-piloto-v2-shadow`, preservando 23 archivos de v9 y reemplazando exclusivamente los tres módulos de código alterados (lector B5l y worker; revisar diferencias reales antes de empaquetar).
- Usar puente interno ya autorizado para **una única** invocación privada, apagando todos los flags aunque el resultado sea incierto. Verificar B5n nuevo sin alteración de B5k/B5m, ofertas, Whapi y contactos.
- Si la condición ordinal 4 continúa ambigua, **no forzar** `visible_rows_accounted_private`; documentar motivo y priorizar el circuito completo comprador → proveedor → arquitecto, sin generar diagnósticos indefinidos.

**Estado comercial:** una coincidencia de subtotal de artículos NO certifica el precio pagadero, el flete a convenir no equivale a cero y `$` no prueba ARS. El piloto E2E sigue pendiente.

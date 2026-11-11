# Acta 515 — B5o: publicación en piloto y relectura histórica

**Fecha:** 11/11/2026. **Autorización:** «Publicalo», limitada a `cotironda-piloto` (`ilggkalaafhtiysyzlmg`), sin producción, Vercel ni WhatsApp. **Código exacto:** commit `99095f784574d31ec20db55e9e46db1837eae819` de [PR #786](https://github.com/ProtectorRudo/Cotironda/pull/786), apilado sobre [PR #785](https://github.com/ProtectorRudo/Cotironda/pull/785).

## Verificación previa

- 6/6 workflows generales de GitHub y 4/4 específicos B5o aprobados (Node, Deno/PDF.js, PostgreSQL 17 ROLLBACK y regresión); Next.js PASS.
- Supabase piloto: Edge V2 `cotironda-piloto-v2-shadow` v10 ACTIVE con 23 archivos; cinco flags V2 apagados; B5k=1, B5m=1, B5n=1, B5o=0, cero leases.
- Predecesor privado real: B5n `source_part_mixed` en condición ordinal 4/5, subtotal de materiales conciliado y `can_publish=false`. Se probó elegibilidad por fuente histórica y SHA sin extraer textos del proveedor.
- Sin cambios en WhatsApp outbox (6 históricos), ofertas anónimas (0), versiones de oferta (1), finalistas (0); cron documental existente activo y sin mensajes pendientes de enviar.

## Actualización aplicada

1. Migración Supabase aplicada `cotironda_v2_b5o_final_pdf_replay_privado_20261111` (versión registrada `20261111184454`). Se extendió `processor_version` en el ledger privado existente y se actualizaron 4 funciones SQL privadas (B4, B5o gate, claim y finish). Sin crear tablas, colas, cron ni credenciales.
2. Postflight SQL: los cinco flags siguieron OFF, B4/B5o gates OFF, 0 leases, B5o=0; RLS activa y permisos `anon/authenticated` bloqueados.
3. Edge `cotironda-piloto-v2-shadow` **v11 ACTIVE**; SHA `484678506bdbd5d51dae0ee920993d56a734fe93bcdae831b40870fc587ac45a`. Paquete con 23 archivos; únicamente los módulos `auditoria-cobertura-original-b5l.ts` (doble referencia de nota y condición) y `worker-moneda-original-b5k.ts` (versión B5o) cambiaron desde v10.
4. Ventana privada armada el **11/11/2026 18:46:05 UTC**, utilizando la autorización de cron B4 ya existente, sin extraer secretos de Vault ni realizar invocación HTTP manual. Gate B4 TRUE confirmado. La ventana expira automáticamente luego de 8 minutos; al tomar el PDF, el propio claim desactiva ambos flags en la misma transacción.

## Resultado de la única relectura real

**EJECUCIÓN REAL CONFIRMADA:** el cron documental existente inició su ciclo a las **18:50:00 UTC** (estado `succeeded`). Mediante el puente B4 y la Edge V2 v11, se reclamó y terminó el **único PDF autorizado** bajo la nueva versión `v2_b5o_20261111`. La consulta del 11/11/2026 18:50:18 UTC observó **B5o=1, `private_diagnosed=1`, leases=0, cinco flags OFF y B4=FALSE**, evidenciando el apagado automático transaccional.

**Comparación determinista de los cuatro diagnósticos sobre el mismo HMAC y SHA256 del original** (sin copiar presupuestos ni datos del proveedor):

| Indicador privado | B5k | B5m | B5n | B5o |
|---|---:|---:|---:|---:|
| Estado `private_diagnosed` | sí | sí | sí | sí |
| Materiales corroborados | 3/3 | 3/3 | 3/3 | 3/3 |
| Subtotal de materiales coincide | NO | sí | sí | sí |
| Condiciones comerciales corroboradas | 4/5 | 3/5 | 3/5 | **5/5** |
| Cobertura `coverage_code` | `line_assignment_ambiguous` | igual | igual | **`unmapped_text`** |
| Filas visibles PDF.js | 13 | 13 | 13 | 13 |
| Filas atribuidas / sin atribuir | 8 / 5 | 8 / 5 | 8 / 5 | 8 / 5 |
| Fuente verificada integralmente | NO | NO | NO | NO |
| Economía `economic_code` | `fiscal_or_freight_ambiguous` | igual | igual | igual |
| ISO de moneda comprobado | NO | NO | NO | NO |
| Publicar / ranking / revelar contactos | NO | NO | NO | NO |

**Resultado técnico:** B5o **sí resolvió el falso positivo de doble referencia entre dos notas comerciales y sus dos condiciones**, que habían quedado detenidas desde B5n. No hay primera condición pendiente (`first_unresolved_condition_ordinal=null`, `condition_failure_kind=null`); los cinco términos están atribuidos. **No permite concluir que el documento completo esté acreditado:** siguen cinco filas PDF.js visibles sin atribuir (`unmapped_text`), y además el total pagadero y los términos fiscales/flete/moneda ISO continúan inciertos. No atribuir arbitrariamente esas filas a encabezados o decoraciones sin corroboración.

**Postflight final auditado a las 18:50:56 UTC:** B5k=1, B5m=1, B5n=1, B5o=1; los cuatro diagnósticos comparten **un** HMAC y **un** SHA256 (las pruebas históricas permanecen intactas). Cinco flags OFF, B4 y gate B5o FALSE, 0 leases. `whapi_outbox=6`, `anonymous_offers_mvp091=0`, `offer_versions=1`, `finalist_whapi_outbox_mvp110=0`, B5j histórico=2, trabajadores sombra históricos=2, **sin cambios**. RLS activa; `anon` no lee el ledger ni llama B4 y `authenticated` no reclama fuente.

**Decisión:** la prueba real de relectura B5o **terminó bien**; el documento comercial **no está listo para publicarse**. No abrir un B5p por inercia ni anunciar E2E. Priorizar una auditoría estructural de las cinco filas no atribuidas, comprobación de IVA/flete/moneda y la asociación de ofertas PDF/Excel a la ronda correcta, seguida del comparador B6 y la vista del arquitecto.

## Seguridad y alcance

- El replay no publica ofertas ni rankings, ni envía WhatsApps, adjudica, revela contactos o certifica el total final. Todos los indicadores `source_verified`, `can_publish`, `can_rank`, `can_reveal_contacts` permanecen FALSE incluso si mejora la cobertura.
- El flete mencionado sin importe no equivale a gratis, `$` no prueba moneda ISO y IVA sin evidencia no se deduce. No comparar los totales de ofertas incompletas.
- Los PR #785/#786 permanecen abiertos y no fusionados. No se modificó producción.

## Próximo objetivo de negocio

Una vez documentado el resultado B5o, priorizar **Issue #750 (E2E)**: correlación de PDF y Excel con la ronda correcta, condiciones económicas verificables, comparación B6 por rubro y cantidad/cobertura, seguimiento anónimo durante la ronda, revelación al cierre y prueba real WhatsApp con dos proveedores. Evitar nuevas versiones de replay aisladas sin un criterio comercial claro.

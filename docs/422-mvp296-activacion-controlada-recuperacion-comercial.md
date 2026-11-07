# Decisión 422 — MVP296: activar recuperación comercial sin un secreto adicional imprevisto

Fecha: **07/11/2026**. Alcance: exclusivamente `cotironda-piloto`. **Estado: publicado tras 12/12 controles CI exitosos**, [PR #687](https://github.com/ProtectorRudo/Cotironda/pull/687), commit `66fcfb4b2214ed2b061a93119a0cda28937d8423`, migración n.º 83 y worker v8 ACTIVE. **El resultado económico real aún necesita auditoría de fuentes y ranking.**

## Evidencia después de publicar MVP295

- PR #686 integrado en `feat/mvp174-supplier-packaging-equivalence` con 13/13 CI; SQL `piloto_mvp295_continuidad_comercial_textos_vinculados` aplicada (migraciones 81→82), seguimiento `v23 ACTIVE`, worker `cotironda-piloto-auto-recovery v7 ACTIVE`. Whapi v66 y cron Vault v31 sin cambios.
- Ejecución real cron 07/11/2026 **16:30 UTC**: log `cotironda_mvp293_internal_tick accepted` y worker v7 arrancó. Sin embargo: **0** filas en `ai_supplier_linked_replay_mvp295`, **0** revisiones `ai_supplier_review_mvp227`, **0** llamadas comerciales con medidor MVP264.
- Consulta SQL **solo lectura** para el mensaje histórico de Nahuel: están en `true` la identidad y consentimiento de comprador/proveedor, `l.kind=text`, `association=semantic_unique_mvp291`, SHA original cifrado, estado de recuperación/correlación `linked`, libro unresolved resuelto, sombra IA, invitación, `ai_dispatch_jobs_mvp222 api_accepted` antes del mensaje, ronda vigente, plazo 7 días y ausencia de revisiones/reprocesos anteriores.
- La Edge v7 contenía un cuarto gate de entorno `COTIRONDA_PILOT_AI_CENTRAL_SUPPLIER_QUOTE_ENABLED` que **no estaba entre los tres controles de recuperación habilitados por el operador**. La conexión actual **NO permite leer Secrets**; por ende no se afirma haber consultado ni confirmado su valor. El gate adicional es la causa probable, coherente con el tick aceptado pero sin procesamiento.
- Canary HTTP sin credenciales a worker v7 devolvió **401** como corresponde. La seguridad dual se conserva.

## Solución

1. No solicitar otro secreto a la persona ni asumir el valor del gate adicional. En la Edge interna, después de autenticación doble y resultado `empty` de la cola MVP292, exigir explícitamente los **tres gates ya autorizados**: `COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED`, `COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED`, `COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED` iguales a `true`.
   **Aislamiento de costos:** el camino antiguo `textCommercialEnabled` del MVP292 no tenía metering ni versionado del MVP295, así que queda permanentemente `false` en esta Edge. La interpretación comercial histórica solo se efectúa por el procesador MVP295, con `usageTraceEnabled:true` y `quoteVersioningEnabled:true`. Nunca ejecutar ambos caminos ni introducir consultas IA fuera del libro MVP264.
2. Agregar a `cotironda_piloto_claim_linked_text_mvp295` una **segunda barrera obligatoria de base de datos**: `ai_central_control_mvp226.enabled=true` con `activated_at` no nulo; mantener `integration_flags.whatsapp_inbound_enabled=true`. Es el control existente del módulo de IA Central, verificado activo en piloto. Ambas verificaciones viven dentro del RPC service_role, no confían solo en el entorno.
3. No alterar las verificaciones existentes de consentimiento, SHA/HMAC, equivalencia de fuentes, despacho Whapi anterior, ronda no vencida, máximo 6 reclamos diarios, deduplicación ni metering MVP264. El nuevo worker solo procesará una fuente comercial por tick y nunca mandará WhatsApp.
4. Migración adicional `mvp296_quote_recovery_existing_control.sql`, **sin modificar la migración MVP295 ya aplicada**. Preservar todos los demás módulos al desplegar la función.
5. PostgreSQL 17 sintético y revertido: rechazar con IA Central OFF, no dar acceso anon/auth, permitir camino ON sin reejecutar fuente reclamada. Node/Deno/typecheck y CI completo.

## Verificación posterior requerida

- Crear CI PASS, fusionar PR con SHA exacto, aplicar migración SOLO a `cotironda-piloto`, verificar ACL y estado.
- Actualizar solo `cotironda-piloto-auto-recovery` preservando bundle actual y comparar código exacto a GitHub.
- Esperar ticks del cron Vault ya existente (sin activaciones extra). Comprobar registro de cola, estado privado del proveedor Nahuel, revisión económica MVP227, tokens MVP264 y ofertas por rubro si se verifican. No afirmar `oferta visible` si quedan condiciones por revisar; nunca asociar a la fuerza el documento ambiguo de Ailín.
- Production y `main` NO tocan este cambio.

## Primera recuperación económica real del piloto (16:45 UTC)

Tras publicar la Edge **v8** y SQL mig.83, el cron Vault existente ejecutó la recuperación de la fuente histórica de **Nahuel** y produjo **una** fila `ai_supplier_linked_replay_mvp295` y **una** fila `ai_supplier_review_mvp227`. Se registraron exactamente **2 llamadas observadas** con **3.503 tokens** en `ai_usage_calls_mvp264`; no se estableció precio monetario de API (factura/precios del proveedor no conciliados).

El análisis comercial devolvió **`review/semantic_review_required`**, con `summary IS NULL`. Por lo tanto hay **cero** revisiones `verified` y ninguna oferta por rubro o ranking nuevo publicada desde ese original. Las dos lecturas se contabilizaron; por idempotencia NO se vuelve a ejecutar la IA por la misma fuente. La explicación más específica de la revisión no está persistida actualmente: no corresponde atribuirla a moneda, IVA ni discrepancia de lecturas sin evidencia.

Ailín permanece `review/multiple_indistinguishable_rounds` por su documento histórico. No hay motivos para forzar su vínculo ni solicitarle a los proveedores que repitan la cotización.

**Resultado:** código, DB, cron, correlación, descifrado, doble análisis económico, metering y revisión privada verificados contra fuentes reales. **Aún NO verificados**: publicación económica de este presupuesto, aparición en ranking comprador, cierre/ganadores y E2E completo WhatsApp→navegador. Próximo trabajo: conservar un motivo diagnóstico seguro de la revisión semántica sin repetir llamadas facturables ni relajar evidencia comercial.

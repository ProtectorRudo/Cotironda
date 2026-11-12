# Acta 524 — MVP356: evitar despachos superpuestos a un proveedor (PILOTO)

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registra». **Estado:** SOLO DESARROLLO; NO instalado en Supabase piloto, NO publicación, NO WhatsApp enviado.

Referencia obligatoria: [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [PR #799](https://github.com/ProtectorRudo/Cotironda/pull/799).

## Problema verificado (Supabase, SELECT únicamente)

Hay **dos documentos** históricos en `ai_supplier_unresolved_mvp237` con `ambiguous_round`. Se reconstruyó el número de envíos aceptados correspondientes a su mismo proveedor al momento original de recepción:

- Un documento tenía **dos despachos IA Central** candidatos.
- Otro tenía **un despacho IA Central y uno legacy Whapi** candidatos.

En la ronda nueva que permanece preparada, existen dos pedidos `api_accepted`; un documento del proveedor fue recibido y archivado, pero **cero originales tienen asociación documental acreditada** para esa ronda. No es seguro asignar el documento histórico al pedido que hoy permanece abierto. La extracción económica no repara la falta de vínculo.

## Cambio mínimo en desarrollo

Se leen del piloto, SIN modificación remota, las definiciones desplegadas de:
- `public.cotironda_piloto_ia_claim_mvp222` (despacho normal)
- `public.cotironda_piloto_ia_claim_mvp314` (lotes)

Se propone añadir **una exclusión transaccional compartida** a ambas rutas:

1. Cada claim adquiere el mismo `pg_advisory_xact_lock(7835634)` antes de elegir un proveedor, para impedir que dos transacciones tomen a la vez trabajos distintos para la misma empresa proveedora.
2. El helper privado `cotironda_piloto_privado.hay_despacho_solapado_mvp356(request,supplier)` comprueba rondas `prepared` vigentes y solapadas, para el mismo proveedor y otra ronda, en `ai_dispatch_jobs_mvp222` y `whapi_outbox`; estados `leased`, `api_accepted` y `uncertain`.
3. Si otra ronda está en curso, **el trabajo queda `pending`**: no se envía WhatsApp duplicado, no se asocia automáticamente ningún PDF y no se genera un estado económico falso. No afecta a otros proveedores.
4. Tras el cierre de la ronda anterior, el mismo trabajo `pending` será elegible **en una nueva ejecución del lote**. NO hay automatización de esa nueva ejecución demostrada hasta el momento.
5. Nueva tabla privada de configuración `ai_supplier_overlap_gate_mvp356`, `enabled=false` y `activated_at=null` por defecto. Solo al activar EXPLÍCITAMENTE pasa a operar el bloqueo. Se revocan privilegios de `anon` y `authenticated`; se mantienen las funciones originales y su interfaz.
6. El bloqueo se limita a piloto: una operación comercial escalable **no puede retener cinco días cada pedido de distintos arquitectos a un mismo proveedor**. Para producción será necesaria identificación por referencia de pedido/WhatsApp citado y manejo de conflictos con revisión privada, no serialización global.

### Escenarios para PostgreSQL17 descartable

- Dos compradores de distintas empresas y un mismo proveedor: primero `leased`, segundo `empty`; al finalizar su primera ronda el segundo vuelve a ser elegible.
- Estado `api_accepted` y `uncertain` impiden nueva ronda; ni un timeout HTTP justifica otro envío automático.
- Otro proveedor sigue elegible para ser contactado.
- El despacho por lotes `mvp314` y el dispatcher normal `mvp222` utilizan la misma exclusión.
- Un `whapi_outbox` legacy aceptado en otra ronda bloquea el nuevo envío; el cierre libera.
- Instalación del SQL con **gate OFF** no cambia comportamientos; activación solo simulada dentro de BEGIN/ROLLBACK.
- Las tablas, funciones y roles sintéticos desaparecen tras ROLLBACK; no se emplean secretos reales, números de teléfono ni mensajes.

## Bloqueos para publicar (NO activar antes)

- [ ] **Reintento automático de cola:** `cotironda-piloto-ai-batch` Edge existe, pero se consultó `cron.job` y no hay tarea verificada invocándolo. Los cron actuales cubren cierre, recuperación documental y conciliación IA Central. Si se activa el guard SIN programar/probar la ejecución periódica y sus límites, las solicitudes nuevas podrían permanecer `pending` indefinidamente.
- [ ] **Convivencia con legacy:** solo los claims `mvp222` y `mvp314` adquieren el nuevo advisory lock. Un despachador legado concurrente, si permanece habilitado, podría seguir enviando solicitudes durante ese intervalo. Antes de activar, deshabilitar el flujo legado de nuevas invitaciones o integrarlo a la misma exclusión (comprobación real en piloto).
- [ ] Revalidar definiciones desplegadas de las 2 RPC antes de aplicar el snapshot de este PR. Si difieren, reconciliar primero; no sobrescribir cambios nuevos.
- [ ] Ejecutar rollback/staging sobre SQL real; verificar checks ACL `anon` y empresa y que gate OFF no modifica salida.
- [ ] Al activar, probar 2 proveedores reales, 1 comprador y navegador, sin solapamientos; preservación y asociación de PDF/Excel. No reutilizar los 2 documentos ambiguos como pruebas de éxito.
- [ ] P0 sigue abierto por usuario Auth=0, consentimientos originales=0 y política descargas OFF. No activar descarga ni revelar originales de no ganadores.

**Nota de seguridad:** el guard disminuye el riesgo futuro pero no sustituye la prueba M355 (inbox+vínculo+SHA). Los documentos antiguos ambiguos permanecen sin atribuir. La semántica `empty` del claim es la misma que ya consume el dispatcher: para el comprador no debe significar «enviado»; se debe mostrar `pendiente de despacho` según estado real.

## Entrega / relevo

**Hecho en rama:** SQL instalable pero OFF, fixture PG17 con casos normales/extremos, CI del mismo SHA, tests Node, acta y actualización de roadmap. **Pendiente de verificar:** todos los checks del PR y el reintento programado. **No publicar** con esta sola autorización.

**Siguiente acción única:** desarrollar y probar el reintento idempotente de envíos `pending` en entorno controlado, mediante el Edge `cotironda-piloto-ai-batch` ya existente y un cron privado con secretos Vault, sin reenviar un envío `uncertain`. Solo después considerar la activación piloto de este guard y MVP354/MVP355, con «Publicalo».

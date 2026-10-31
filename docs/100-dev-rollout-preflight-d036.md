# 100 — D036: preflight read-only y plan de instalación gradual en Supabase DEV

**30/10/2026 · Issue #173 · PR apilado sobre D035/#172. No autoriza ejecutar migraciones.**

## Hallazgo real de la auditoría

La consulta read-only al proyecto Supabase DEV `qkercsoqhehbenbbncwk` confirmó PostgreSQL **17.11**, `is_session_verified` SECURITY DEFINER con owner `postgres`, 0 tablas de rondas/WhatsApp, 0 funciones nuevas y 0 roles de Etapas 03–04. El registro comercial y el scheduler de pruebas IA están apagados. No se modificaron usuarios ni datos.

**Importante: el proyecto DEV tiene 17 migraciones registradas, no 12.** Las primeras doce corresponden al núcleo de identidad, seguridad y Storage de Etapa 01. Las cinco restantes corresponden a funciones y registros de calidad IA en DEV (D019–D021): `dev_quality_once_only`, `dev_quality_results_ledger`, `dev_quality_auto_dispatch_d020`, `dev_quality_pg_net_nonpublic_d020` y `dev_quality_numeric_diagnostics_d021`. No deben eliminarse ni confundirse con migraciones comerciales. La reconstrucción histórica en GitHub Actions prueba únicamente las **12 migraciones base**, no las cinco de laboratorio alojadas. Es una limitación concreta que se debe resolver antes de considerar un reset de DEV o restauración completa.

## Preflight de solo lectura

`supabase/sql/dev_inventory_d036.sql` hace **una sola SELECT** con resultados JSON agregados exclusivamente de catálogos, versión, inventario de migraciones, permisos del checker de sesiones, flags y ausencia de tablas/funciones/roles nuevos; sin consultas de correos, teléfonos, usuarios, presupuestos, sesiones, secretos o contenidos.

`scripts/ci/dev-readiness-d036.mjs` evalúa estrictamente:
- PostgreSQL 17+; **exactamente** las 17 versiones y nombres de migraciones observadas en DEV, en orden.
- Cero instalaciones parciales de `D024–D035`, funciones, roles comerciales o login de Whapi.
- Verificador `is_session_verified` propiedad de postgres y SECURITY DEFINER.
- Registro comercial y scheduler IA apagados, ningún cron de calidad automático.
- RLS activo en tablas base `organizations`, `organization_members` y `supplier_profiles`.
- Ante cualquier inconsistencia, devuelve `BLOQUEADO`; con todo conforme devuelve `BASELINE_DEV_CONSISTENTE` y **siempre `autorizaInstalacion:false`**, porque faltan backups y aceptación de gates. Si se añade una migración legítima en DEV, el inventario debe volverse a auditar y versionar; no saltar el control para que pase.

Se verifica contra el proyecto alojado **solo mediante SELECT**, sin aplicar DDL. `tests/unit/dev-readiness-d036.test.mjs` simula drift, 12/17, campos manipulados, banderas encendidas, versión incompatible, privilegios, RLS y respuestas incompletas.

`supabase/tests/ci/106_dev_rollout_security_gate.sql`, en PG17 descartable **después** de instalar D024–D034 en CI, evalúa propietarios, roles NOLOGIN, RLS de ocho tablas privadas, SELECT privado denegado al cliente/gateway, EXECUTE mínimo y reader sin acceso a `auth`. No debe aplicarse al DEV previo: está diseñada para el estado **posterior**.

## Cambio Supabase del 30/10/2026: API explícita

Supabase anunció que a partir del **30 de octubre de 2026** las tablas nuevas `public` ya no se exponen automáticamente a Data API: se requieren GRANT explícitos. [Changelog oficial](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). Por ello, no confiar en permisos por defecto. D025 ya declara `GRANT EXECUTE` explícito para la RPC `public.buyer_round_overview_v1` exclusivamente a `authenticated`, mientras las tablas de rondas y WhatsApp residen en `cotironda_private` sin Data API. El futuro instalador debe revisar ese ajuste real en DEV y correr pruebas REST de token válido/denegado, además de PostgreSQL SQL.

## Orden propuesto de instalación en DEV — NO EJECUTADO

Este es un plan sujeto a revisión y aprobación. **No ejecutar todas las etapas en una sola transacción gigante ni con un único prompt**:

1. **Gate 0: freeze y respaldo.** Confirmar branch/commit y cadena de PRs apilados; inventariar las 17 migraciones; obtener backup verificado de Supabase DEV **incluyendo las cinco migraciones de IA** y ensayar restauración en entorno aislado. El backup sintético de PG17 no certifica recuperación de DEV alojado. Revisar plan de reversión para cada etapa y disponibilidad de API/usuario; prohibido borrar migraciones históricas.
2. **Gate 1: ledger privado D024.** Revisar SQL `supabase/sql/rounds_private_ledger_d024.sql` y preparar migración formal versionada mediante Supabase CLI tras auditar diff. Aplicar solo a DEV autorizado. Verificar RLS, ocho? **seis** tablas iniciales, permisos privados y cero cambios en compra/registro. No incorporar proveedores reales.
3. **Gate 2: lectura segura D025 corregida por D035.** SQL `supabase/sql/round_buyer_overview_d025.sql` **ya incluye corrección de D035**, sin `GRANT USAGE auth` a rol personalizado. Validar owner/SECURITY INVOKER de RPC, ACL, PostgREST JWT genuino, sesión revocada, comprador ajeno y cuenta suspendida. Mantener `COTIRONDA_ROUNDS_READ_ENABLED` apagado durante migración; habilitar únicamente en Preview tras prueba autorizada.
4. **Gate 3: escritura privada D026.** `supabase/sql/round_offer_atomic_write_d026.sql`, revisión atómica de empresa/proveedor, versiones, consentimiento, importes y rondas abiertas. Sin WhatsApp real ni confirmación automática.
5. **Gate 4: inbox WhatsApp aislado**, en orden: `whapi_private_inbox_d028.sql` → `whapi_gateway_private_d030.sql` → `whapi_inbox_key_id_d032.sql` → `whapi_replay_across_aes_d034.sql`. Revisar roles NOLOGIN, RLS, idempotencia, ciphertext, baja irreversible, replay entre claves y permisos sin exposición REST. **No conectar webhook ni secreto permanente**.
6. **Gate 5: E2E en DEV + auditoría de seguridad.** Crear datos **sintéticos** con autorización y roles mínimos. Verificar Node→PostgreSQL por TLS con CA validada, sesiones/suplantación y aislamiento por empresa, costos, logs sin PII, retención y restauración. Consultar asesores Supabase de seguridad, resolver hallazgos. Solo después considerar un canal Whapi DEV dedicado con opt-in, autenticidad de webhooks y límites de gastos; no enviar WhatsApp en esta fase.

**Reversión:** no ejecutar `DROP TABLE`/`DROP ROLE` ni restauración destructiva automáticamente. Las migraciones RLS/grants pueden afectar acceso y cambios pueden no tener down migration trivial. Si falla un gate, mantener flags OFF, detener avance y evaluar restore completo contra backup verificado. Registrar tiempos, responsables, IDs de versiones y auditoría.

## Estado de la entrega

- No hay migraciones nuevas oficiales bajo `supabase/migrations`: crear una **solamente al comenzar el despliegue autorizado**, con CLI actual y un SQL por etapa revisado. No se escriben versiones a mano.
- No cambia DEV ni producción, no se crean usuarios, no se toca Whapi, no se consume IA.
- El preflight **no sustituye** la aprobación, backups y pruebas reales alojadas.
- Todo se sube en un PR draft. En cada despliegue futuro reportar versión, pruebas, SQL y rollback real; jamás declarar producción lista con solo CI.

**UX-001:** el comprador seguirá enviando pedidos y el proveedor respondiendo por WhatsApp sin aprender ninguna de estas operaciones de infraestructura.

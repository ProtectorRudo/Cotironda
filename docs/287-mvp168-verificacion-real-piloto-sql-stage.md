# Cotironda — comprobación del MVP168 en Supabase piloto

**Fecha:** 4/11/2026. **Entorno:** `cotironda-piloto` (PostgreSQL 17.11, no producción). **Referencias:** #535 y #529; código PR #543, commit `415abae8255307d8acac0125bd54ac7659c4fb67`.

## Comprobado con herramientas conectadas al piloto

Antes del cambio: registro y dos RPC de MVP168 ausentes; 4 documentos con fuente v9 verificada y 4 registros de fuente MVP163, 0 mensajes en outbox de finalistas y 0 activaciones. Edge documental `cotironda-piloto-document-recovery` v25 ACTIVE.

1. **Primera prueba SQL reversible:** se ejecutó el contenido exacto de `supabase/piloto/mvp168_supplier_economic_source_ledger.sql` dentro de una transacción con `BEGIN`/ `ROLLBACK`, seguida de `mvp168_smoke_rollback.sql`. Resultado `mvp168_rollback_check_completed`. Inspección posterior: las nuevas tablas y RPCs NO existían, 4 documentos originales verificados intactos, 0 finalistas.
2. **Selector validado sobre datos reales:** dentro de transacción reversible, `cotironda_piloto_next_economic_facts_mvp168()` devolvió `candidate`, así que la comprobación de escritura y deduplicación no se salteó por ausencia de documentos.
3. **Instalación de esquema SOLO PILOTO:** migración `mvp168_supplier_economic_source_ledger_pilot_only` aplicada con éxito al proyecto de pruebas. Es aditiva: tabla de evidencia económica en esquema privado, RLS, trigger de inmutabilidad y RPCs `service_role`. No se modificaron presupuestos, usuarios, contactos, originales ni políticas de entrega. Confirmado tras instalar: tabla y dos RPC existentes, RLS ON, `anon` sin permiso de selección, `authenticated` sin escritura y `service_role` con permiso de selección. Selector sigue devolviendo `candidate`.
4. **Smoke sobre esquema ya instalado:** `mvp168_smoke_rollback.sql` ejecutado directamente, respuesta `mvp168_rollback_check_completed`; volvió a dejar el ledger vacío. La prueba controla rechazos de campos extras, IVA fingido, idempotencia y ausencia de outbox de finalistas. Se hizo `ROLLBACK` de la cotización ficticia.
5. **Despliegue separado de STAGING para validar el paquete:** `cotironda-piloto-economic-staging` versión 1, ACTIVE, `verify_jwt=true`. Paquete de 25 archivos: 17 archivos del recuperador activo v25 preservados, 3 archivos actualizados y 8 incorporaciones según el commit del PR #543. Se verificaron las referencias de importación internas antes de subirlo.
6. **Aislamiento posterior:** `cotironda-piloto-document-recovery` **sigue v25**, ACTIVE; función staging v1 ACTIVE pero **sin cron**; ledger MVP168 aún con **0 registros económicos reales**; siguen **4 v9**, **4 fuentes MVP163**, **0 finalistas activados** y **0 mensajes de finalistas**. No se reemplazó el recuperador activo, no se activó el flag económico ni se envió WhatsApp.

## Qué NO demuestra esta prueba

- Que la Edge staging haya procesado el PDF de Ailín o el Excel de Nahuel: el paquete fue **desplegado, no invocado** con una credencial autorizada ni conectado al cron. El ledger vacío confirma que **no se ejecutó la nueva lectura económica real**.
- Que el cálculo fiscal esté completo: los auditores MVP166/167 separan descuento comercial de IVA/base fiscal y siguen devolviendo `rankingAllowed:false`.
- Que el Excel tenga citas por hoja/celda exactas: los ordinales del lector actual no equivalen a coordenadas reales.
- Que el cierre, los originales descargables o el intercambio de contactos puedan habilitarse: esos controles tienen sus propios bloqueos y consentimientos.

## Próxima acción técnica

Conservar **staging aislado** hasta ejecutar una invocación autorizada con token del trabajador, auditar lectura de 1 archivo sin PII en logs, verificar el primer registro MVP168 real y luego el segundo con deduplicación. Para activar el recuperador habitual se requiere desplegar su **paquete completo preservando archivos** y habilitar `COTIRONDA_PILOT_ECONOMIC_FACTS_ENABLED`, con salvaguardas/backup y sin activar finalistas ni WhatsApp. **Ninguna de esas acciones se realizó en esta comprobación.**

Después integrar base fiscal, stock y entregas en el adaptador/ comparador existente (issues #535, #524), y finalmente prueba E2E de una ronda nueva. No confundir la instalación del registro con una comparabilidad económicamente demostrada.

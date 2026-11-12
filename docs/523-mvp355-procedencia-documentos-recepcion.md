# Acta 523 — MVP355: no atribuir archivos por la mera fecha

**Estado: código de desarrollo, sin integración ni despliegue.** [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR técnico anterior #797](https://github.com/ProtectorRudo/Cotironda/pull/797). Revisado el 11/11/2026.

## Problema real confirmado

La función `cotironda_piloto_reserve_media_mvp095` del piloto **puede preasignar** `media_archive_mvp095.request_id` si existe una sola invitación `prepared` en ese instante. Esa preasignación sirve para gestión interna pero NO prueba que el documento responde a esa ronda: una cotización tardía de otra solicitud podría entrar justo cuando hay una nueva ronda.

La primera versión del contador MVP354 combinaba `a.request_id`, fechas, invitación y despacho. Siendo suficiente para la UI de «recibido», podía producir un falso positivo, incluso sin OCR o IA. El nuevo cambio evita ese error crítico **antes** de darle la información al arquitecto.

## Corrección MVP355 propuesta

Se mantiene el contrato anónimo de ocho campos de MVP354 y su flag `COTIRONDA_PILOT_DOCUMENT_RECEIPTS_MVP354_ENABLED`, **OFF en el piloto hasta autorización de publicación**. Se refuerza su RPC con la prueba de origen ya persistida:
- Mismo mensaje y mismo proveedor deben existir en `whapi_inbox` autenticado, y el `request_id` de su **inbox** coincidir con la ronda.
- Debe existir un registro `ai_supplier_links_mvp225` de ese **mismo mensaje, proveedor, ronda, clase y SHA del binario**, con método `quoted_whapi_id` (mensaje citado), `single_active_round` (única ronda elegible) o `prior_supplier_preamble` (el proveedor avisó que enviaba un archivo y el SQL MVP238 vinculó el adjunto con el aviso y su ronda bajo controles privados). Los tres métodos se verificaron en el código actual; **no** se acepta una atribución solo semántica de IA.
- `media_archive_mvp095` debe seguir `stored` con path exacto, tamaño y SHA. El instante de atribución es `whapi_inbox.received_at`, no la fecha de fin de descarga del archivo. Esto evita descartar documentos que llegaron a tiempo pero se archivaron después del vencimiento.
- Una contradicción en `ai_supplier_unresolved_mvp237` (`ambiguous_round`, `not_matched`, `media_context_conflict`) **bloquea** el contador, aunque exista una asignación previa.
- Una segunda ronda con despacho aceptado para el mismo proveedor, vigente a la hora de **recepción original**, hace fallar la asociación automática. Se rechaza en lugar de atribuir un archivo ajeno.
- Un proveedor se cuenta UNA vez aunque mande varios PDFs o reenvíos. No se muestran nombres, precios, originales, IDs, hashes ni canales.

**Auditoría adicional de compatibilidad:** revisadas funciones SQL reales `cotironda_piloto_ia_attach_supplier_media_mvp238`, `cotironda_piloto_link_quoted_media_mvp151` y `cotironda_piloto_ia_link_supplier_mvp225`. MVP238 guarda método `prior_supplier_preamble` con SHA y origen; no debemos ocultar ese presupuesto. MVP151 resuelve exclusivamente el **flujo legado** por `whapi_outbox`; el contador MVP354 apunta a despachos `ai_dispatch_jobs_mvp222` y no debe asumir que las rondas legadas están verificadas. El camino IA nuevo puede generar proof `quoted_whapi_id` a través de MVP225; su funcionamiento de extremo a extremo aún no se comprobó en piloto. La auditoría de flags real dio `2/2` proveedores habilitados para `quote_link`, sin modificar permisos.

### Pruebas automatizadas
En `supabase/tests/ci/mvp354-document-receipts-pg17.sql`, con PostgreSQL 17, transacción completa `BEGIN/ROLLBACK`: 0 sin archivo; 0 con archivo preasignado sin prueba; 0 con inbox pero sin proof; 1 con PDF + proof; 1 con segundo PDF mismo proveedor; 1 si Excel de otro negocio aún no tiene proof; 2 cuando tiene proof; bloqueo al adulterar SHA del vínculo, método de vinculación solo semántico, conflicto sin resolver o ruta Storage; bloqueo de ronda solapada; tokens revocados/vencidos; permisos reservados a service_role. Los tests Node validan la consulta y su integración con MVP354.

**No se probaron todavía los archivos reales** de una ronda nueva: el último snapshot tenía 2 despachos aceptados, pero 0 archivos de proveedor acreditados en esa ronda. Tampoco se ejecutó una prueba de todo WhatsApp→browser→descarga. No marcar P1/P2/P3 completas por la CI.

## Límite importante para el negocio

La seguridad introducida tiene un costo deliberado: si la integración no registra una prueba fuerte en `ai_supplier_links_mvp225`, el arquitecto verá **«pendiente/en revisión»** aunque un adjunto esté guardado. El remedio correcto es reparar la vinculación de forma no invasiva y con evidencia, **no** eliminar esta comprobación ni exigir al comercio reenviar el documento.

**Siguiente paso tras la CI:** auditar el camino real de `cotironda_piloto_ia_link_supplier_mvp225` para documentos y asociar automáticamente, sin exigir un texto especial o precio perfecto. Añadir en la proyección las respuestas exclusivamente de **texto cifrado en `whapi_inbox`** como categoría separada, sin representarlas falsamente como archivos descargables. Exigir una comprobación de correlación y fuente SHA. El usuario del portal todavía necesita Auth propio para acceder a originales.

## Política de originales que NO debe modificarse accidentalmente

La regla comercial histórica da contactos a dos ganadores, pero también quiere que el arquitecto descargue al cierre los originales de todos los invitados. Los archivos originales pueden revelar teléfonos, CBU, web, CUIT y correos incluso de proveedores no elegidos. **Propuesta para nuevas rondas exclusivamente**: informar y registrar en condiciones al alta/invitación que los originales íntegros y sus datos se compartirán al comprador de la ronda al finalizar; no crear confirmaciones por cada presupuesto. Hasta comprobar que las condiciones efectivamente autorizan esa divulgación y el comprador tiene Auth+empresa verificada, **el gate de originales sigue apagado**. No habilitar retroactivamente para rondas viejas.

## Estado y control de cambios

- Rama derivada del PR #797, sin introducir nuevo pipeline, ni nuevas claves, ni servidor ERPNext.
- Sin DML/DDL remoto, sin desplegar Edge, sin WhatsApps.
- Estado se registra en [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md).
- P0/P1/P2/P3/P4/P5 quedan pendientes hasta pruebas E2E verificadas; no confundir pruebas sintéticas con aceptación del piloto.

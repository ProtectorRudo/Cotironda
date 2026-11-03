# MVP157 — Descuento en columna sin bloquear un PDF correcto

03/11/2026 · Issue #517 · solo `cotironda-piloto`.

## Fallo real
Dos PDF originales de Ailín y Nahuel quedaron archivados y asociados a la ronda de arena, piedra y cemento, con tres renglones y `unanswered=[]`. El verificador de fidelidad v8 devolvió `needs_source_review/missing_line` en los dos. El borrador de la IA incluyó `BIG BAG de Arena; Dscto. 22.4%` y `BIG BAG de Arena; Dscto.: 0.0%` como descripción compuesta, pero el PDF fuente puede imprimir `Dscto` en una columna distinta. Exigir esa descripción completa en un único bloque visual causa un bloqueo artificial.

## Verificación v9
Se permite desprender exclusivamente un sufijo semánticamente marcado `Dscto porcentaje` **para localizar el nombre básico del producto**, nunca para modificar el original ni las cifras. Sigue siendo obligatorio encontrar cantidad, precio unitario e importe declarado de la misma fila en el PDF fuente. Además debe verse el porcentaje exacto en el original y el encabezado comercial `Dscto/descuento/bonificación`; el porcentaje también debe cuadrar por aritmética entera con precio de lista, cantidad y subtotal (tolerancia de redondeo existente). Si uno falla, retener la oferta. Todos los importes, líneas adicionales, totales y condiciones son auditados y los descuentos no se inventan. No se declara cobertura técnica: BIG BAG no equivale automáticamente a m³, arena genérica no equivale a fina y piedra genérica no garantiza partida.

La BD registra `supplier_evidence_mvp138` append-only versión 9, conservando versiones 1–8 y ACL `service_role`. La función de seguimiento privado extiende `verifier_version between 2 and 8` a `between 2 and 9` sin tocar otra lógica. No hay ranking económico ni contacto de proveedores durante la ronda.

## Pruebas y despliegue
CI de unitarios y Deno, PDF sintético con columna de descuento Ailín 22.4% y Nahuel 0.0%, tasas inventadas, subtotal alterado, total ausente y flete extra; PostgreSQL 17 BEGIN/ROLLBACK sobre los originales reales y prueba de permisos. Desplegar SOLO `cotironda-piloto-document-recovery` preservando fuente real Office en el bundle actual de 15 archivos; cron Vault existente sin envíos WhatsApp de prueba. Si la fuente real sigue sin quedar corroborada, conservar `needs_source_review` y continuar diagnóstico, jamás marcar verificado artificialmente.

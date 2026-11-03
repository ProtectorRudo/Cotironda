# MVP144 — Aclaraciones comerciales del PDF con orden visual distinto

Fecha: 03/11/2026. Issue #488. Ámbito exclusivo: `cotironda-piloto`. No modificar `main` ni producción.

## Falla reproducida

El Excel de Nahuel ya pasó v5 y devuelve una oferta anónima al comprador. La
revisión v6 del PDF original de Ailín reconoció el total, pero lo retuvo con
`uncovered_note`: sus condiciones comerciales declaradas se distribuyen en
objetos PDF que no siempre mantienen el orden de lectura de la redacción IA.

## Cambio mínimo y seguro

- Las condiciones de pago, plazo, flete y lista se cotejan por *tokens completos*
  relevantes de las líneas **no consumidas** del PDF, no por su secuencia
  artificial. Se conservan todas las negaciones (`no`, `sin`, etc.),
  números y porcentajes exactos, con normalización acotada de acentos,
  conectores y plural de “precio/día”.
- Cada renglón comercial del original continúa obligado a estar respaldado
  en la nota propuesta. Un concepto omitido, cargo monetario sin demostrar,
  IVA asumido, monto alterado, documento sin hash, detalle sospechoso o PII
  sigue retenido.
- Una línea aislada que solo prueba el descuento ya verificado de un ítem
  no se exige por duplicado en las aclaraciones. El descuento probado aparece
  explícitamente en la presentación Cotironda.
- Revisión v7 **append-only**, sin borrar v1–v6. Se preservan el original,
  el enlace del comprador, el anonimato, la idempotencia y la prohibición
  de ranking económico sin comparabilidad real.

## Criterios de aceptación

1. Unitarios: nota comercial reordenada, descuento en fila separada,
   número/negación cambiados, cargo pallet adicional, total incorrecto.
2. PostgreSQL 17: ejecutar el SQL dentro de `BEGIN/ROLLBACK`, controlar
   `service_role`, lectura de la última evidencia por proveedor y 0 duplicados.
3. Deploy solamente a la Edge `cotironda-piloto-document-recovery`.
   Ejecutar recuperación desde el cron privado existente, sin mensajes Whapi.
4. Base real: PDF de Ailín y XLSX de Nahuel ambos `verified`, el
   enlace del arquitecto devuelve **2 ofertas anónimas y 0 pendientes**.
   Si no se alcanza, el trabajo NO está resuelto.

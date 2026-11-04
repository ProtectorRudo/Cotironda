# MVP145 — Encabezados comerciales PDF vs condiciones verificables

03/11/2026 — Issue #488. Exclusivamente `cotironda-piloto` (no `main`/producción).

El diagnóstico temporal autenticado del PDF original de Ailín, contrastado por SHA256,
mostró que el cotejo completo de sus aclaraciones era válido; la retención
`uncovered_note` se debía a palabras de **encabezados de tabla** (`ITEM`,
`CANT`, `DESCRIPCION`, `DSCTO`, `SUBTOTAL`), etiquetas de correo,
`OBSERVACIONES` y el plazo de cero días con ceros a la izquierda. El lector
los interpretaba como nuevas condiciones económicas.

Cambio: verificar **todas** las condiciones redactadas contra los objetos PDF
originales; para líneas comerciales sobrantes, comparar vocabulario económico
protegido (IVA, flete, entrega, pago, contado, sin/no, descuentos, cargos, etc.)
y números; permitir solo encabezados reconocidos sin dinero/porcentajes.
`0000` y `0` comparten valor cero, pero **otros números no** se omiten.
Cualquier precio $ adicional, línea monetaria, recargo, negación, condición
nueva, total cambiado o descuento inverificable retiene el archivo. PDF fuente
privado y presupuesto original intactos. Proyección anónima incluye descuento
literal fuente; **no hay ranking económico ni WhatsApp saliente**.

La revisión SQL v8 agrega evidencia sin sobrescribir v1-v7, mantiene permisos
solo de `service_role` y token comprador, recupera desde cron ya autorizado.

Criterios de cierre: seis CI verdes, SQL BEGIN/ROLLBACK validado en PG17,
revisión E2E real: Ailín PDF `verified`, Nahuel XLSX `verified`,
seguimiento con dos ofertas anónimas y cero documentos pendientes; retirar
tanto el endpoint de diagnóstico temporal como la función privada SQL de
diagnóstico. Producción intacta.

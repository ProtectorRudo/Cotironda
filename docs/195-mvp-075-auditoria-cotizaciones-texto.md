# MVP-075 — Auditoría económica fiel de cotizaciones textuales (02/11/2026)

## Contexto del piloto
Cotironda ya recibió de un arquitecto un pedido real por WhatsApp (cemento + hidrófugo, entrega La Plata), y recibió la cotización de Ailín, preservando **literalmente** el texto en `offer_versions.original_quote`. Esos hechos **no** demuestran todavía extracción económica confiable, IVA/flete, equivalencias ni ranking. El presupuesto de ensayo contenía `$180.000`, `$35.000` y `TOTAL: $215.000` sin centavos. Según el criterio conservador ya aprobado en MVP-063, un único separador de tres dígitos puede representar miles o decimales; **no se decide en silencio**.

## Implementación offline, no producción
- `src/domain/auditoria-cotizacion-texto-mvp075.ts` compone el espejo íntegro `capturarPresupuestoOriginalMvp063` y agrega **anotaciones independientes**: número de línea, texto exacto, importes literales, categoría aproximada (`concepto`, `embalaje`, `flete`, `descuento`, `impuesto`, `subtotal`, `total`, `nota`), indicación de IVA/flete y verificación aritmética limitada.
- Se usa **BigInt en centavos** para importes inequívocos con centavos e importes enteros sin separador, y se pueden comprobar líneas explícitas `N x $ precio = $ importe`. Si la multiplicación no cuadra, se rechaza la conciliación.
- Los signos de descuentos se respetan únicamente si el renglón es inequívoco. Se conserva todo: cabecera, líneas vacías/CRLF, embalajes no solicitados, cargos, descuentos, IVA, flete, nota, **total literal**, hash SHA-256.
- `sumaObservada` se calcula solo si los montos atribuibles son seguros y todos los renglones con importes están contabilizados. No significa `costo final comparable`; nunca reemplaza el total del proveedor. Se bloquea con subtotal monetario, IVA con moneda no atribuible, USD, flete a convenir/contradictorio, notas con importes o un solo monto inseguro.
- Aunque una suma coincida con el total, la cotización **no está habilitada para ranking ni adjudicación**, porque todavía faltan la homologación de productos, cobertura, IVA, flete, forma de pago y fecha de entrega verificables.
- El módulo **no se conecta a Supabase ni WhatsApp**, no llama a IA y no expone los presupuestos a clientes. Debe integrarse en un futuro lector protegido por empresa y versión, sólo tras auditoría; no desplegar en producción implícitamente.

## Criterios de aceptación y pruebas
- Texto de ensayo de Ailín: 5 renglones conservados, hash igual, literal `$215.000`, `estadoTotal=ambiguo_no_verificado`, IVA/flete no informados, no suma numérica, no ranking.
- Caso controlado con `20 bolsas x $9.500,00 = $190.000,00`, `5 litros x $4.200,00 = $21.000,00`, `2 pallets x $7.000,00 = $14.000,00`, flete `$12.000,00` y descuento `-$3.000,00`: suma independiente `234000.00`, total declarado `234000.00`, original intacto.
- Diferencia monetaria, multiplicación incorrecta, importe sin formato verificable, totales duplicados, subtotal, moneda extranjera, IVA contradictorio, flete sin definir y nota monetaria generan observaciones/bloqueos; jamás corrección silenciosa.
- Pruebas nuevas `tests/unit/mvp075-auditoria-cotizacion-texto.test.mjs` dentro de `npm run test:unit` y `npm run typecheck`.

## Limitaciones que NO se deben ocultar
Las categorías textuales son anotaciones conservadoras, **no** clasificación semántica completa. Ninguna línea se asigna automáticamente a un artículo del comprador y ninguna presentación o marca se trata como equivalente técnico. Las cifras con separadores ambiguos se muestran literalmente, sin esconderlas. El total declarado puede diferir de cualquier suma parcial y siempre se muestra por separado. El código no evalúa presupuestos originales de PDF, fotos, planillas o Word; esos formatos requieren persistencia segura y evaluación por fuente.

## Estado de despliegue
Rama de desarrollo `feat/mvp-075-auditoria-presupuesto-texto`. No se cambió Supabase, Whapi, Vercel, DEV histórica ni producción, y la salida WhatsApp continúa apagada.

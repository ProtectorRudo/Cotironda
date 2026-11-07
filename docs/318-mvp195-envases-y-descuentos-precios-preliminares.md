# MVP195 — envases de cemento e hidrófugo en referencias de precio fuente

**04/11/2026. Solo desarrollo. No publicar ni alterar piloto, producción,
WhatsApps, identidad, adjudicación o descargas.**

## Problema real verificado (solo lectura)
El selector antiguo de finalistas (SQL MVP159) exige descripciones iguales,
`unit_literal` explícita y cantidad literal idéntica. Los diez renglones
del piloto tienen `unit_literal=NULL`, pese a tener evidencia de presentación
de origen. Esto deja fuera una equivalencia comercial frecuente: 20 bolsas
de cemento de 50 kg solicitadas vs. 40 bolsas de 25 kg cotizadas. También
se verificó el caso 5 L de hidrófugo vs. un envase de 5 L de otra marca.

**La equivalencia NO significa que una oferta completa tenga un precio
final comparable**: IVA, flete, pago, stock y moneda aún deben auditarse.

## Cambio concreto

1. Se reutiliza el cotejador de presentaciones existente
   `cotejarPresentacionObraMvp174`. El comparador documental preliminar
   `compararPreciosCotizadosMvp185` acepta ahora un conjunto opcional
   `pruebasEnvasesObra` del servicio PRIVADO, para cemento gris y
   hidrófugo (no aplica automáticamente a materiales de otros rubros).
2. Cada prueba indica **item del pedido, línea fuente, SHA de original v9,
   familia y descripción literal ORIGINAL del pedido**, y debe estar cotejada
   por el proveedor privado contra la solicitud real; no aceptar valores de
   frontend, IA ni proveedor como autorización.
3. Requiere fuente de igual hash, página/fila verificadas, unidad en columna
   realmente no declarada, familia que coincide, presentación literal
   cuantificada en descripción de la cotización y equivalencia comercial
   corroborada. Solo acepta cantidades físicas totales equivalentes.
   **40 × 25 kg = 20 × 50 kg**, pero 20 × 25 kg no equivale a 20 × 50 kg.
   **Un envase expresamente de 5 L = 5 L**, pero cinco unidades de
   “hidrófugo en pasta” no prueban cinco litros.
4. Se permite comparar el **importe original del renglón** por la cantidad
   completa del pedido, no el precio nominal de una bolsa suelta.
5. Se incorpora un control adicional para **todos** los artículos, no
   solamente estos casos: el `unitarioComercialTrasDescuento` de la
   auditoría económica debe conciliar en centavos con la cantidad y el
   total literal del original y coincidir en página y fila con la evidencia
   independiente. Nada de saltarse descuentos, pallets ni otras líneas.
6. Agrega advertencia
   `presentacion_envase_diferente_misma_cantidad_sin_stock`.
   Conserva `rankingFinalHabilitado=false`, `stockConfirmado=false`,
   `impuestosCalculados=false`, `contactosRevelados=false`,
   `adjudicacion=false` y `originalesDescargables=false`.

## Prueba representativa de los 2 presupuestos del piloto

Un fixture reproduce exclusivamente importes/materiales y presentaciones
de la ronda de prueba sin copiar identidad del proveedor:

- Cemento: 40 bolsas de 25 kg a 7603,70 = **304.148,00**.
- Hidrófugo: un envase de 5 L a **6.211,22**.
- Subtotal de materiales por fuente: **310.359,22**.
- Una segunda oferta con cemento CPC de 50 kg puede resultar más barata
  nominalmente; **si dice 5 unidades de hidrófugo en pasta sin volumen,
  NO puede competir por la canasta completa como si fuera 5 L**.
- No existe adjudicación ni notificación, y el ejemplo no verifica
  la moneda, IVA ni flete de la transacción real.

Este fixture no transforma la fuente PILOTO, no recalcula las ofertas
publicadas y no publica un ranking. Se requiere luego un productor servidor
de correlaciones con acceso al request y las fuentes, moneda respaldada
independientemente y unión al cierre/portal.

## Pruebas y pendientes

Regresiones: cementos 25/50 kg, hidrófugo 5L, discrepancias de peso/litros,
pedido/archivo, prueba SHA cruzada, renglones duplicados, página/fila,
fuente desactualizada, descuentos corridos y parcial aparentemente más
barato. También correr suite completa + Next/Deno/PG.

**Sigue abierto:** #535 (productor de evidencia y moneda, comparador real),
#524 (recomendación económica real con condiciones), #523 (worker de cierre
posterior a activación prospectiva), #525 (originales con consentimiento),
#529 (checklist); NO marcar ninguno terminado.

El antiguo planner SQL no cambia: continúa protegido y desactivado por
`finalist_activation_mvp113=false`. No dirigir el worker a una pareja
comercial sugerida sin consentimiento y prueba completa; la selección por
descripción exacta sigue siendo una **restricción pendiente** y debe
reemplazarse con un vínculo robusto por solicitud/hashes antes de activar.

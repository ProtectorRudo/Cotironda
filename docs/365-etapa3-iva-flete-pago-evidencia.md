# Decisión 365 — IVA, flete y pago: condiciones acreditadas en la fuente (MVP242)

**Etapa:** 3, comprensión comercial avanzada. **Fecha:** 06/11/2026.
**Estado inicial:** desarrollo. No desplegar en Supabase PILOTO ni producción.

## Riesgo que corregimos

El lector MVP225 solo comprobaba que `ivaEvidencia`, `fleteEvidencia`
y `pagoEvidencia` fueran subcadenas del mensaje del proveedor. Una IA
podía declarar `iva=incluido_explicito` con la «evidencia» `IVA` o
incluso `cemento`. Si dos lecturas repetían el mismo error, la
clasificación resultaba indebidamente verificada. Lo mismo se aplicaba
a flete y pago.

## Regla nueva

- **IA interpreta lenguaje libre**, abreviaturas y condiciones; el módulo
  determinista `evidencia-condiciones-mvp242.ts` confirma que la
  fuente y la cita literal apoyen **el mismo estado**. No es un
  diccionario de materiales ni reemplaza la comprensión semántica.
- IVA: distingue explícitamente `IVA incluido`, `con IVA`,
  `IVA 21% incluido` de `sin IVA`, `más IVA`, `+IVA`,
  `IVA no incluido`. Nunca calcula alícuota.
- Flete: distingue `flete incluido/sin cargo`, `flete aparte`,
  `flete a convenir/cotizar`. `Entrega el lunes` o `retiro
  por local` no prueban flete incluido ni excluido.
- Pago: contado/efectivo, transferencia o crédito comercial;
  `tarjeta de crédito` no demuestra `crédito comercial` y
  `entrega a 30 días` no equivale a `pago a 30 días`.
- **Ausencia de dato:** `no_informado` con evidencia nula.
  Conservar la convención del rubro (precios operativamente tratados
  sin IVA cuando no se menciona), pero no afirmar «IVA excluido»
  como hecho acreditado ni añadir impuestos. Tampoco inventar
  flete, entrega o descuentos.
- Si una fuente mezcla `IVA incluido` y `sin IVA`, o ofrece
  `contado o transferencia`, su único campo global no puede
  representar correctamente todas las variantes: conservar el texto
  original y marcar **revisión**, nunca elegir arbitrariamente.
  La ampliación a condiciones por renglón/opción es trabajo posterior.
- El comparador por rubro también valida el contenido literal del
  original cuando recibe una cotización tipada por otra ruta.
  No puede tratar como comprobadas condiciones inventadas.
  **Cobertura, productos, montos y extras se conservan**, sin
  fabricar comparaciones ni adjudicaciones globales.

## Criterios de aceptación

- `IVA` como cita aislada no certifica `IVA incluido`.
- `IVA no incluido` jamás se interpreta `IVA incluido`.
- `IVA/flete/pago no_informado` se admite sin pedir al proveedor
  datos que no mencionó; pero una omisión de una condición explícita
  queda en revisión para no perderla.
- Flete `a convenir` no equivale a `incluido` ni a `aparte`.
- `Contado o transferencia` no se comprime artificialmente a contado.
- Una fecha de entrega no es una condición de pago ni prueba el costo
  del flete.
- Los precios exactos por artículo siguen usando `BigInt`.
- Sin envío de WhatsApp, sin escritura SQL, sin despliegue al piloto.

## Pruebas y alcance

Corpus unitario MVP242 sobre IVA, flete, pagos, citas falsas,
contradicciones, valores ausentes, cotejo directo, y doble lectura
MVP225. Regresión completa de las pruebas previas, compilación de
TypeScript/Next.js y chequeos de seguridad del repositorio.

La etapa 3 continúa: falta interpretar condiciones compuestas por
ítem (flete por artículo, pago mixto), equivalencias de presentaciones,
documentos PDF/Excel/imágenes y E2E comercial real. No afirmar
que la etapa 3 esté terminada tras este cambio.

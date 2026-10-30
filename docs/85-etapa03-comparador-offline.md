# 85 — Etapa 03 / D022 propuesto: comparación justa OFFLINE de ofertas

**30/10/2026 · Issue #143 · módulo `src/domain/comparacion-ofertas.ts` · sin red ni datos reales.**

## Alcance entregado
- Evalúa hasta **8 renglones y 10 ofertas** sintéticas. Es un límite deliberado de complejidad de laboratorio, no del producto futuro.
- Entrada estricta: cantidad solicitada y unidad por artículo; ofertas **confirmadas y versionadas**; ID anónimo (sin identidad ni contactos), cantidad disponible, unidad, equivalencia técnica `verificada/sin_verificar/incompatible`, precio unitario **neto**, IVA explícito `0/10.5/21`, moneda, pago, plazo, flete final (IVA incluido) y mínimo de compra (importe final de materiales IVA incluido).
- Los datos tienen que venir de un backend **confiable y autenticado**, con catálogo homologado y oferta confirmada. El campo `equivalencia:'verificada'` **no se puede aceptar directamente de un comprador, proveedor o salida IA**. Es un contrato de motor, no autorización de acceso.
- Valores monetarios como strings decimales **hasta 2 decimales**, cantidades decimales hasta 3. Se calculan precios con `BigInt` (centavos enteros; fracción de cantidad en milésimas), redondeando **half-up** en el subtotal neto de cada renglón y su IVA de renglón. La conversión de unidades, los impuestos desconocidos y los tipos de cambio **no se inventan**.
- Distingue **cobertura por renglón y cantidad** de valor comparable. Cuando falta stock, no hay confirmación, no coincide unidad, hay alternativa sin homologar o falta información económica, reporta motivo y mantiene `totalComparable:null`.
- Busca canasta **completa** con 1 proveedor y con hasta 2 proveedores, asignando cada renglón entero a exactamente un proveedor, sin duplicar cantidad. En escenarios de dos proveedores agrega flete una sola vez por proveedor y verifica su mínimo sobre el subtotal IVA incluido **individualmente**, no sobre el total del grupo.
- Ofertas y combinaciones sólo comparten orden/puesto si coinciden la **moneda, forma de pago y plazo de entrega exactos**. Grupos con una sola opción carecen de `puestoDentroDeCondiciones`. Empates no producen posiciones distintas.
- La salida jamás emite nombres/contactos ni adjudica: `contactoRevelado:false`, `adjudicacionAutomatica:false`, `estado:'comparacion_offline_sin_adjudicacion'`.

## Restricciones deliberadas y riesgos
- **No optimiza fraccionamiento de un mismo artículo entre proveedores**: si A dispone 5 bolsas y B 5 bolsas para un pedido de 10, aún no propone A+B. La salida declara `limite:'solo_asignacion_de_lineas_completas_sin_fraccionar'` y `optimoGlobalGarantizado:false`. No se debe presentar como la solución más barata de cualquier reparto posible.
- No incluye descuentos por volumen, bonificaciones, distintas tasas aduaneras, retenciones, seguros, variación temporal, envases alternativos y excedentes, redondeos particulares del proveedor, crédito, financiación, flete dependiente del volumen, múltiples monedas ni comparaciones con fechas de validez distintas. La moneda puede ser ARS o USD pero **nunca mezcla ni convierte**.
- `fleteFinal` exige costo total ya confirmado con impuestos incluidos; `minimoCompraFinal` exige mínimo confirmado de **materiales con IVA**. No se asume que la ausencia de información equivale a 0. Se limita a un conjunto de formas de pago versionado.
- No hay API, RLS, almacenamiento, servidor multiempresa, interfaz, ronda real, mensajes a Whapi ni pago. La optimización matemática se audita por tests; ningún resultado habilita negocio comercial.
- El orden dentro de grupo refleja exclusivamente **costo declarado en idénticos términos modelados**, no fiabilidad, desempeño de entregas o valoración comercial. El comprador decide siempre.
- **Antes de piloto:** matemática decimal y facturación con escenarios de impuestos de cada rubro, aceptación de validación técnica con documentación, min/max por producto, condiciones reales, precio con impuestos y descuentos, motor de reparto fraccionado o señal explícita de no disponibilidad, y pruebas cross-tenant de confirmación.
- **No se modifica el flujo D021** de IA ni se consumen reservas del laboratorio, que sigue bloqueado en 4/6 con Issue #141 abierto.

## Pruebas adversariales
`tests/unit/comparacion-ofertas.test.mjs`: total con IVA 21%, IVA 0, fletes, 1 vs 2 proveedores, cotizaciones parciales con precio menor, cantidades limitadas, unidades erróneas, alternativas no homologadas, cantidades fraccionarias, redondeo exacto, moneda USD/ARS sin FX, formas de pago y plazos distintos, mínimos, precios/IVA/flete desconocidos, duplicados, campos de identidad extra, ofertas sin confirmar y entradas maliciosas. Sin red, IA, proveedores ni secretos.

## Criterios de liberación de código
PR de revisión con todos los checks GitHub verdes; fuente de verdad GitHub; no merge al main ni publicar a producción. La presente implementación no finaliza la Etapa 03.

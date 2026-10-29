# 06 — Ranking justo y compra óptima

## Regla principal
**Nunca comparar totales de ofertas que contienen distinta cantidad de materiales.** Evaluar cobertura y competitividad por separado.

## Cobertura
Por líneas: cantidad de líneas cumplidas / total solicitado. Además informar cantidad satisfecha por línea; 8 de 10 unidades no equivale a cumplimiento pleno. A=13/13, B=10/13, C=2/13 no significa que C gane por su menor suma.

## Comparación
Solo artículos técnicamente equivalentes, mismas cantidades y unidades normalizadas. Considerar IVA, moneda, stock, transporte, mínimos, plazo, descuentos y pago. Marca alternativa permitida si cumple especificaciones; marca obligatoria debe respetarse para considerar conforme.

## Competitividad
Evaluar precios unitarios en artículos verdaderamente coincidentes; mostrar número de artículos comparados. Ejemplo: los mismos diez productos A=$1.000.000 y B=$950.000: B cuesta 5% menos **en esos diez**, sin declarar ganador general. Posición ordinal solo para canasta completa, condiciones equivalentes y datos suficientes; de otro modo «no comparable».

## Optimización
1. Mejor costo total de un solo proveedor que cubra toda la demanda.
2. Mejor combinación de hasta dos proveedores cubriendo todo sin duplicar cantidades; recalcular fletes por proveedor, descuentos y mínimos.
3. Si ninguna combinación cubre la lista: mostrar faltantes, sin anunciar «compra completa».
4. Decisión final humana; incluir criterio de disponibilidad y plazo.

## Ejemplo
A cotiza los 13 ítems por $1.300.000 + $40.000 de flete = $1.340.000. B baja algunos precios; A+B suman $1.250.000 en materiales, pero $100.000 de fletes = $1.350.000. A sigue siendo opción menos costosa para el pedido completo, si cumple condiciones.

## Pruebas
Cálculo decimal exacto y explicación reproducible; casos de IVA, unidades, ofertas parciales, faltantes, mínimos, fletes, vencimientos, empate, alternativas, monedas y dos proveedores.

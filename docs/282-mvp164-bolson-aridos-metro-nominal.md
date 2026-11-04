# MVP164 — BIG BAG / bolsón de áridos = 1 m³ **comercial nominal**

**Decisión del negocio, 04/11/2026. Issue #538; plan #529, ranking #535.**

## Regla incorporada

En Argentina, un *BIG BAG*, *bigbag*, *big biag* (errata frecuente) o *bolsón* de **arena, piedra, granza, grava, ripio o cascote** se comercializa habitualmente como **un metro cúbico nominal embolsado**. Ejemplos de catálogos argentinos: https://dimazconstrucciones.com.ar/categoria/corralon/arena/ y https://materialesvialero.com.ar/producto/piedra-partida-6-20-por-bolson-1m3/. El volumen nominal es una convención de venta, **no** medición del material entregado.

- `1 BIG BAG de arena` = **1 m³ nominal** de arena.
- `2 BIG BAG de piedra` = **2 m³ nominales** de piedra.
- `bolsón arena fina 0,75 m³` = 0,75 m³ *por bolsón*: prevalece el volumen expresamente declarado.
- Presentaciones pequeñas, peso especial, bolsas de cemento/otros productos y documentos con volumen contradictorio **no** heredan esa conversión.
- No se equipara arena genérica a **arena fina**, piedra genérica a **piedra partida** ni piedra rodada a partida. Se informa `variedad_no_informada` o `variedad_distinta`; la **cantidad nominal** se puede reconocer sin inventar especificación.
- No se inventa IVA, precio neto, stock ni flete a partir de esta regla.

## Aplicación

`src/domain/aridos-bolson-mvp164.ts` es un módulo puro con datos fuente-verificados (v9 y hechos MVP163) que reporta `volumenM3PorUnidad`, `volumenM3Cotizado`, `origen` (`convencion_nominal` o `capacidad_expresa`) y estado separado de variante. No cambia importes ni otorga ranking. La fuente de prueba identifica BIG BAG aunque `unit_literal` del PDF sea NULL.

El servicio PILOTO cuenta con una función **privada solo service_role** que aplica la regla a archivos ya comprobados (requiere vinculación con fuente verificada v9 y MVP163) y devuelve únicamente sugerencias de presentación comerciales, no decisiones de adjudicación. No publica contactos, documentos, nuevos WhatsApps ni modifica `supplier_quote_lines_mvp101`, `supplier_evidence_mvp138` o `public_text`.

## Pruebas/pendiente

Probar documento de Ailín/Nahuel: **dos bolsón de áridos por presupuesto**, arena = 1 m³ nominal y piedra = 2 m³ nominal, variantes **fina/partida no explícitas**. Normalizar cantidades y unidades abre la posibilidad de comparar *cobertura nominal*, pero el ranking económico sigue requiriendo descuento neto auditado, IVA/flete/pago/stock y equivalencia técnica; no se puede anunciar ganador basándose solo en envases.

Faltan conexión de la normalización comercial al adaptador MVP162 y al portal de cierre, descarga segura de todos los originales consentidos, tratamiento de formatos de imagen y más de 25 líneas/10 ofertas.

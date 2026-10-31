# 70 — Preparación de alternativas de cotización sin homologación automática

**30/10/2026 · Issue #113 · Etapa 02 · rama `feat/02-alternative-package-proposals` sobre PR #111.**

## Por qué
El cotejo exacto de catálogos evita errores, pero puede dejar fuera proveedores que venden la misma familia técnica en envases distintos o que registraron un nombre comercial diferente. Cotironda **debe permitir propuestas razonables sin fabricar equivalencias**. El comprador envía su lista una sola vez; ninguna aprobación manual por línea fue reintroducida.

## Alcance de este PR: motor puro sin efectos
Se agregó `src/domain/alternativas-cotizacion.ts` con `proponerAlternativasDeCotizacion(...)`. **No modifica ni conecta el despachador exacto `planificarDespachoAutomatico`**. Consume un borrador ya validado, requisitos técnicos explícitos, SKU de proveedor confirmado y relaciones curadas. Todos esos metadatos **deberán provenir de un servicio servidor autorizado y respaldarse con evidencia**, no de la salida libre de la IA o del comprador. En esta etapa son datos sintéticos de pruebas.

Devuelve un objeto con estado **`simulacion_alternativas_sin_envio`** y propuestas agrupadas por proveedor (clave idempotente separada). Cada propuesta está etiquetada como:

- **`presentacion_alternativa`**: misma familia técnica, mismas especificaciones críticas y magnitud compatible (`kg` o `l`), pero otro tamaño o envase. Se calculan envases enteros, contenido solicitado, ofrecido y excedente mediante **aritmética decimal exacta con BigInt**. No se compara como producto idéntico ni se inventa precio.
- **`consulta_funcional`**: existe una relación expresamente curada entre la denominación solicitada y un SKU confirmado del proveedor. No se conoce equivalencia de formulación ni dosificación; se transmite únicamente una consulta con advertencia técnica para que el proveedor confirme ficha/uso. No se calculan envases ni se equipara económicamente.

Si falta consentimiento del comprador para distribución, no hay propuesta. Si el proveedor está suspendido, fuera de zona, sin opt-in o en opt-out, se excluye. Si la línea original está dudosa, tiene duplicado conflictivo o marca obligatoria diferente, se retiene. La **confianza declarada por la IA** no es prueba técnica.

## Ejemplos sintéticos verificables

| Pedido original | Catálogo confirmado | Propuesta de laboratorio | Estado |
|---|---|---|---|
| 20 bolsas de cemento CPC clase 40 de 50 kg | Cemento CPC misma clase, bolsa 25 kg | 40 bolsas; 1.000 kg solicitados, 1.000 kg ofrecidos, sin sobrante | Presentación alternativa sujeta a proveedor |
| 4 L de hidrófugo de formulación confirmada | Envase 5 L, misma formulación | 1 envase; 5 L ofrecidos, 1 L sobrante | Presentación alternativa sujeta a proveedor |
| 20 L de látex interior con atributos críticos idénticos | Envase 18 L | 2 envases; 36 L ofrecidos, 16 L sobrantes | Presentación alternativa sujeta a proveedor |
| Ceresita | Hidrófugo de SKU relacionado y ficha pendiente | Consulta sobre uso/marca/dosificación, **sin conversión ni afirmación de equivalencia** | Consulta funcional curada |
| Ligante | Tacurú registrado como aditivo vinílico | Consulta con restricción: **no asumir promotor de adherencia** | Consulta funcional curada |

Para cemento de otra familia CPN/CPP o clase diferente, látex exterior en vez de interior, placa RH vs RF o 9,5 vs 12,5 mm, **no** se emite una propuesta de presentación. No se convierten kilogramos a litros sin densidad acreditada. Una marca obligatoria impide proponer otras marcas.

## Pruebas y limitaciones
`tests/unit/alternativas-cotizacion.test.mjs` aporta casos de masa, volumen, sobrantes, decimales, clase distinta, familias distintas, relaciones curadas, marca obligatoria, consentimiento, zonas, duplicados y aritmética determinista. Los ejemplos son sintéticos y no prueban compatibilidad de productos comerciales reales.

**No se hicieron envíos WhatsApp, pruebas de IA real, nuevas tablas en Supabase ni carga de archivos de clientes.** El módulo no asigna precios ni adjudicaciones, no decide el ranking y no confirma fichas. Activar sugerencias en producción requerirá decisión comercial sobre cuándo consultar al proveedor y cómo exponer las alternativas, RLS/consentimiento/WhatsApp validados, catálogos reales y verificación técnica de relaciones.

**Fuentes de referencia para futuras validaciones de catálogo:**
- [Cementos Loma Negra](https://www.lomanegra.com/tipo_de_productos/cemento/)
- [Weber Tacurú](https://www.ar.weber/mezclas-de-albanileria/tacuru)
- [Weber Ceresita](https://www.ar.weber/ceresita)

**No cerrar Issue #112 completo:** falta catálogo real, reglas por rubro, atributos críticos homologados, ofertas alternativas en UI y ranking/normalización de costos. Este PR cierra solo un primer corte técnico limitado del Issue #113.
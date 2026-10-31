# 72 — D015: invitar por producto, comparar técnicamente después

**30/10/2026 · Issue #117 · Etapa 02 · rama `feat/02-broad-product-invitation` hija de PR #116.**

## Corrección del propietario
Un arquitecto suele solicitar **«cemento»**, no un código técnico concreto. Si pide «cemento Loma Negra de 50 kg» y un corralón comercializa «cemento Avellaneda de 25 kg» (o una presentación hipotética de 35 kg), Cotironda **debe ofrecerle participar**. La marca o el envase no constituyen el producto; la decisión final corresponde al comprador. Esta misma oportunidad comercial aplica a los proveedores de pinturería, construcción en seco, electricidad y sanitarios.

## Dos preguntas diferentes, dos validaciones diferentes

1. **Elegibilidad para recibir una consulta de cotización:** el proveedor confirmó que comercializa **ese producto/familia canónica** y atiende la zona, está activo, tiene consentimiento WhatsApp y no pidió baja. No pedir que haya SKU idéntico en marca/envase, ni exigir atributos que el comprador no especificó. Una sola solicitud por proveedor/ronda con las líneas correspondientes. Nunca invitar solo por pertenecer al rubro genérico.
2. **Cumplimiento de lo solicitado y comparación de ofertas:** cuando el proveedor responde con un SKU/marca/presentación y su precio, se verifican atributos técnicos, envases, rendimiento, disponibilidad, IVA, flete y pago. Si difiere en un atributo crítico explícito (ej., RH/RF, sección del cable, resistencia del cemento), la respuesta queda **marcada como alternativa técnicamente distinta, no comparable como conforme**. El comprador puede examinarla y decidir; nunca ocultar esa diferencia ni adjudicar automáticamente.

Esta política D015 **rectifica la fase de invitación** de D014, que filtraba variantes antes de preguntar al proveedor. D014 mantiene los atributos técnicos en la evaluación de la oferta, no como puerta automática a toda consulta.

## Qué significa «marca obligatoria»
La descripción «Cemento Loma Negra 50 kg» aporta una **marca mencionada/preferida**. **NO** crea exclusividad por sí sola. Solo formulaciones como **«solo Loma Negra», «marca Loma Negra obligatoria» o «no acepto sustitutos»** justifican restringir a esa marca. La IA puede proponer esta bandera, pero debe conservar la frase fuente y validarse; ante duda no declarar cumplimiento de otra marca. En el contrato actual `marca_obligatoria=true` filtra: su correcta extracción con respaldo textual sigue pendiente de tests reales de OpenAI.

## Código entregado — simulación offline
`src/domain/invitaciones-por-producto.ts` contiene `planificarInvitacionesPorProducto(...)`. Recibe borrador ya validado con cantidad y unidad confiables, mapeo **curado** de cada fila a producto_id (ej. `cemento_gris_obra`, `pintura_latex`, `cable_unipolar`, `placa_yeso`) y SKUs confirmados por proveedor. Estos identificadores no pueden venir de la IA ni del navegador sin revisión del servicio de catálogo.

La salida `invitaciones_por_producto_sin_envio` agrupa una sola invitación por proveedor/ronda; cada línea contiene solicitud original, marca mencionada, cantidad y opciones concretas del proveedor. No se fusionan ni borran productos del comprador.

Las opciones se etiquetan:

- `mismo_producto`: familia igual y atributos expresamente solicitados sin contradicción, más presentación base conocida. Aun así requiere cotización/confirmación del proveedor y `comparable_como_identico=false`.
- `verificar_especificacion`: faltan atributos importantes o conversión de presentación, o unidad base no declarada. **Se envía una pregunta, no una equivalencia**. Cantidad de envases sugeridos `null` cuando el arquitecto escribió solo «10 bolsas de cemento» sin indicar tamaño.
- `diferencia_tecnica_declarada`: familia igual, pero un SKU registrado declara un atributo contradictorio respecto de la solicitud (p. ej., placa RH versus RF). El comercio **puede recibir la consulta** para cotizar un SKU correcto si lo obtiene o informar una alternativa con la diferencia a la vista. El código no propone cantidades de una variante contradictoria ni la homologa.

**Ejemplos de laboratorio:**

| Comprador escribe | Corralón o comercio registra | Elegible para preguntar | Cómo se presenta la alternativa |
|---|---|---|---|
| «10 bolsas de cemento» | Cemento Avellaneda 25 kg | Sí | Cantidad de envases a determinar; no inventar kg por bolsa solicitada |
| «20 bolsas de cemento Loma Negra 50 kg» | Avellaneda 25 kg o 35 kg | Sí | Marca no exclusiva. Si tipo y contenido están verificados, 40×25 o 29×35, marcando excedente de 15 kg en 35 kg |
| «Solo Loma Negra, no reemplazar» | Exclusivamente cemento Avellaneda | No por esa marca | Conserva restricción explícita del comprador |
| «Placa RH 12,5 mm» | Comercio con placa RF 12,5 mm confirmada | Sí, consulta | **Diferencia técnica declarada**; no afirmar que RF cumple RH |
| «Cable 2,5 mm²» | Comercio con cable 1,5 mm² confirmado | Sí, consulta | Diferencia de sección; el proveedor debe aclarar disponibilidad de lo solicitado |
| «Cemento» | Solo adhesivos cerámicos | No | Familia/producto distinta aun si el rubro es corralón |

## Seguridad, costos y estado
- Planificador **puro, sin llamadas de red**, sin WhatsApp, catálogo real ni precios. La lista de alternativas se deriva de SKUs ficticios confirmados en pruebas; no se tocaron cuentas ni proveedores reales.
- No abrir una categoría entera indiscriminadamente: deben existir coincidencias por `producto_id` confiable + rubro + zona/consentimiento del proveedor. Las alternativas incoherentes de familias diferentes no entran.
- La IA económica extractora propone texto, cantidades, marca y requisitos; el catálogo curado decide familia y candidaturas, no la confianza subjetiva del modelo.
- El módulo no activa ni sustituye aún `planificarPorProducto`, `proponerAlternativasDeCotizacion` ni `planificarDespachoAutomatico`; la integración backend/Whapi, datos curados y medición real de recall/precisión de invitaciones siguen pendientes.
- No afirmar precisión GPT-6 Luna sin ensayo real; las pruebas son unitarias con datos sintéticos.

## Relación con los módulos anteriores
PR #116: coincidencias de identidad y características para alternativas compatibles; PR hijo D015: **invitación amplia por producto confirmado**. El futuro motor comercial utilizará D015 para preguntar y D014/criterios técnicos para evaluar qué contestó cada proveedor. Ranking justo y adjudicación manual permanecen. No lanzar piloto hasta verificar RLS, consentimiento, costos, colas idempotentes, antivirus de archivos y desempeño real de IA.
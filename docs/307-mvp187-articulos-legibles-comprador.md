# MVP187 — Material y cantidades claras en el enlace privado del comprador

**04/11/2026 · Solo desarrollo, no desplegado · Issues #529/#535/#528.**

## Problema funcional
La vista de importes MVP186 mostraba únicamente «Artículo 1», «Artículo 2» y cifras literales. En una lista de obra eso obliga al comprador a ir y volver al PDF para identificar materiales, y permite interpretar erróneamente como equivalentes importes de cantidades o presentaciones distintas.

## Solución en el circuito EXISTENTE, sin un paso extra
1. Del pedido previamente cargado y acreditado por `private_round_inputs_mvp172`, se muestran **descripción del material** (`descripcionSolicitada`, máximo 500 caracteres), **cantidad solicitada** (`cantidadSolicitada` con precisión de tres decimales) y **unidad solicitada** (`unidadSolicitada`).
2. Cuando un renglón de presupuesto ya superó SHA/v9, localización de fuente, descuentos y asignación inequívoca de MVP186, se muestra su **cantidadCotizadaLiteral**, sin convertirla a la unidad del pedido. Si el renglón no tiene importe vinculable, ambos campos de importe y cantidad quedan `null`, sin generar falsos precios comparables.
3. No se añade ninguna cifra calculada, ranking, recargo, IVA, flete, disponibilidad ni confirmación: «Pedido: 2 m³» y «Cantidad indicada en la oferta: 40 (presentación del proveedor)» explican que un subtotal no representa necesariamente la misma cantidad de material.
4. Se usa únicamente la descripción **del comprador**, nunca la descripción sin filtrar del documento del proveedor, que podría contener datos personales. Se presenta como texto seguro (`textContent`, jamás HTML).
5. Edge retorna solo estos campos ya verificados; Vercel repite lista blanca, longitud, unidad, formato de cantidad y relación oferta↔artículo; la UI valida por tercera vez. Una fuente con contacto, SHA, HMAC, ruta de Storage u otros campos no atraviesa el proxy.
6. Los mecanismos previos de revocación de enlace, desconexión y respuesta tardía siguen borrando por completo la sección. No se incluye ninguna función o tabla nueva.

## Comprobación sobre datos del piloto — SOLO LECTURA
Una consulta de agregados sobre `private_round_inputs_mvp172` dio exactamente **4 cotizaciones, 10 renglones con localizador independiente y auditoría económica, 10 unitarios de descuento conciliados, 10 cantidades de origen y 10 totales literales**. Otro control numérico independiente sobre la misma fuente validó **10/10 multiplicaciones precio unitario × cantidad hasta centavos**, sin mostrar importes ni contactos. Cero unidades explícitas estructuradas: las alternativas por presentación siguen informativas, no equivalencias demostradas.

## Qué falta para activarlo
- CI del SHA final (unidad, PostgreSQL 17, PostgREST, Edge Deno, sitio y Next.js).
- En PILOTO, instalar con autorización la versión revisada de `mvp172_private_round_inputs.sql` (ya ensayada con BEGIN/ROLLBACK en MVP186), desplegar Edge de seguimiento y Vista Vercel **solo en el entorno piloto**, después correr smoke HTTP con enlace real consentido, token inválido, revocación y fallo de red.
- Cualquier problema de credenciales, cuota Vercel o exactitud causa NO-GO y rollback; nunca habilitar ranking ni originales por esta mejora. El comprador puede seguir descargando presupuestos solo después de completar la política propia de autenticación+consentimiento #525.

## Seguridad y alcance
Únicamente un cambio de **presentación de información ya conocida y autorizada**, no un nuevo lector IA, no apertura de contactos, no nuevas preguntas al proveedor y no publicación en `cotironda.com`. El estado `ranking_allowed=false` y las restantes barreras del MVP186 permanecen sin cambios.

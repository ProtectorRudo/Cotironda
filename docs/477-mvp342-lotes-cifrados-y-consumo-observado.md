# Decisión 477 — MVP342: cifrado por lectura y consumo medido

**Fecha:** 10/11/2026. **Estado:** solo desarrollo/CI, sin aplicar al piloto.
**Dependencias:** PR #742, #743, #745, #746, #747 y #748.

## Problema

La IA Central debe conservar una lectura por lote, con origen atribuible, sin exponerse a duplicados ni gastos incobrables. MVP264 ya mide tokens reales en el circuito previo, pero el límite de dos lecturas por proveedor no sirve para presupuestos largos. MVP339, MVP340 y MVP341 planifican, reservan, leen y cierran resultados **agregados** sin conservar las lecturas cifradas ni el consumo detallado por lote.

## Implementado (sin despliegue)

- Cifrado AES-256-GCM, clave independiente de 32 bytes, nonce aleatorio por lectura y AAD que vincula ronda, proveedor, HMAC de mensaje/chat, hash del archivo y plan, recibo único, lote, perspectiva y modelo. Ningún precio sin cifrar sale de la lectura interna.
- Tabla privada con una fila por origen/lote/perspectiva, RLS activado y REVOKE incluso para SELECT de service_role. Estado reservado, observado o consumo desconocido. Solo almacena ciphertext, IV, digest, hash del ID de respuesta y **tokens observados**; no guarda texto en claro ni un costo monetario supuesto.
- Tres funciones internas exclusivas de service_role: reservar cada llamada antes de enviar a OpenAI, registrar lectura cifrada con tokens realmente observados o registrar consumo incierto, y verificar que todas las llamadas del documento hayan sido registradas antes de finalizar. Cuota inicial: 24 llamadas y 150.000 tokens observados por comprador en 24 horas. El total puede excederse por una llamada individual y **NO es un presupuesto monetario**.
- Worker privado de medición: envuelve el worker MVP341, exige reserva de origen MVP340 y reserva de llamada MVP342, mide la respuesta de API, cifra su lectura antes de persistirla y recién entonces permite pasar al siguiente lote.
- Adaptador de Responses API que reutiliza la validación estricta del lector MVP339 (sin herramientas, sin almacenar conversaciones) y extrae los campos de uso input, output, total y hash de response ID. Un uso incompleto es desconocido, no cero.
- Adaptador Deno separado sin ruta HTTP, sin cron ni modificaciones al webhook publicado.

## Aceptación y seguridad

1. Dos cifrados del mismo contenido usan IV diferentes; no es posible descifrar con otra ronda, proveedor, recibo, fuente, lote, perspectiva o modelo.
2. Archivo DOCX/XLSX de ensayo se asocia a ronda, pasa por SHA, reserva, dos lecturas medidas, cifradas y persistidas antes del cierre privado.
3. Presupuesto insuficiente, respuesta duplicada, error de red, tokens ausentes o resultados de IA inverificables se retienen sin publicación ni reintentos automáticos.
4. PG17 debe negar acceso a anon y authenticated, proteger tablas incluso ante SELECT de service_role, y detener estados fuera de orden o gasto incierto. Ensayo en transacción con ROLLBACK obligatorio.
5. Prohibidos OpenAI real en tests, WhatsApp saliente, cron, cambio de precios y publicación de ofertas.

## Lo que todavía falta

- La cuota de tokens no calcula gasto real en USD o ARS; hace falta obtener y versionar tarifas verificadas, tipo de cambio/factura y un presupuesto monetario por empresa. El costo incierto sigue bloqueando reintentos.
- Política de retención, rotación y recuperación de clave de cifrado. La clave no se imprime, no se guarda en base y no puede ser reutilizada desde otra función sin gestión segura de secretos.
- Auditar la suma de costos previos MVP264 y nuevo MVP342 para un límite global, incluida empresa compradora.
- Corroboración económica determinista en 25+ líneas, IVA, flete, descuentos, cantidad comparable, disponibilidad y totales. Los datos cifrados **son lecturas propuestas**, no ofertas comercialmente aprobadas.
- OCR independiente de imágenes/PDF escaneados, Office complejo/legado y corpus humano de al menos 150 documentos comerciales genuinos.
- Consolidad PR #742 a #748 y este PR en entorno de desarrollo; preflight de backups y costos, host interno autenticado, publicación separada al piloto y prueba real de WhatsApp a ranking, ofertas anónimas y cierre.

## Próxima acción recomendada para retomar el piloto

No demorar indefinidamente el ensayo simple por pretender primero soporte universal. El circuito antiguo de WhatsApp ya cuenta con envíos comprobados, pero una consulta reciente **solo lectura** al piloto encontró 6 mensajes entrantes, 1 archivo archivado y 0 vínculos nuevos en las últimas 48 horas, además de 2 rondas abiertas. Antes de pedir nuevas cotizaciones hay que resolver esa ambigüedad. Validar con Ailín y Nahuel el pedido nuevo, la asociación inequívoca del PDF/Excel a su ronda, la oferta anónima verificable, la vista del arquitecto y el cierre automático. No se puede anunciar la reactivación hasta comprobarlo en vivo.

**Decisión:** finalizar seguridad de la lectura, pero concentrar el siguiente bloque en consolidación y recuperación operacional del piloto, sin inventar resultados ni prometer una fecha.

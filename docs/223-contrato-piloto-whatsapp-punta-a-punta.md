# Contrato operativo — Cotironda piloto WhatsApp de punta a punta

**Versión acordada 02/11/2026.** Este documento define el criterio de aceptación del **circuito completo**, no certifica que todas las etapas estén implementadas. Prevalece sobre versiones anteriores cuando se contradicen sus preferencias de comunicación: los valores de presupuestos **verificados** pueden verse anónimamente durante la ronda, las identidades de negocios solo se revelan a los finalistas al cierre.

## 1. Entrada del arquitecto
- **Un único WhatsApp**, que puede incluir saludo, conversación previa, una foto de una hoja, PDF, Word, Excel, texto u otro formato soportado; la IA interpreta intención, detalles de entrega, artículos, cantidades, unidades, marcas preferidas, especificaciones y observaciones. No asume unidades, precios ni localidad faltantes. Si no son datos de materiales, contesta solo consultas de Cotironda para las que tiene información comprobada y no inicia solicitudes.
- **Si falta localidad** o especificación imprescindible: pide **una única aclaración agrupada**, breve, por WhatsApp, y vincula su respuesta al archivo y chat originales sin pedir reenvío. Si la localidad está presente, no la vuelve a pedir ni llena el recorrido de confirmaciones.
- Una solicitud que está completa y enrutable recibe: «Cotironda ya tiene los datos de tu pedido. Ahora nos encargamos de reunir las mejores cotizaciones. Seguí el avance acá: [enlace privado]». El enlace es único, privado y abre la plataforma de seguimiento de esa ronda.
- **Regla vital**: no anunciar «ya estamos cotizando» si todavía falta material, cantidad, unidad o zona esencial. Si ningún negocio cubre todos los rubros, informar esa limitación sin fingir que se solicitó todo. En un piloto limitado, una zona que no se cubre debe indicarse.
- **Datos siempre preservados:** lista completa del arquitecto, rubro/clasificación por ítem, ciudad, aclaraciones y fuente original; sin agregar condiciones IVA o flete que el cliente no pidió. La IA propone; ruteo se determina por catálogos declarados y localidad.

## 2. Distribución a proveedores
- Cada negocio recibe **solo los materiales de los rubros que vende**, con cantidades y especificaciones del pedido, zona/localidad, aclaraciones pertinentes, fecha límite, código Cotironda y un PDF propio profesional. No recibe nombres ni teléfonos del arquitecto antes de que la ronda autorice revelar. Nada se inventa ni se reescribe silenciosamente.
- WhatsApp es la interfaz principal. El portal de proveedor es opcional. Confirmar recepción no debe ser requisito.
- El sistema reserva una sola invitación por ronda/negocio. Ante timeout de Whapi no reenvía a ciegas, sino que registra estado incierto y requiere conciliación.

## 3. Recepción de presupuestos
- El negocio cotiza por texto, foto, PDF, Excel, Word o medio soportado. Cotironda agradece **una vez** la recepción, sin anunciar que los importes fueron aprobados.
- Se conserva el original y la identidad del negocio privados. La IA propone una transcripción de **todos** los conceptos y sus importes literales: solicitados y extras como pallets, bolsones, flete, IVA, descuentos, envases, intereses, condiciones comerciales y TOTAL. No se pierden signos ni reemplaza el total declarado por una suma.
- Se verifica cada ítem contra fuente y segunda lectura cuando corresponda, con análisis decimal determinista. Si falta evidencia o un campo es ambiguo, la propuesta queda en revisión **interna**; no se exige al negocio reconfirmar cada importe como rutina.
- Una proyección **aprobada, fiel y sin contacto comercial** aparece en el portal bajo un seudónimo estable durante la ronda. Si el proveedor corrige presupuesto, la revisión pendiente **oculta** la versión vieja hasta aprobar la última.

## 4. Seguimiento del arquitecto
- Enlace privado con token de 256 bits en fragmento de URL (no query string). Actualización del contenido, fechas de cierre, cantidad recibida y archivos pendientes de revisión.
- Los datos económicos de cada oferta **aprobada** se pueden ver **anónimamente mientras la ronda está abierta**; nunca nombre, teléfono, CUIT, dirección, mail, archivo crudo ni marca del negocio que lo identifique. No se publican posiciones anticipadas o invitaciones para bajar precios.
- Si hay menos de dos ofertas verificadas, se muestra la situación real, sin falsas promesas. Enlace revocado, expirado, ronda cancelada o consentimiento retirado bloquea acceso.

## 5. Comparación y cierre
- Plazo por defecto: **4 días** (configurable conforme reglas), medido en servidor. Al cierre, el motor **determinista** distingue **cobertura** de ítems y competitividad. Compara productos equivalentes y mismas unidades/cantidades, IVA/flete/embalaje/descuentos/pago/entrega explícitos. Las marcas se admiten como equivalentes salvo exigencia exacta.
- Proveedores con presupuestos parciales se presentan como parciales: nunca gana una oferta solo por tener total menor porque cotizó menos artículos. Considera una solución total de un negocio o una combinación de **hasta dos** si cubre todo y los costos son comparables.
- Revela al arquitecto únicamente los datos de contacto de **hasta dos finalistas justificados**, con evidencia y autorización vigente; nunca inventa segundo ganador ni declara «el más barato» sin condiciones comparables.
- A cada negocio seleccionado envía **un** WhatsApp: «Tu presupuesto quedó entre las dos alternativas finalistas de Cotironda para esta solicitud. Te compartimos los datos de contacto del comprador para que puedan coordinar: ...». Solo incluir datos expresamente consentidos; si no hay dos comparables, el mensaje debe indicar lo que el proceso realmente determinó, o mantenerse en revisión.
- Registros atómicos e idempotentes de ganadores/finalistas, motivos del cálculo, contactos revelados y envío incierto. El comprador negocia directamente; Cotironda no adjudica ni cobra comisión al proveedor.

## 6. Condiciones de salida para **declarar el piloto listo**
- [ ] 1. Un comprador real por WhatsApp en lenguaje natural manda un pedido mixto **sin localidad**; recibe una sola pregunta y contesta; se crea la ronda exacta y se envía un enlace funcional.
- [ ] 2. Otro pedido real **con localidad** inicia directamente, sin repetir preguntas. Ambos conservan todos los materiales y la clasificación por rubro comprobada contra catálogo.
- [ ] 3. Cada proveedor invitado recibe exclusivamente su solicitud propia en PDF, con zona/plazo correctos. Se comprueba entrega real de Whapi, no solo respuesta HTTP.
- [ ] 4. Dos proveedores cotizan en formatos diferentes, uno con **extras** y descuentos. La IA agradece una vez; el archivo original y la versión anónima son fieles 100% en conceptos/valores/condiciones, corroboradas contra fuente; si falla, se bloquea y explica.
- [ ] 5. El comprador ve **en vivo** propuestas autorizadas, nunca datos de contacto, y ve actualización/versión. Token incorrecto, enlace robado/revocado, cliente no consentido, reintentos, pedido fuera de región y otra empresa no filtran datos.
- [ ] 6. Se simula el cierre con reloj controlado y luego un cierre real: comparador determinista no compara totales parciales, identifica hasta dos finalistas justificadamente, revela contactos solo en momento correcto y manda un solo WhatsApp a cada seleccionado.
- [ ] 7. Pruebas extremas: documento de más de 8 ítems/25 líneas, archivos grandes, IVA sin aclarar, flete externo, descuentos, distintas presentaciones, artículos no cubiertos, mensajes con saludo, errores del modelo y Whapi incierto. No descartar renglones ni inventar datos.

## Estado al crear este contrato
- MVP-104 propone corregir link a compradores de PDF/foto y sus aclaraciones, y agregar acuse a negocios con reserva SQL; probado en transacción revertida, **no desplegado**.
- MVP-105 propone visualizar proyecciones **ya aprobadas** durante la ronda sin identidades; probado con datos sintéticos bajo rollback, **no desplegado**.
- Quedan **SIN resolver** la corroboración de fidelidad documental sin intervención habitual, la proyección automática segura, ranking y revelación bilateral, los límites de formatos/ítems y **toda la prueba de mensajes reales completa**. Una suite verde de CI o una función Edge activa no prueba esos puntos.

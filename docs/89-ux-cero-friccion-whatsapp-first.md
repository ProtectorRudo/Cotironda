# 89 — UX-001: simplicidad radical, WhatsApp primero y cero fricción innecesaria

> **Rectificación aprobada UX-002 (31/10/2026):** el arquitecto NO adjudica en Cotironda. Al cierre, el sistema identifica automáticamente hasta dos presupuestos finalistas comparables por rubro y revela contacto comercial mutuo solo a las partes elegibles previamente consentidas y verificadas. Contacto no es venta; cualquier frase histórica de adjudicación manual o doble «Confirmo» en este documento queda sustituida por [docs/159](159-ux-002-finalistas-y-contacto-mutuo.md).

**Decisión fundacional APROBADA por el propietario · 30/10/2026 · Issue #151.**

> **Cotironda tiene que ser tan intuitiva que un comprador y un corralón quieran usarla sin capacitación, tutorial ni obligación de entrar a un sistema nuevo.**
>
> **La tecnología trabaja detrás; las personas simplemente piden, responden y se ponen en contacto.**

## 1. Principios no negociables

1. **WhatsApp primero para las dos partes.** Compradores y proveedores pueden avanzar desde su conversación habitual. El portal es un tablero opcional de seguimiento, comparación y decisiones puntuales; no se exige para enviar o responder una cotización.
2. **Una sola carga, nunca transcripción doble.** Cotironda recibe texto, PDF, planilla, documento, foto o audio donde el canal y la tecnología permitan interpretarlo con confiabilidad. No obligar a reescribir, desglosar manualmente por rubro, copiar precios ni instalar una aplicación. Si WhatsApp no admite alguna operación, ofrecer alternativa clara y accesible, sin prometer capacidades inexistentes.
3. **Cada quien recibe solo lo que necesita.** El proveedor recibe exclusivamente los materiales pertinentes a su catálogo/producto y cobertura; mensajes breves, naturales, contexto y plazo visibles. El comprador no recibe jerga de IA, SQL, versiones o rankings engañosos.
4. **Automatizar lo repetitivo y pedir intervención solo ante una decisión o dato ambiguo.** El comprador autoriza la distribución al enviar el pedido (D013), sin aprobar cada línea segura; los renglones dudosos se retienen y consultan puntualmente, sin frenar los demás. La respuesta del proveedor identificado constituye cotización recibida sin segundo «Confirmo», y sus correcciones generan versiones atribuibles, sin formularios extensos.
5. **Nada de pasos ocultos ni callejones sin salida.** El próximo paso, plazo y estado deben ser comprensibles. La conversación y el portal muestran el mismo estado verificado; reintentos y fallos se resuelven sin repetir lo ya recibido y sin duplicar mensajes.
6. **Privacidad y trato profesional.** No mostrar otros proveedores, sus ofertas, el contacto de un comprador o datos personales fuera de las reglas aprobadas. No presionar a bajar precios ni enviar recordatorios excesivos. Mensajes simples, educados y en español argentino.
7. **Móvil antes que escritorio.** Mensajes legibles en pantallas chicas, botones claros si existen, accesibilidad, lectura escaneable, navegación sin capacitación, y opción de ayuda humana o explicación puntual cuando sea necesaria.

## 2. Flujo ideal comprador — sin curso

1. Envía **una sola vez** por WhatsApp o portal una lista o archivo de materiales e indica lugar de entrega y plazo si falta.
2. Cotironda entiende, segmenta en rubros/productos, valida catálogo y zona, y distribuye automáticamente únicamente lo seguro y autorizado; **no** obliga a revisar una lista línea por línea (D013).
3. Recibe confirmación honesta: «Recibimos tu pedido; consultamos a los comercios correspondientes. Faltan aclarar estos dos artículos», **solo si esas acciones ocurrieron**.
4. Si hay dudas concretas, responde una pregunta puntual; en cualquier momento puede consultar por WhatsApp «¿Cómo viene?» y, si quiere, abrir el portal para ver solicitudes, estados y ofertas.
5. Al vencer el plazo configurable (por ejemplo, 7 días) ve opciones comparables y parciales claramente diferenciadas. **No se adjudica ninguna compra**: Cotironda identifica hasta dos finalistas comparables por rubro y habilita contacto comercial mutuo consentido, sin botón de adjudicación ni compra en la plataforma.

## 3. Flujo ideal proveedor — tan sencillo como responder a un cliente

1. Recibe por WhatsApp una invitación pertinente y comprensible, con productos, cantidades, plazo y zona; consentimiento activo, frecuencia razonable y «no recibir más» sencillo.
2. Contesta por **texto, foto, audio o archivo** según posibilidad técnica del canal: no tiene obligación de abrir el portal ni crear una planilla nueva.
3. La IA interpreta la cotización y prepara **un borrador**. Si faltan IVA, presentación, unidad, flete o entrega, hace preguntas breves y específicas; **no inventa valores**.
4. Cotironda registra la respuesta del proveedor autenticado como oferta recibida, sin solicitar «Confirmo» adicional. Una corrección enviada por el mismo proveedor crea una nueva versión atribuible; ante ambigüedad real se pregunta solo lo imprescindible.
5. El comercio puede preguntar «¿Se registró?», «¿Cuándo cierra?» o «¿Cómo salió?» desde WhatsApp sin entrar al portal. Nunca recibe un puesto engañoso ni datos de competidores.
6. Ante fallo de procesamiento, recepción o desconexión de Whapi, el sistema muestra estado honesto y alternativa, sin dar por recibido/entregado algo que no llegó.

## 4. Lenguaje de producto que simplifica

| Evitar | Preferir |
| --- | --- |
| «Iniciá una licitación de materiales» | «Pedí presupuestos» |
| «Alta y gestión de oferta versionada» | «Enviá tu precio» / «Confirmá tu presupuesto» |
| «Error de validación semántica del ítem» | «¿De cuántos kilos es la bolsa?» |
| «Solicitud enviada» si solo está en cola | «Estamos enviando tu pedido» |
| «Presupuesto recibido» si solo está en cola | «Recibimos tu mensaje; estamos registrando la cotización» |
| «Ganaste la venta» cuando solo es finalista | «Tu propuesta quedó entre las finalistas; ya podés contactar al comprador» (solo tras verificar entrega) |

Estos ejemplos **no son mensajes automáticos habilitados**; se evaluarán por políticas de WhatsApp y claridad con usuarios piloto.

## 5. Filtro obligatorio para cada Issue/PR

Antes de aprobar una nueva función, responder con evidencia:
- ¿Qué problema resuelve al comprador o proveedor? ¿Puede hacerlo por WhatsApp sin ir al portal?
- ¿Le agregamos una cuenta, paso, pantalla, descarga, copia manual o explicación que podría evitarse? Si sí, justificar o rediseñar.
- ¿Qué pasará cuando reciba un texto incompleto, foto borrosa, error de interpretación, duplicado, desconexión o respuesta fuera de plazo?
- ¿El estado mostrado es verdadero y sincronizado entre canales?
- ¿Qué confirma la persona realmente y qué hace la IA sin permiso? Mantener consentimiento, autorización, precios atribuibles y revelación mutua autorizada al cierre.
- ¿Puede resolverlo desde un celular, con lectura breve y accesible, sin saber qué significa «ronda» o «homologación»?

**Puerta de calidad UX:** ningún PR que agregue interacción se considera listo para piloto sin una prueba del flujo completo con una persona no técnica de cada rol, sin capacitación ni guía paso a paso. Los tests técnicos son necesarios pero no suficientes.

## 6. Métricas para piloto (línea base y objetivos pendientes de medir)

- Tiempo desde primer pedido hasta distribución válida, y desde invitación hasta primera oferta confirmada.
- Cantidad de decisiones y mensajes exigidos por operación completada; aclaraciones innecesarias.
- Porcentaje de compradores que completan un pedido **sin entrar al portal**; porcentaje de proveedores que cotiza y confirma **solo por WhatsApp**.
- Tasa de abandono, consultas de ayuda, necesidad de capacitación, tiempo hasta entender qué hacer.
- Respuestas malinterpretadas, correcciones humanas, duplicados o estados incorrectos.
- Bajas de WhatsApp, exceso de notificaciones y costo por ronda.

**No inventar metas numéricas** antes de medir la línea base con usuarios reales; el éxito se juzga por finalización fácil y confiable, no por cantidad de pantallas, funciones o mensajes enviados.

## 7. Simplicidad no significa negligencia

«Cero fricción» significa **cero fricción innecesaria**, no quitar consentimiento de envío, opt-in del proveedor, autenticación/permisos, controles técnicos, revisión ante ambigüedad, atribución de precios, privacidad, deduplicación, trazabilidad, límites de costos o revelación recíproca consentida de finalistas. Toda automatización opera dentro de esos límites.

## 8. Estado de implementación al registrar la decisión

**Visión aprobada; implementación completa por WhatsApp todavía pendiente.** Existen prototipos de extracción IA, comparación económica y motor de rondas en ramas de desarrollo. Whapi y su flujo conversacional real para ambos roles todavía no están conectados ni probados de extremo a extremo. Este documento **no habilita envíos, usuarios, adjudicaciones, conexiones ni producción**.

**Fuente de verdad:** UX-001 (Issue #151), D005 (WhatsApp preferido), D013 (sin revisión obligatoria de cada línea), D015 (selección por producto y zona), D023–D025 (rondas y permisos). En caso de contradicción, auditar y documentar antes de implementar.

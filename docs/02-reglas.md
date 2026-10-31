# 02 — Reglas funcionales

## UX-001 — regla transversal de simplicidad radical
No construir un sistema que obligue al comprador o al corralón a aprender un portal: **WhatsApp primero para ambos, web opcional para seguimiento y decisiones**. El usuario no transcribe ni separa rubros ni repite datos enviados. Mensajes con lenguaje claro, contexto, próximo paso y errores accionables; estados siempre honestos. Aclaraciones acotadas, sin interrumpir materiales seguros. La cotización enviada por el proveedor se registra sin un segundo «Confirmo» y puede corregirse; adjudicación siempre por el comprador. Cada interacción que añada pasos, pantallas o capacitación requiere justificación, tests móviles y prueba de usabilidad. **No confundir objetivo UX con WhatsApp ya funcionando.** Ver [docs/89](89-ux-cero-friccion-whatsapp-first.md).

## Pedido
- Empresa compradora autenticada carga documento o texto, datos de entrega, urgencia, condiciones y plazo.
- IA extrae líneas con cantidades, unidades, rubros, marca y especificaciones; dudas visibles. Nada inventado.
- Al **enviar la lista**, el comprador autoriza explícitamente la distribución automática; NO revisa ni confirma cada línea. Los ítems seguros se derivan sin intervención; los dudosos se retienen para aclaración puntual sin detener el resto.
- Plazos candidatos: 24/48 horas; 3, 5, 7 o 10 días. Vigencia y zona horaria se verifican antes del piloto.

## Proveedores
- Registro gratuito, catálogo por archivo o selección de categorías, revisado por el proveedor.
- Selección por producto ofrecido, entrega en zona, aceptación de comunicaciones y disponibilidad para cotizar.
- Catálogo declarado no equivale a stock disponible.
- Si omite un ítem, distinguir: no comercializa, sin stock, sin precio, olvidado.
- Invitaciones limitadas y pertinentes, con rotación y mecanismo de baja.

## Ofertas
- Recibidas por WhatsApp o portal y registradas como **oferta recibida al enviarlas**, siempre que la procedencia se verifique en el backend; **no pedir una confirmación adicional**. El proveedor puede corregir enviando una nueva versión.
- Oferta incluye moneda, cantidad, unidad, especificación, IVA, precio, transporte, descuentos, mínimo, plazo, disponibilidad y forma de pago.
- Si faltan datos determinantes, marcar «requiere aclaración». **No asumir IVA ni flete, ni que el precio es neto/bruto.** Cada proveedor declara en los **detalles de su oferta** si el precio incluye IVA o si es más IVA, con alícuota confirmada; y si el flete está incluido, se cotiza por separado, es expresamente sin cargo o está pendiente. Un valor omitido NO equivale a cero. Sin esas aclaraciones no presentar un importe final ni competir en ranking por precio. Ver docs/125.
- Cada nueva oferta o corrección enviada crea una versión inmutable. Al cierre se congela la última recibida dentro de plazo, salvo reapertura auditada.
- Marcas alternativas válidas si son técnicamente equivalentes y no hay requisito obligatorio; alternativas no equivalentes, visibles pero fuera del cálculo conforme.

## Privacidad y resultado
- Comprador ve importes y condiciones pero no nombre/contacto del proveedor durante ronda, según política a aprobar.
- Proveedores no ven identidad, oferta detallada ni archivos de competidores.
- No compartir ranking ordinal salvo canasta completa y comparación realmente equivalente.
- Adjudicación manual a uno o hasta dos proveedores por rubro con asignación de cantidades no duplicada.
- Sólo ganadores y comprador intercambian identidad/contacto según las reglas de adjudicación manual aprobadas. No garantizar compra ni entrega en MVP.
- Registrar transiciones, quién decidió, por qué y cuándo; prohibir adjudicar sobre datos no atribuibles al proveedor o modificaciones posteriores al cierre.

## Casos antiabuso
Pedidos falsos, invitaciones duplicadas por rubro compartido, cambios fuera de plazo, modificación de oferta ajena, proveedor sin consentimiento, archivos maliciosos y spam.

## Distribución automática D013
No alcanza pertenecer al rubro: coincidir producto específico confirmado en catálogo, unidad, dimensiones, marca si obligatoria y cobertura geográfica. La similitud semántica por IA sola no demuestra equivalencia técnica. Sin coincidencia verificable, retener esa línea y avisar, no inventar. Enviar una sola solicitud por proveedor/ronda con su subconjunto; no compartir documento completo, precios objetivo ni información innecesaria. Exigir autorización de envío del comprador, opt-in proveedor, baja respetada, anti-spam, cuotas e idempotencia. Informar al comprador DESPUÉS, no pedir aprobación previa por línea.

## Alternativas de presentación y consultas (propuesta para piloto, Issue #112)
El proveedor que confirmó un SKU compatible con requisitos técnicos esenciales pero distinto tamaño de envase **puede ser candidato a cotizar** el número entero necesario de envases; la cantidad real suministrada y el sobrante deben figurar, sin que Cotironda lo presente como idéntico. Los nombres comerciales relacionados requieren relación curada explícita y consulta al proveedor con uso/ficha técnica; nunca se infiere equivalencia a partir de palabras similares o confianza IA. Marcas obligatorias, normas, diferencias estructurales y familias incompatibles bloquean sustitución. Prototipo docs/70: offline sin Whapi, no modifica el despachador actual.

## D014 — identidad del producto como primer criterio (30/10/2026)
Primero identificar la **familia/producto funcional canónico**. La marca es una preferencia libre y el tamaño de envase una presentación, salvo marca expresamente obligatoria. Antes de considerar una variante válida, comprobar los **atributos técnicos esenciales** (por rubro: tipo/clase/resistencia, aplicación, ancho/espesor, aislamiento/sección y norma si aplica). Familia igual con atributos confirmados incompatibles = no enviar como cumplimiento. Datos críticos faltantes = **consulta técnica**, no comparar como idéntico. Si coincide, el proveedor puede cotizar cualquier marca y presentación de su catálogo confirmado, informando envases enteros, cantidad realmente ofrecida y excedente. Un comercio con varias marcas no recibe múltiples invitaciones por el mismo artículo. La oferta, las condiciones económicas y la decisión final son del proveedor y del comprador respectivamente. Módulo offline docs/71, sin Whapi ni producción.

## Rectificación D015 — separar invitación de comprobación de equivalencia
La consulta se dirige a **todos los proveedores elegibles que tengan confirmado trabajar ese producto/familia** dentro de la zona y con opt-in, incluso si el SKU registrado tiene otra marca o presentación, o las especificaciones que no pidió el comprador están ausentes. «Cemento Loma Negra 50 kg» no exige Loma Negra **por sí solo**; marca obligatoria solo con exclusividad expresa. No se filtra un proveedor de cemento por comercializar Avellaneda 25 kg. Con diferencias técnicas conocidas en la MISMA familia, el comercio puede recibir una **consulta de alternativa diferente** y ofrecer cumplir el pedido o declarar qué variante vende: esa alternativa nunca pasa por conforme/idéntica, no se inventa cantidad ni se ocultan discrepancias. Un proveedor de adhesivos no recibe «cemento» solo por ser corralón. La validación técnica estricta se hace **sobre la oferta real** antes de compararla, siempre adjudicación humana. Ver docs/72; módulo offline sin envíos.

## MVP-006 — Condiciones económicas del documento y del comprador
La IA debe leer notas, pies y aclaraciones **dentro del presupuesto** con evidencia literal verificable, no dar IVA/flete por ausentes únicamente porque no están en los renglones. Si no hay evidencia clara, mostrar «IVA no informado» o «Flete no informado»: el importe citado no acredita esos cargos, pero **nunca** afirmar «IVA excluido», «flete gratuito» o «precio final» como hecho sin declaración. Contradicciones se consultan, no se resuelven por estimación. Si el comprador exige **con IVA incluido**, incorporar esa condición en la misma solicitud enviada a cada proveedor elegible para que responda respetándola o aclare su imposibilidad. No agregar pasos al comprador ni invitaciones adicionales. Ver docs/126; solo protocolo offline probado, no IA live ni WhatsApp real.

## MVP-007 — Conversión controlada a borradores de cotización
En ofertas entrantes nunca asignar `precioUnitarioNeto` directamente a partir de un importe de presupuesto: primero verificar el origen del precio, si la nota dice **más IVA / incluido / no informado**, la alícuota explícita y el requisito expreso del comprador. En precio bruto con IVA solo calcular base cuando la conversión determinista al centavo recompone el bruto original; ante diferencias de redondeo, retener y preguntar. Flete cero solo si el proveedor declara sin cargo o incluido; flete adicional con monto y cita válida; omisión no equivale a cero. La cotización se registra al recibirla del proveedor verificado según la nueva decisión MVP-008; D046 de doble confirmación queda legado offline. Equivalencias técnicas siguen sin verificar. MVP-007 solo offline, sin Whapi ni IA live. Ver docs/127.

## MVP-008 — Regla vigente, prioridad máxima: fluidez sin pasos extra
**No pedir al comprador confirmación de renglones ni al proveedor confirmar una oferta que ya envió.** Enviar pedido autoriza distribuir; solo preguntar datos vitales ausentes, empezando por localidad/zona de entrega. Con zona de pedido o perfil vigente, no preguntar. Consultar una sola vez a cada comercio elegible con sus materiales y **zona de entrega**; incluir condiciones extraordinarias del comprador únicamente cuando las pidió de forma explícita (p. ej. con IVA). Respuesta de comercio identificada y autenticada = cotización recibida, visible con aclaraciones aunque falten IVA/flete; nuevas respuestas actualizan con versiones inmutables. El precio publicado puede mostrarse, pero **no se inventan totales finales ni rankings económicos** si faltan datos suficientes. Toda interacción de autorización, remitente, opt-in, idempotencia, adjudicación manual y privacidad se conserva. Ver [docs/128](128-mvp-008-flujo-sin-friccion.md): esta decisión rectifica confirmaciones redundantes históricas D022–D026/D046. Aún falta migrar SQL y Whapi real.

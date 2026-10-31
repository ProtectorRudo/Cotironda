# 02 — Reglas funcionales

## UX-001 — regla transversal de simplicidad radical
No construir un sistema que obligue al comprador o al corralón a aprender un portal: **WhatsApp primero para ambos, web opcional para seguimiento y decisiones**. El usuario no transcribe ni separa rubros ni repite datos enviados. Mensajes con lenguaje claro, contexto, próximo paso y errores accionables; estados siempre honestos. Aclaraciones acotadas, sin interrumpir materiales seguros. Precio/cambios requieren confirmación breve; adjudicación siempre por comprador. Cada interacción que añada pasos, pantallas o capacitación requiere justificación, tests móviles y prueba de usabilidad. **No confundir objetivo UX con WhatsApp ya funcionando.** Ver [docs/89](89-ux-cero-friccion-whatsapp-first.md).

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
- Recibidas por WhatsApp o portal y estructuradas en borrador; **el proveedor confirma** antes de validez.
- Oferta incluye moneda, cantidad, unidad, especificación, IVA, precio, transporte, descuentos, mínimo, plazo, disponibilidad y forma de pago.
- Si faltan datos determinantes, marcar «requiere aclaración». **No asumir IVA ni flete, ni que el precio es neto/bruto.** Cada proveedor declara en los **detalles de su oferta** si el precio incluye IVA o si es más IVA, con alícuota confirmada; y si el flete está incluido, se cotiza por separado, es expresamente sin cargo o está pendiente. Un valor omitido NO equivale a cero. Sin esas aclaraciones no presentar un importe final ni competir en ranking por precio. Ver docs/125.
- Cada cambio confirmado crea versión inmutable. Al cierre se congela la oferta vigente, salvo reapertura auditada.
- Marcas alternativas válidas si son técnicamente equivalentes y no hay requisito obligatorio; alternativas no equivalentes, visibles pero fuera del cálculo conforme.

## Privacidad y resultado
- Comprador ve importes y condiciones pero no nombre/contacto del proveedor durante ronda, según política a aprobar.
- Proveedores no ven identidad, oferta detallada ni archivos de competidores.
- No compartir ranking ordinal salvo canasta completa y comparación realmente equivalente.
- Adjudicación manual a uno o hasta dos proveedores por rubro con asignación de cantidades no duplicada.
- Sólo ganadores y comprador intercambian identidad/contacto después de confirmación. No garantizar compra ni entrega en MVP.
- Registrar transiciones, quién decidió, por qué y cuándo; prohibir adjudicación después de cambios no confirmados.

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

# 126 — MVP-006: condiciones económicas leídas de aclaraciones y requisito del comprador

31/10/2026 · [Issue #225](https://github.com/ProtectorRudo/Cotironda/issues/225) · Corrección comercial del propietario posterior a docs/125.

## Regla funcional

**Cotironda debe leer las aclaraciones y notas dentro de todo presupuesto**, no solo su tabla de artículos. La IA que procese el documento deberá extraer por separado evidencia textual de IVA y flete (texto exacto, ubicación verificable, atribución al proveedor), incluso si aparece al final del archivo, en un pie de página o en el mensaje de WhatsApp que acompaña el adjunto. Frases expresas como «IVA incluido», «más IVA», «no incluye IVA», «flete sin cargo», «flete aparte» o «flete a convenir» deben reflejarse en los **detalles** de esa oferta.

**Si no hay aclaración:** etiqueta operativa «IVA no informado; importe mostrado sin IVA adicional acreditado» / «Flete no informado; importe mostrado sin transporte acreditado». Esta etiqueta satisface la necesidad de mostrar al comprador lo que **no está acreditado** en el presupuesto, **sin** afirmar que el proveedor excluye IVA, cobra cero flete o tiene exención fiscal. No se debe llamar «precio final con IVA/flete» ni poner la oferta en ranking económico comparable hasta contar con bases completas y confirmadas. Omitido y cero explícito son diferentes. Una declaración expresa de IVA incluido tampoco autoriza calcular un precio neto sin tasa y base verificada.

**Pedido del comprador con IVA:** si la solicitud dice expresamente que quiere presupuesto con IVA incluido, debe transferirse esa exigencia **a cada proveedor elegible y en el mismo envío de la solicitud**, sin crear una invitación separada ni afectar catálogo/opt-in/zonas. Texto sugerido: «El comprador solicita cotización CON IVA incluido en el importe final. Indicá la condición y el IVA en las aclaraciones. Si no podés cotizar así, aclaralo expresamente.» Una cotización que no cumpla esa exigencia queda pendiente de aclaración o no conforme, no se presenta como si la cumpliese. Si el comprador no pidió con IVA, nunca imponerlo como regla predeterminada.

## Entrega comprobable MVP-006, **sin IA ni transportes reales**

- `src/domain/lectura-condiciones-documentales-mvp006.ts`: lector offline de aclaraciones por líneas, con números y citas literales y detección conservadora de IVA incluido/no incluido y flete incluido/gratis/adicional/a convenir. Contradicciones y ausencia conservan su estado, no se fabrican precios. `validarEvidenciaIA` comprueba cita literal y línea atribuida y vuelve a clasificarla con reglas; una salida inventada o la pregunta «¿IVA incluido?» no se aceptan como evidencia.
- **Límite esencial:** no hay llamadas reales al modelo, lectura de PDF/Word/imagen ni procesamiento de WhatsApp por esta función. El módulo es un contrato de validación para una futura extracción asistida. No se pueden atribuir a la IA real los aciertos de las reglas sintéticas.
- `src/domain/condiciones-comprador-mvp006.ts`: en el texto simple de la demo, reconoce exclusivamente **líneas enteras de instrucción económica explícita**, las separa del catálogo de materiales y preserva sus números originales, sin usar una mención casual o una condición inferida. Condiciones incompatibles bloquean la instrucción fiscal. No modifica el plan D015 de proveedores elegibles, su clave idempotente, el consentimiento ni la secuencia de distribución. **La condición se añade solo al primer mensaje por proveedor**, no a cada artículo duplicando notificaciones.
- La UI `/probar` muestra la condición detectada y las invitaciones simuladas. No envía WhatsApp ni cotiza de verdad. Las instrucciones largas o ambiguas se siguen reteniendo para la futura IA (no se inventa comprensión universal).

## Pendiente imprescindible para el piloto real

1. Conectar el lector/validador a las salidas de extracción IA con citas y evidencia por documento. Debe distinguir observaciones generales de línea de producto, anexos, precios brutos/netos e IVA con alícuotas verificadas; en conflictos, preguntar al proveedor.
2. Crear en el broker autenticado una representación versionada del requisito económico del comprador, persistirlo y exigirlo en el mensaje real por WhatsApp/portal sin duplicados. No permitir que una instrucción en un PDF suplante permisos de envío o altere proveedores.
3. El adaptador de cotización solo convierte bruto/neto con dato/tasa confirmados, nunca desde `no_informado`. Mantener el bloqueo del ranking D022 hasta tener base fiscal y flete verdaderamente comparables.
4. Probar con presupuestos reales consentidos, excepciones y notas en PDF/Excel/fotos y WhatsApp; medir precisión, falsas afirmaciones y costo. Bloqueo de restauración #175 continúa: **no instalar migraciones comerciales en DEV**.

## Aceptación

Pruebas unitarias sobre aclaraciones explícitas, no especificadas, ambiguas, contradictorias, falsificaciones de cita IA, fletes a convenir; solicitud comprador «con IVA» llega a proveedores elegibles, no a bajas/sin consentimiento, sin crear envío adicional. TypeScript, Next.js, smoke HTTP y PostgreSQL/PostgREST CI. Sin merge ni producción.

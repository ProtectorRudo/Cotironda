# 77 — Benchmark independiente de calidad comercial por producto (D015 + D016)

**30/10/2026 · Etapa 02 · Issue #127 · PR draft hija de #126.**

## Por qué existe
El evaluador antiguo `evaluacion-ia-documental.ts` calificaba un planificador de coincidencia **literal** de nombre y unidad. El negocio aprobado permite que un corralón de cemento Avellaneda cotice cuando el comprador pidió cemento Loma Negra en otra presentación. Por eso se requiere medir **cuántos proveedores elegibles se encontraron y cuántos destinatarios son incorrectos**, sin sustituir el criterio por coincidencia exacta de marca/SKU.

## Qué evalúa
`src/domain/evaluacion-invitaciones-producto.ts` recibe **los resultados reales del coordinador de pruebas** y un **gold independiente** definido antes de las respuestas del modelo, con una fila por material: línea de fuente, descripción, cantidad, unidad, rubro, `producto_id` canónico esperado y lista de proveedores elegibles esperados. Las marcas/envases de SKUs del proveedor **no se equiparan automáticamente** con la solicitud.

1. **Extracción exacta:** cada material gold se empareja uno a uno (multiset lógico) con una extracción del mismo origen/descripción/cantidad/unidad/rubro/producto canónico. Los duplicados no suman cobertura ficticia.
2. **Invitaciones correctas:** un proveedor se considera correcto si está en el gold de ese artículo específico, no porque venda algo de otro rubro o tenga la misma marca. Se contabiliza por par material/proveedor, con duplicados y destinatarios falsos penalizados.
3. **Puerta de seguridad:** `FAIL` ante artículos alterados/no reconocidos contados como distintos o invitaciones a un proveedor no esperado; retener un material no se confunde con enviarlo bien.
4. **Puerta de cobertura:** `FAIL` si la extracción o los destinatarios esperados quedan por debajo del umbral (100% para las pruebas sintéticas). Una omisión es pérdida de oportunidad, aunque todas las invitaciones realizadas hayan sido seguras.
5. **Nunca activar envíos:** `apto_para_envio_real=false` por diseño. El resultado pertenece al **laboratorio**, no a la cola de WhatsApp.

## Corpus sintético independiente
`tests/fixtures/gold-invitaciones-producto-v1.mjs` define doce solicitudes con sus **destinatarios esperados declarados** independientemente de las respuestas mock:

- Cemento Loma Negra mencionado, candidato Avellaneda de 25 kg.
- Cemento genérico, sin clase técnica inventada.
- Cemento CPC de 50 kg vs Avellaneda CPC en presentación de 25 kg.
- Cemento y látex juntos en una misma línea, ambos cubiertos.
- La misma línea omite pintura: seguridad PASS / cobertura FAIL.
- Cantidad 20 cambiada a 200: seguridad FAIL / cobertura FAIL.
- Marca expresamente exclusiva: solo corralón que ofrece Loma Negra.
- Corralones fuera de zona o que dieron baja no aparecen como destinatarios.
- Placa RH solicitada y proveedor con placa RF de la misma familia: **consulta con diferencia técnica**, no equivalencia homologada.
- Sin proveedor confirmado: no crear invitaciones.
- Cemento de contacto no es cemento gris de obra: no asignar el producto.
- Una línea omitida entre dos rubros.

Las pruebas adversariales además inyectan artificialmente un proveedor no esperado, una invitación duplicada y una cantidad cambiada **después** del coordinador para verificar que el evaluador no les otorgue un éxito.

## Comandos y evidencia
`npm run benchmark:producto:offline` (Node 22+) ejecuta estos casos con Responses API **MOCK**, muestra los contadores por escenario y retorna código distinto de cero si la clasificación esperada cambia. `tests/unit/evaluacion-invitaciones-producto.test.mjs` prueba también la métrica directamente. El benchmark no accede a Internet ni factura tokens y sus salidas **no prueban la calidad real de GPT-6 Luna**.

## Criterio para autorizar un ensayo live futuro
En entorno DEV aislado, con clave secreta de servidor y presupuesto autorizado, reutilizar el mismo gold pero dejar que OpenAI genere las respuestas. Registrar exactos, errores técnicos, omisiones, destinatarios correctos/falsos, latencia, tokens, costo por solicitud y errores por rubro. Luego analizar casos fallidos y ampliar el corpus con muestras autorizadas. No ajustar el gold después de ver respuestas para 'mejorar' la métrica.

## Límites actuales
- Estas 12 muestras prueban **instrumentación y puertas de calidad con mocks**, no un porcentaje real de aciertos ni precisión estadística.
- La clasificación del producto todavía proviene de un diccionario piloto limitado y no del catálogo completo argentino; un mismo producto puede tener atributos técnicos incompatibles, que deberán verse como alternativas transparentes.
- Si el gold no espera ningún proveedor, la cobertura de invitaciones es `null`, **no se inventa 100% de proveedores cotizando**. Una línea retenida por no pertenecer a la taxonomía puede ser correctamente detectada pero no es una cotización disponible.
- Antes de piloto: ampliar familias y corpus; catálogo por empresa con permisos, control del presupuesto, cuarentena/antivirus (Issue #61), pruebas reales de modelos, consentimiento WhatsApp y colas idempotentes.

**Estado:** un PR apilado sobre #126, sin merge a `main`, sin claves ni datos reales, sin deploy y sin mensajes.
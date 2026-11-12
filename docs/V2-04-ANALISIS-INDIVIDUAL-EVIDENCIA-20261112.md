# V2-04 — análisis individual del original, orientativo y no bloqueante

**12/11/2026. Desarrollo en rama; NO instalado, NO E2E, NO usuarios reales modificados.** Contrato maestro: Cotironda V2, no ranking ni ganadores.

## Qué se implementó

`src/server/v2-04-analisis-individual.ts` es un procesador de texto original para **una sola oferta**. No lee otras ofertas, no envía WhatsApp y no cambia ningún dato económico. Precondiciones estrictas: servicio ya autenticó al comprador y proveedor, consentimiento para exponer original, validó fuente y su SHA-256, y reservó cuota de IA por documento. En etapa inicial se acepta texto exacto de WhatsApp y texto extraído previamente del PDF/Excel con origen de bytes probado; **no presume que puede extraer PDFs/Excel binarios por sí mismo**.

Salida para portal V2: título `Lo importante de este presupuesto`, 2 a 4 observaciones con categoría (`cobertura, precio, IVA, flete, pago, plazos, disponibilidad, presentación...`), **cita literal de hasta 180 caracteres presente en la fuente original** y nota interpretativa breve. La llamada a IA usa Responses API, `store:false`, `tools:[]`, modelo permitido, salida JSON con esquema y timeout. No interpreta ni convierte importes automáticamente ni declara IVA/flete incluido si no hay evidencia; no compara canastas heterogéneas ni adjudica ganadores.

Se rechaza todo el análisis ante cita inventada, contenido malformado, contacto privado accidental en observaciones, SHA del texto diferente, falta de permiso, modelo fallando o límite de tiempo/tamaño. En TODOS esos casos devuelve `analisis_pendiente`, **nunca elimina ni bloquea el original**. El verificador no puede acreditar universalmente que una interpretación de texto sea acertada: esta salida sigue siendo una guía orientativa y debe representar fielmente el documento.

## Tests (sin credenciales ni presupuesto de API)

`tests/unit/v2-04-analisis-individual-evidencia.test.mjs` usa mocks de modelo y verifica comentarios sobre presentación, condiciones de pago y entrega, fuente literal, casos de identidad/consentimiento ausentes, fuente adulterada por SHA, citas inventadas, PII accidental, ranking engañoso, API 503 y respuesta malformada. GitHub CI en `cotironda-v2-04-analisis-individual.yml` y controles generales de TypeScript/Next.js.

## Qué falta para la funcionalidad real de la vista

- [ ] **Integrar** un trabajador sobre recepción auténtica de respuesta: obtener original autorizado/almacenado, extraer texto de PDF/Excel/Word si corresponde, verificar fuente y presupuesto de OpenAI, procesar **una sola vez por (ronda, proveedor, SHA)** con reintentos acotados y guardar guía/auditoría en Supabase privado.
- [ ] Conectar guía publicada, sin contenido privado ni exposición de otros compradores, al RPC `cotironda_piloto_v2_responders_private`, sin volver a puertas de cierre/economía. El portal hoy muestra literalmente `Análisis en preparación`; este PR por sí solo **no modifica esa visualización**.
- [ ] Si la IA falla, original disponible inmediatamente; si una oferta llega tardíamente se debe distinguir del plazo de publicación/cierre.
- [ ] Probar con originales reales del piloto, IVA/flete/cantidades y análisis general al cierre. **No declarar E2E hasta superar el recorrido WhatsApp→2 originales→portal→análisis→cierre.**
- [ ] Crear comprador real en Auth y registrar consentimientos V2 prospectivos antes de revelar nombres/documentos. Migraciones y deploy solo bajo `Publicalo`.

**No alterar** webhook v76 activo con el índice histórico; PR apilado sobre #823, no incluye la rama #814.


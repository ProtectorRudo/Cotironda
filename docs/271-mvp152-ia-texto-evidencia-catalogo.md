# MVP152 — IA que interpreta lenguaje libre, con prueba de fuente

03/11/2026. Issue #509, iniciativa #505. Solo rama y Supabase `cotironda-piloto`.

## Problema resuelto en código
Antes la decisión del modelo tenía que ser interpretada de nuevo por el MISMO parser de frases reconocidas. Si ese parser no entendía un texto libre pero cuantificado, se detenía la ronda o preguntaba algo ya explícito.

## Mecanismo
- Los pedidos reconocibles usan el fast-path determinista gratuito.
- Si el fast-path no entiende, se invoca un solo análisis IA, con cuota interna por comprador y mensaje original cifrado.
- El modelo recibe categorías curadas reales de los proveedores consentidos por zona, sin nombres ni precios.
- El modelo propone artículo, cantidad, unidad y una subcadena textual de evidencia.
- El verificador independiente requiere que cada artículo pruebe cantidad y unidad literales, descripción y familia, localidad exacta, y que ningún par cantidad/unidad del mensaje quede sin cubrir. Además rechaza discrepancias de artículos que sí reconoce el parser anterior.
- Los controles de acceso, clave Whapi, antifraude, deduplicación, consentimiento, vínculo por proveedor y auditoría económica quedan intactos. El LLM no envía mensajes ni calcula precios.

## Limitaciones pendientes
No se resuelve aún el lenguaje sin cantidad o unidad explícita; corresponde preguntar lo verdaderamente necesario. Siguen límites físicos de 3000 caracteres para WhatsApp y 25 artículos por solicitud, sujeto a desarrollo de partición/lotes sin pérdida. La selección de códigos de rubro no se habilita para familias fuera del catálogo. No se declara que entienda cualquier texto sin pruebas.
Pruebas de texto natural con 2 artículos y peso de presentación, línea omitida, zona o familia inventada, distintas cantidades, permisos y CI. Sin producción.

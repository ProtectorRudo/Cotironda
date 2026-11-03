# MVP-116 — fidelidad de condiciones económicas en los originales

**02/11/2026 · Issue #443 · desarrollo en rama, no publicado.** Integrado sobre el circuito consolidado MVP101–115. Se detectó un defecto de integridad en `supplier-source-text.ts`, lector reutilizado para TXT/CSV y, después de extracción independiente, DOCX/XLSX y PDF simples.

## Hallazgo

El cotejo de montos usaba igualdad de conjuntos (presencia de cada cadena `$ 12.000,00`) y no multiplicidad. Si el original tenía **dos cargos del mismo importe en un renglón** pero el borrador de IA registraba uno, ese cotejo podía aprobarlo. Asimismo, el validador comprobaba que el texto de la descripción estuviera presente, pero **no que toda aclaración visible quedara representada**. Por ejemplo, `20 bolsas … $ 190.000,00 · IVA incluido` o `Total: $ 202.000,00 · pago contado` podía perder información de IVA o pago sin fallar la comprobación.

Esto impedía garantizar fidelidad completa de condiciones y, por lo tanto, invalida cualquier ranking económico basado en esas ofertas.

## Correcciones

- `sourceMoneyCovered` ahora comprueba **cada ocurrencia** de cada cadena monetaria contra campos realmente extraídos. Duplicados idénticos no se deduplican ni se convierten silenciosamente en uno; al faltar una aparición, el resultado es `needs_source_review` (`uncovered_money`).
- `unclaimedWords` sustrae del renglón **cada campo literal** de descripción, unidad, precio e importe, y analiza lo que queda. Si hay palabras no representadas (IVA, flete, contado, pago, entrega, stock, disponibilidad, o cualquier otra descripción adicional), retorna `needs_source_review` con nuevo motivo `uncovered_terms`. Los números remanentes se cotejan con cantidad mediante el guardia previo. Se permite solo el signo aritmético `x` después de sustraer los campos y se bloquean variantes complejas no comprendidas en vez de interpretarlas.
- La línea de **TOTAL** debe terminar exactamente con el literal `total_declared`; anexos y condiciones después de la cifra impiden aprobación automática (`uncovered_terms`). No se reescribe el total ni se deduce IVA.
- Se añadió `uncovered_terms` a la enumeración **privada** de tabla SQL y a la RPC de registro de auditoría MVP106. El resultado deja el presupuesto original almacenado y en revisión interna: nunca lo publica ni deja enviar una selección engañosa.
- El borrador IA del proveedor **no recibe una confirmación nueva**; esta es una protección interna, sin pasos adicionales para compradores o negocios.

## Verificación y límites

`tests/unit/mvp116-original-economic-terms-completeness.test.mjs` ensaya originales correctos, doble aparición del mismo flete, unidad y total inventados a partir de una sola cifra, IVA/pago/entrega/stock no representados, letra chica al lado del total, anotación de IVA como línea completa y CSV. Los tests anteriores de texto, Word, Excel y PDF simples siguen obligatorios, al igual que PostgreSQL17 y Deno Edge typecheck.

Este cambio **no es el ranking de precios definitivo**. Al contrario, evita presentar como comparables ofertas cuando se omitieron condiciones. En formatos complicados, las fuentes siguen bajo revisión hasta que exista una extracción totalmente verificable de sus condiciones; fotos o escaneos no se vuelven confiables por tener dos lecturas de IA. No supera límites de 3 MiB / 25 líneas / 8 materiales. No cambia el guardia anti-rondas históricas ni el cierre de cuatro días.

**Despliegue:** ninguno. **PR:** borrador. **Real E2E WhatsApp:** pendiente de integrar migraciones/Edge, autorización expresa para publicar PILOTO y prueba con tres teléfonos. Ver docs/223 y docs/230.

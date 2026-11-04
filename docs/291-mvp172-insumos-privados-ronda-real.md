# MVP172 — Conectar las cotizaciones reales con el cotejo comercial (solo desarrollo)

**04/11/2026 · P0-B / #535, checklist #529.** Rama apilada sobre MVP170–171, PR #546. **NO se instala ni despliega** SQL/Edge/portal sin autorización explícita para el entorno.

## Problema corregido
El piloto ya tiene 4 originales leídos (3 PDF, 1 Excel), 10/10 precios unitarios conciliados y registros privados de fuente v9 y economía. Pero el adaptador flexible MVP170/171 aún esperaba que otra función le pasase manualmente cada dato desde la base. Eso impedía comprobar que una ronda real incluyera a todos los proveedores sin inventar condiciones.

## Integración implementada
- **SQL privado read-only** \`supabase/piloto/mvp172_private_round_inputs.sql\`: una RPC \`public.cotironda_piloto_private_round_inputs_mvp172(uuid)\` devuelve a un **trabajador con service_role**, en una única lectura, el pedido original, TODAS las cotizaciones, líneas verificadas v9, hechos de presentación de MVP163 y auditorías económicas MVP168 de los mismos request/HMAC/SHA. Exige consentimientos vigentes, invitación, fuente actual y ninguna revisión documental superior. No usa LLM. Acceso \`anon\`/\`authenticated\` revocado, \`search_path=''\`. Si falta un documento o se supera la capacidad, rechaza el conjunto: nunca muestra silenciosamente solo un subconjunto.
- **Capa diagnóstica** \`src/domain/diagnostico-ronda-mvp172.ts\`: consume solamente ese envelope privado y **llama al adaptador que ya existe** \`prepararPresentacionesAridosMvp170\`, que incorpora la flexibilidad MVP171. Devuelve códigos anónimos \`oferta_001\`…, cantidad de artículos/ofertas y estados por artículo, sin originales, contactos, hashes, precios totales, nombres o solicitudes externas.
- **Alternativas comerciales visibles en la lógica:** ante «arena fina» pedida y «BIG BAG arena» cotizado, informa \`alternativa_comercial_con_aclaracion\` (volumen nominal coincidente), sin exigir réplica idéntica. Si el comprador exige exclusividad o el proveedor especifica material distinto, distingue \`variedad_no_acreditada\` / \`variedad_diferente\`. Otros rubros permanecen sin correlación **hasta acreditar familia y presentación desde archivo o catálogo**; no se eliminan ofertas.
- **No habilita ranking**. Aunque haya precios comerciales exactos, la ausencia de IVA/base fiscal, tratamiento total de flete, entrega o stock mantiene \`precioTotalComparable=null\`, \`rankingHabilitado=false\`, sin adjudicación, contactos, descarga ni WhatsApp. Se conservan explícitamente las 4 ofertas.

## Comprobación real, no persistente, en Supabase piloto (PostgreSQL 17)
Se ejecutó el **contenido exacto del SQL propuesto dentro de BEGIN/ROLLBACK** y se consultaron únicamente conteos/estado:
- **2/2 rondas**: \`private_inputs\`.
- **4/4 cotizaciones** con evidencia v9, fuente y economía vinculadas.
- **5/5 artículos originales**.
- Permisos: \`anon_can_execute=false\`, \`authenticated_can_execute=false\`, \`service_can_execute=true\`.
- \`rankingAllowed=false\` en ambos conjuntos.
- \`ROLLBACK\` final: RPC MVP172 no queda instalada y las rondas no cambiaron.
La proyección TypeScript se comprueba con **fixtures de contrato** y sus regresiones. **No se ejecutó TypeScript contra los datos crudos del piloto**, porque eso requeriría instalar/invocar un worker privado autorizado; no atribuirle un E2E inexistente.

## Seguridad y criterios de aceptación
1. No omitir proveedor con documento incompleto o con revisión posterior; devolver \`incomplete_evidence\` para toda la ronda en vez de esconder la cotización.
2. No tomar afirmaciones del proveedor ni texto IA como consentimiento o stock.
3. No devolver SHA, HMAC, precios, nombres ni descripción textual del proveedor al cliente con este módulo. RPC SQL es exclusivamente para service_role; **no enlazarla al navegador**.
4. Rechazar mezcla entre rondas, duplicados, diferencias SHA y fuente v9 vencida.
5. Manejar explícitamente más de 25 artículos o 10 proveedores; aún no soluciona escalabilidad #532.
6. Conservar documento original íntegro, IVA desconocido como desconocido, falta de flete como falta de dato, sin recomendación engañosa por totales parciales.
7. Pruebas de fuente normal/alternativa/contradictoria, negativa de permisos, sin variación de estado del piloto y CI del repositorio.

## Próxima etapa
Una vez superados los límites externos de preview/merge, instalar **solo en entorno autorizado** la RPC privada y conectarla al worker de diagnóstico de forma protegida. Luego integrar al tracking comprador la representación anónima con aviso de alternativas sin exponer contratos privados; completar acreditación fiscal, fletes y stock antes de ordenar precios.

# ADR 486 — Motor de presupuestos V2: un documento fiel, verificación por campo y comparación por rubro

**Fecha:** 10/11/2026. **Estado:** propuesta técnica en rama de desarrollo; **no desplegada ni integrada**. **Base:** PR #758 + Issue #759. **Prioridad:** resultado del arquitecto antes de ampliar catálogo o optimizar el consumo de IA.

## Decisión recomendada

**Conservar Cotironda, WhatsApp, base, consentimientos y enlaces existentes. Rehacer SOLO el corazón ingreso → lectura → conciliación → comparación.** El objetivo es dejar de usar la coincidencia literal entre dos borradores de IA como permiso global para que exista un presupuesto. Las lecturas de IA proponen datos; el archivo original permanece fuente de verdad. Un renglón con duda no debe borrar los otros renglones comprobados.

Esto NO equivale a publicar cifras no corroboradas. La información visible al comprador debe estar ligada a su fuente o mostrarse explícitamente como en revisión, sin convertirla en precio competitivo hasta verificarse.

## Evidencia de por qué hace falta

- El PDF de tres renglones llegó a Storage con SHA y fue leído de nuevo por auto-recovery v11. Terminó `review/archived_materials_disagree` (18:20 UTC) y se agotó su lease: no existe la segunda lectura literal guardada en esa ruta para diagnosticar el campo concreto. Otro PDF quedó `review/multiple_indistinguishable_rounds`.
- MVP348 solo corrige diferencias inequívocas de escritura; el esquema actual sigue exigiendo múltiples gates globales en MVP102/103/106/346/347 y no representa incertidumbre por renglón. Por tanto, otra excepción en un campo puede seguir dejando el documento completo en revisión.
- Ya existe correlación conservadora, extracción estructurada y cálculo de cobertura por rubro; no hay que descartar esos módulos. Hay que desacoplar cuándo se **ingiere** un documento, cuándo se **asocia** a una ronda, cuándo se **puede mostrar** y cuándo se **puede comparar**.

## Nuevo circuito recomendado (sin trabajo adicional de comprador/proveedor)

1. **Recibir siempre:** un mensaje/archivo por Whapi o portal se guarda privado una única vez, con proveedor remitente comprobado, fecha, tipo MIME, HMAC e integridad SHA. El receptor registra `received` aunque no encuentre ronda única.
2. **Interpretar por tipo de archivo:** PDFs con texto + visión de páginas según estructura; XLSX/CSV con lectura de celdas/hojas determinista y modelo solo para significado de columnas; DOCX/texto con extracción nativa; imagen/escaneo con visión. No exigir plantilla ni un vocabulario cerrado. No recortar renglones o anexos sin marcar explícitamente la limitación.
3. **Una interpretación estructurada primaria:** JSON estricto con una entrada por renglón original, incluyendo extras, pallets/bolsones, cargos, descuentos, IVA, flete, precio de lista vs contado, condiciones y aclaraciones. Cada campo conserva `raw_text` y origen (página, celda o posición) y usa null cuando falta. No transformar ni inventar monedas, cantidades o precios en esta etapa.
4. **Verificación granular:** parser/comparador determinista verifica literal de fuente, valores numéricos y multiplicación **solo si** la columna es precio unitario efectivo explícito; totales, extras, descuentos e impuestos se concilian como conceptos separados. Si hay duda, rerelectura **dirigida al campo o página dudosa**, no doble lectura completa obligatoria. Se conserva diagnóstico privado no sensible por campo.
5. **Asociar la ronda por separado:** identidad validada del proveedor + invitación efectivamente enviada + ventana y materiales solicitados. Si solo hay una ronda elegible, asignar. Si hay más de una y no es inequívoco, almacenar como `received_unassigned` en bandeja privada y procesar documentalmente igual, sin inventar destinatario ni consultar repetidamente al proveedor.
6. **Vista preliminar progresiva:** una oferta con varias líneas se puede representar aunque una esté en revisión. Comprador ve cantidad y renglones respaldados; importes no acreditados se muestran `En revisión`, nunca como confirmados ni incluidos en ranking. El documento íntegro solo se descarga según reglas de cierre; el original permanece privado e inmutable.
7. **Comparación comercial independiente:** vincular producto por semántica, rubro y presentaciones comprobadas; calcular cobertura y competitividad solo en artículos realmente comparables, con unidades, cantidades, marcas exigidas, IVA, flete, stock y pago. No sumar ofertas parciales para simular que una ganó por total. Ofrecer combinación de hasta dos proveedores cuando la cobertura y costos están acreditados.
8. **Cierre:** revelar identidad de TODOS los proveedores invitados, distinguiendo quién cotizó y quién no, como se acordó. Contactos de comprador solo a ganadores/adjudicados según autorizaciones. El comprador permanece anónimo frente a los demás. Descargar originales de candidatos al cierre con permisos.

## Contrato de datos mínimo sugerido (V2, sin migrar tablas actuales)

- `source`: HMAC, SHA256, formato, localización Storage, participante privado y estado de recepción.
- `supplier_quote`: id estable, estado documental `received | parsed | partial_review | source_verified | review_required`, request_id nullable mientras no haya atribución inequívoca; condiciones literales, total y moneda como valor raw/parsed sin suponer ARS por `$`.
- `quote_line`: ordinal original, `original_description`, `original_text`, `quantity_raw`, `unit_raw`, `unit_price_raw`, `unit_price_kind` (`effective | list | unknown`), `line_total_raw`, tipo de renglón (`material | charge | discount | note`), fuente, diagnósticos por campo.
- `quote_line_validation`: `source_verified | extracted_unverified | missing | conflicting`, códigos privados, valores originales inmutables, versión de lector y campo; correcciones versionadas sin UPDATE de la fuente.
- `quote_line_match`: vinculación por rubro/artículo de pedido y equivalencia comprobada, no reemplaza el literal recibido.
- `buyer_quote_view`: proyección segura sin contactos pre-cierre; las líneas sin valor comprobado no participan de comparaciones monetarias.

**Precaución:** jamás confiar ciegamente en el `confidence` autodeclarado por un modelo. La verificación requiere evidencia de archivo, coherencia determinista y reglas de negocio. Sin evidencia real, estado `extracted_unverified` y no precio publicado como acreditado.

## Anonimato: decisión de producto separada

**Mantener identidad oculta durante la ronda en etiquetas Proveedor A/B/C**, mostrar artículos, cobertura y precios fuente-verificados sin contacto, y revelar a todos los invitados al cierre con estado de participación. Esto reduce negociación externa prematura y sesgo, pero no debe ser un gate de extracción. El anonimato es una regla de la proyección y de permisos, no de la lectura. Podrá parametrizarse después; NO gastaremos desarrollo nuevo en él ahora.

## Ejemplo conceptual (datos ficticios)

Un PDF presenta tres productos: cemento con importe consistente, arena con `precio de lista` y `total contado` diferentes, y piedra con subtotal legible. V2 guarda los tres renglones y las condiciones de contado. Verifica cemento y piedra; arena queda `contexto de precio en revisión`, no se inventa descuento dividiendo cantidades. Se publica solamente la información acreditada y se señala que el total no es comparable hasta conciliar arena. Un segundo presupuesto Excel con los mismos artículos se compara por cobertura y por renglón validado, no por suma parcial engañosa.

## Plan en cuatro entregas, sin construir todo de golpe

**A — Contrato, corpus y métricas (primera prioridad):** tomar originales YA archivados + muestras sintéticas de PDF digital, PDF escaneado, Excel, WhatsApp texto, fotos y Word. Anotar manualmente una base de verdad para descripción, cantidad, unidad, precio, subtotal, extras, condiciones, pago, IVA y flete. Guardar corpus cifrado/privado y fixtures sintéticos CI. Medir exactitud por campo y por documento, porcentaje que llega a proyección útil, falsos positivos financieros, y tiempo hasta enlace visible. Sin usar datos reales en repositorio público.

**B — Nueva extracción aislada:** implementar lector V2 por MIME y JSON estricto (modelo multimodal solo donde aporta), persistencia privada inmutable, SHA y evidencia de posición/celda. No reemplazar el worker activo: ejecutarlo en modo sombra con archivos de prueba y comparar salida contra corpus. Los lectores no podrán publicar ni enviar WhatsApps.

**C — Calidad por línea + bandeja privada de excepciones:** verificación aritmética y fuente por campo, segunda mirada solo sobre dudas, estados parciales, cero inferencias. Para PDFs ya consumidos (Issue #759), crear **nuevo ledger por versión de procesamiento** y reingresar la fuente SHA archivada de forma idempotente, sin resetear ni borrar los estados históricos ni contactar al remitente.

**D — Proyección/comparación y ensayo E2E:** integrar únicamente campos verificados con tracking, conservar anonimato temporal, probar Excel/PDF mixtos y respuestas desordenadas de Ailín/Nahuel; cierre con revelación por reglas. Evaluar antes/después con corpus y barreras; solo entonces cambiar el camino principal mediante feature flag y `Publicalo` autorizado.

## Criterios verificables antes de considerar piloto funcional

- Cero documentos aceptados perdidos y cero WhatsApps duplicados; asociación única verificable o revisión privada.
- Todos los renglones y condiciones relevantes del original presentes, o explícitamente marcados para revisión; sin extrapolaciones de precio, descuentos, IVA, flete ni presentaciones.
- Una línea dudosa NO elimina ni altera las demás; valores inciertos no participan de ranking; ningún total de cobertura distinta simula ser comparable.
- Pruebas con PDF, imagen, XLSX, DOCX, texto; múltiples proveedores y rondas solapadas; notas, descuentos, cargos extra, números decimales argentinos, formatos desconocidos y reenvíos.
- El resultado de clasificación de fuente y precio tiene evidencia suficiente y la pantalla distingue parcial, completo y revisión. Reversión demostrable, seguridad RLS, consentimientos, originales y permisos de cierre intactos.
- Métricas calculadas sobre un conjunto representativo y revisado manualmente; **no prometer 100%** de lectura de todos los documentos. Cero publicaciones monetarias que no pasen las barreras de fuente definidas.

## No hacer

No seguir agregando una segunda/tercera lectura obligatoria global, no saltar la validación financiera para forzar avance, no reiniciar leases manualmente, no volver a pedir confirmaciones rutinarias, no invitar otra vez al proveedor, no contratar servicios adicionales ni desplegar a producción. El sistema debe ser simple para el usuario, no ingenuo con dinero y privacidad.

## Estado de este ADR

Esta decisión es una propuesta de rediseño del subcircuito documental, no una declaración de que V2 existe o está publicado. Próximo paso técnico: etapa A con documentos de prueba, contrato y métricas. Recién después implementar B/C/D en ramas acotadas, medir contra el flujo actual y solicitar `Publicalo` para el entorno piloto.
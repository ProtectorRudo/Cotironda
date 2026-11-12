# V2-D013 — segunda verificación técnica y feriados 2026 por alcance

**12/11/2026. Estado:** solo código candidato, sin despliegue SQL, Edge ni Vercel.

## Evidencia de producto: segunda barrera antes del envío

El ruteador V2 del [PR #821](https://github.com/ProtectorRudo/Cotironda/pull/821) podía autorizar todas las asociaciones sugeridas por la IA que coincidieran con un número de catálogo real, aunque la explicación técnica fuera inventada. Este incremento incorpora `verificador-evidencia-tecnica-v2-d013.ts`, puro y determinista, llamado **después de la IA y antes de la preparación SQL/WhatsApp**.

Requiere que haya material reconocible en **ambas descripciones originales**; no acepta la explicación del modelo como prueba de existencia. Bloquea, al menos, las contradicciones de materiales que hoy sabemos especialmente delicadas: cemento Portland/albañilería, aplicaciones de látex interior/exterior, calibre de cable mm², placas OSB frente a yeso, espesores exigidos en mm y marcas obligatorias explícitas. Cuando falta evidencia, devuelve `revision_interna`: no anuncia compatibilidad ni dispara WhatsApp. El catálogo, zona, consentimiento e identidad del negocio continúan sujetos a las validaciones D013 del PR #821.

Cuando el material tiene evidencia común y no aparecen contradicciones, calcula **únicamente cantidades nominales**, no condiciones comerciales:
- 100 bolsas de cemento Portland de 50 kg = 5.000 kg; una presentación de 25 kg representa 200 bolsas.
- 100 envases de 4 L = 400 L; una presentación de 5 L representa 80 envases.
- Si unidades o divisibilidad son incompatibles, rechaza en vez de redondear paquetes o inventar precios.

Este guardián **NO es una certificación técnica universal**. Para nombres puramente comerciales, equivalencias sin ficha ni atributos conocidos (p.ej., Ceresita frente a cualquier hidrófugo genérico), quedan pendientes de evidencia técnica; no se usan listas de rubros para filtrar ni se consulta al cliente para editar el pedido. Las pruebas no acreditan stock ni sustitución reglamentaria; se requiere validación posterior de catálogo y ficha técnica cuando corresponda.

## Calendario: feriados obligatorios no son días optativos

Se documentó una **propuesta incompleta, NO instalable**, para La Plata desde 12/11/2026:
- 19/11 aniversario local de La Plata: feriado optativo para comercio y otras actividades, no feriado obligatorio universal. Fuente: [Resolución 516/2026 PBA](https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224).
- 23/11 Día de la Soberanía Nacional trasladado: feriado nacional. Fuente: [Banco Central: feriados bancarios 2026](https://www.bcra.gob.ar/consulta-feriados-bancarios-2026/).
- 07/12 día no laborable turístico: **no equivalente automáticamente a feriado obligatorio del sector privado**. Fuente: [Resolución 164/2025](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-164-2025-421799).
- 08/12 Inmaculada Concepción, 25/12 Navidad: feriados nacionales. Fuente: BCRA.

`calendario-operativo-preflight-2026.ts` distingue clases y devuelve siempre `publicable:false`, porque la aprobación SQL de V2-05 exige **calendario anual íntegro** y una política comercial para optativos. **No se cargan feriados, no se aprueba 2026 y no se activa V2**. Antes de instalar se deben revisar también provincia, localidad, alcance sectorial, fuentes y calendario de 2027.

## Validaciones y pendientes

- [ ] Tests Node: producto correcto, formatos, errores técnicos, envases, marcas obligatorias.
- [ ] Tests Node: feriado local/turismo optativo, obligatorio y manifiesto incompleto no publicable.
- [ ] PG17 compatibilidad #821, Deno Whapi v76 y Next.js regresiones.
- [ ] Validar fichas reales y atributos técnicos: no asumir que pruebas sintéticas prueban todas las equivalencias.
- [ ] Completar y aprobar años/localidades, política sobre feriados optativos antes de permitir cierre automático V2.

**No modificar el sistema histórico**, no desplegar sin `Publicalo` y no anunciar que el piloto funciona E2E.

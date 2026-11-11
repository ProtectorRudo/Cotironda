# Acta 517 — MVP349 / MVP348: correspondencia de materiales independiente del orden, pero única

**Fecha:** 11/11/2026. **Orden:** «Luz verde»; desarrollo y pruebas, **no publicar** ni reabrir fuentes históricas. **Base:** [PR #788](https://github.com/ProtectorRudo/Cotironda/pull/788) commit `7d66c7ca84dd2c6a9b9d8d5806a494299e333cfa`. **Piloto E2E:** [Issue #750](https://github.com/ProtectorRudo/Cotironda/issues/750).

## Qué comprobé en la base, sin exponer datos

Existe **una** fuente ambigua que tiene el resultado `ai_supplier_auto_correlation_mvp291=review:insufficient_material_evidence` y **otro** control previo `ai_supplier_auto_recovery_mvp292=review:archived_materials_disagree` para el mismo HMAC. El proveedor conserva autorización y archivo almacenado; la ronda candidata recibió previamente el pedido y está dentro del plazo.

Su **primer borrador archivado** contiene **3** líneas, las tres con cantidad explícita y **sin unidad explícita**; las tres descripciones son distintas y tienen longitud suficiente. El registro del segundo modelo **no conserva un desglose**: por lo tanto **no puedo afirmar si el desacuerdo real fue un cambio de orden, descripción, cantidad o presentación**. El seguimiento anterior ha retenido el bloqueo y **no hay pruebas para forzar la asociación**.

El `claim` de MVP336 excluye intencionalmente una fuente que ya figure en la recuperación MVP292, aunque esta última finalizara en `review`; en este caso hay 1 diagnóstico previo y 0 reintentos MVP336. Se mantiene ese límite: **nada de eliminar la guarda `NOT EXISTS` ni crear un reintento automático**. La doble lectura debe conservar independencia.

## Defecto general abordado en el código (no se presume causa histórica)

La función `evaluarMaterialesRecuperadosMvp348` comparaba líneas por índice. Si un parser de un PDF o Excel entrega los **mismos tres materiales y cantidades en distinto orden**, los trataba como descripciones cambiadas. La clasificación era técnicamente conservadora pero incapaz de distinguir un *ordenamiento* de un producto distinto.

Implementé una segunda comprobación **exclusivamente de alcance de materiales para correlación privada**, cuando falla la comparación posicional:

1. Comparación por descripción normalizada de forma mínima: Unicode NFC, minúsculas, espacios repetidos. **No** se admiten sinónimos, marcas, presentaciones ni similitud semántica.
2. La cantidad debe ser idéntica o decimal **no ambiguo** equivalente (`2,00` y `2`), como ya lo exigía MVP348. `1.000` frente a `1,000`, cantidades distintas o desconocidas siguen bloqueadas.
3. La unidad debe conservarse: ambas ausentes o exactamente igual tras normalización; **no** inferir bolsas, m³, kg ni capacidad por el nombre.
4. Debe existir correspondencia biyectiva **única**: cada línea de un borrador tiene exactamente una pareja del otro y ninguna pareja puede reutilizarse. Materiales indistinguibles duplicados => **revisión**, no aceptación.
5. El resultado favorable usa `matched=true, mode='reordered_unique', reason='material_scope_unique_reorder'` y **no transforma ninguno de los borradores ni cambia el orden de los renglones, su índice, sus importes ni su PDF original**.
6. La correlación con una ronda sigue dependiendo de lecturas independientes de IA y criterios deterministas de singularidad (MVP291/336). Los precios, IVA, flete, totales y publicación siguen bajo las comprobaciones autónomas MVP102/103/106/346/347; **la igualdad de materiales por sí sola no habilita ninguna oferta, ranking ni contacto**.
7. No hay migración SQL, cambio de permisos o worker, cron, Vault, llamadas reales a OpenAI ni WhatsApps.

## Criterios de aceptación y pruebas

- Aceptar tres descripciones únicas y cantidades iguales aunque el parser cambie el orden.
- Rechazar marcas/presentaciones cambiadas, una cantidad equivocada, unidad faltante o inventada, números ambiguos y largo diferente.
- Rechazar permutaciones de dos materiales **indistinguibles**, incluso si tienen nombres idénticos.
- Permitir dos descripciones iguales solo si una **cantidad distinta** da una pareja única para cada renglón.
- En un worker sintético, aun si la correspondencia reordenada permite llegar a un candidato de ronda única, una fuente **sin aprobación económica** sigue en `review_required` y produce **cero WhatsApps**.
- CI Node + regresión total, Deno typecheck del worker y función, PostgreSQL 17/Rollback de reintentos MVP336, Next.js y controles generales. Registrar resultados reales del HEAD antes de declarar el desarrollo terminado.

## Alcance del resultado

**Esto no repara automáticamente la cotización histórica.** El segundo borrador literal no se conserva en el ledger de recuperación y la fuente ya tiene resultado de revisión con barrera contra reintentos; no se ejecutó ninguna IA adicional ni se reconstruyó ese segundo borrador. Reabrirla exigiría un plan separado que preserve el original, documente los dos dictámenes y pruebe por qué un resultado de lectura nuevo prevalecería, con autorización de piloto explícita.

Estado comercial actual (lectura solo de contadores): 4 cotizaciones en `awaiting_fidelity_check`, 3 fuentes `ambiguous_round`, ninguna oferta anónima publicada nueva; B5o real aún 5 filas visibles sin atribuir. Siguiente objetivo de negocio: **fuentes vinculadas y económicamente verificadas → comparador B6 → seguimiento del arquitecto**, no acumular versiones de replay.

# Acta 520 — MVP352: identidad material conservadora y última reevaluación auditada

**Fecha:** 11/11/2026. **Autorización:** «Avanza» = código, pruebas, documentación. **Estado:** desarrollo, PR #792 (apilado sobre #791); **NO publicado**. **Proyecto exclusivo de futura instalación:** `cotironda-piloto` (nunca producción).

## Hecho real que dio origen al cambio

El despliegue MVP351 del 11/11/2026 sí activó el worker v13 y Whapi v76, pero el único PDF fuente agotó el segundo intento y terminó en `review/multiple_indistinguishable_rounds` con correlación `review/insufficient_material_evidence`. Permanecen cero ofertas verificadas en el comprador. El original archivado tiene tres artículos con cantidades 15/2/1 y notas porcentuales anexadas a las descripciones (por ejemplo `Cemento Avellaneda; Dscto. 22.4%`); existe una ronda preparada con cantidades 15/2/1 y una rival histórica cerrada luego del mensaje con 20/3. **Coincidencia de cantidades no prueba unidad/presentación, equivalencia de producto, precio ni destino.** La razón exacta de la discrepancia entre propuestas IA no fue persistida y no puede afirmarse que el descuento sea la única causa.

## Cambio en comprensión, SIN tocar la fuente

- `supplier-material-identity-hint-mvp352.ts` extrae `material_identity_hint` **solo** si la descripción termina en un descuento porcentual explícito separado por **punto y coma**, con percentil válido entre 0 y 100. No contiene diccionario cerrado de materiales ni reinterpreta marcas, unidades o cantidades; cualquier otra sintaxis queda literalmente sin pista.
- `supplier-auto-correlation-mvp336.ts` agrega `material_identity_hints` al contexto de **dos lecturas IA independientes**. Mantiene **idéntico** `source_items`, los renglones de la ronda, la transcripción original y el algoritmo de puntaje. El modelo tiene instrucciones para NO tratar porcentajes como materiales, cantidades o precio de referencia.
- La selección todavía exige la concordancia íntegra de ambas propuestas, al menos tres indicios de cantidades nominales cuando la fuente carece de unidad, margen frente a todos los rivales y el bloqueo final `bind_allowed=false` para rondas históricas cerradas. Solo PostgreSQL puede vincular la fuente. Una pista jamás autoriza una venta, un descuento ni un ranking.

## Única reevaluación adicional, sin ciclo infinito

La segunda recuperación MVP351 **ya se consumió** y no se borra. MVP352 prepara una tercera y **última** oportunidad privada, pero solo para una fuente PDF con todos estos requisitos simultáneos:

1. Original SHA intacto en Storage privado; inbox sin ronda asignada, proveedor con consentimiento vigente y fuente documental de menos de 7 días.
2. Existencia de los registros privados del intento MVP351 y del reintento de correlación MVP336 sobre el **mismo SHA y proveedor**. Ninguna fuente sin historial compatible puede usar este camino.
3. Recuperación final anterior exactamente `review/multiple_indistinguishable_rounds`, y correlación final anterior `review/insufficient_material_evidence`; ni ofertas ya vinculadas ni errores de archivo entran.
4. Una ronda `prepared` aún viva, cuya invitación se despachó realmente antes de la recepción. Las rondas `closed` desde después del mensaje son solo **contraste negativo**, nunca destino; a lo sumo ocho candidatas.
5. Un registro atómico e inmutable en `ai_supplier_semantic_reassessment_mvp352`, con RLS y ACL internas. **Un solo registro por fuente** y hasta dos nuevas reevaluaciones por día en el piloto.
6. Tras la reserva, el worker existente lee el **mismo original**, verifica su SHA, coteja primera y segunda lectura de material, invoca la correlación conservadora y luego los **gates económicos originales** MVP102/103/106 y MVP346/347. Las tablas de ofertas no se escriben desde el claim ni desde la migración.

El worker consulta este tercer claim **solo si las dos colas previas están vacías**. Si falla o los modelos discrepan, queda en revisión privada; **no habrá cuarta tentativa automática**. No se pide una nueva cotización ni se manda WhatsApp. La tercera no altera el ledger original MVP351, el del primer intento, ni los PDF.

## Pruebas y criterios de aceptación

- Node: material original y cantidades exactamente preservados; extracción de tres pistas del formato real, equivalentes `Dscto.`/`Descuento`/`Bonificación` con coma decimal; entradas maliciosas, descuentos no separables y ambigüedades fallan sin modificar original. Dos modelos reciben pista y fuente original por separado; si uno difiere, no hay asociación.
- PostgreSQL 17 sintético: dentro de **BEGIN/ROLLBACK**, se recrea la fuente revisada, ambos ledgers anteriores, dos rondas históricamente candidatas, source SHA, invitación y despachos. Reclamo único, privacidad (anon/auth sin acceso), protección ante chat de otro proveedor, comparación histórica, negativa de enlace a cerrada, enlace privado a activa solo con RPC verificada, cero escrituras en outbox/dispatch/ofertas y preservación del original. Se comprueba que el esquema no sobrevive al ROLLBACK.
- Deno: módulos de extracción, correlador y worker sin errores de tipos.
- Regresión general: Next.js, RLS, PostgREST, WhatsApp y las baterías existentes sin modificar.
- **Aún pendiente:** responder al PDF real, comprobar el descuento/IVA/flete contra su archivo completo, disponer de dos ofertas verificadas, vista real del arquitecto y cierre. Que PG17/Node estén verdes **no** certifica E2E real.

## Orden de futura publicación — requiere «Publicalo»

1. Revisar los **PR apilados #790 → #791 → #792** y decidir estrategia de integración; GitHub `main` sigue siendo la fuente de verdad, no confundir PR draft con una publicación.
2. Comparar Supabase piloto en vivo con el acta 519: auto-recovery v13, webhook Whapi v76, tracking v29, migración MVP351 instalada, un solo ledger previo y no haber surgido nuevas respuestas. Verificar resguardo recuperable y que ningún cron esté ejecutando el worker.
3. Pausar **solo** cron documental. Instalar **solo la migración MVP352** tras revisión de permisos: no repetir MVP351, MVP346, MVP347. Consultar RLS, funciones `EXECUTE`, idempotencia y estado de la fuente.
4. Construir Edge auto-recovery **preservando cada dependencia publicada no modificada** y sustituyendo correlador/worker, agregando nuevo módulo de pistas. Construir webhook desde el **bundle activo** con correlador nuevo + pistas, conservando auth, destinatarios y toda la lógica de WhatsApp.
5. Verificar ambas versiones y reactivar el mismo cron. Observar **exactamente un** nuevo reclamo en el ledger MVP352, inspeccionar la decisión y evitar reejecutarlo manualmente.
6. Si el presupuesto llega a asociación privada, exigir validación económica integral del PDF y la publicación anónima real, después recibir/recuperar el segundo proveedor y comprobar el enlace y cierre. Si vuelve a fallar, conservar en revisión; no producir otro lector/reintento por inercia.

**Riesgos:** la pista puede no resolver la ambigüedad; el PDF puede seguir sin unidades o tener descuentos no conciliables. No se ocultan estas carencias ni se publican importes sin fuente. Nunca elegir al proveedor por totales de ofertas parciales.

**Referencias:** [PR #792](https://github.com/ProtectorRudo/Cotironda/pull/792), [Acta 519](519-mvp351-reintento-historico-controlado.md). Todos los números de ejecución deben contrastarse con el SHA final del PR antes de publicar.

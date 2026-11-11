# Acta 519 — MVP351: un solo reintento de fuente ya revisada, con rival histórico cerrado

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» = preparar código y pruebas únicamente. **No publicar en piloto/producción, no ejecutar cambios en Supabase real, no enviar WhatsApps ni reactivar cron.**

## Evidencia real auditada (SOLO LECTURA, Supabase `cotironda-piloto`)

- Ronda preparada creada el 10/11: **2 trabajos despachados**, cada uno `api_accepted` y con ID Whapi; 1 seguimiento del comprador aceptado. `prepared` es un estado **válido** para responder, no hay que cambiarlo por `open`.
- Un proveedor contestó el **10/11 11:19 UTC** con archivo documento, conservado `stored` con SHA. El `whapi_inbox` no tiene ronda asociada y marca `needs_review`.
- La decisión original de correlación sigue `review/insufficient_material_evidence`, con 2 rondas candidatas al recibir el archivo. El primer intento de recuperación archivada terminó `review/archived_materials_disagree`; **cero reintentos MVP336**, cero ofertas verificadas publicadas.
- Ahora queda **una ronda preparada** y la rival está **cerrada**, pero ambas habían sido despachadas al mismo proveedor y estaban vigentes **en el instante de recepción**. Atribuir por «única ronda abierta hoy» sería inseguro.
- Validación solo lectura: 1 solicitud actual `prepared` y 1 competidora `closed` cumplen la ventana histórica y tienen despachos aceptados anteriores al documento.
- La fuente archivada contiene 3 renglones; eso no demuestra fidelidad de precios/unidades/IVA/flete ni habilita publicar.

## Qué se corrige, con controles estrictos

1. **Nueva migración `mvp351_reintento_fidelidad_y_rivales_historicos.sql` (desarrollo):** conserva las dos funciones existentes MVP336, incorporando un reintento estrictamente único de una fuente cuya recuperación previa está `review/archived_materials_disagree`. Registra **antes** la razón, fechas y proveedor originales en tabla privada `ai_supplier_recovery_second_attempt_mvp351`; RLS activa, sin privilegios públicos, sin perder procedencia. Fuentes ya reintentadas quedan excluidas.
2. Al reconstruir las opciones en el *reintento*, considera las rondas entregadas al proveedor que estaban efectivamente activas **cuando llegó** el archivo, incluso si una ya cerró **después de recibirlo**. El control de despacho debe preceder a la recepción. No considera rondas vencidas o cerradas antes del mensaje, ni sin consentimiento/catálogo/invitación.
3. Marca cada opción `bind_allowed`: solamente `prepared` y dentro de plazo puede recibir el enlace. La ronda `closed` sirve como control negativo; **nunca** como destino. El validador TypeScript preserva la marca y devuelve `historical_round_best_fit` si esa opción gana. El RPC SQL MVP291 vuelve a exigir `prepared`, identidad de proveedor, invitación y despacho correcto.
4. El algoritmo **no atribuye por fecha o cercanía**. Sigue exigiendo **dos lecturas coincidentes** de relaciones semánticas y criterio determinista de cantidad + margen frente al rival. Tres coincidencias literales sin unidad habilitan únicamente vinculación **privada**, no agregan unidades ni validan importes.
5. **No hay nueva IA documental ni mensajes**: el worker existente repite la lectura para comparar fidelidad del archivo SHA original. Ante desacuerdo se mantiene revisión privada. La publicación anónima y ranking requieren gates de economía y cobertura de fuente originales, nunca solo coincidencia de materiales.

## Tests de desarrollo

- **Node MVP351:** activo 15/2/1 vs histórico 20/3, histórico que encaja mejor no se vincula, RPC de seguimiento sin bind y sin salida WhatsApp, controles del SQL de historial/privacidad.
- **PostgreSQL 17 con `ROLLBACK`:** fuente sintética revisada dos veces, rival cerrado después del mensaje, razón original auditable, reserva única, chat ajeno rechazado, no vincular al histórico, vinculación privada al preparado, cero nuevas ofertas/WhatsApps y RLS.
- **Deno:** tipado del correlador.
- Regresión heredada: MVP291, MVP292, MVP336 y MVP348. No cambiar Vercel, Whapi ni Supabase real hasta que CI haya terminado y exista autorización de publicación específica de piloto.

## Orden posterior (no ejecutado)

1. CI y revisión de código; comprobar que no se rompió el worker ni la correlación previa.
2. Si corresponde publicar, identificar **exactamente** migración + función Edge compatibles; comprobar duplicados/cupos/costos y resguardo antes de instalar. **Publicación de código NO autoriza reenvíos ni obliga a iniciar otra ronda.**
3. Solo después, un ensayo real interno contra el documento guardado, con registros de dos lecturas y control de materiales. Si no se comprueba fidelidad, revisión interna; **no enviar proveedor a repetir presupuesto**.
4. Completar segunda oferta, verificación de IVA/flete/total, seguimiento del arquitecto, cierre/revelación y originales descargables antes de declarar E2E.

## Restricciones operativas

Los PR #789 y #790 siguen apilados y en borrador. Este cambio parte de #790 y no los fusiona. La limitación de compilaciones Vercel no equivale a fallo del correlador; debe auditarse por separado. Mantener la identidad del arquitecto reservada y no publicar contactos salvo cierre autorizado. El piloto **no** queda completado por estas pruebas.


## Preflight adicional de publicación (solo lectura, 11/11/2026)

Auditoría externa sobre **Supabase `cotironda-piloto`**:
- `ai_supplier_correlation_retries_mvp336` ya existe.
- `supplier_revision_candidates_mvp346` y `anonymous_supplier_revisions_mvp347` ya existen; **no reinstalar estas tablas**.
- `ai_supplier_recovery_second_attempt_mvp351` todavía NO existe (migración de este PR pendiente).
- La Edge `cotironda-piloto-auto-recovery` está ACTIVE en versión **12**; el archivo `supplier-auto-recovery-worker-mvp292.ts` de esa versión **no importa MVP348**. La rama de desarrollo sí contiene la importación y el control de fidelidad. Esto impide concluir que publicar solo la migración SQL activaría el circuito completo.
- `cotironda-piloto-whapi` está ACTIVE en versión **75**; comparar el bundle real antes de actualizarlo, sin modificar secretos/credenciales.
- Todos los 7 workflows principales del commit `7c3492ea82b0` finalizaron verdes en GitHub. Los estados externos de Vercel siguen fallando por límite de compilaciones; no confundir ese error con una prueba del worker.

**Nuevo control offline**: `scripts/piloto/mvp351-release-bundle-readonly.mjs` valida las dependencias entre el correlador aprobado por SHA (allowlist), worker + fidelidad MVP348, RPC de reintento y candidatas comerciales MVP346/347, autenticación y persistencia. Devuelve siempre `ready_to_publish=false` y `ready_for_e2e=false`, porque no puede verificar con archivos locales el código activo, resguardo ni resultados de negocios. Pruebas de mutación y workflow incluidas. No configura servicios ni contiene secretos.

### Orden mínimo para una futura autorización «Publicalo» (NO ejecutado)

1. Comprobar nuevamente rondas activas, cron, documentos pendientes, ids de mensajes y copia recuperable; congelar si hay otra ejecución concurrente.
2. Aplicar **solo** migración MVP351 en el proyecto `cotironda-piloto` después de revisar su diff, RLS y permisos. No volver a aplicar MVP346/347.
3. Preparar un paquete de Edge **exactamente de la rama autorizada**, con el módulo MVP348 y el correlador MVP351 coincidentes en worker/webhook. Compararlo con los bundles activos y preservar secreto/auth; no reemplazar parcialmente una sola función.
4. Ejecutar **un único intento interno controlado**, guardar outcome sin documentos/contactos en logs. Si nuevamente hay `archived_materials_disagree` o error comercial, conservar revisión privada y priorizar revisión operativa en vez de un nuevo parser.
5. Confirmar costo, precio, IVA/flete explícitos, ofertas anónimas visibles desde navegador real y segunda cotización; ejecutar cierre y revelación con reglas de privacidad. No comparar totales parciales.

Sin orden «Publicalo» no hay mutaciones ni mensajes; hasta nueva verificación del SHA real y dos ofertas, **no está certificado el piloto**.

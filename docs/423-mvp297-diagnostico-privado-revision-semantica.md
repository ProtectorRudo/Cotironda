# Decisión 423 — MVP297: diagnóstico seguro y no facturable de revisiones semánticas

**Fecha:** 07/11/2026. **Estado: SOLO DESARROLLO (Luz verde), NO publicado**. Fuente de verdad: GitHub `ProtectorRudo/Cotironda`. Piloto objetivo futuro: `cotironda-piloto`, nunca producción sin autorización.

## Hechos verificados antes de editar

- El 07/11/2026 el cron del piloto procesó **una** respuesta textual histórica del proveedor Nahuel, previamente vinculada de forma unívoca (MVP291/292), por el camino comercial MVP295; registró 2 lecturas de IA y **3.503 tokens observados** en MVP264. El ledger `ai_supplier_review_mvp227` terminó `review/semantic_review_required`, con `summary IS NULL`. El proveedor Ailín conserva su documento ambiguo bajo `multiple_indistinguishable_rounds`. La vista por rubro de esa ronda devolvió **cero** ofertas verificadas.
- El lector `interpretarPresupuestoConIAMvp225` ya devuelve `motivo`: `primera_lectura_sin_fuente`, `lecturas_no_coinciden`, `modelo_no_disponible_o_fuente_invalida`, `no_es_presupuesto`. Sin embargo el procesador `procesarPresupuestoCentralMvp227` sustituía TODOS esos motivos por el único `semantic_review_required` al persistir `reason_code`.
- Las respuestas **crudas** del modelo y la causa técnica concreta de esa lectura histórica **no se almacenaron**. No existe prueba suficiente para determinar retrospectivamente si Nahuel falló por discrepancia, cita literal, moneda o disponibilidad. Es incorrecto atribuirle cualquier causa precisa sin evidencia, y volver a llamar al modelo para averiguarlo infringiría la protección de un solo procesamiento y costo.
- Tabla `ai_supplier_review_mvp227.reason_code`: restringida a texto `^[a-z_]{3,64}$`, sin acceso a anon/auth, RLS activo; no requiere esquema nuevo para registrar un motivo permitido.

## Solución (SOLO futuras lecturas)

1. `diagnosticarLecturaInvalidaMvp297` clasifica el primer chequeo de fuente que falla, siguiendo los predicados existentes de MVP225 sin cambiar su resultado. Categorías cerradas: estructura, evidencia de moneda, evidencia de IVA/flete/pago, cita de línea, cargos monetarios omitidos y vínculo de artículo. Se distingue `first_*` versus `second_*`.
2. Si las dos lecturas PASAN los chequeos individuales pero no coinciden económicamente, registrar `readings_disagree`. Si el modelo falla o la respuesta no se puede leer, `model_or_response_unavailable`. El lector preserva sus `motivo` anteriores por compatibilidad e incluye `diagnostico` opcional.
3. El procesador comercial almacena **solo** `diagnostico` si está en una allowlist estática `diagnosticoPermitidoMvp297` (nunca la frase del proveedor, respuesta, API error, cita, monto ni identidad), por `cotironda_piloto_ia_finish_quote_mvp227` con `p_state=review` y `p_summary=null`. Valores inesperados conservan `semantic_review_required` (fail closed).
4. **Ningún cambio** a aceptación económica, comparación de precios, IVA, flete, equivalencias, correlación de ronda, token de seguimiento, anonimato, adjudicación, Whapi ni cuotas. El paquete no agrega llamadas OpenAI: clasifica en memoria la respuesta ya producida. El seguimiento comprador sigue mostrando únicamente verificados. El documento de Ailín no se vincula a la fuerza.
5. Diagnósticos de versiones antiguas, incluido Nahuel, permanecen como `semantic_review_required`. No hay backfill ni reescritura de motivos ni reintentos de fuentes.

## Criterios de aceptación

- Rechazo antes de segunda lectura cuando falta evidencia literal o una línea cita un precio inexistente.
- Diferenciar inválida la segunda lectura de dos lecturas válidas pero discrepantes; cada caso consume como máximo las dos lecturas originales.
- IVA, moneda, cargos omitidos y mapeo inválido generan categorías separadas, sin copiar texto ni valores.
- Inyección en `diagnostico` → fallback privado genérico. `p_summary=null` y ningún renglón ni precio público.
- Respuesta válida y sus condiciones no cambian; las pruebas existentes MVP225/MVP227/MVP295 siguen aprobadas.
- Deno typecheck y CI de la rama verde; **SIN SQL/Edge aplicado a Supabase real** durante esta luz verde.
- Para publicación futura: inspeccionar bundle Edge Whapi completo y todas las rutas que importan el lector, actualizar de forma conservadora, probar rechazos y reconciliar contadores de consumo; hasta entonces no prometer motivos detallados de mensajes nuevos.

## Control de datos

La categoría es solo diagnóstico operativo privado. No tiene números, nombres, teléfonos, SHA/HMAC ni muestras de presupuesto. No exponer el nuevo motivo al comprador ni usarlo para mejorar artificialmente la posición de una oferta. Un motivo nuevo ayuda a auditar el fallo, pero no habilita automática y retroactivamente una fuente antes rechazada.

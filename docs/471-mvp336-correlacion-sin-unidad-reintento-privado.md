# Acta 471 — MVP336: asociación automática de presupuesto sin unidad y recuperación única

**Fecha:** 10/11/2026. **Estado:** desarrollo en rama, sin autorización de publicación.  
**Alcance:** Cotironda PILOTO, nunca producción. No actualizar Supabase/Vercel/Whapi con «Luz verde».

## Evidencia real previa (solo lectura)

- Ronda de prueba: `aefe169e-7801-4efc-aabf-25cd134744eb`, comprador en La Plata, entrega a dos proveedores registrada.
- Ailín envió un archivo tipo documento el 10/11 a las 08:19 ART (11:19 UTC). Fuente guardada con SHA-256 y ruta privada.
- La primera lectura documental detectó tres productos con cantidades literales `15,00`, `2,00`, `1,00`, pero **sin campo de unidad**. Descripciones: cemento Avellaneda, BIG BAG de arena y BIG BAG de piedra. Se preserva el PDF original sin corregir ni inventar su presentación.
- Solicitud más reciente: **15** bolsas de cemento CPC 50 kg, **2** bolsones de arena y **1** de piedra. Ronda anterior todavía abierta: **20** bolsas de cemento y **3** bolsones de arena; ambas fueron despachadas a Ailín.
- Estado real anterior: `ai_supplier_auto_correlation_mvp291.state=review`, `reason=insufficient_material_evidence`. Cero ofertas de esta ronda. No hay autorización para atribuir manualmente al comprador ni para mostrar precios sin cotejar el original.
- La IA hizo dos lecturas independientes; el desempate matemático de MVP291 exigía al menos una coincidencia de cantidad con **unidad**. Sin unidad, un match sumaba un punto, por lo que tres coincidencias numéricas no alcanzaron.

## Criterios de aceptación

1. La IA propone vínculos de materiales con dos lecturas; una función determinista evalúa si una ronda tiene ventaja comprobable. No se usan precios, posiciones ni «más reciente» como evidencia única.
2. Si falta unidad, tres renglones de material diferentes y cantidades numéricas literales coincidentes pueden sustentar **solamente la asociación privada** cuando hay una ventaja de al menos cuatro puntos frente a cualquier ronda rival.
3. Dos coincidencias, cantidades ausentes, equivalencia de envases contradictoria, empate, lecturas IA divergentes, identidad/canal incorrectos o rondas vencidas **no deben atribuir automáticamente**. La unidad omitida permanece omitida; no hay equivalencias comerciales inferidas.
4. Una cotización cuyo primer intento quedó en `review/insufficient_material_evidence` puede reexaminarse **una sola vez**, sin reenvío del proveedor. Se conserva la razón original en una tabla de auditoría privada.
5. Solo el worker interno autorizado puede reservar una fuente archivada, con SHA, remitente/consentimiento, invitación y despacho verificados. La fuente permanece inmutable; no se duplican trabajos ni gastos indefinidamente.
6. Asociar una fuente no autoriza publicar su contenido: siguen vigentes las comprobaciones independientes de fuente, precios, cantidades, IVA, flete, unidades y total. La fuente debe pasar los gates comerciales antes de aparecer en el seguimiento.
7. No genera nuevos WhatsApps, invitaciones ni solicitudes de confirmación. Sin datos correctos, se mantiene `review` y se informa el motivo internamente.
8. Ensayo Node + Deno + PostgreSQL17 con transacción `ROLLBACK` y pruebas de RLS, una única reserva, no asociación al chat equivocado y ausencia de ofertas no verificadas.

## Cambios en desarrollo

- `supplier-auto-correlation-mvp291.ts`: evidencia numérica débil con unidad ausente (2 puntos), aceptable solo con tres concordancias y margen único ampliado. No cambia `corroborarCantidadMvp291` ni inventa unidades.
- `mvp336_recorrelacion_una_vez_sin_unidades.sql`: nueva tabla privada de historial, nuevo claim de documentos previamente revisados y preparación protegida del único reintento. Los RPC MVP291/MVP292 existentes NO se sustituyen.
- `supplier-auto-recovery-worker-mvp292.ts`: primero atiende fuentes pendientes; si no hay ninguna, intenta la única recuperación elegible, sin mensajes.
- Pruebas unitarias con caso documentado Ailín 15/2/1; pruebas de rechazos, segundo intento, idempotencia y regresión. Workflow propio para PG17/Deno/Node.

## Puntos que siguen pendientes

- CI y revisión PR aprobados; ejecución PostgreSQL17 sintética, no real. Un resultado verde **no equivale** a la prueba WhatsApp → presupuesto verificado → seguimiento anónimo.
- Aplicación SQL en `cotironda-piloto` y despliegue sincronizado del worker + webhook requieren nueva orden explícita «Publicalo». Nunca publicar parcialmente por detrás del operador.
- Verificar si el worker privado `cotironda-piloto-auto-recovery` está habilitado con credenciales actuales. No leer ni exponer valores secretos; no activar costos o cron sin aprobación.
- El documento real de Ailín permanece en revisión hasta desplegar y validar; no atribuirlo manualmente mientras tanto.
- No existe respaldo real/restauración verificada; mantener plan de contingencia y evitar mutaciones en vivo antes de un preflight.
- Una vez autorizado y publicado, inspeccionar solo el estado de la fuente y cada gate: vínculo correcto, cotejo independiente del original, integridad comercial, oferta anónima y ranking sin comparar totales parciales. Registrar resultados reales en otra acta.

## Decisión de seguridad

Priorizar **falsos negativos revisables** frente a adjudicar una cotización al comprador equivocado o publicar un precio no comprobado. La comparación por tres conteos sin unidad identifica una ronda, **no valida los envases ni la cobertura económica**. Mantener fuente y registro de primer intento inmutables, evitar contacto con los proveedores para solucionar fallas internas.

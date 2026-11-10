# Acta 478 — MVP343: recuperación mínima y preflight real para volver al piloto

**Fecha:** 10/11/2026. **Estado:** SOLO DESARROLLO. Sin SQL sobre base real, sin OpenAI, sin WhatsApp saliente, sin merge ni despliegue.
**Prioridad:** [Issue #750](https://github.com/ProtectorRudo/Cotironda/issues/750).
**Dependencias:** PR #742 (MVP336) → #743 → #745 → #746 → #747 → #748 → #749.

## Diagnóstico confirmado: Supabase PILOTO, solo lectura

Último documento del proveedor, sin divulgar identificadores, contactos ni precios:

| Control | Resultado |
|---|---|
| Mensaje | document / needs_review |
| Archivo original | stored / suggested_only |
| ¿Ya asociado a ronda? | No: inbox y archive sin ronda |
| Propuesta documental | supplier_quote / review_required |
| Renglones originales interpretados | 3 |
| Renglones sin campo de unidad | 3 |
| Correlación | review / insufficient_material_evidence |
| Solicitudes candidatas despachadas y todavía abiertas | 2 |
| Recuperación previamente reclamada | No |
| Tabla de reintento privado MVP336 en piloto | **No existe** |

La ronda nueva de 10/11 tiene dos invitaciones con envío aceptado y cero ofertas visibles; cierra el 14/11 a las 09:20 UTC. La ronda anterior vence el 11/11 a las 11:27 UTC y tampoco muestra ofertas visibles. Los plazos deben comprobarse nuevamente antes de cualquier intento, pues la elegibilidad cambia con el tiempo.

**Hallazgo:** el PDF no se perdió. El correlador MVP291 exige cantidades con unidad y lo retuvo como ambiguo. MVP336 incorpora evidencia numérica limitada para el caso 15/2/1 versus 20/3, **solo para identificar una ronda**, y un único reintento privado del original archivado. Esa migración todavía no está publicada y no autoriza publicar precios, IVA, flete, unidades o cobertura.

## Verificación adicional del código desplegado (solo lectura)

Consulté el inventario y los archivos de las Edge Functions desplegadas en el proyecto piloto, **sin modificar versiones**:

| Función | Versión real | Archivos / correlador |
|---|---:|---|
| cotironda-piloto-whapi | **75** | 61 archivos; importa el módulo histórico supplier-auto-correlation-mvp291.ts, NO MVP336 |
| cotironda-piloto-auto-recovery | **10** | 25 archivos; contiene el correlador histórico MVP291, NO el módulo nuevo MVP336 |

El paquete candidato local MVP336 agrega un archivo (61 → 62) y cambia únicamente el import previsto en el index, pero **no se ha comparado aún byte a byte** contra el despliegue real; se necesita ese preflight previo a publicación. La evidencia confirma por qué el PDF sigue sin recuperar: el circuito activo no ejecuta MVP336 y la base no tiene su tabla de reintento.

No basta aplicar SQL: hay que mantener sincronizados webhook y trabajador, conservar la reserva única, comprobar credenciales de host y consentimiento vigente antes de activar el reintento.

## Decisión operativa actualizada: funcionamiento antes que contabilidad fina

El usuario priorizó expresamente **dejar funcional Cotironda antes de completar la medición avanzada del costo de IA**. Esta decisión no autoriza gastos ilimitados ni modifica APIs reales: el circuito MVP336/MVP292 ya usa una sola reserva por documento, cupo de recuperaciones y límites por lectura.

Se pospone la instrumentación por llamada/tokens del recovery antiguo. El preflight **ya no exige** recoveryAiSpendControlled para que una versión autorizada pueda intentar una recuperación privada. Informa aiCostMeteringDeferred=true, sin declarar gastos reales o presupuestos monetarios controlados.

**Permanecen obligatorios:** origen inmutable y hash, un solo reintento, permiso del proveedor, correlación única y dos lecturas independientes, revisión económica, autenticación del trabajador, sincronización de webhook+SQL+worker y una orden separada Publicalo. No habilitar ciclos de reintento indefinidos, gastos de fondo sin límite, mensajes automáticos extra ni ofertas engañosas.

**Ensayo funcional nuevo:** tests/unit/mvp343-flujo-documento-recuperado.test.mjs recorre el worker histórico real con PDF sintético de SHA verificado, propuesta con cantidades 15/2/1, dos correlaciones en MVP336, vínculo privado y paso a verificación comercial simulada que permanece en revisión cuando no hay justificación económica. También prueba segunda lectura divergente y fuente duplicada sin llamadas.


## Dos tracks separados

### A. Recuperación mínima del circuito existente

MVP336 es el componente cuya publicación coordinada podría destrabar el PDF. No hace falta publicar todos los MVP337–342 para ensayar el flujo antiguo.

El nuevo scripts/piloto/mvp343-recovery-only-preflight.mjs:

- Prepara en memoria un overlay del webhook MVP336 con hash fijado, conservando el bundle histórico de 61 archivos y generando un candidato de 62.
- Verifica integración al trabajador privado y autenticación interna, sin cambiar index, cron, SQL ni enviar mensajes.
- Comprueba que la migración SQL MVP336 se ejecuta solo en ensayo PG17 con BEGIN y ROLLBACK, y que el paquete mínimo no incluye migraciones MVP340–342.
- Evalúa únicamente métricas sanitizadas de la fuente. Si el archivo dejó de estar guardado, cambió su asociación, hay un claim previo, desapareció una ronda o cambió el número de líneas, devuelve BLOCKED sin adivinar.
- Con SQL aún no publicado devuelve staging_required. Sin respaldo/alternativa de recuperación aceptada, sincronización webhook/worker y orden separada Publicalo tampoco habilita la prueba. La medición fina de tokens queda diferida.
- El preflight **nunca** asigna rondas, autoriza ofertas ni registra costos como reales. Solo SQL y las dos lecturas del worker pueden aprobar una correlación privada.

### B. Integración universal posterior

MVP337–342 agregan lectores extensos, doble lectura, fuentes binarias, reservas, AES-GCM y tokens observados. Siguen como PR apilados en desarrollo. Mezclarlos obligatoriamente en el primer ensayo incrementaría migraciones, secretos, gastos y posibles fallos antes de resolver el bloqueo concreto.

## Criterios de aceptación

1. Dos lecturas semánticas concordantes del mismo PDF 15/2/1 y de los dos pedidos 15/2/1 contra 20/3 seleccionan una sola ronda por material con puntuación determinista [6,2], conservando unidades nulas. No usar recencia ni precios para elegir.
2. Dos lecturas distintas, rondas iguales, segundo claim, unidades/formatos incompatibles, una sola ronda candidata o cambio de plazo no deben adjudicar.
3. El overlay de seguridad del webhook histórico permanece intacto; solo se genera candidato offline. Trabajador privado autenticado y cuota previa obligatoria.
4. PostgreSQL17 valida un único reintento con RLS y vínculo atómico del original, sin publicar ningún documento comercial; finaliza en ROLLBACK.
5. Todos los tests de GitHub deben estar aprobados antes de proponer un lanzamiento. La consulta al piloto aún informa tabla MVP336 ausente; por lo tanto el estado real sigue bloqueado.
6. El comando Luz verde **no** publica. La orden Publicalo solo autorizará entorno y versión explícitamente definidos, con recuperación de datos y sincronización controladas; la medición fina de IA no es prerequisito del ensayo funcional.

## Próxima prueba real, una vez publicada la versión autorizada

No pedir reenvío a Ailín. Comprobar el reintento del PDF privado y, si la asociación queda respaldada, validar fuente económica, totales, condiciones IVA, flete y unidades sin inventar. Publicar solo ofertas verificadas, anónimas y fieles; comprobar navegación del arquitecto y recepción de Nahuel. Cerrar la ronda y revelar candidatos según reglas.

**Bloqueantes restantes:** SQL MVP336 no aplicado, worker e index nuevos no desplegados, respaldo/restauración no certificado, posible vencimiento de la ronda anterior, oferta aún no validada económicamente y falta de comprobación E2E. No crear rondas nuevas solo para forzar resultados.

**Decisión:** primera prueba de recuperación con MVP336, sin depender de publicación simultánea de MVP337–342, sin riesgos innecesarios para proveedores y compradores.

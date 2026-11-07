# MVP293 — Puente seguro a la recuperación histórica desde cron existente

## Situación / motivo

El piloto tiene **dos originales ambiguos** guardados. Se publicó el recuperador aislado `cotironda-piloto-auto-recovery`, cuya autenticación exige simultáneamente el JWT service-role verificado por Supabase y la cabecera `x-cotironda-recovery-secret` del secreto MVP292 de Edge. El comprador/negocio NO debe elegir rondas ni repetir mensajes.

Se identificó cron `cotironda_piloto_document_recovery_5min` existente y ACTIVO, ejecutado cada cinco minutos con token independiente de Supabase Vault; su Edge `cotironda-piloto-document-recovery` valida ese token mediante RPC antes de ejecutar código privado.

## Decisión

Reutilizar **la ejecución interna ya autorizada**, sin añadir pg_cron, y **sin copiar secretos** a SQL, GitHub, registros o llamadas externas:
- Después de procesar el flujo documental anterior, el Edge cron autorizado llama una sola vez al nuevo recuperador privado dentro del **mismo proyecto Supabase**.
- Antes de llamar, exige ambos flags `COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED` y `COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED` en `true`, URL estricta del piloto, JWT interno y clave dedicada MVP292 de longitud segura.
- La llamada exige JWT **y** `x-cotironda-recovery-secret`; el trabajador destinatario revalida ambos. El secreto de recuperación se obtiene del entorno Edge privado, no de Vault/pg_cron ni del texto entrante.
- No se cambia el cron ni su frecuencia. El nuevo trabajador reclama **un solo origen** por ejecución, con cuotas, atomicidad, evidencia de origen y fail closed heredados del MVP292.
- Resultado del proceso original retorna intacto aun cuando el nuevo trabajador rechace/falle; logs contienen solo estado no sensible, nunca tokens, teléfonos ni presupuestos.
- Solo se activan gastos reales si los tres gates/secret están correctamente instalados y hay una fuente elegible. No se envían nuevos mensajes WhatsApp desde el puente.

## Requisitos de aceptación

1. Quien no pase la autorización Vault de `cotironda-piloto-document-recovery` jamás llega a la llamada MVP292.
2. GATE OFF, JWT inexistente/ilegible, clave ausente/corta o proyecto equivocado → cero intentos de red.
3. Gates ON + credenciales válidas → un POST a **solo** `/functions/v1/cotironda-piloto-auto-recovery`.
4. Dos factores presentes en headers, sin ser impresos ni guardados en SQL.
5. Rechazo HTTP, interrupción de red, respuesta comercial sin fuente: no altera estado ni respuesta del cron anterior.
6. E2E verificado: dos fuentes históricas se intentan a lo sumo una vez cada una, priorizando atribución única; ambigüedad queda privada. Condiciones, IVA, flete y cantidades originales no se inventan.

## Publicación controlada

**Exclusivamente `cotironda-piloto`**. GitHub es referencia, pero el Edge desplegado antes de la tarea tiene cambios menos recientes que el módulo documental completo de la rama base; en despliegue se debe preservar **exactamente** el bundle original de Edge y aplicar SOLO el nuevo import/llamada más su helper. No reemplazarlo ciegamente con el código de rama, porque alteraría operaciones preexistentes no publicadas.

**Sin usar producción.** Antes de declarar listo: CI de Node y Deno, despliegue de función documental, comparación de archivos, observar ticks cron/logs y SQL real. La aparición de `ACTIVE` no demuestra que haya reprocesado un presupuesto.

Referencias: [416](416-mvp291-correlacion-automatica-sin-friccion.md), [417](417-mvp292-texto-historicos-sin-friccion.md), [418](418-mvp291-mvp292-publicacion-piloto.md).

# Decisión 386 — Etapa 7: Supervisor de IA Central, diagnóstico seguro MVP262

Fecha: 06/11/2026. **Solo desarrollo**. Aprobación «Luz verde» significa implementar y probar, sin desplegar a PILOTO/producción ni enviar WhatsApps.

## Objetivo del primer módulo

Conocer el estado técnico de las rondas, cotizaciones, documentos y mensajes de IA Central sin otorgarle al supervisor permisos comerciales o de mensajería. Un sistema «autónomo» que detecta errores no debe convertir una alarma en una autorización de reintento, filtración de contactos o adjudicación.

## Implementación

`cotironda_piloto_supervisor_snapshot_mvp262(p_window_hours)` es una RPC **STABLE / solo lectura**, `SECURITY DEFINER SET search_path=''` y `EXECUTE` concedido únicamente a `service_role`; denegado a `PUBLIC`, `anon` y `authenticated`. No crea cron, webhook, alertas salientes ni un nuevo bot. Ventana de observación de 1 a 168 horas; los casos *actualmente inciertos* se cuentan aunque sean más antiguos, para no ocultar incidentes por vencimiento de la ventana.

La salida es estrictamente agregada: **no contiene identificadores de rondas, proveedor, comprador, origen, ID Whapi, contactos, material, precio, HMAC ni SHA**. Señales verificables:

- WhatsApp `uncertain`, reservas `leased` envejecidas y salidas pendientes de trabajo, sin diferenciarlas como confirmaciones de recepción.
- Presupuestos de proveedor en `review` y reservas de IA con más de 15 minutos.
- Documentos con reintentos realmente habilitados por la política MVP256 y casos fallidos permanentes que requieren investigación.
- Expedientes abiertos de Whapi sin ID en revisión de operador MVP258 y evidencias autenticadas del MVP257 (una evidencia **no** hace desaparecer el incidente por sí sola).
- Referencias de memoria comercial MVP259 próximas a vencer en 24 horas.

Regla de severidad: **`blocked`** cuando existen envíos inciertos, leases viejos o fallas documentales permanentes; **`attention`** ante presupuestos pendientes, reservas envejecidas, revisiones de origen o reintentos elegibles; `ok` cuando ninguna señal se cumple. Muestra solo *códigos* de investigación sugerida para operador, nunca ordena ejecutarlos.

Siempre regresa las banderas `records_modified=false`, `messages_sent=false`, `automatic_resend_allowed=false`, `automatic_award_allowed=false`, `contacts_revealed=false` y `costs_verified=false`. La ausencia de una contabilidad de costos confiable **no** se transforma en un número inventado.

## Pruebas y no regresión

- PostgreSQL 17 aislado con `ROLLBACK`: sin eventos la severidad es `ok`; con eventos sintéticos de dos colas y citas vencidas, severidad `blocked`, recuentos correctos y recomendaciones que no ejecutan acciones.
- Al agregar una evidencia de Whapi confirmando una entrega incierta, el incidente original **sigue contando** hasta conciliación acreditada.
- Parámetros fuera de 1–168 horas, salida con identificadores privados y `anon`/authenticated con permisos son rechazados.
- Contratos Node revisan que la rutina no contenga escrituras SQL, llamadas de transporte, cron, valores comerciales o PII; suite completa de GitHub debe aprobar.
- Publicación en PILOTO requiere autorización separada y verificación de fuentes reales.

## Pendientes para declarar etapa 7 cerrada

Esta primera función **no está programada para correr sola** ni notifica a nadie; debe conectarse a un cron controlado con presupuestos, métricas y controles de incidentes, deduplicación de avisos, procedimiento de escalamiento y auditoría real del operador. Los costos por cliente aún no tienen contador determinista; no se incluyen como métricas hasta contar con fuente firme.

Tampoco tiene capacidad de cerrar rondas o adjudicar: las decisiones comerciales siguen bajo las reglas y autorizaciones existentes. La etapa 7 se considera **iniciada**, no terminada.

Esta entrega se integra solo a la rama de desarrollo y no modifica los gates de etapa 5 ni el versionado MVP261 de etapa 6.

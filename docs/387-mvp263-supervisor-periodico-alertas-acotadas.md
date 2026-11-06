# Decisión 387 — Etapa 7: vigilancia periódica segura con alertas privadas MVP263

Fecha: 06/11/2026. «Luz verde» autoriza **desarrollar y probar**, no activar ni publicar en PILOTO ni producción.

## Decisión técnica

Reutilizamos el Supervisor agregado del MVP262. No construimos otro modelo de IA, cola de WhatsApp ni servicio externo. El vigilante es una función SQL de PostgreSQL 17, preparada para ejecutar una lectura cada **15 minutos** mediante `pg_cron` en un despliegue futuro específicamente autorizado.

La instalación de `mvp263_supervisor_bounded_watchdog.sql` **no programa cron ni habilita nada**. Configuración privada `supervisor_policy_mvp263.enabled=false` por defecto. El script `mvp263_operator_cron_activate_MANUAL.sql` está separado: verifica `pg_cron`, exige que el operador haya habilitado la bandera y rechaza registrar un job duplicado. **No se ejecuta en este PR.**

## Qué observa y registra

La función `cotironda_piloto_supervisor_tick_mvp263()` obtiene exclusivamente el snapshot privado del MVP262. Valida la lista cerrada de siete señales y sus recuentos para detectar envíos inciertos, leases detenidos, presupuestos pendientes, reservas antiguas, reintentos documentales permitidos, fallas documentales permanentes y expedientes de WhatsApp sin revisión.

- `supervisor_runs_mvp263`: **un resumen por bloque de quince minutos** (clave única). Guarda solo severidad y números agregados, nunca IDs de empresas, ronda, WhatsApp, documentos, precios ni teléfonos. Retención limitada a 30 días, sin borrar registros de compradores ni proveedores.
- `supervisor_alerts_mvp263`: una fila por cada uno de los **siete códigos permitidos**, no una alerta nueva en cada ciclo. Actualiza recuentos de observaciones, mantiene la primera y última detección, marca resolución cuando la señal es cero y registra reaperturas.
- `cotironda_piloto_supervisor_alerts_mvp263()`: proyección de uso interno, **solo service_role**, sin datos privados ni comandos operativos.
- `supervisor_policy_mvp263`: una sola fila bloqueada con `FOR UPDATE`, con gate de activación, intervalo obligatorio de 15 minutos, y máximo configurable entre 1 y 96 ejecuciones por día UTC. El par **bloqueo + clave única del bloque** evita alertas duplicadas si dos ejecuciones se solapan.

## Controles de gastos y seguridad

La vigilancia **no usa OpenAI, Google, Whapi, pg_net, HTTP, email ni otro servicio de pago**. Cada ciclo requiere `external_api_calls=0` y `model_calls=0`, impide reenvíos, adjudicación y revelación de contactos. Esto **no significa que PostgreSQL sea gratuito**: las consultas consumen recursos de la base y no contamos con métricas facturables de Supabase por cliente. Por eso los límites reales que implementamos son **frecuencia y cantidad máxima de ejecuciones**, siete alertas registrables y retención de 30 días; el coste monetario efectivo sigue siendo `costs_verified=false`.

Si el snapshot falla, trae una señal no acreditada, o supera límites, el ciclo aborta sin guardar una conclusión ficticia. La función es `SECURITY DEFINER SET search_path=''`, sólo `service_role`, con tablas privadas bajo RLS y sin grants directos para `anon`, `authenticated` o `service_role`.

La función **no envía avisos por WhatsApp ni notifica por correo**, no ejecuta correcciones y no habilita pagos. Los incidentes quedan guardados **para consulta interna del operador**. Las notificaciones externas, si se desean en el futuro, deben contar con su propia aprobación, evidencia de consentimiento, cuota y deduplicación independiente.

## Criterios de aceptación y pruebas

- PostgreSQL 17 transaccional con `ROLLBACK`: gate OFF sin escrituras; dos invocaciones en el mismo intervalo y bloque deduplicados; siete señales y recuentos; cuota diaria bloqueante; cierre cuando desaparece el incidente; reapertura de la misma clave sin nuevas filas; sin PII; RLS y ACL.
- Tests Node para contrato SQL (lista blanca, bloqueo atómico, no API, no cron en migración, activación manual separada).
- Regresión general GitHub (unitarios, Next.js, Deno, SQL y PostgREST) antes de fusionar en desarrollo.
- **No desplegar** las migraciones a PILOTO/producción ni ejecutar el script de activación. No declarar etapa 7 terminada operativamente.

## Faltantes de etapa 7

No se ha probado el intervalo cron con carga real, su tiempo de consulta, interrupciones de pg_cron, costos reales de base, ni una respuesta de operador a una alerta en entorno autorizado. Tampoco existe un canal de aviso externo aprobado. El supervisor diagnostica y registra; no es un agente autónomo con capacidad de tomar decisiones comerciales.

Para un futuro piloto: auditar permisos y costos reales, instalar migración bajo autorización, mantener gate OFF, validar snapshot con sólo lectura y backups, habilitar gate conscientemente, ejecutar el script de cron una sola vez, comprobar `cron.job_run_details` y la proyección de alertas, y ofrecer mecanismo de apagado: **primero `enabled=false`, luego `cron.unschedule(...)`**, también con aprobación expresa.

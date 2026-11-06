# Decisión 393 — MVP268: preflight de publicación solo lectura, con estado real del piloto

**Fecha:** 06/11/2026. Autorización del propietario: «Luz verde» = **desarrollar y probar**, sin publicar ni activar tráfico real.

## Resultado real de `cotironda-piloto`

Consulta ejecutada directamente por herramienta conectada a Supabase, proyecto `ilggkalaafhtiysyzlmg`, con el SQL nuevo `supabase/piloto/mvp268_launch_readiness_readonly.sql`. No se leyó PII, ni documentos, ni importes; no hubo DDL, DML, cron programado, API externa ni WhatsApp.

| Comprobación | Observado |
| --- | --- |
| PostgreSQL | 17.11 |
| Rondas existentes (agregado) | 3 |
| Salidas Whapi con estado `api_accepted` | 5; **no equivalen a entregas** |
| Whapi `uncertain` y despachos IA `uncertain` | 0 / 0 |
| Gates IA Central, despacho, ventana de ensayo, originales | Cuatro desactivados |
| `pg_cron` | Instalado; 3 trabajos preexistentes activos |
| Nuevo cron supervisor MVP263 | Ausente/inactivo |
| Usuarios Supabase Auth | 0 |
| Funciones/objetos de MVP256–MVP267 | **0 de 12 presentes**, enumerados por el SQL |
| Condiciones iniciales de **esquema** para planear instalación controlada | Sin bloqueos en los cinco criterios SQL comprobados |
| Cuenta de operador con MFA `aal2` | No verificada; no hay usuarios Auth |
| Ronda real WhatsApp→presupuestos→comparador→cierre | No verificada |
| Permiso de publicación y pilotaje | No concedido por «Luz verde» |

Los módulos ausentes son `256,257,258,259,260,261,262,263,264,265,266,267`. El reporte incluye `source_project_verified_by_sql=false`: **un SELECT no prueba la referencia de proyecto por sí mismo**; la identidad del proyecto se verificó **separadamente** con la conexión Supabase elegida.

**Dictamen:** el entorno tiene una base de partida para preparar una instalación controlada sin envíos inciertos en los dos ledgers consultados. **NO-GO para decir «piloto completo» o habilitar despachos en este momento.** La etiqueta `ready_for_controlled_schema_install` es un precontrol *técnico limitado*: NO cubre backups, prueba integrada de las 12 migraciones, versionado de Edge/Vercel, flags de entorno, consentimientos ni costos facturados.

## Qué aporta MVP268

- Una única consulta SQL **de solo lectura**, sin procedimientos auxiliares ni escrituras, que inspecciona la presencia de cada etapa desde MVP256 a MVP267, los cuatro gates críticos, la existencia de `pg_cron`, los jobs activos (sin exponer comandos), usuarios Auth agregados, rondas y colas inciertas.
- Devuelve exclusivamente JSON agregado, sin teléfonos, nombres, IDs de mensajes, SHA/HMAC, montos, originales ni payloads de conversaciones.
- Nunca certifica `ready_for_real_whatsapp_pilot`, `release_authorized` o `operator_auth_e2e_verified` a partir de SQL. **Se mantienen en `false` hasta que se haga y documente un E2E autorizado.**
- Prueba PostgreSQL 17 reversible con dos escenarios: configuración inicial conservadora y configuración insegura (despacho encendido, outbound incierto, supervisor en cron). La segunda debe ser rechazada.
- Tests Node contra mutaciones SQL prohibidas, filtración de datos, lista completa de 12 módulos y ausencia de afirmaciones falsas.
- CI exclusiva de desarrollo; ningún job llama a APIs pagas, WhatsApp, bases remotas ni Vercel.

## Advertencias del asesor de seguridad Supabase (solo lectura)

El asesor **Security** del proyecto real, consultado el 06/11/2026, informó:

- **WARN** `extension_in_public` (1): `pg_net` está en esquema `public`. No moverlo a ciegas: comprobar dependencias de cron, Edge y webhooks y planificar migración con rollback.
- **WARN** `authenticated_security_definer_function_executable` (3): `cotironda_piloto_buyer_identity_mvp191`, `cotironda_piloto_my_rounds_mvp126` y `cotironda_piloto_new_web_link_mvp126`. Sus funciones manejan identidad en el servidor. El aviso no demuestra por sí solo una vulnerabilidad, pero **hay que completar pruebas de permisos/sesiones** antes de activar Auth y documentar por qué el `SECURITY DEFINER` resulta indispensable.
- **INFO** `rls_enabled_no_policy` (60 tablas de esquema privado). Son tablas privadas con aislamiento intencional por RPC, pero se debe auditar ACL y exposición de esquema antes de cualquier publicación.

La salud general respondió sin incidencias. No se deshabilitaron funciones, no se movieron extensiones y no se modificaron políticas. Fuentes de remediación: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public y https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

## Orden de instalación posterior a una autorización `Publicalo en cotironda-piloto`

Instalar en orden de dependencia, siempre previa copia de seguridad y ensayo PG17 transaccional sobre un esquema compatible:

1. `MVP256` — política segura de recuperación documental; reemplaza funciones existentes (mayor riesgo de regresión: probar el worker antes/después).
2. `MVP257`, `MVP258` — recibos de Whapi incierto y expedientes sin ID, solo pasivos.
3. `MVP259`, `MVP260`, `MVP261` — memoria privada, puente de contexto y versiones comerciales, manteniendo los flags Edge **apagados**.
4. `MVP262`, `MVP263` — supervisor y watchdog sin activar `enabled`, **NO ejecutar** `mvp263_operator_cron_activate_MANUAL.sql`.
5. `MVP264`, `MVP265`, `MVP266`, `MVP267` — consumo OpenAI, bitácora, bloqueo persistente y Auth+MFA. No habilitar operadores por defecto ni introducir `service_role` en el navegador.

El orden anterior **no autoriza** ejecutar las migraciones automáticamente. Validar primero las firmas, objetos y RLS reales, toda la cadena de dependencias y la posibilidad de volver al estado previo sin perder registros. No revertir un incidente borrando ledgers; apagar flags y retirar tráfico antes de modificar el esquema.

## Puertas de salida antes del primer WhatsApp de prueba

1. Versiones exactas de migraciones/Edge/web registradas, backup recuperable y dos entornos distintos del productivo.
2. Doce migraciones coherentes en una reconstrucción PG17 con rollback, revisión ACL/RLS, y tests CI completos verdes.
3. Configuración manual de usuarios y permisos necesarios (cuenta operadora Auth con MFA para operar incidentes/originales, sin abrir autorregistro general).
4. Activación gradual y acotada de gates, con cuota/costo trazable y apagado inmediato comprobado; sin reenvío automático de estados `uncertain`.
5. Prueba real autorizada con un comprador y dos proveedores previamente consentidos: pedido de tres rubros, PDF, dos respuestas en distintos formatos, asociación correcta, ofertas parciales, ranking honesto, seguimiento y cierre con consentimiento.
6. Evidencia de resultados HTTP/Whapi/DB/portal y costos observados, no solo pruebas sintéticas.

**Estado del cambio:** preparación y pruebas en desarrollo, sin modificar `main`, Supabase PILOTO, cron, Vercel ni WhatsApp.

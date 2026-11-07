# MVP294 — compatibilidad de credenciales de Supabase para recuperación interna

## Evidencia real del piloto

`cotironda-piloto-document-recovery` **v30 ACTIVE** incorporó puente privado MVP293. Al ejecutarse cron Vault el **07/11/2026 15:10 UTC**, el log de la misma Edge fue `cotironda_mvp293_internal_tick configuration_unavailable`. Las dos fuentes históricas continuaron pendientes; la base tuvo **0** reclamos y **0** replays. Ningún WhatsApp fue iniciado por el nuevo módulo.

La guía vigente de Supabase ([Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)) explica que los nuevos `sb_secret_` **no son JWT**, deben enviarse en la cabecera `apikey`, y el gateway `verify_jwt=true` no los valida como tokens JWT. El diseño anterior solo admitía JWT legacy y por lo tanto rechazaba claves modernas o no podía autenticarlas.

## Solución de seguridad

- MVP293 acepta **exactamente** un JWT legacy de service-role **o** una clave moderna `sb_secret_` con formato esperado. El JWT se envía en `Authorization: Bearer`; el secreto moderno solo en `apikey`. Ambos con cabecera separada `x-cotironda-recovery-secret`, desde Edge env.
- En MVP292 Edge, cuando se haga el despliegue de esta corrección, **`verify_jwt=false` exclusivamente en el recuperador interno**. Como sustituto, su propio handler comprueba en tiempo constante **AMBOS** factores contra su entorno: (1) clave moderna `SUPABASE_SECRET_KEYS.default` o JWT legacy `SUPABASE_SERVICE_ROLE_KEY` que coincida **exactamente**, y (2) secreto MVP292 dedicado con longitud >=32, <=256. No permite mezclar modos, aceptar tokens del navegador ni pedir secretos por URL.
- El guard se ejecuta antes de crear el cliente privilegiado o procesar la fuente, y devuelve exclusivamente `401 unauthorized` sin credenciales. El cron y la Edge histórica anterior conservan el token privado de Vault y verifican autorización antes de invocar el puente.
- No añadir cron ni exponer claves en `cron.job`, `pg_net`, GitHub, logs o chat.
- La ausencia de secret/gate/identificación unívoca mantiene el sistema cerrado; nunca crea oferta falsa ni reenvía WhatsApps.

## Control de aceptación

Pruebas unitarias Node comparan exactitud de dos factores, modos JWT/`sb_secret_`, faltantes, colisiones, mixtos y rechazo. CI Deno typecheck verifica el recuperador y el cron. Antes de publicar verificar que la Edge anterior aún activa y su código no haya cambiado, desplegar solamente el archivo de worker de GitHub y helper nuevo, `verify_jwt=false` y preservando los demás módulos. Confirmar el mismo procedimiento para `cotironda-piloto-document-recovery` sin reemplazar módulos preexistentes.

Después del despliegue observar log del primer tick posterior: `accepted` es transporte exitoso, **no** prueba de vínculo económico/comercial. Revisar SQL en `ai_supplier_auto_recovery_mvp292` y `ai_supplier_archive_replay_mvp292`; si la fuente queda en revisión privada, se respeta ambigüedad real. Nunca declarar completado hasta E2E verificado.

Solo `cotironda-piloto`. No modificar producción ni `main`.

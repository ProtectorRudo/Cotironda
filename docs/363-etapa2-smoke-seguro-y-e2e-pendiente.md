# MVP240 — Verificación segura de la etapa 2 en el piloto

El objetivo es una comprobación de **contratos y permisos en la base real** sin enviar WhatsApps, crear rondas o forzar respuestas. El SQL es un test, **no una migración**.

## Por qué no insertar dos invitaciones de prueba en esta base
Auditoría de triggers sobre `cotironda_piloto_privado.invitations`:
- `enqueue_on_invitation` ejecuta `queue_invitation_whapi_v1`.
- `mvp092b_supersede_prior_invitations` interviene antes de insertar.
- `z_mvp099_partial_invite` actualiza estados de parcialidad.

Por seguridad no insertamos rondas, proveedores ni mensajes simulados en esa tabla de piloto. Las pruebas de dos rondas y fuente/archivo/ACL se ejecutan aisladas en PostgreSQL 17 mediante los tests MVP236–MVP239 (ya aprobados). **La simulación de base no sustituye al E2E real**.

## Comprobaciones del SQL
`supabase/tests/ci/mvp240_stage2_pilot_smoke_no_whapi.sql` usa `BEGIN/ROLLBACK`; solo invoca RPCs con HMAC ficticios previamente descartados como registros existentes. Verifica tres gates OFF, presencia de triggers, tablas MVP237–239, permisos públicos denegados, RLS y respuestas fail-closed de seis RPCs.

No emplea cuentas reales para enviar mensajes, no incluye tokens, teléfonos ni precios. La prueba solo es válida **cuando los tres gates están apagados**.

## Criterio de cierre aún pendiente
Para declarar etapa 2 terminada operativamente se necesitan mensajes WhatsApp **reales y autorizados** con comprador y dos proveedores, dos rondas simultáneas, PDF/Excel y reintentos. Los envíos no pueden simularse modificando filas en una base que tiene triggers comerciales. Los controles se habilitarán únicamente dentro de una prueba acotada acordada, y se apagarán al finalizar.

Estado antes de esa prueba (06/11/2026): no llegaron nuevos WhatsApps al piloto desde el 05/11/2026, 3 rondas históricas, 0 trabajos nuevos de despacho/relación IA Central, gates OFF. El E2E no puede afirmarse como completado.

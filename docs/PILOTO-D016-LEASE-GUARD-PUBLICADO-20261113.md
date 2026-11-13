# Cotironda V2 — D016 P0: refuerzo de lease del aviso, publicado en PILOTO

**13/11/2026.** Supabase real: proyecto \`cotironda-piloto\` (\`ilggkalaafhtiysyzlmg\`). Infraestructura privada únicamente. **Sin activación comercial ni cambios a producción.**

## Migración instalada y verificada

- Migración identificada por Supabase: **\`20261113194958\`**.
- Nombre: \`cotironda_d016_original_notice_lease_guard_off_pilot_20261113\`.
- Fuente versionada: \`supabase/piloto/v2_d016_original_notice_lease_guard_CANDIDATE.sql\` del [PR #840](https://github.com/ProtectorRudo/Cotironda/pull/840).
- Preflight en la transacción exigió PostgreSQL 17, **7 rondas previas** y **1 preparada**, políticas negocio/originales/cierre en **OFF**, **0 avisos y 0 respuestas** existentes, RPC anterior presente y RPC con lease ausente.
- Supabase confirmó \`apply_migration success=true\`, con migración registrada.

## Cambio de seguridad

La función previa \`cotironda_piloto_v2_d016_reserve_original_notice_private(uuid,text,text,text,text)\` no comprobaba el lease del trabajador MVP222. Se revocó su permiso \`EXECUTE\` a \`service_role\`.

Se instaló \`cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)\` que exige, además de identidad de ronda/proveedor/chat y política prospectiva, el **token exacto de un job en estado \`leased\`**, creado después de la invitación. Solo entonces admite registrar una reserva. Invocaciones duplicadas no insertan otra fila. La versión del aviso y su SHA permanecen inalterados.

## Postrelease contra Supabase REAL

- Rondas antiguas: **7**, preparadas históricas: **1**.
- Políticas comerciales \`v2_business_policy\`, \`v2_original_share_policy\`, \`v2_auto_release_policy\`: **false / false / false**.
- Avisos en nuevo ledger: **0**. Respuestas nuevas: **0**.
- RPC nueva instalada: **true**, ejecutable por \`service_role\`: **true**; por \`anon\` y \`authenticated\`: **false / false**.
- RPC antigua ejecutable por \`service_role\`: **false**.
- Prueba negativa de reserva con lease nulo: **false**. No se crearon avisos.
- En GitHub CI, [PR #840](https://github.com/ProtectorRudo/Cotironda/pull/840) incluye Node, PG17 sintético y Deno; comprobar conclusión de **todo** el último SHA antes de fusionar.

## Integración de despacho — código en revisión, NO instalado

El PR añade \`ai-central-dispatch-d016.ts\` por fuera del fichero histórico inmutable \`ai-central-dispatch-mvp223.ts\`, adaptador \`original-notice-dispatch-d016.ts\` y overlay \`v2-d016-original-notice-overlay.mjs\`. Este último genera en CI una copia candidata del webhook preservando la versión activa v76 por SHA. La reserva se hace **antes** del mismo HTTP Whapi que envía el PDF, y la confirmación **después** del \`finish_mvp222\`. El flag \`COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED\` permanece OFF. No se envió ningún pedido, tampoco un WhatsApp adicional.

**Pendientes obligatorios:** revisar la suficiencia legal del aviso para originales (Ley 25.326), integrar observación y baja del proveedor en el webhook autenticado y las RPC de lectura/descarga/worker prospectivas, comprobar secretos privados, abrir la Preview de acceso corregida cuando se libere cuota Vercel, E2E WhatsApp→PDF/Excel→portal→informe final con un comprador y dos proveedores. No activar políticas ni cron antes de ese E2E.

**Referencia:** [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) y [plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

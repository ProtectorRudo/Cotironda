# Acta 490 — Despliegue controlado V2 sombra a Supabase piloto

**Fecha:** 10/11/2026 (ART). **Único entorno autorizado:** Supabase `cotironda-piloto`, ref `ilggkalaafhtiysyzlmg`. **Autorización:** «Publicalo». **Producción:** no tocada. **Alcance:** reingreso PRIVATE de originales ya archivados; NO publicar ofertas, rankings, WhatsApp ni identidad.

## Origen y controles

- GitHub fuente: PR #761 (contrato/ADR486), #762 (lector B1), #763 (ledger/worker B2), #764 (Edge B3) y #765 (puente B4). Se comprobó CI de B3 con 6/6 workflows; para B4 se exige prueba Node/Deno/PG17 y regresión antes de alterar Edge previo.
- Se confirmó en solo lectura que hay **dos PDF originales de proveedores autorizados con invitaciones entregadas**, `state=stored`, `review_state=suggested_only`, sin `request_id`, y los dos son `review` en el ledger MVP292. No exigir reenvíos ni resetear histórica.
- Bucket `cotironda-piloto-originals` PRIVATE, límite 8 MiB. Función anterior `cotironda-piloto-auto-recovery` **v11** coincidía exactamente con el source GitHub previo. Backup GitHub: rama `ops/backup-auto-recovery-v11-before-v2-20261110`; imagen original recuperable mediante get_edge_function de v11 (conservada en historial de versiones Supabase).

## Cambios efectivamente publicados

1. Migración `20261110221810`, nombre `cotironda_v2_b2_shadow_archived_supplier_read_20261110`: tabla privada `v2_shadow_settings` flag false, ledger `v2_supplier_shadow_runs`, RPCs B2 service_role solamente, RLS ON, anon/auth denied. Comprobación posterior `claim_v2_shadow_b2()` -> `disabled`; 0 filas procesadas.
2. Edge `cotironda-piloto-v2-shadow` **v1 ACTIVE** con `verify_jwt=false` protegido **en el código** por doble factor: secreto de recuperación existente + credential secret service role exacta, más flag SQL. Bundle con seis archivos desde GitHub PR #764 (commit `f9051f832f48522198e2078121b8c0786cf285a0`). SHA de bundle `88052854d28a7d5da9d08f9e4a6a05422f1ed678ac67a8f9c61879a79c90764e`.
3. Nueva RPC B4 `cotironda_piloto_v2_shadow_enabled_b4()`, SECURITY DEFINER solo service_role, `search_path=''`, devuelve booleano del flag privado; nunca entrega datos ni toma lease. Validación real: OFF, anon/auth false y service_role true.
4. Recuperador original se desplegó como **v12 ACTIVE**, construyendo desde los 27 archivos exactos de v11 y modificando únicamente index + helper `v2-shadow-bridge-b4.ts` (28 archivos). Bundle SHA `78e67bdddbab9a53482f11242bffa3e3c7b756cce5e9de7907e9b447cf54b0fa`. `EdgeRuntime.waitUntil` dispara V2 en segundo plano y devuelve rápido al cron MVP293; V2 OFF -> una RPC SQL de solo lectura y cero POST extra. **No se cambiaron los tres cron jobs**, Whapi, tracking, Vercel ni fuentes.

## Prueba real 1 — comprobación y bloqueo no destructivo

- Se habilitó temporalmente `v2_shadow_settings.enabled=true` a las **22:30:09 UTC (19:30:09 ART)**. Se invocó una única ejecución extra del **cron preexistente** mediante su propio comando `pg_net` Vault autenticado. La consulta no imprimió ningún token, y previamente se validó que el cron era una sola sentencia `net.http_post` a la Edge de recuperación y que no había outbox pendiente.
- Logs confirmaron **`cotironda_mvp293_internal_tick accepted`** y después **`cotironda_v2_shadow_b4_tick scheduled`**. La llamada HTTP al Edge B3 llegó pero devolvió **`POST | 413`**; por lo tanto el bridge reportó `refused`. NO se ejecutó lectura de IA ni se consumió ningún claim V2. Ledger B2 permaneció 0. Esto NO demuestra extracción exitosa.
- La causa concreta en el código B3: trataba cualquier `request.body !== null` o encabezado `transfer-encoding` como payload malicioso. La pasarela Edge puede representar un POST vacío como stream no nulo/chunked. Se reemplazó el guard por: contenido declarado 0 + query vacía + lectura acotada de stream (hasta 4 chunks vacíos, timeout 5s) y rechazo de todo byte de carga. Se agregaron pruebas de empty-string/stream y de cuerpo real con bytes (sigue 413). El fix espera CI y deploy B3 v2.
- Por seguridad se **apagó nuevamente el flag SQL a las 22:33:10 UTC (19:33:10 ART)**. Los dos PDF y el ledger histórico siguen intactos; no se enviaron nuevos WhatsApps ni se publicó una oferta.

## Siguiente paso de este mismo despliegue autorizado

1. Exigir CI completo en PR #765 y verificar compilación Deno, autenticación sin regresiones y el test que reproduce el POST vacío del gateway.
2. Reemplazar únicamente Edge B3 **v1 → v2** (mismo módulo y seis archivos, cambiando handler), sin rotar claves ni tocar v12, Whapi o cron.
3. Verificar `v2_shadow_settings.enabled=false`, habilitarlo solo para tick controlado a través de cron Vault existente; después leer ledger B2 agrupando `state,reason_code` SIN devolver textos, HMAC ni datos privados al chat.
4. Dejar flag OFF al finalizar la prueba y contrastar antes/después: PDF originales 2; ledger MVP292 2 reviews; ofertas públicas MVP347 no aumentan.
5. Si aparece `candidate_private`, NO implica precio correcto: verificar artículo, cantidad, subtotal, IVA, flete y condiciones con el documento original antes de publicar en el enlace del arquitecto.

## Límites y recuperación

Este trabajo prepara y ensaya el camino de lectura privada. Todavía falta auditor económico independiente por campo, asociación inequívoca de ronda y proyección parcial anónima. No declarar E2E completa por HTTP 200 ni `candidate_private`. Ante fallas, SQL flag OFF y examinar logs genéricos; no reiniciar versiones/leases ni pedir reenvío. Para revertir v12, reconstruir y redeplegar exactamente el bundle v11 desde el historial de Supabase, usando el branch de respaldo como referencia; nunca sustituyendo con un estado GitHub divergente.

**Métricas finales e incidentes posteriores se registran en #759/#760/#765 al cierre.**
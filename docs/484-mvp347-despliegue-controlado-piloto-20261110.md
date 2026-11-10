# Acta 484 — Publicación controlada MVP347 en cotironda-piloto

**Fecha:** 10/11/2026. **Autorización:** usuario dijo «Publicalo». **Entorno:** Supabase `cotironda-piloto` (proyecto `ilggkalaafhtiysyzlmg`), NO producción. **Estado:** infraestructura publicada; recuperación real pendiente de invocación interna segura. No declarar E2E completo.

## Versión exacta instalada

- **Fuente de código:** commit `e7078523dc4c066ce07073a0dff730d1cc9e1ab7`, PR #757 aún draft (pila #742→#752→#754→#755→#756→#757).
- **Migración Supabase aplicada:** `20261110180847`, nombre `mvp347_pilot_verified_revision_combined_20261110`. Abarca SQL `mvp336_recorrelacion_una_vez_sin_unidades.sql`, `mvp346_supplier_economic_revision_private.sql`, `mvp347_verified_economic_revision_publication.sql` y `mvp347_tracking_verified_revision_overlay.sql`. Preflight exigió PostgreSQL 17, RPCs de base y hash de función de seguimiento `b06e282511a1f53a8e69b3d35e2f3cd6a7a9fe3b0fb2bbd4249fb94670aef9de`.
- **Edge Function:** `cotironda-piloto-auto-recovery`, versión **11 ACTIVE**, checksum compilado `67e8ed1e15ae82939aa1cb26289624613f2176bd744e8ea275802333f584a439`; 5 módulos añadidos/actualizados sobre el bundle existente, conservando la validación de doble factor. Se mantuvo `verify_jwt=false` como en v10 exclusivamente porque el handler aplica autenticación privada propia; POST sin credenciales devolvió HTTP 401.
- **Sin publicación de UI ni webhook:** `cotironda-piloto-whapi` permanece v75, `cotironda-piloto-seguimiento` v29. La consulta SQL de seguimiento sí fue actualizada. No hubo deploy Vercel, cuyo plan tenía límite de builds.

## Validaciones reales

- `ai_supplier_correlation_retries_mvp336`, `supplier_revision_candidates_mvp346` y `anonymous_supplier_revisions_mvp347` existen.
- Los RPC nuevos de recuperación y publicación y la función de seguimiento son ejecutables por `service_role`, **no** por `anon` ni `authenticated`.
- Consulta con token inválido a seguimiento => `not_found`. Intento de publicar una revisión sin candidato/atribución => `not_permitted`. Petición HTTP a Edge sin claves => `401 unauthorized`.
- Recuento posterior: 2 rondas vigentes, 2 archivos PDF sin vincular; 1 fuente revisable con razón `insufficient_material_evidence` y sin lease, otra ya en revisión por `independent_reads_disagree`. No se han creado candidatas MVP346, publicaciones MVP347 ni reintentos MVP336.
- Código anterior: CI Node 3.527 casos / 3.517 aprobados / 0 fallidos / 10 omitidos, PG17 Deno y seguridad aprobados; estas son **pruebas sintéticas**, no evidencia de oferta real procesada.

## Reversión y contingencia

- Copia exacta de los archivos del Edge worker **v10** (25 archivos) preservada en rama `ops/backup-piloto-auto-recovery-v10-20261110`, commit `bf4931ff95cc2a0c5e40ed7966f55c50d73cad22`, en `docs/ops/rollback/piloto-auto-recovery-v10-20261110.json`. Para restaurar: redesplegar `files`, `entrypoint_path` y `verify_jwt` del JSON; verificar versión y checksum resultantes, y hacer smoke de 401.
- Si hubiera que desactivar la nueva vía de publicación, primero detener el invocador de auto-recovery; restaurar la función SQL de seguimiento desde `supabase/tests/ci/mvp347-tracking-baseline-readonly.sql`, verificando huellas y versión antes de cambiar funciones. Las tablas nuevas son privadas y el SQL fue aditivo. **Nunca hacer DROP** de tablas de candidatos/publicaciones sin verificar que estén vacías y respaldadas. Conservar original, ofertas y enlaces.
- No se contrató backup pago ni se asumió que GitHub sustituye un respaldo completo de PostgreSQL. La reversión anterior cubre el bundle nuevo y el overlay, no una restauración integral de la base.

## Falta para activar la prueba real

1. No existe entrada activa de `cron.job` que invoque `cotironda-piloto-auto-recovery`. El cron activo de `document-recovery` es **otro** Edge endpoint. Se necesita un disparo/cron autenticado con la credencial interna y una clave de servidor, sin compartir claves en chat ni pasarlas por frontend. No se desactiva el doble factor.
2. Ejecutar exactamente un tick autorizado, verificar el lease, la correlación única y los controles económicos de **un** PDF sin crear rondas, enviar WhatsApps o pedir archivos otra vez.
3. Si la lectura fuente confirma la interpretación, comprobar publicación anónima en el enlace del arquitecto; si hay diferencias, conservar revisión y diagnóstico. Luego Nahuel y cierre de ronda. No anunciar dos presupuestos publicados hasta leer sus registros reales.
4. Antes de cualquier nueva publicación: monitorear cambios de hash de seguimiento, límite Vercel y estados de candidatos, importes, permisos y cron. El resto del piloto queda operativo sin alterar webhook.

**Observación:** «Publicalo» autorizó este despliegue de pilotaje, no revelación de teléfonos, adjudicación automática ni producción.

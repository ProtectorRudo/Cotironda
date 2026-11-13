# Cotironda V2 D016 — Acta de publicación REAL · 13/11/2026

**ENTORNO EXCLUSIVO: PILOTO. No producción.**
**Estado: publicada infraestructura candidata con bloqueo comercial deliberado.
NO es un E2E real ni un piloto 100% operativo.**

## A. Vercel Preview: PUBLICADO Y VERIFICADO

- Proyecto: `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`).
- Deployment: `dpl_HnXQbGifbdAienC7fZQJfexQmEdW`.
- Commit exacto: `64b8573fde5321dabaef557d2bea40c7d80bc503` de
  `feat/d016-whatsapp-link-safe-pilot-20261113` (PR #837 DRAFT).
- URL: <https://cotironda-portal-anhy2cgft-protector-rudo-s-projects.vercel.app>.
- Vercel API reportó **READY** y build **Deployment completed**. SSO
  en `cotironda-portal-dev` permanece habilitado para TODOS los deployments.
- `target: null` (Preview por omisión). **Sin `--prod`, sin dominio productivo,
  sin promoción, sin merge a `main`**.
- No estaban configuradas en Vercel Preview las variables y claves privadas
  D016 necesarias; por eso el portal no queda habilitado para operar aunque
  la compilación haya terminado. No inventar que el enlace permite E2E.

## B. Supabase PILOTO: funciones Edge nuevas instaladas

Proyecto `cotironda-piloto` (`ilggkalaafhtiysyzlmg`), cuenta
`link_6ae7c396d2588191bf791cfe84ae4ab3`.

- `cotironda-piloto-v2-text-reader-d016`: **ACTIVE v1**.
- `cotironda-piloto-v2-worker-d016`: **ACTIVE v1**.
- Ambas son NUEVAS, `verify_jwt=false` solo porque implementan seguridad
  interna basada en dos credenciales servidor-servidor y validación en SQL;
  la habilitación por variables Edge se mantiene **OFF/no configurada**.
- Webhook histórico `cotironda-piloto-whapi`: **ACTIVE v76 intacto**.
- No se enviaron WhatsApps ni se invocó la IA con presupuesto real.
  No se activaron cron jobs. El trabajador no se programa mientras el workflow
  GitHub no esté integrado a la rama default y el flag específico habilitado.

## C. Supabase PILOTO: SQL instalado, RLS y ACL validadas

Migraciones `apply_migration` exitosas, **solo en cotironda-piloto**:

1. `cotironda_d016_whatsapp_access_pilot_20261113`
2. `cotironda_d016_responders_originals_pilot_20261113`
3. `cotironda_d016_analysis_pilot_20261113`
4. `cotironda_d016_offline_worker_pilot_20261113`
5. `cotironda_d016_business_close_pilot_20261113`
6. `cotironda_d016_final_report_pilot_20261113`
7. `cotironda_d016_la_plata_2026_unapproved_calendar_pilot`

Se instaló el marcador no confidencial de identidad
`cotironda_d016_pilot_project_ref` dentro de Supabase Vault, con
identidad `ilggkalaafhtiysyzlmg`. **No se crearon ni copiaron claves de
API ni secretos de Whapi, OpenAI o usuario.**

**Resultados leídos DESPUÉS de publicar:**

- **22 RPC D016**, **0 ejecutables por `anon` o `authenticated`**,
  solo `service_role`.
- **5 tablas D016 con RLS activado**, **0 sin RLS**.
- `v2_business_calendar`: 1 fila, `la plata / 2026 / lp_v2_r1`,
  **`approved_at=NULL`**; `v2_business_holidays`: 18 fechas 2026.
- Calendarios APROBADOS: **0**. 2027: **sin cargar**.
- `v2_business_policy.enabled=false`,
  `v2_original_share_policy.enabled=false`,
  `v2_auto_release_policy.enabled=false`.
- Proveedores con consentimiento específico V2 de originales: **0**.
  No inferir que esto significa que no estén registrados en Cotironda.
- `cron.job` D016: **0**.
- La función worker `worker_due_private(1)` devolvió `[]` (nada que
  procesar); funciones de fuente original e informe final rechazaron
  ronda inexistente sin revelar datos.
- Auditor de seguridad Supabase: 5 tablas D016 se informan en aviso
  INFO `rls_enabled_no_policy`, consistente con **denegación completa
  a cliente y acceso exclusivo por RPC privadas service_role**.
  Referencia: <https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy>.

## D. Qué quedó PENDIENTE antes de una ronda comercial real

**No se puede afirmar que Cotironda esté 100% operativo.**
Bloqueos actuales, sin eludir reglas:

1. Validar el **consentimiento específico de compartir originales V2**
   para Ailín/Nahuel y rondas prospectivas; no fabricar aceptaciones.
2. **Aprobar el calendario** y su criterio sobre feriados optativos de
   comercio, confirmar fuentes locales y preparar 2027 si se cruzará el año.
   Nunca retrofechar `approved_at`.
3. Configurar secretos segregados y flags específicos en
   Supabase Edge, Vercel Preview y GitHub Actions sin mostrarlos ni
   traspasar AES de Whapi a Vercel. El acceso SSO del Preview debe
   verificarse con un usuario autorizado; no se desactiva globalmente.
4. Habilitar progresivamente los tres gates V2 SOLO para rondas nuevas
   y ejecutar cron SQL-only de cierre + trabajador GitHub cuando las
   políticas/seguridad/costos sean verificables. No programar `pg_net`
   con secretos.
5. Probar **E2E real**: arquitecto → WhatsApp → distribución por producto de
   catálogo → Ailín/Nahuel → originales PDF/Excel/texto → análisis IA →
   enlace comprador → cierre 2 hábiles a 18:00 AR → informe final.
   Sin intervención manual del cliente ni proveedor. No tocar pruebas
   anteriores ni clasificaciones V1.

## E. Reversión, monitoreo y límites

- Mientras estén OFF los gates, no es necesario borrar tablas ni archivos.
- Si aparece una falla, detener únicamente las funciones D016 y el Preview
  mediante los mecanismos soportados por Supabase y Vercel; no revertir
  el webhook Whapi histórico v76 ni borrar cotizaciones/auditorías.
- Comparar siempre versión y SHA con lo instalado; no desplegar nuevo HEAD
  automáticamente si el PR cambia. Una publicación futura necesitará
  un commit nuevamente verificado.
- No revelar identidad comprador/proveedores fuera de reglas ni
  habilitar originales de rondas anteriores con permisos retroactivos.
- CI sintético en SHA `64b8573...`: **8/8 GitHub Actions SUCCESS** antes
  de publicar. Build Vercel READY y consultas SQL reales posteriores
  prueban instalación técnica; NO sustituyen la vuelta comercial.

**Fuente de verdad:** [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837),
[plan maestro](docs/PILOTO-100-PLAN-MAESTRO.md),
[estado](docs/PILOTO-100-ESTADO.md).

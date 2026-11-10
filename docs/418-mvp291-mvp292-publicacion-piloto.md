# Entrega 418 — MVP291/MVP292 instalado en cotironda-piloto

**Fecha:** 07/11/2026. **Alcance de publicación autorizado:** PILOTO exclusivamente, **NO** `main`, producción ni alta pública. PR [#683](https://github.com/ProtectorRudo/Cotironda/pull/683) fusionado por squash commit `b2dac7378c323f5f368f1da808664d00fab7f480`.

## Resultado verificado
- Proyecto Supabase `cotironda-piloto` en región `sa-east-1`, PostgreSQL 17, estado `ACTIVE_HEALTHY`.
- Instaladas, una vez cada una, las migraciones:
  - `piloto_mvp291_correlacion_automatica_fuentes_privadas`
  - `piloto_mvp292_correlacion_texto_proveedor`
  - `piloto_mvp292_recuperacion_interna_archivos`
- Total de migraciones **81** (78 antes).
- Webhook real `cotironda-piloto-whapi` reemplazado v61 → **v62 ACTIVE**, manteniendo 54 archivos previos intactos; nuevo código y dependencias MVP291/MVP292 tomados del commit fusionado en GitHub. `verify_jwt=false` se mantiene como la versión previa; webhook valida su cabecera secreta específica antes de acceder a la base.
- Nuevo Edge `cotironda-piloto-auto-recovery` **v1 ACTIVE**, `verify_jwt=true`, con control adicional de cabecera `x-cotironda-recovery-secret` y flag obligatorio. **No** se configuró cron, scheduler ni contacto de proveedor.
- Las cuatro tablas privadas cuentan con RLS. Los ocho RPC SQL MVP291/MVP292 tienen ejecución revocada a `anon` y `authenticated`, habilitados solo por `service_role`.
- Canarios SQL inocuos: fuente documental inexistente → `not_eligible`; observaciones textuales inválidas → `invalid`; solicitud de replay de origen inexistente → `not_eligible`. Sin nuevos registros en `ai_supplier_auto_correlation_mvp291`, `ai_supplier_text_materials_mvp292`, `ai_supplier_auto_recovery_mvp292` ni `ai_supplier_archive_replay_mvp292` al terminar.
- Antes del merge: **31/31** GitHub Actions `SUCCESS` para el PR fusionado, incluyendo unitarias, Deno, PostgreSQL 17 sintético y Next.js.

## Activación no acreditada — no afirmar circuito real listo

La conexión actual de Supabase permite desplegar funciones y SQL pero **no proporciona una acción para configurar/leer secretos de Edge**. Por lo tanto, no se cambiaron ni se pudieron verificar los valores de:
- `COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED`
- `COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED`
- `COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED`
- `COTIRONDA_PILOT_AUTO_RECOVERY_SECRET`

En el código, los tres gates exigen el valor literal `true`; si la variable no existe, la rama nueva permanece apagada. El proceso histórico, además, exige JWT autorizado y secreto fuerte dedicado (32–256 caracteres). **No se agregó cron** para evitar que un antiguo archivo sea consumido sin seguridad/costos validados. No pedir al usuario que comparta credenciales en un chat.

### Acciones de operador necesarias antes del E2E real
1. En Supabase Dashboard, proyecto `cotironda-piloto` → Edge Functions → Secrets: poner en `true` los gates de correlación MVP291 y texto MVP292 **solo después de confirmar límites reales de IA y que la cuota comercial del piloto esté disponible**. No habilitar un gate por SQL como sustituto improvisado del secreto.
2. Si se autoriza backfill histórico: generar en secreto `COTIRONDA_PILOT_AUTO_RECOVERY_SECRET` fuerte distinto del de WhatsApp y habilitar el gate MVP292. Configurar un scheduler seguro con ambos factores (JWT y cabecera), sin exponer la credencial en SQL`pg_net`, URL, log ni repositorio. Máximo una fuente por tick y cupos 12/día + 8 replays/día.
3. Hacer prueba E2E consentida: proveedor envía texto sin citar ronda → asociación determinista correcta; archivo enviado anteriormente/archivado → replay con SHA y precio exacto; dos rondas idénticas → revisión privada, nunca publicación errónea. Verificar mensajes al comprador y enlace anterior sin reenvíos.
4. Verificar costos de OpenAI y las reglas de cobertura/ranking sin comparar totales de canastas distintas.

No existió mensaje WhatsApp enviado por el operador de esta publicación, no se tocó producción ni se activaron tareas programadas. Desplegar una Edge con estado `ACTIVE` acredita publicación de código, **no** funcionamiento de cada nuevo camino comercial hasta que sus gates estén activos y haya E2E con evidencia.

**Decisiones:** [416](416-mvp291-correlacion-automatica-sin-friccion.md), [417](417-mvp292-texto-historicos-sin-friccion.md).

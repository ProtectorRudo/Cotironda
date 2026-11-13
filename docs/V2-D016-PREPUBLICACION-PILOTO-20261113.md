# Cotironda V2 D016 — auditoría de prepublicación · 13/11/2026

**Estado: NO PUBLICAR AUTOMÁTICAMENTE.** Documento para «Publicalo» exclusivamente en `cotironda-piloto`, sin afectar producción ni la función histórica Whapi v76. Este documento NO significa que las políticas, las claves, los calendarios ni los consentimientos estén aprobados. Ver [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837).

## Evidencia de solo lectura del entorno (13/11/2026)

- **GitHub:** PR #837 draft, base apilada en PR #836. Los candidatos SQL/Edge/Next **no integrados**. Consultar siempre último SHA y 8 CI del HEAD, no resultados de un commit anterior.
- **Supabase:** proyecto único `ilggkalaafhtiysyzlmg` `cotironda-piloto`. Se confirmaron `pg_cron`, `pg_net` y `supabase_vault` instalados, y esquema real PostgreSQL para solicitudes con `timing_mode='business_two_days'`, `round_days=2`, revisión y **CHECK de vencimiento a las 18:00 de America/Argentina/Buenos_Aires**. Políticas reales `v2_business_policy`, `v2_original_share_policy` y `v2_auto_release_policy`: **OFF**; calendarios `v2_business_calendar` aprobados: **0**. RPC del worker/cierre D016 **no instaladas**.
- **Corrección de seguridad comercial:** anteriormente `v2_d016_expected_close_private` conservaba la hora de creación, incompatible con el CHECK real de 18:00. Se cambió a hora fija local `18:00:00`. Ahora el fixture PostgreSQL añade los CHECK y claves de calendario auténticos a partir del punto V2 y ensaya viernes→martes, feriado, cruce de año y denegación de cierre incorrecto. **Sin cambiar una sola fecha comercial real.**
- **Supabase Edge:** `cotironda-piloto-whapi` histórica permanece ACTIVE en versión 76; no sustituirla por candidato sin control de huella y pruebas. No hay Edge D016 instalado.
- **Vercel:** proyecto correcto `cotironda-portal-dev`, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`. El Preview READY previo apunta a commit `06e1700...`, NO a PR #837; SSO está habilitado para todos los despliegues. En la consulta de metadata Preview **no figuran variables con prefijo `COTIRONDA_D016_`**, ni la llave privada del lado servidor `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`; no se consultaron ni imprimieron valores cifrados.
- **WhatsApp:** no se enviaron mensajes reales, no se activó el sender D016 ni se alteró el webhook histórico.

## Auditoría corregida — pg_net y arquitectura sin secretos en cola (13/11/2026)

**CORRECCIÓN DE AUDITORÍA:** La documentación oficial de Supabase
([KB, 04/11/2026](https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16))
indica que los grants por defecto de `pg_net` son del propietario
`supabase_admin`: `postgres` no puede revocarlos; incluso una revocación
hecha por el propietario rompería jobs/webhooks dependientes de `PUBLIC`.
Además, `anon` y `authenticated` son roles `NOLOGIN` y la API de
Supabase no expone `net` por defecto. **El informe anterior confundía
`has_table_privilege` con exposición pública de datos mediante API.**

Se RETIRÓ la propuesta de revocar permisos:
`v2_d016_pgnet_acl_REVIEW_ONLY.sql` es ahora **un stub que aborta
explícitamente** y no modifica ningún grant. La cola sí es legible por
roles de base de datos con `LOGIN`, y los headers usados por `pg_net`
permanecen temporalmente en ella. Por lo tanto, la solución soportada
para Cotironda D016 es **no pasar credenciales por `pg_net`**.

**Nueva arquitectura de activación (solo código, sin publicar):**

1. Cierre a dos días hábiles: `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql`
   programa **una única tarea `pg_cron` SQL** (cada 5 minutos)
   que invoca `public.cotironda_piloto_v2_d016_close_due_private(5)`.
   La tarea no usa Vault para API keys, HTTP ni `pg_net`; verifica proyecto
   PILOTO por marcador de Vault, políticas activas, calendario aprobado,
   instalación de SQL y ausencia de cron duplicado.
2. IA de ofertas con comprador desconectado:
   `.github/workflows/cotironda-d016-worker-piloto.yml` programa HTTPS
   **directo GitHub Actions → Supabase Edge**, usando repositorio exacto,
   dos secretos de GitHub (separados del navegador y de PostgreSQL),
   variable de habilitación OFF por defecto y máximo un trabajo por
   invocación según el worker. Cada ejecución descarta el cuerpo de
   respuesta y sólo muestra un código de estado, sin copiar el presupuesto.
   Frecuencia inicial de **dos veces por hora** (minutos 13 y 43 UTC);
   el portal conserva análisis bajo demanda. GitHub permite retrasos u
   omisiones de jobs programados, por lo que **no es un SLA en tiempo real**.
3. Los workflows programados se ejecutan solo en la rama **default**
   después de integrar código autorizado. El PR #837 está DRAFT,
   apilado sobre #836, y no dispara esos cron. Se requiere aprobar
   costos de GitHub Actions y presupuestos OpenAI antes de activar
   `vars.COTIRONDA_D016_PILOTO_WORKER_ENABLED=true`.

**Preflight comprobable:** `v2_d016_preflight_SOLO_LECTURA.sql` mantiene
el conteo de políticas, calendarios, consentimientos y RPCs pendientes;
ahora **no clasifica los grants nativos de `pg_net` como fuga a
usuarios API**. En cambio, bloquea si detecta un cron D016 antiguo del
worker dentro de la base de datos, porque podría incluir credenciales
en `pg_net`. La última ejecución anterior al cambio arrojaba 11
bloqueos, de los cuales **uno fue un falso positivo de seguridad**.
Volver a ejecutar el nuevo preflight antes de dar el número actualizado.
No se manipularon permisos reales ni se envió ningún secreto D016.

**Referencias oficiales:** [Supabase sobre grants de pg_net](https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16),
[headers en cola pg_net](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357),
[GitHub Actions scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## Gate de publicación exclusivo PILOTO (checklist)

- [ ] Aprobar el SHA exacto de PR #837 y su cadena de dependencias (#836); cotejar 8/8 CI y protección de Whapi v76; revisar archivos SQL por permisos y cambios.
- [ ] Verificar compradores y proveedores consentidos para **rondas nuevas y originales V2**, sin extender autorización prospectiva a rondas antiguas. Nunca habilitar publicación general de presupuestos anteriores.
- [ ] Crear y aprobar calendario auténtico `la plata` 2026, y 2027 cuando una ronda pueda cruzar el año. Cargar feriados nacionales, provinciales y locales aplicables con fuente identificable, diferenciando día no laborable de feriado; no inventar, no aprobar fechas en silencio, no sobreescribir revisión utilizada por ronda existente. Fuente primaria: <https://www.argentina.gob.ar/feriados> y actos oficiales provinciales/municipales pertinentes.
- [ ] Revalidar que el cierre a 2 días hábiles, **18:00 hora Argentina**, coincide exactamente con el CHECK de `requests` y con el calendario aprobado antes de crear solicitudes.
- [ ] Tomar snapshot de políticas, cron y funciones activas del PILOTO antes de instalar. Mantener el rollback no destructivo, con auditoría inmutable; migrar SQL en orden de dependencias tras revisar esquema: tickets D016 → sesiones → respuestas/originales → análisis → worker → cierre → informe final.
- [ ] Registrar secretos **dentro del proveedor** (no en GitHub ni conversación). Supabase Edge: secreto privado de proyecto, HMAC D016 y secreto del worker; Vault: clave `sb_secret_` y secreto segregado; Next Preview: HMAC D016 correspondiente y secreto de lector Edge, clave privada de Supabase/IA en backend. **Jamás copiar AES histórico a Vercel.**
- [ ] Instalar funciones Edge D016 en PILOTO con flags **OFF**. Generar paquete Whapi desde overlay inmutable V2-02 + D016 y comprobar diff exacto; nunca modificar `index.ts` histórico directamente.
- [ ] Construir y desplegar exclusivamente un Preview en `cotironda-portal-dev` con SHA auditado, no asignar dominio público de producción. Confirmar que SSO permite la prueba autorizada o habilitar acceso privado específico, **sin desactivar seguridad global sin una decisión expresa**.
- [ ] Ejecutar pruebas negativas EN PILOTO: inicio sin consentimiento, enlace reenviado/vencido, sesión revocada, ronda ajena, descargas sin originales, duplicados de Whapi, no leak de PII, costos ante fallos, fuentes SHA alteradas, calendario sin aprobar, cierre fuera de hora.
- [ ] Solo tras pasar negativas, activar flags D016 acotados por piloto, programar **solo cierre SQL** con `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql` y programar **IA offline directamente por GitHub Actions con secrets**, nunca mediante `pg_net`. Comprobar proyecto Vault, ramas, costos y funcionamiento. No activar automáticamente por merge.
- [ ] Prueba real: arquitecto manda pedido por WhatsApp; se detecta zona, matchean productos de catálogo, Ailín/Nahuel reciben solicitudes consentidas, devuelven PDF/Excel/TXT, aparecen como respondedores, los originales y guías se abren, y el resumen final se publica después del cierre hábil verificado. **Cero pasos extra a compradores/proveedores**. Usar una ronda nueva aprobada, no una ronda histórica pre-V2.
- [ ] Medir costos OpenAI/Whapi, logs de colas, retry e idempotencia, cron ejecutado y auditoría, latencia e integridad; decidir continuar o revertir solo flags/cron/Preview si falla. No borrar originales ni registros.

## Rollback seguro

1. Desactivar flags específicos D016, **sin tocar el webhook histórico**.
2. Desprogramar `cotironda-v2-d016-offline-worker-piloto` y `cotironda-v2-d016-close-piloto` solo si se verifican instalados en PILOTO.
3. Volver al Preview anterior si existe y está auditado; mantener SSO, datos, políticas y archivos históricos.
4. Conservar tablas/auditorías D016 para análisis forense; no eliminar cotizaciones ni empresas.
5. Verificar sin envío que las funciones antiguas siguen respondiendo y que ningún contacto se reveló incorrectamente.

**Resultado exigido para «terminado»: una ejecución comercial real de punta a punta con evidencia de WhatsApp, fuentes originales, guías, cierre y acceso del comprador. CI sintético 8/8 no sustituye este criterio.**

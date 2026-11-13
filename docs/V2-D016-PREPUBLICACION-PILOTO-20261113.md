# Cotironda V2 D016 — auditoría de prepublicación · 13/11/2026

**Estado: NO PUBLICAR AUTOMÁTICAMENTE.** Documento para «Publicalo» exclusivamente en `cotironda-piloto`, sin afectar producción ni la función histórica Whapi v76. Este documento NO significa que las políticas, las claves, los calendarios ni los consentimientos estén aprobados. Ver [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837).

## Evidencia de solo lectura del entorno (13/11/2026)

- **GitHub:** PR #837 draft, base apilada en PR #836. Los candidatos SQL/Edge/Next **no integrados**. Consultar siempre último SHA y 8 CI del HEAD, no resultados de un commit anterior.
- **Supabase:** proyecto único `ilggkalaafhtiysyzlmg` `cotironda-piloto`. Se confirmaron `pg_cron`, `pg_net` y `supabase_vault` instalados, y esquema real PostgreSQL para solicitudes con `timing_mode='business_two_days'`, `round_days=2`, revisión y **CHECK de vencimiento a las 18:00 de America/Argentina/Buenos_Aires**. Políticas reales `v2_business_policy`, `v2_original_share_policy` y `v2_auto_release_policy`: **OFF**; calendarios `v2_business_calendar` aprobados: **0**. RPC del worker/cierre D016 **no instaladas**.
- **Corrección de seguridad comercial:** anteriormente `v2_d016_expected_close_private` conservaba la hora de creación, incompatible con el CHECK real de 18:00. Se cambió a hora fija local `18:00:00`. Ahora el fixture PostgreSQL añade los CHECK y claves de calendario auténticos a partir del punto V2 y ensaya viernes→martes, feriado, cruce de año y denegación de cierre incorrecto. **Sin cambiar una sola fecha comercial real.**
- **Supabase Edge:** `cotironda-piloto-whapi` histórica permanece ACTIVE en versión 76; no sustituirla por candidato sin control de huella y pruebas. No hay Edge D016 instalado.
- **Vercel:** proyecto correcto `cotironda-portal-dev`, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`. El Preview READY previo apunta a commit `06e1700...`, NO a PR #837; SSO está habilitado para todos los despliegues. En la consulta de metadata Preview **no figuran variables con prefijo `COTIRONDA_D016_`**, ni la llave privada del lado servidor `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`; no se consultaron ni imprimieron valores cifrados.
- **WhatsApp:** no se enviaron mensajes reales, no se activó el sender D016 ni se alteró el webhook histórico.

## Preflight automatizado y bloqueo de permisos pg_net — 13/11/2026

**Se creó y ejecutó contra Supabase PILOTO, exclusivamente con SELECT,**
`supabase/piloto/v2_d016_preflight_SOLO_LECTURA.sql`. No incluye nombres,
números telefónicos, archivos, tokens, ni valores de Vault. CI valida
estáticamente que este archivo no modifique permisos ni datos.

Resultado de la base real (verificación 13/11/2026, sin cambios):
- Compradores con consentimiento general y WhatsApp autenticado: **1**.
- Proveedores con **consentimiento específico V2 para compartir originales**
  vigente: **0**. Este contador no significa que no estén registrados,
  que no puedan cotizar por WhatsApp o que hayan revocado su participación.
- Políticas `v2_business_policy`, `v2_original_share_policy`,
  `v2_auto_release_policy`: **todas OFF**.
- Calendarios 2026/2027 de La Plata aprobados: **0**.
- RPC D016 de token, sesión, worker, cierre e informe: **no instaladas**.
- PostgreSQL respeta el CHECK de cierre a **18:00 AR**.
- `pg_cron`, `pg_net` y Vault instalados.
- **11 bloqueos de activación detectados en total.**

**Hallazgo crítico: cola HTTP con permisos públicos.** En el proyecto
`net.http_request_queue` tiene `relrowsecurity=false` y su ACL
`=arwdDxtm/supabase_admin` concede acceso a `PUBLIC`;
`anon` y `authenticated` tienen además USAGE del esquema `net`.
La cola puede guardar temporalmente los encabezados HTTP con credenciales
de `pg_net`, según la [documentación de Supabase](https://supabase.com/docs/guides/functions/schedule-functions).
No se enviaron nuevas claves D016 por ese canal.

El script `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql` ahora
**ABORTA** con `D016_PGNET_QUEUE_EXPOSED_TO_CLIENT_ROLES` si
`anon` o `authenticated` conservan permiso de lectura de la cola.
La consulta de preflight también devuelve
`cola_pgnet_expone_headers_a_roles_cliente`.

Se preparó únicamente para auditoría y futura aprobación el archivo
`v2_d016_pgnet_acl_REVIEW_ONLY.sql`: propone revocar **SELECT**
a `PUBLIC, anon, authenticated` manteniendo el derecho INSERT y
sin cambiar permisos de USAGE del esquema. Incluye una comprobación
previa del project ref de Vault y verificación posterior de privilegios.
**NO se ejecutó ni se incluye en migraciones automáticas.** Antes de
aprobarlo hay que evaluar impacto sobre todas las integraciones que
usen `pg_net`, respaldar la ACL anterior y revisar la compatibilidad
con las políticas de extensiones administradas por Supabase.

**Próxima secuencia:** auditar alcance de ese permiso; mitigar sin
afectar el webhook histórico; luego validar consentimiento prospectivo
de originales V2 para los proveedores participantes, aprobar calendario
oficial local, instalar candidatos D016 con flags apagados bajo
`Publicalo`, probar seguridad, habilitar worker y cron por fases y
realizar el E2E con arquitecto y dos proveedores. Ninguno de estos
pasos se declara ejecutado por tener CI verde.

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
- [ ] Solo tras pasar negativas, activar flags de D016 acotados por piloto y aprobar el script `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql`; comprobar Vault `decrypted_secret`, identidad de proyecto, rol de `pg_net` y el riesgo de retención de headers en su cola. No programar cron ni envío real automáticamente por un merge.
- [ ] Prueba real: arquitecto manda pedido por WhatsApp; se detecta zona, matchean productos de catálogo, Ailín/Nahuel reciben solicitudes consentidas, devuelven PDF/Excel/TXT, aparecen como respondedores, los originales y guías se abren, y el resumen final se publica después del cierre hábil verificado. **Cero pasos extra a compradores/proveedores**. Usar una ronda nueva aprobada, no una ronda histórica pre-V2.
- [ ] Medir costos OpenAI/Whapi, logs de colas, retry e idempotencia, cron ejecutado y auditoría, latencia e integridad; decidir continuar o revertir solo flags/cron/Preview si falla. No borrar originales ni registros.

## Rollback seguro

1. Desactivar flags específicos D016, **sin tocar el webhook histórico**.
2. Desprogramar `cotironda-v2-d016-offline-worker-piloto` y `cotironda-v2-d016-close-piloto` solo si se verifican instalados en PILOTO.
3. Volver al Preview anterior si existe y está auditado; mantener SSO, datos, políticas y archivos históricos.
4. Conservar tablas/auditorías D016 para análisis forense; no eliminar cotizaciones ni empresas.
5. Verificar sin envío que las funciones antiguas siguen respondiendo y que ningún contacto se reveló incorrectamente.

**Resultado exigido para «terminado»: una ejecución comercial real de punta a punta con evidencia de WhatsApp, fuentes originales, guías, cierre y acceso del comprador. CI sintético 8/8 no sustituye este criterio.**

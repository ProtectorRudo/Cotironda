# MVP169 — Primer procesamiento económico real, aislado y autorizado

**04/11/2026 · Issues #529/#535 · Proyecto Supabase `cotironda-piloto` · Solo entorno de pruebas.**

## Problema encontrado
MVP168 deja SQL privado instalado, tabla económica vacía y una Edge staging v1 con el *entrypoint completo del recuperador*. Aun siendo staging, no corresponde invocarla para la primera prueba: esa ruta también contiene lógica de despacho WhatsApp. La meta es procesar **un solo original real**, sin riesgos de envío ni de adjudicación.

## Solución MVP169
- Nueva Edge `supabase/functions/cotironda-piloto-economic-staging/index.ts`: **solamente** autentica una invocación y llama a `auditarOriginalEconomicoMvp168` (una cotización máximo). No importa recuperador completo, WhatsApp, OpenAI, finalistas, pagos, ni ranking.
- `logic.ts` reutiliza `guardScheduledRecovery` con token de **96 hex** obligatorio en cabecera. El servidor verifica el token mediante la RPC privada `cotironda_piloto_recovery_token_allowed_mvp132` con la clave del Vault existente. El token no se imprime ni se devuelve.
- El worker usa únicamente cliente `service_role` del proyecto piloto exacto, selecciona desde `cotironda_piloto_next_economic_facts_mvp168`, descarga el original del bucket privado y registra por `cotironda_piloto_record_economic_facts_mvp168`.
- Respuestas HTTP: solo `none`, `economic_facts_recorded` o un error genérico; sin datos de clientes, nombres, textos, hashes ni importes.
- Se agrega compilación de esta Edge al CI Deno y 11 pruebas unitarias de autenticación, ausencia de información, un solo callback, error, método y flag.

## Procedimiento de puesta en prueba manual

1. CI del PR completo (Deno, units, pg17, auth, portal) en verde.
2. Verificar que staging v1 no fue añadido a cron (0 jobs) y el recuperador habitual sigue en v25. Desplegar la Edge **staging v2 económica y aislada** con `verify_jwt:false` porque el token aleatorio largo es autenticado por código/RPC; esta modalidad requiere control de token ANTES de cualquier lectura. Sin cron propio.
3. Desde PostgreSQL (herramienta autorizada), ejecutar **una sola** llamada con `net.http_post` a staging, incorporando en headers el token directamente desde `vault.decrypted_secrets` mediante subconsulta **sin mostrar el valor** en resultados, SQL ni logs. La solicitud se inicia tras commit, no dentro de rollback.
4. Consultar respuesta de `net._http_response` por ID generado; leer **únicamente** estado HTTP/código. Auditar 1 registro nuevo en ledger sin PII y comprobar flags de ranking falsos.
5. La segunda invocación (si se realiza) procesará otro documento elegible, no es prueba de reejecución idéntica; deduplicación ya probada por RPC smoke SQL reversible.
6. Si la primera llamada falla, revisar logs **sin cuerpos** ni datos sensibles y corregir en nueva rama/PR antes de reintentar. No activar flujo habitual ni envíos.

## Seguridad
Nunca consultar ni mostrar el secreto del Vault. Nunca utilizar un `publishable key` en lugar del token interno. El token es autentico solo si la RPC devuelve `true`. El staging no tiene código de Whapi; el piloto habitual y la producción siguen intactos.

**Importante:** los datos del archivo son no confiables. Todo resultado permanece **diagnóstico**, no habilita neto fiscal, IVA cero, flete gratis, stock ni ranking; MVP166/MVP167 devuelven `rankingAllowed=false`. Sin ranking de dos ganadores ni liberación de contactos.

## Resultado real verificado — 04/11/2026 (PILOTO)

- **GitHub:** PR #545, workflow CI **6 de 6 aprobados**, Deno real PASS y **1.938/1.938** pruebas unitarias PASS, con 11 escenarios MVP169.
- **Edge staging:** `cotironda-piloto-economic-staging` **v2 ACTIVE**, `verify_jwt=false` con **autenticación interna obligatoria** por token 96 hex de Vault validado por RPC. El recuperador operativo `cotironda-piloto-document-recovery` **permanece v25**, sin reemplazo.
- **Prueba no autorizada:** petición de `pg_net` 269 sin token: **HTTP 401 `unauthorized`**, 0 datos procesados.
- **Cuatro invocaciones autorizadas one-shot:** solicitudes 271, 272, 273 y 274; **las cuatro HTTP 200 `economic_facts_recorded`**, con token enviado directamente desde Vault a la cabecera interna SQL, **sin mostrar el valor**.
- **Control final de cola vacía:** quinta llamada autenticada, request 276, **HTTP 200 `none`**; no hubo nuevos registros ni relectura, ledger mantiene 4. Confirma comportamiento no duplicante a nivel de selección cuando no queda trabajo.
- **Resultados privados:** 4 registros de `supplier_economic_facts_mvp168` (`source_checked`), **3 PDF y 1 Excel**, total **10 de 10 precios unitarios comerciales conciliados** (renglones 2+3+3+2), 0 pendientes; el selector responde `none`. No se escribieron detalles del original en la proyección pública.
- **Condiciones:** IVA `no_informado` en los 4 documentos; un PDF con flete `a_convenir`, otros tres sin flete informado. Tres PDF declaran pago al contado, Excel no informa pago.
- **Seguridad:** `rankingAllowed=false` en los 4; **0 finalistas activados, 0 mensajes en outbox de finalistas, 0 cron para staging**. La evidencia documental previa se mantiene: 4 fuentes v9 + 4 hechos MVP163.
- **Idempotencia:** la RPC de escritura ya pasó smoke SQL reversible, y el ledger usa clave primaria de mensaje sin actualización; las 4 invocaciones procesaron **cuatro documentos diferentes**, no constituyen por sí solas una prueba de reenvío del mismo mensaje.
- **Sin publicación en producción**, no se activaron contactos ni ranking. El procesamiento fue real de archivo desde Storage en PILOTO; no sustituye el E2E desde nuevo WhatsApp ni la comprobación fiscal/stock/flete.

**Conclusión:** cierre de la subetapa de lectura económica de origen MVP168/169. Mantener #535 abierto para obtener netos fiscales comparables, condiciones y ranking verdadero antes de activar finalistas.


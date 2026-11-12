# Acta 527 — MVP359: preflight verificable antes de publicar en piloto

**Fecha:** 12/11/2026. **Orden:** «Avanza y registra». **Entorno:** desarrollo, no desplegado, sin modificar Supabase ni enviar WhatsApps.

## Propósito y regla comercial

No seguir acumulando PR sin saber si se pueden aplicar con seguridad. Antes de instalar SQL/Edge/cron en `cotironda-piloto` necesitamos demostrar dos propiedades independientes: **(A)** las funciones SQL existentes son exactamente las que fueron auditadas para modificar, y **(B)** la cola de `pg_net` no se expone a los usuarios por el Data API. Un resultado de auditoría parcial NO habilita la publicación.

## Evidencia real ejecutada en Supabase — solo lectura

Se añadió y se ejecutó directamente contra el piloto `supabase/tests/preflight/mvp359-piloto-solo-lectura.sql`. Resultado a 12/11/2026:
- **4/4 huellas SHA256 de RPC coincidieron** con las definiciones de `claim_whapi_v1`, `ia_claim_mvp222`, `ia_claim_mvp314`, `ia_next_batch_mvp314` auditadas; ninguna cambió desde su captura.
- **0 pendientes y 0 inciertos** tanto en IA como en WhatsApp legado. Esto no acredita entrega E2E; solo significa que no hay retry de esas colas por atender ahora.
- **1 ronda `prepared` vigente.** No crear otra ronda superpuesta ni reenviar pedidos sin permiso.
- **0 cron MVP357 / 0 nombres de secretos MVP357**, consistente con que no se publicó ni activó.
- **0 usuarios `auth.users`.** Bloquea P4/descargas seguras hasta aprovisionar comprador con empresa/identidad/consentimiento.
- `anon`/`authenticated` tienen `USAGE` en el esquema SQL `net` y `SELECT` sobre `net.http_request_queue`. Esto NO prueba exposición externa por PostgREST; **el punto sigue NO VERIFICADO**.

El preflight devuelve solo estados, números y huellas de código, sin teléfonos, originales, hashes de archivos ni valores de Vault. No es una migración y debe repetirse antes de cada despliegue. Una huella diferente implica STOP: revisar la función cambiada, no sobrescribirla con snapshot antiguo.

## Probe REST externo (código sin ejecución LIVE todavía)

Archivo: `scripts/piloto/verificar-exposicion-net-mvp359.mjs`. Usa **únicamente una clave pública `sb_publishable_...` o JWT con rol `anon`** (rechaza `service_role` y `sb_secret_`). No usa claves administrativas. Comprueba el host exacto del piloto `https://ilggkalaafhtiysyzlmg.supabase.co/`, sin redirecciones, timeout 10 s, GET de una **tabla deliberadamente inexistente**:
- Con `Accept-Profile: public`, la respuesta debe ser `404/PGRST205`, para demostrar que la API responde y que las credenciales públicas son válidas.
- Con `Accept-Profile: net`, debe ser `406/PGRST106`, que demuestra que el esquema **NO** figura entre los expuestos.
- Si `net` devuelve `200` o `PGRST205`, es **UNSAFE**. Si falta API, hay 401, timeout, código inesperado o falló la conexión, es **INCONCLUSIVE**: fallar cerrado, no publicar.
- No lee `net.http_request_queue`: consulta una tabla que NO existe. No muestra claves ni cuerpos. El probe no hace conexiones externas por defecto, requiere `--live`.

Comando de uso **solo desde un entorno seguro con acceso a Internet y variables de entorno preexistentes**:

```bash
SUPABASE_PILOTO_URL=https://ilggkalaafhtiysyzlmg.supabase.co/ \
SUPABASE_PUBLISHABLE_KEY='<clave pública del piloto, NO administrativa>' \
node scripts/piloto/verificar-exposicion-net-mvp359.mjs --live
```

No guardar la clave como argumento CLI, en logs, archivos, comentarios ni dentro de PR. Mejor usar secreto del entorno antes que introducirlo en línea de comando. El comando mostrado es **instrucción para la ejecución futura**, no evidencia de haberlo ejecutado.

**Limitación de esta sesión:** la red de la computadora local de ejecución no resolvió los hosts externos; los conectores Supabase entregan metadata del proyecto y SQL, pero NO el listado de «Exposed schemas», y la sesión SQL no expone `pgrst.db_schemas`. Por lo tanto, el control REST REAL permanece **[ ] pendiente**. Alternativa: confirmar el listado exacto en <https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/integrations/data_api/settings> y registrar evidencia, además del probe si es posible. No deducir seguridad externa solo de grants internos.

## Pruebas técnicas automatizadas

`tests/unit/mvp359-data-api-net-preflight.test.mjs` incluye fetch SIMULADO:
- `public:PGRST205` + `net:PGRST106` => `VERIFIED_SAFE`;
- `net:PGRST205` => `UNSAFE`;
- `401/503`, errores de red, clave inválida y dominio malicioso => `INCONCLUSIVE` y exit distinto de cero;
- prohíbe URLs que lleven la clave, requests no GET, comandos o lectura de tablas reales; exige huellas 4/4 y SQL puramente SELECT.

El mock verifica lógica del programa; **NO demuestra cómo está configurado el Data API real del piloto**. Revisar el SHA y la CI del PR #801 para considerar la parte de código aprobada.

## Dependencias para una publicación segura y reversible

1. Confirmar que el probe REST REAL marque `VERIFIED_SAFE`, o evidencia directa de «Exposed schemas» sin `net`. Si `UNSAFE` o `INCONCLUSIVE`, STOP.
2. Volver a ejecutar preflight SQL, confirmar **4/4 huellas**, no hay leases `uncertain`, no existe ronda nueva superpuesta y los 2 permisos de comprador/proveedor no cambiaron.
3. Auditar orden completo de PRs apilados **#793 → #797 → #798 → #799 → #800 → #801** y registro documental **#796**. Las pruebas de cada PR deben estar verdes en el SHA que se va a instalar; no instalar una mezcla de versiones por accidente.
4. Aprovisionar dos secretos app-scope para batch (sin usar admin key). Instalar SQL MVP354/MVP355/MVP356/MVP357/MVP358 **con gates OFF por defecto**, Edge con ruta cron limitada y sin tocar producción. Solo con `Publicalo` específico para piloto.
5. Configurar cron pero mantener OFF hasta smoke controlado de Auth, límites, duplicación y `next_batch`; verificar que el sistema heredado y el nuevo no desplacen trabajos a dos rondas simultáneas.
6. Recién entonces iniciar **una sola ronda de prueba autorizada** 1 comprador/2 proveedores, con originales PDF/Excel reales: vinculación comprobada, estado `recibido` anónimo en seguimiento con enlace válido y visualización en navegador. P0 comprador/consentimiento y P4/P5 cierre y descargas no pueden saltarse.

**Importante:** tener el guard SQL en verde sin demostrar el caso real no convierte el piloto en «100 %». Esta secuencia es una barrera de publicación, no un nuevo desarrollo de lectura PDF.

## Semáforo / relevo

- [x] Preflight SQL en repositorio **ejecutado contra piloto** y estado registrado: huellas 4/4, pendientes 0, nueva ronda NO.
- [x] Probe HTTP fail-closed desarrollado con pruebas simuladas (subject to CI del SHA final).
- [ ] Probe REAL contra REST con clave pública y evidencia de `net` excluido; hasta entonces NO publicación.
- [ ] P0–P5 siguen abiertos; especialmente comprador Auth 0 y dos presupuestos reales sin vínculo acreditado.
- [ ] No mezclar deploy GitHub/SQL/Edge con mensajes reales WhatsApp sin autorización explícita de esa acción.

**Continuidad obligatoria:** [Issue canónico #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro y estado #796](https://github.com/ProtectorRudo/Cotironda/pull/796), [PR técnico #801](https://github.com/ProtectorRudo/Cotironda/pull/801).

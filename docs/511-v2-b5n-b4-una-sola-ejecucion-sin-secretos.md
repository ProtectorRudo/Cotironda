# Acta 511 — Ejecutar B5n una sola vez usando el puente B4 existente

**Fecha:** 11/11/2026 · **Estado:** solo desarrollo / pruebas («Luz verde»).
**PR:** [#783](https://github.com/ProtectorRudo/Cotironda/pull/783), apilado sobre [#781](https://github.com/ProtectorRudo/Cotironda/pull/781).
**Fuente:** [Acta 510 — B5n publicado en piloto pero sin relectura](https://github.com/ProtectorRudo/Cotironda/blob/docs/v2-b5n-publicacion-piloto-20261111/docs/510-v2-b5n-publicacion-piloto-bloqueo-relectura.md).

## Decisión

La operación de B5n falló **antes de generar una solicitud** porque la herramienta bloqueó la llamada SQL que incluía el token privado leído de Vault. No se intentará transportar ese secreto mediante herramientas ni se inventará un mecanismo paralelo.

**Hallazgo verificado en el piloto:** el puente B4 **YA EXISTE** y funciona así:

`cron.job cotironda_piloto_document_recovery_5min` (activo) → autorización guardada en Vault → `cotironda-piloto-document-recovery` → `cotironda-piloto-auto-recovery` (función interna autenticada) → `scheduleV2ShadowB4()` → `cotironda-piloto-v2-shadow` v10.

- El puente B4 consulta la RPC privada `cotironda_piloto_v2_shadow_enabled_b4()`, inicialmente `false`.
- Utiliza la **clave de servicio de ese mismo proyecto** y el **secreto interno ya configurado**, sin exponerlos a SQL operativo ni a quien llama por chat. Ambas credenciales deben ser verificadas por la Edge de destino.
- El envío interno se programa con `EdgeRuntime.waitUntil()`; no agrega cron, webhook ni mensaje de WhatsApp y no interrumpe la respuesta documental existente.
- Si las variables de entorno de la recuperación automática están apagadas, si la autenticación del cron no funciona o si el trabajo preexistente falla antes del puente, **B5n no se ejecutará**. Se debe diagnosticar esa dependencia sin saltarse la autenticación.

## Implementación B5n/B4 (desarrollo)

Archivo: `supabase/piloto/v2_b5n_b4_one_shot_lease_window.sql`, todavía **no instalado**.

1. Preflight: los cinco flags V2 deben estar apagados, cero leases, cero corridas B5n y exactamente un diagnóstico B5m antecedente del PDF histórico que concilia subtotal y se detuvo en condición 4/5. La RPC B4 debe continuar privada.
2. Reemplaza únicamente tres RPC **ya existentes**, conservando `SECURITY DEFINER`, `search_path TO ''` y permisos de `service_role` (no `anon/authenticated`). No agrega tablas ni modifica historial B5k/B5m.
3. En `b5k_only`, tanto el gate B4 como el gate B5n requieren que `updated_at` esté entre los últimos **8 minutos** y los próximos 15 segundos, que no haya otras modalidades activas y que aún no exista un resultado B5n. En otras modalidades, el gate B4 mantiene su criterio original.
4. El `claim` existente sigue verificando exactamente SHA, proveedor, origen PDF, autorización y diagnóstico B5m 3/5 antes de reservar la fuente.
5. **En la misma transacción del `INSERT` del lease** se ejecuta `UPDATE v2_shadow_settings SET enabled=false,b5k_only=false`. Si la desactivación falla, se revierte toda la transacción; la Edge no descarga el archivo. La RPC de finalización puede terminar la evidencia privada aunque los flags ya estén apagados.
6. Si el claim responde `empty`, también apaga los flags. Si el cron/puente no llega a ejecutar ninguna RPC, la ventana vence y los gates pasan a `false`, pero los flags podrían **seguir físicamente ON**: la auditoría operativa debe apagarlos explícitamente al terminar o fallar el intento.
7. La clave única `(source_hmac,processor_version)` impide reapertura B5n y los campos `first_unresolved_condition_ordinal` / `condition_failure_kind` siguen estrictamente privados, sin texto, precios ni datos personales.

## Pruebas y aceptación

- **PostgreSQL 17 con ROLLBACK real**: `supabase/tests/ci/v2-b5n-b4-once-pg17-rollback.sql` recrea la cadena sintética histórica B5g–B5n. Verifica B4 apagado, otros modos intactos, ventana vencida, marca futura, claim único, apagado transaccional, finalización posterior, rearmado duplicado rechazado, claim sin fuente y RLS/permisos privados.
- **Node**: `tests/unit/presupuestos-v2-b5n-b4-once.test.mjs` comprueba que las tres RPC están presentes, los gates tienen TTL y la migración no introduce transporte, lectura de Vault, cron o autorización pública. También prueba el B4 existente con flag OFF (cero peticiones).
- **Deno/PDF.js**, regresión completa y build Next.js: CI [#783](https://github.com/ProtectorRudo/Cotironda/pull/783).

## Procedimiento de la próxima publicación (solo si se autoriza «Publicalo»)

1. Verificar 6 workflows generales + 4 específicos SUCCESS en commit exacto; revisar [PR #783](https://github.com/ProtectorRudo/Cotironda/pull/783) y su dif.
2. Verificar `cotironda-piloto`: Edge V2 v10, cron documental activo, B4 instalado, cinco flags OFF, B5k=1, B5m=1, B5n=0, cero leases, historiales de ofertas y WhatsApp respaldados como conteos. No tocar producción.
3. Instalar únicamente el SQL versionado con flags OFF. Confirmar que los gates permanecen cerrados, que las RPC siguen inaccesibles a `anon/authenticated` y no hubo publicación.
4. En una ventana supervisada, activar `enabled=true,b5k_only=true` mediante cambio **privado y breve en los flags**; no hacer ninguna petición que incluya la credencial de Vault. El siguiente cron autorizado debe llamar al puente B4 existente, sin tarea nueva.
5. Comprobar dentro de esa ventana si se produjo B5n=1 y el resultado. Si no ocurrió, observar únicamente estados genéricos/logs seguros de cron y Edge. **No** duplicar ni forzar llamadas.
6. Apagar explícitamente los cinco flags, incluso si se produjo error o venció la ventana. Confirmar B5k/B5m intactos, B5n como máximo 1, 0 leases salvo incidente que deba auditarse, conteos de mensajes/ofertas sin cambio y ausencia de publicación/ranking/revelación.
7. Si B5n fue diagnosticado, analizar `coverage_code`, la **primera condición no atribuida** (ordinal/código) y la economía; no asumir total final, moneda ISO, flete gratis ni cobertura completa.

**Restricciones:** Sin nueva clave, token, webhook, cron, ruta pública, WhatsApps o modificación de las funciones de recuperación existentes. Este trabajo prepara el último paso operativo; **no comprueba por sí mismo el PDF real ni el circuito E2E**.

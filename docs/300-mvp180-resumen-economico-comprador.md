# MVP180 — Economía visible del comprador, sin inventar ranking

**04/11/2026 · P0-B2 #535 y P0-B2r #529 · desarrollo + ensayo SQL reversible en PILOTO.** Base PR #555. Ninguna modificación a Whapi, originales, adjudicación, contacto o datos económicos existentes.

## Problema confirmado en datos reales

La lectura `supplier_economic_facts_mvp168` contiene cuatro documentos de dos rondas: cuatro fuentes verificadas y sus SHA conservados, pero **0/4 habilitan ranking**, **4/4 tienen IVA no informado**, **3/4 flete no informado, 1/4 a convenir** y **4/4 carecen de stock corroborado y base neta acreditada**. El comparador monetario offline ya existe, pero no puede operar a costa de inventar tarifas, impuestos o disponibilidad.

## Cambio incremental conectado al seguimiento

1. La RPC `cotironda_piloto_buyer_economy_summary_mvp180(text)` se invoca **únicamente** con token privado cuyo hash fue verificado por el mismo seguimiento `MVP091`. Exige buyer consentido vigente, no revocado y ronda legible. `anon` y `authenticated` no pueden ejecutarla: solo `service_role`.
2. La RPC selecciona la **última revisión por proveedor** entre texto/media, cruza fuente v9 y ledger económico por ronda, proveedor, mensaje y SHA, y descarta evidencia superada. Compara el **multiconjunto completo de transcripciones públicas** con los presupuestos visibles al comprador, incluyendo duplicados; ante un solo desfase devuelve `null`. No representa ofertas parcialmente auditadas como si todas estuvieran comprobadas.
3. Devuelve solo conteos agregados: IVA no informado, flete no informado o a convenir, disponibilidad no corroborada, pago no informado, precio neto, plazo y mínimo sin acreditar. **Nunca precios, nombres, hashes, documentos, enlaces ni puestos.** La falta de stock acreditado no significa stock cero.
4. La Edge de seguimiento solo incorpora ese resumen si una segunda validación estricta pasa, y si la RPC está ausente, falla o no concilia, el seguimiento **continúa funcionando sin resumen**.
5. El proxy de Vercel vuelve a aplicar lista blanca y límites de conteos. La web muestra «Qué falta para comparar precios» mientras está abierta o cerrada; no oculta ofertas, no pide formularios, no abre adjudicación ni altera presupuestos. Al revocar, cancelar o perder conexión borra la sección. Se corrige además la coerción `null → 0` del contador en el proxy.

## Ensayo inicial real y reversible

El SQL exacto se ejecutó en `cotironda-piloto` con `BEGIN; ...; ROLLBACK;`, comprobando permisos `anon/auth DENEGADOS`, `service_role` autorizado y token falso sin resultado. Dos enlaces vigentes: **dos resúmenes correctos y cuatro documentos**; conteos 4 IVA no informados, 3 fletes no informados, uno a convenir, 4 disponibilidades y 4 netos sin acreditar. Después se confirmó con `to_regprocedure` que **la función no quedó instalada**.

No se extrajeron tokens en claro, números, nombres ni presupuestos. Se usaron hashes ya autorizados dentro de la propia consulta para verificar conteos.

## Criterios para habilitar en PILOTO

- Tests unitarios del reductor, proxy, DOM y contrato SQL; todos los controles GitHub relevantes verdes.
- Instalar solamente RPC en `cotironda-piloto`, volver a probar privilegios, hash falso y 2 enlaces reales con conteos sin exponer hashes.
- Desplegar Edge de staging separada con la dependencia nueva; smoke GET, token falso, aislamiento y comparar salida canónica de la Edge activa.
- Crear una Preview Vercel del SHA exacto, verificar HTML/JS/CSS MIME, CSP/no-store y POST proxy. Probar los enlaces auténticos en navegador mediante su titular, no intentar regenerarlos desde hashes.
- Solo entonces activar el nuevo resumen en la Edge activa del PILOTO, conservando reversión a v11. **No producción**.

## Alcance y pendiente de ranking

MVP180 **no convierte precios en comparables**; documenta al comprador qué falta para compararlos. P0-B2/#535 sigue abierto hasta que el auditor documental acredite IVA, flete, plazo, mínimo, equivalencia y stock/cantidad desde las fuentes, y el motor determinista devuelva opciones explicables. Las ofertas permanecen anónimas y completas/parciales, cualquiera sea la recomendación futura. Descarga original #525 y finalistas/avisos #523 siguen separados y deshabilitados.

## Implementación comprobada exclusivamente en PILOTO

- La RPC `public.cotironda_piloto_buyer_economy_summary_mvp180(text)` se **instaló solo en `cotironda-piloto`**, después del ensayo reversible. Verificación posterior persistente: **2 enlaces vigentes, 2 resúmenes, 4 presupuestos**, 4 IVA no informados, 3 fletes no informados y 1 a convenir, 4 disponibilidades sin corroborar. `anon` y `authenticated` sin EXECUTE; `service_role` sí; token falso de 64 ceros retorna `null`. Cero modificación a los cuatro documentos/ledger.
- Se desplegó Edge separada `cotironda-piloto-seguimiento-economia-staging` **v1 ACTIVE**, nueve archivos (paquete activo v11 de 8 archivos, `index.ts` únicamente extendido con llamada económica + nuevo reductor privado). SHA del bundle `4e0fea69da83003c2ff2cd65e6638703d05a1bd190fcbea7911ec17e7b0a2295`.
- HTTP real a esa Edge: GET resuelve la página anterior y segura de Preview con `Location` verificada, GET con query indebida devuelve `400`, POST con token falso responde `{"state":"not_found"}`; no retornó economía de otra cuenta. Los **dos tokens auténticos** solo se probaron dentro de PostgreSQL mediante el hash y SIN imprimirlos; **no hay prueba POST real de token autorizado a la Edge**.
- La auditoría de Supabase no detectó acceso anon/auth a la RPC MVP180. Notifica 41 tablas de esquema privado con RLS sin políticas (en ellas es una restricción deliberada y deben mantener permisos revocados), una extensión `pg_net` en público y dos funciones heredadas `MVP126` accesibles a `authenticated`; estos avisos preexistentes requieren auditoría contextual, no levantar permisos.
- **Vercel** rechazó crear Preview del SHA original del PR #556 con `402 api-deployments-free-per-day` / `retryAfter=86400`. No hay sitio con la sección económica desplegado. El enlace actual del comprador **continúa funcionando sin la sección nueva** y se mantiene Edge de seguimiento v11. No se desactiva SSO ni se modifica `cotironda.com`.
- Durante CI se descubrió una prueba antigua `MVP146` que exigía la URL de redirección anterior. Se actualizó la expectativa en las ramas PR #555 y #556 sin relajar los controles: la nueva URL tiene Preview HTTP real y token solo en fragmento. GitHub comprobó **2.075/2.075 tests unitarios PASS en el commit `e869a91c3c485f21e5f0b58ad99d67221663b0bc`**; la última documentación vuelve a disparar controles, verificar nuevo SHA antes de concluir 6/6 CI.
- Consulta adicional a `cotironda-piloto`: **0 usuarios `auth.users`, 0 vínculos `web_account_links_mvp126`**, así que la descarga de originales continúa bloqueada correctamente. Hay código de acuse único WhatsApp en el webhook, pero `supplier_ack_mvp104` contiene **0 registros** pese a la bandera de salida del piloto habilitada: revisar en #526 sin reenvíos inciertos ni mensajes reales en esta fase.

### Reversión y bloqueo actual

La función de resumen económico se puede revocar/droppear exclusivamente en PILOTO si se detecta un problema; no modifica tablas. La Edge nueva es staging independiente y la Edge activa de seguimiento sigue v11. El frontend sin publicar se puede revertir descartando el PR. P0-B2 y P0-D **no están terminados** hasta tener evidencia de fuentes netas/fiscales/flete/stock, E2E de los enlaces auténticos y vínculo Auth para documentos identificables.

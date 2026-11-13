# Cotironda V2 — D016/P0 #838: envío de pedido con aviso y evidencia Whapi (candidato)

**Fecha:** 13/11/2026. **Rama de desarrollo, NO desplegado.** Continúa el PR #839 y la infraestructura instalada en Supabase piloto, sin activar política comercial.

## Objetivo técnico

Integrar el registro D016 de evidencia al envío existente `despacharSolicitudCentralMvp223`, sin modificar el webhook activo v76 ni generar un segundo WhatsApp. Se conserva el PDF original de solicitud y se agrega el aviso *dentro del caption de ese mismo mensaje* (sin truncar). El aviso comercial nuevo no conserva la afirmación histórica de mostrar todos los invitados porque en V2 el comprador sólo ve negocios que respondieron.

## Implementación

1. En `ai-central-dispatch-mvp223.ts` agregamos **dos callbacks opcionales** y emparejados: `prepareOriginalNotice` antes del HTTP Whapi, y `confirmOriginalNotice` después de que SQL `cotironda_piloto_ia_finish_mvp222` confirma el despacho con ID real. Con ambos ausentes el flujo existente permanece igual. Con uno ausente se aborta ANTES de reclamar.
2. El adaptador `original-notice-dispatch-d016.ts` crea y valida el caption con `AVISO_ORIGINALES_D016_VERSION`, calcula el SHA-256 exacto y llama a las RPC privadas de reserva y confirmación ya instaladas en Supabase piloto.
3. El script `v2-d016-original-notice-overlay.mjs` genera **solo en CI** una copia del webhook desde la huella v76 validada, V2-02 y D016 comprador. El código publicado original no se edita. El nuevo interruptor `COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED` arranca OFF. Si no hay reserva validada, no se emite el PDF. Si Whapi responde de manera incierta, el job se registra como incierto y no se asume consentimiento. Si la confirmación posterior falla, retorna conciliación y **no reenvía**.
4. El código de D016 devuelve **evidencia**, nunca consentimiento legal ni acceso a presupuestos: la leyenda `verified_reply_not_authorization` permanece sin permisos de descarga.

## Pruebas y compatibilidad

- `tests/unit/v2-d016-original-whapi-adapter.test.mjs` controla envío único y secuencia reserva→HTTP→finish MVP222→confirm ledger, flag OFF, fallas, ID ausente, timeout, doble callback incompleto, variaciones de identidad y webhook histórico inalterado.
- CI Deno comprueba tipado del candidato completo, y `PostgreSQL 17 ROLLBACK` del PR #839 conserva las pruebas de tablas privadas, baja y ACL.
- Al 13/11 no hay evidencia de una ronda nueva por este cambio ni de mensajes reales. La Preview anterior de Vercel sigue en commit `64b8573`; este candidato no se publicará con el reintento de interfaz f985 del 14/11.

## Auditoría pendiente antes de activar

- Revisión de datos personales y fundamento legal en Argentina (Ley 25.326 arts. 5/11): una respuesta posterior a un aviso **no presume por sí sola consentimiento jurídico válido**.
- Fortalecer correlación de la RPC de reserva con el lease exacto del despacho, y validar que `p_notice_body_sha256` y el estado de `api_dispatch_jobs_mvp222` no pueden desincronizarse.
- Integrar recepción de respuestas reales (cualquier formato) **después del guardado** y conservar `NO COMPARTIR` revocable sin falsas atribuciones.
- Adaptar todas las funciones que leen/descargan originales y worker al contrato prospectivo `aviso acreditado < respuesta auténtica < publicación`, y probar negativos en PG17.
- Configurar secretos privados, verificar webhook por SHA, probar E2E real con comprador y los dos proveedores, luego habilitar políticas/cron individualmente sólo en PILOTO.

**Referencia:** [P0 #838](https://github.com/ProtectorRudo/Cotironda/issues/838), [plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #839](https://github.com/ProtectorRudo/Cotironda/pull/839).

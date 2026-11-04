# MVP149 — Salida WhatsApp a proveedores desde cron privado

03/11/2026 · [Issue #503](https://github.com/ProtectorRudo/Cotironda/issues/503). Exclusivamente piloto y sin publicaciones en `main`.

## Problema real
Tras la corrección de envío MVP148, dos filas de `whapi_outbox` de la ronda `469cb459-5f00-49c2-b0b9-bc8b11e5c900` siguen `pending`. Su predicado de permiso es `true`, pero el envío original solo se ejecuta al finalizar un webhook Whapi autenticado. No pedirle al arquitecto un mensaje de activación para una cola que Cotironda debería procesar sola.

## Implementación
Agregar `whapi-dispatch.ts` a la Edge `cotironda-piloto-document-recovery`, invocada desde un job Supabase pg_cron cada 5 minutos. **No se crea ningún endpoint nuevo ni se expone un botón público.** El guard `guardScheduledRecovery` verifica token secreto Vault mediante función SQL cerrada `cotironda_piloto_recovery_token_allowed_mvp132` antes de abrir DB o intentar enviar.

Hasta dos filas `pending` por ejecución: `claim_whapi_v1` / `authorize_whapi_v1` del transportador original, comparar HMAC del destino contra teléfono permitido cargado en secretos Edge, obtener snapshot confiable `pdf_snapshot_mvp091`, renderizar el mismo PDF `generarSolicitudPdfMvp091`, enviar a Whapi `messages/document` y persistir `finish_whapi_v1`. Sólo `sent===true` cuenta `api_accepted`; errores de red/timeout quedan `uncertain` **sin reintento automático**. Base, permisos, números de WhatsApp y destinatarios originales no se modifican.

Se conserva toda la recuperación documental v21 sin alteraciones salvo una llamada de despacho *después de la autenticación y antes del servicio de documentos*. Los secretos se leen en memoria del servidor. Sin teléfonos, tokens ni respuestas privadas en logs; tests usan contactos y PDF sintéticos.

## Verificación y rollback
- CI de unitarias/seguridad y Deno, pruebas de dos envíos, flag OFF, destinatario no coincidente, timeout y configuración inválida.
- Comparar el bundle real v21 de `cotironda-piloto-document-recovery` con los archivos de GitHub; al desplegar, preservar todo lo no cambiado byte-exacto y agregar únicamente `whapi-dispatch.ts` y la dependencia `request-pdf.ts`.
- Verificar job cada cinco minutos, `api_accepted` con ID por proveedor para la ronda real. La aceptación de API no confirma entrega al dispositivo; verificar recibo Whapi o con proveedor.
- No mezclar con el frontend `cotironda.com` ni arreglos del enlace público (#497).

Rollback: recuperar bundle v21 archivado en Supabase usando las versiones previamente verificadas. Las filas `api_accepted` y `uncertain` nunca se reinician ni duplican.

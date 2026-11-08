# Decisión 443 — MVP313: destinatarios dinámicos cifrados y autorización por lease

**Fecha:** 08/11/2026 (ART). **Orden:** «Luz verde»: desarrollar y probar, **SIN publicar**. Requiere MVP309–312, todavía no instaladas en el piloto.

## Problema auditado

Whapi v70 conserva `COTIRONDA_PILOT_RECIPIENTS_JSON`, una lista literal con solo dos contactos de prueba. En una ronda de IA Central, `despacharSolicitudCentralMvp223` elegía un teléfono desde esa lista, no desde el proveedor seleccionado por catálogo/rubro y autorización. Por eso el alta multiusuario MVP310/MVP312 no alcanzaba para enviar solicitudes a proveedores nuevos. También existe un sender **histórico** `dispatchTwo` con su propio lease, que se mantiene separado.

## Implementación

- `supabase/piloto/mvp313_destinatarios_dinamicos_cifrados.sql`: RPC `cotironda_piloto_ia_recipient_packet_mvp313`, **solo service_role**. Recibe `request_id + supplier_key + lease_token + chat_hmac + channel`. Solo devuelve un sobre de teléfono **cifrado** si coinciden un trabajo `ai_dispatch_jobs_mvp222` en estado `leased`, el proveedor vigente, la misma identidad HMAC, catálogo/entrega/estado de ronda y cupo del `ia_pdf_snapshot_mvp222`, la invitación y la regla vigente `proveedor_contactable_mvp307`. Nunca devuelve texto claro ni datos del comprador. Selecciona la fuente WhatsApp antigua autenticada o la declaración administrativa MVP312; frente a fuentes contradictorias **falla cerrado**. La función `cotironda_piloto_is_supplier_mvp313` evita confundir a proveedores nuevos con compradores al procesar respuestas citadas.
- `supabase/functions/cotironda-piloto-whapi/dynamic-recipient-mvp313.ts`: **descifra solo dentro de Edge** usando AES-GCM y AAD del chat. Recalcula el HMAC del número y su SHA desde el canal real; rechaza alteraciones, otro canal, otro proveedor, otra ronda o un paquete incompleto. No busca números en logs, usuarios web ni variables de configuración.
- `ai-central-dispatch-mvp223.ts`: bajo modo dinámico, el teléfono se resuelve **después de reservar** el trabajo y **se revalida justo antes del HTTP a Whapi**. Si cambió el destino, el permiso, el lease o la identidad, el envío queda `uncertain`, sin reintento automático. El mensaje y PDF siguen los valores verificables del mismo trabajo; no se inventan presupuestos.
- `index.ts`: `COTIRONDA_PILOT_DYNAMIC_RECIPIENT_MVP313_ENABLED` (apagado salvo que sea literalmente `true`) habilita el modo. En este modo no se exige la lista fija de dos teléfonos, y se usa SQL para reconocer remitentes proveedores. **No drenar la cola histórica `whapi_outbox` sin su allowlist**: hacerlo marcaría pendientes como inciertos y podría impedir una posterior recuperación. Se conserva como ruta independiente hasta revisarla. La ruta IA Central mantiene **máximo dos envíos por invocación** para no incurrir en consumo inesperado.

## Invariantes

1. Sin `service_role`, sin lease vigente y sin envío autorizado de IA Central: **ningún destinatario**.
2. Identidad por rol real, chat HMAC, proveedor y ronda: un número de negocio no puede usarse para otra empresa.
3. Una revocación del proveedor o la declaración del administrador invalida la obtención del sobre. Un comprador nunca se comparte con proveedores.
4. Todo envío tiene reserva durable y resultado terminal `api_accepted` o `uncertain`. Un timeout no dispara un segundo envío.
5. Los mensajes de nuevos proveedores son considerados como tales por su chat HMAC y rol sin necesitar una lista manual de personas.
6. El modo dinámico está **OFF** y además depende de los otros gates de IA y Whapi.
7. El piloto histórico y las tres RPC antiguas de finalistas no se amplían ni reactivan.

## Pruebas

- Tests Node con WebCrypto real: cifrar/desencriptar, HMAC/SHA, AAD, manipulación, canal falso, fuga de número, lease ajeno, PDF de una solicitud y nuevo chequeo del destinatario antes de enviar.
- PostgreSQL 17 sintético que importa el fixture MVP312, instala la RPC, ejercita permisos, fuente administrativa, lease, revocación y separación comprador/proveedor, finalizando en **ROLLBACK**.
- Compilación del portal, aislamiento empresarial, tests previos y workflows GitHub.
- **No** prueba E2E real con Whapi ni servicios externos: el plan de prueba de Whapi está agotado y el piloto sigue apagado.

## Límites pendientes

- La cola histórica funciona solo para los dos contactos antiguos y se conserva. No hay envío automático de esa cola a usuarios nuevos.
- Los trabajos de IA Central siguen limitados a dos por evento para controlar costos. Para rondas con más proveedores hace falta un trabajador/cron controlado que consuma el resto con presupuesto diario, idempotencia y monitoreo; no se habilita un lote masivo silencioso.
- Un número incorporado mediante declaración del responsable tiene procedencia `owner_statement`, **no prueba directa de titularidad por WhatsApp**. Verificar suficiencia y alcance de evidencia bajo Ley 25.326 antes de divulgar información personal.
- **Ningún código nuevo está publicado** en `cotironda-piloto`; habilitar MVP313 exige revisión, despliegue separado y nueva prueba del proveedor de WhatsApp.

Referencias: [MVP312](442-mvp312-canal-whatsapp-admin-cifrado.md), [MVP311](441-mvp311-rpcs-multiidentidad-sin-reabrir-finalistas.md).

# MVP-109 — Contactos WhatsApp protegidos y consentimiento específico de revelación

**02/11/2026 · Issue #429 · desarrollo del piloto, no producción.**

## Problema que bloqueaba el cierre
En el piloto el identificador del chat se almacenaba como un **HMAC no reversible**. Sirve para autenticar compradores y proveedores, pero no permite reconstruir el número de WhatsApp que la IA necesita enviar a los dos finalistas, ni permite compartir el número del arquitecto con ellos. Guardar teléfonos en claro en Supabase resolvería el envío sacrificando seguridad. Además, la inscripción/consentimiento general a WhatsApp no prueba por sí sola que la persona autorizó **revelación bilateral de su contacto** al terminar una ronda.

## Solución implementada
- El webhook verifica la identidad y conserva el `chat_id` del remitente **solo cifrado** con AES-GCM/nonce aleatorio, AAD vinculado al HMAC del chat y hash SHA256 separado; la tabla `participant_channels_mvp109` está en esquema privado, con RLS, sin permisos directos de API e inmutabilidad. No se graba ni se registra el teléfono en texto claro.
- Contactos de grupos u otros identificadores no admitidos se rechazan; si cambia el chat/HMAC del participante, `identity_conflict` bloquea el reemplazo silencioso y obliga a verificar nueva identidad. Revocar consentimiento general también impide compartir.
- Una **autorización única, no por presupuesto**, se captura mediante WhatsApp autenticado: `COTI CONTACTOS SI` habilita el intercambio de datos únicamente cuando una ronda cierre y el negocio quede finalista; `COTI CONTACTOS NO` lo revoca. Los comandos se apartan **ANTES** de que el clasificador legado procese un texto como presupuesto, y se registran cifrados por HMAC con hash SHA256 de frase exacta.
- En `contact_reveal_consents_mvp109` queda constancia del consentimiento específico y su eventual revocación. No se necesita volver a confirmar al cotizar.
- La RPC `cotironda_piloto_finalist_contacts_mvp109` solo devuelve al backend **contactos cifrados** para una ronda cerrada con un plan de alternativas completas MVP-108, revalidando consentimiento, participación e identidad para **todas las partes**. No envía ni revela nada por sí misma.

## Verificaciones
- PostgreSQL 17 Supabase PILOTO, migraciones 101..109 y fixture realista de una ronda cerrada con comprador+dos proveedores: sin consentimiento niega; al recibir los tres comandos afirmativos entrega tres contactos cifrados al backend; duplicate/identidad distinta rechazados; revocación del proveedor bloquea inmediatamente la entrega; usuario de API sin privilegios. Resultado **PASS con ROLLBACK**; la migración no quedó instalada.
- Tests de contrato Node y AES-GCM con AAD: manipular la identidad del chat hace fallar desencriptado. CI de GitHub del PR por validar. No se enviaron WhatsApps ni se imprimieron números reales.

## Qué falta
1. Outbox de revelación **idempotente** y canal Edge que, en su propia ejecución autenticada, obtenga los contactos cifrados, los descifre en memoria, revalide consentimiento inmediatamente antes de enviar, comunique por WhatsApp a los dos proveedores y al arquitecto, y registre `sent/uncertain` sin reintentos ciegos.
2. Procesador del cron que calcule un plan MVP-108 en ronda cerrada y lo deje listo para ese outbox. El cron actual cierra y nada más.
3. Confirmar el consentimiento específico de participantes de ensayo antes de un envío real; no inferirlo de enrolamientos anteriores. Mostrar al comprador solo datos de los dos finalistas permitidos, nunca antes.
4. Todavía faltan PDF/foto/Excel/Word sin verificación independiente, ranking económico general por condiciones, multi-rubro real y E2E de 3 teléfonos.

Estado: **en rama, sin deploy, sin finalistas contactados**.

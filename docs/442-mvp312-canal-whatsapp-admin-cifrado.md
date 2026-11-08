# Decisión 442 — MVP312: vinculación administrada de WhatsApp con número cifrado, sin repreguntas

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde» — desarrollo y pruebas solamente, **no publicación**. Depende de MVP309, MVP310 y MVP311, todos todavía en rama de desarrollo.

## Regla de negocio

Cuando el dueño de Cotironda solicita agregar un comprador/proveedor con un número que previamente obtuvo de esa persona, esa instrucción declara su autorización para participar, según su rol y alcance. **No se pide otro mensaje de permiso al titular**; tampoco se fabrica un `COTI CONTACTOS SI`, una firma ni un mensaje entrante. La prueba es una **declaración del responsable**, separada de cualquier evidencia directa de WhatsApp.

Una tarea interna del administrador convierte el número en datos protegidos antes de llamar a la base. El usuario no debería cargar catálogos ni repetir el trámite.

## Entrega

- `src/server/pilot-admin-channel-mvp312.ts`: función **solo servidor/operador**, sin red y sin logs, que toma el número en formato internacional de 8–15 dígitos dos veces para prevenir errores de copia; usa **HMAC-SHA256** compatible con el webhook Whapi existente, **SHA256** del chat y **AES-256-GCM** con IV aleatorio, etiqueta de integridad y AAD `chat_hmac|cotironda-contact-v1`. No devuelve teléfono en su paquete SQL y permite verificar/desencriptar únicamente en un backend confiable. Las claves siguen en secretos del servidor, nunca en GitHub ni en interfaz pública. El mismo número produce HMAC estable pero un ciphertext distinto por nonce.
- `cotironda_piloto_privado.admin_channels_mvp312`: registro **inmutable** y con RLS, con `participant_key`, rol, fuente de declaración de MVP309, canal, HMAC, SHA, ciphertext, origen `owner_vouched_phone` y fecha. Un contacto no puede quedar asociado a dos participantes.
- `admin_bind_channel_mvp312(...)`: SQL privado `SECURITY INVOKER` exclusivamente de la sesión `postgres`, sin permisos web ni `service_role`. Exige participante vigente, autorización individual MVP309 del rol correcto y de igual `source_reference`, ausencia de revocación y ausencia de asociación previa con otro número. Actualiza `participants.chat_hmac` de manera atómica con el registro cifrado. No modifica identidad vinculada anteriormente por WhatsApp.
- `admin_create_and_bind_mvp312(...)`: una única transacción SQL para **crear participante + registrar declaración previa + guardar número protegido**. Reintentos idénticos son idempotentes, y fallos/duplicados revierten el alta. Tanto comprador como proveedor quedan vinculados sin enviarle mensaje adicional a nadie.
- Las modificaciones SQL se distribuyen en tres migraciones **ordenadas**: MVP312A (tabla y alta administrativa), MVP312B (predicado de proveedor contactable) y MVP312C (proyección poscierre). La publicación debe ser transaccional y abortar si falta cualquiera.
- Se preserva el **consentimiento WhatsApp original** como vía alternativa. El predicado `proveedor_contactable_mvp307` admite también canal protegido con declaración de dueño y finalidad comercial, pero **nunca** con baja/revocación. `cotironda_piloto_all_supplier_contacts_mvp304` solo entrega ciphertext al backend autorizado cuando `all_suppliers_closed_mvp303` verificó ronda cerrada, token vigente y comprador correcto; nada se entrega antes ni se revela teléfono del arquitecto. Se mantiene revelación de todos los proveedores invitados al cierre; no se usa el circuito de dos finalistas.

## Distinción esencial: procedencia de número

Este mecanismo **no certifica que WhatsApp confirmó la titularidad**. Registra que el **dueño declaró haber verificado previamente** el número. Eso es una fuente de confianza administrativa, no un mensaje recibido ni una autenticación técnica del dispositivo. Un primer mensaje ordinario posterior podrá generar la evidencia WhatsApp real por el webhook ya existente, sin requerir comandos.

Para evitar atribuciones incorrectas, el motor de envío debe descifrar el paquete y **recalcular HMAC + SHA con el canal real**, además de volver a comprobar el rol, la autorización y la ausencia de baja justo antes de cada envío. El helper trae esa verificación, pero **el envío dinámico todavía no se integró**. No habilitar un despacho hasta probarla.

La declaración verbal/administrativa de autorización puede ser jurídicamente insuficiente para ciertas divulgaciones de datos personales; debe revisarse su documentación y alcance bajo Ley 25.326 antes de difundir números de personas físicas. No equivale a consentimiento firmado del titular.

## Límites explícitos del MVP312

El webhook v70 usa una **lista cerrada de dos destinatarios** en `COTIRONDA_PILOT_RECIPIENTS_JSON`, con verificación HMAC. Por tanto, **MVP312 NO hace que nuevos proveedores reciban automáticamente pedidos** hasta implementar un resolver de destinatarios cifrados, dinámico, con comprobación transaccional de send-lease y anti-duplicados (etapa siguiente).

Asimismo, la vigencia de Whapi y la activación del modo automático MVP306 siguen pendientes. No se enviarán mensajes con el desarrollo de esta etapa y no se instalará MVP309–312 sin orden expresa `Publicalo`.

## Criterios de aceptación

1. Sello/descifrado de prueba con número sintético, doble ingreso del operador, nonce nuevo y HMAC estable; rechazo de alteraciones, key/nonce/canal erróneo, suplantación y doble asignación.
2. Alta atómica de comprador/proveedor con constancia administrativa privada; WhatsApp no registra aceptaciones inexistentes y el titular no necesita escribir códigos.
3. Ningún comprador se clasifica como proveedor; ningún proveedor cancelado/revocado muestra contacto; el contacto del comprador nunca aparece.
4. PostgreSQL 17 con datos sintéticos: RLS, SQL solo `postgres`, altas, reintentos, duplicados, identidad, revocaciones y no revelar antes del cierre. Termina `ROLLBACK`.
5. GitHub Actions Node/PG17 + controles generales. Sin llamadas a Whapi, sin secret real, sin publicación ni activar el pilot gate.

## Referencias de proyecto

[Decisión 439](439-mvp309-autorizacion-declarada-administrador.md), [Decisión 440](440-mvp310-altas-multiples-administradas.md), [Decisión 441](441-mvp311-rpcs-multiidentidad-sin-reabrir-finalistas.md).

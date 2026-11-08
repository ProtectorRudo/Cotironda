# Decisión 440 — MVP310: varios compradores y proveedores, alta administrada sin pedir consentimiento otra vez

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde» para desarrollar y probar, **sin publicar**. Depende de MVP309, que sigue sin desplegar en piloto.

## Problema auditado

La migración inicial del piloto `mvp072_runtime_aislado.sql` dejó **tres restricciones fijas**:
- `participants_key_check`: solo `arquitecto`, `corralon_ailin`, `corralon_nahuel`.
- `participants_check`: la clave `arquitecto` es comprador; cualquier otra clave debe ser proveedor.
- `requests_buyer_key_check`: cada ronda debe tener `buyer_key='arquitecto'`.

No alcanza con que el usuario administrador diga «agregá a este arquitecto»: aunque se lo registrase, una ronda nueva de ese comprador quedaría impedida por la base.

## Implementación MVP310

`supabase/piloto/mvp310_altas_multiples_admin_roles.sql` reemplaza las tres restricciones por validaciones explícitas de **rol real**, nombre seguro, aislamiento y contacto verificado.

1. La tabla de participantes admite claves seguras y roles existentes `buyer`/`supplier` sin alterar las tres cuentas históricas. La localidad que registra un proveedor es la de su cobertura. La localidad de entrega de cada pedido sigue declarada por el comprador **en la ronda**, no en su cuenta.
2. `requests` admite distintos compradores. Un trigger de SQL comprueba que el `buyer_key` corresponde a un comprador vigente con WhatsApp autenticado; un proveedor no puede abrir una ronda presentándose como comprador. Rol y clave de participante son inmutables.
3. Solo una sesión SQL administrativa `postgres` (invocador real y sesión efectiva) puede utilizar `admin_create_participant_mvp310(role,display_label,supplier_city,source_reference)`. El sistema genera una clave aleatoria, crea el participante y llama **en la misma transacción** a la declaración por administrador MVP309, con rol/finalidad y referencia auditable de la instrucción recibida. No inventa una firma, mensaje Whapi, vínculo de WhatsApp ni fecha de consentimiento directo. Cualquier error al registrar la constancia revierte también la creación.
4. La referencia de la orden del administrador es única. Repetir una operación idéntica devuelve `already_created` con la misma clave, sin duplicados. Reutilizarla con datos diferentes devuelve `source_reference_conflict`. Una constancia revocada nunca se reactiva por reintento.
5. No acepta números telefónicos visibles como nombre, roles privilegiados arbitrarios, campos inválidos ni duplicados de nombre comercial y localidad para proveedores.
6. No concede `EXECUTE` a `PUBLIC`, `anon`, `authenticated`, `service_role`, ni crea endpoints públicos. No cambia el registro de contacto cifrado, los mensajes existentes o el historial económico.

## Lo que este cambio no pretende simular

**Una autorización obtenida por el responsable no implica que la identidad del número telefónico ya haya sido verificada.** Una cuenta incorporada administrativamente queda con `chat_hmac=NULL` y `consent_at=NULL` hasta que el canal sea asociado de forma segura. No puede originar ni recibir invitaciones por WhatsApp hasta esa vinculación. Esa vinculación no debe utilizarse para solicitar autorización nuevamente.

**Siguiente mejora necesaria:** diseñar el alta de canal de WhatsApp por operador/IA a partir de número proporcionado de forma segura, con cifrado y evidencia técnica de origen, sin pedirle a la persona escribir códigos de permiso. Mantener el control de identidad (para no vincular números de terceros) y evitar guardar teléfonos en logs, GitHub o chat. No adelantar despacho autónomo ni mostrar números hasta esa verificación y hasta acreditar una base de divulgación adecuada. Whapi sigue con limitación de servicio y MVP306 OFF.

## Pruebas de aceptación

- PostgreSQL 17 sintético, luego `ROLLBACK`, incluye la pila MVP309 y corrección de su comprador sintético a `delivery_city=NULL` (igual que en la base real).
- Crear dos roles con identificadores distintos y consentimientos administrativos registrados solo como declaraciones.
- Duplicar la misma instrucción y reconocerla; impedir conflicto de origen y nombre comercial ambiguo en una zona.
- Prohibir ronda desde comprador sin identidad de WhatsApp verificada, y permitirla tras vincular canal sintético en el fixture.
- Impedir `buyer_key` que apunta a un proveedor; impedir que un proveedor cambie su rol a comprador.
- Comprador conserva protección de su contacto; proveedor sin teléfono autenticado no puede ser contactado; revocación administrativa prevalece.
- Solo administrador SQL puede ejecutar el alta. No se abren permisos a roles web ni a Edge.
- Compatibilidad con controles existentes; ningún archivo real ni WhatsApp enviado.

## Publicación

**No aplicada** a Supabase `cotironda-piloto`, Vercel, Whapi o producción. El modo automático permanece apagado. Para desplegar se requiere una orden explícita `Publicalo` y revisar primero dependencias MVP309, orden transaccional de migraciones y la prueba de identidad de WhatsApp.

Documentación previa: [Decisión 439](439-mvp309-autorizacion-declarada-administrador.md), [Acta 438](438-mvp306-308-publicacion-verificada-piloto-v70.md).

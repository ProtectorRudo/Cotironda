# Decisión 435 — MVP307: alta y contacto comercial en un solo WhatsApp, filtrado antes de IA Central

**Fecha:** 07/11/2026. **Estado:** DESARROLLO, PR #702 borrador; **no publicar**.

## Contrato comercial

El comprador no confirma los pedidos. IA Central interpreta, verifica fuente real, localidad, rubros, cantidades, catálogo y destinos; la autorización de envío queda en el sistema, no en un segundo WhatsApp.

Todos los proveedores invitados de las rondas nuevas revelan al cierre su **nombre comercial**, y su **WhatsApp del negocio** sólo si autorizaron que Cotironda lo muestre a ese comprador después de cerrar. La información personal del arquitecto no se entrega al negocio. No hay adjudicación automática ni presiones en el ranking.

La autorización es una sola vez, **en el alta**. El operador muestra al proveedor la explicación antes de enviar el link/mensaje y el proveedor envía **un solo WhatsApp prearmado**:

`COTI ALTA <código> CONTACTOS SI`

Significado preciso del consentimiento: se podrá mostrar el **nombre comercial y número de WhatsApp de ese negocio** a los compradores de las rondas donde haya participado, **únicamente después del cierre**, aunque el negocio no haya cotizado. Puede retirarlo con `COTI CONTACTOS NO`. El comprador no autoriza entregar sus contactos al proveedor por usar Cotironda.

Los proveedores actuales que se dieron de alta con `COTI ALTA <código>` sin la autorización comercial **no se convierten en consentidos**. Una sola aceptación `COTI CONTACTOS SI` desde el WhatsApp autenticado actualiza la situación para rondas futuras. No pedir autorización para cada solicitud. La activación futura debe explicar este cambio antes de contactar a los proveedores.

## Implementación

- Edge Webhook `cotironda-piloto-whapi/index.ts`: reconoce exactamente el comando de alta más consentimiento. Usa los HMAC autenticados del mensaje y del chat, SHA del texto **completo** y AES-GCM del mensaje y número. Un RPC, sin WhatsApp de confirmación ni envío adicional.
- SQL `mvp307_alta_proveedor_contacto_y_ruteo.sql`: la nueva RPC `supplier_enroll_contacts_mvp307` enlaza y registra **atómicamente** alta (MVP073), evento cifrado, canal verificado (MVP109), consentimiento vigente y prueba inmutable versionada. Código de un uso y cinco minutos para el evento. Sin rol proveedor, código correcto, texto exacto y canal autenticado, no hay consentimiento.
- El verificador `proveedor_contactable_mvp307` acepta (a) `COTI CONTACTOS SI` histórico validado por MVP109 o (b) el alta única MVP307 enlazada al código consumido, SHA del WhatsApp real y consentimiento no revocado. Si existe autorización solamente por base de datos sin evento auténtico, falla cerrado. No devuelve teléfonos.
- **Antes de gastar IA**, el RPC `ia_catalogo_mvp220` devuelve únicamente proveedores con opt-in comercial validado **cuando el gate prospectivo MVP306 esté activo**. Cuando está OFF conserva selección heredada, sin alterar rondas históricas. Se preservan zona, rubro y catálogos.
- Antes de **cada** envío, `proveedores_contactables_mvp306` vuelve a verificar el consentimiento de **todos** los destinos y evita nombres comerciales colisionantes que podrían asociar teléfonos equivocados.
- Al cierre, la RPC MVP304 de los teléfonos usa el mismo verificador de consentimiento del alta y sigue exigiendo token privado del comprador, cierre y fecha real vencida vía MVP303; el número permanece cifrado hasta el servicio autorizado.

## Aceptación técnica

1. No se añade confirmación al comprador ni una pregunta extra por pedido al proveedor.
2. Mensaje único para el alta nueva; una aceptación expresamente separada para proveedores antiguos si nunca autorizaron la divulgación.
3. Fallar cerrado por origen falso, código viejo/consumido, mensaje duplicado, error de cifrado, contacto ajeno, consentimiento faltante o revocado, catálogo filtrado, fuente alterada y cambio de identidad.
4. Pruebas unitarias, tipo Deno/TS, PostgreSQL17 sintético y RLS completas sin red, mensajes ni reescritura de históricos.
5. Publicar sólo tras orden literal `Publicalo`, migraciones en orden y configuración. Para una prueba E2E real se necesita recuperar WhatsApp operativo y dos proveedores con opt-in.

**Advertencia operacional:** hoy el piloto registra cero autorizaciones comerciales de teléfono. Si se activara el filtro sin incorporar a Ailín/Nahuel con consentimiento auténtico, IA Central no encontraría comercios habilitados. No confundir aprobación técnica con funcionamiento de punta a punta. El operador debe mostrar de manera verificable el aviso claro al proveedor **antes** del opt-in.

## Estado de ejecución

Cambios preparados en PR #702. El pipeline dedicado `cotironda-mvp307-alta-proveedor.yml` ensaya código válido, falso, repetido, revocación, aislamiento y catálogos con PostgreSQL17 aislado y ROLLBACK. No se ejecutó nada en el Supabase del piloto, Whapi ni Vercel.

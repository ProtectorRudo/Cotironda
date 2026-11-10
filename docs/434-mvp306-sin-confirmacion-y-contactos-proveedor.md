# Decisión 434 — MVP306: circuito automático sin confirmación y proveedor contactable al cierre

**Fecha:** 07/11/2026 (Argentina). **Autorización:** «Luz verde». **Entorno:** SOLO DESARROLLO, **NO publicar en PILOTO**. PR [#702](https://github.com/ProtectorRudo/Cotironda/pull/702) (borrador hasta completar controles).

## Decisiones comerciales nuevas

1. El arquitecto envía texto o documento auténtico al WhatsApp de Cotironda.
2. IA Central interpreta y comprueba material, cantidad, presentación, rubro, ciudad, catálogos y destino del proveedor, usando la evidencia original y segunda lectura cuando corresponde.
3. Si el sistema necesita una aclaración imprescindible (ej. ciudad), solicita solo ese dato en el mismo hilo. Si hay evidencia incompleta, **no envía**: conserva revisión interna.
4. Cuando la fuente, las líneas y los destinos pasan los controles, la **base autoriza internamente** la ronda, sin WhatsApp de revisión ni texto `CONFIRMAR COTI`. Los despachos a proveedores conservan lease, ID Whapi, caducidad y NO duplicación.
5. Al despachar, el comprador recibe un enlace privado y consulta ofertas anónimas por rubro durante el plazo, sin tener que revisar/aprobar el listado.
6. Al vencer y cerrar, MVP303 revela los **nombres de todos los comercios invitados** (cotizaron o no) y MVP304 muestra su **WhatsApp comercial** cuando existe consentimiento de divulgación verificable. **NUNCA** se libera nombre personal, teléfono ni datos de contacto del arquitecto a los proveedores. No hay ganadores automáticos, ni top 2 como límite de identidades.

## Consentimiento de proveedores: una vez, no en cada ronda

Para que en nuevas rondas automáticas la información de contacto comercial **siempre** esté disponible tras el cierre, el proveedor debe aceptar **una sola vez al incorporarse** que su número comercial pueda mostrarse al comprador de las rondas en las que participe. El circuito actual de aceptación verificable es `COTI CONTACTOS SI` enviado desde el WhatsApp autenticado y vinculado al dato cifrado. No se presume consentimiento por tener un registro, recibir un PDF o cotizar.

**Actualmente PILOTO tiene cero opt-ins de divulgación de teléfonos.** El modo automático desarrollado falla cerrado con `supplier_contact_consent_missing` si cualquiera de sus destinatarios carece de autorización. No habilitarlo comercialmente hasta resolver el consentimiento en el onboarding sin pedir acciones por ronda. Si revoca, el número desaparece; de allí en adelante no se le invita automáticamente hasta volver a acreditar permiso. Esto puede reducir catálogos elegibles: el enrutador deberá filtrar proveedores contactables ANTES de seleccionar destinos para no bloquear solicitudes completas.

Los campos de domicilio de local, correo y razón social que no existan como perfil comercial verificado todavía no se inventan. «Información del proveedor» hoy significa nombre comercial más WhatsApp autorizado.

## Protección del arquitecto

No se agrega nombre/WhatsApp de cliente al PDF. Se mantienen los filtros actuales del generador contra contactos/URLs/números largos en material, localidad e indicaciones. Los PDF nunca deben incluir archivos originales sin depurar ni metadatos del emisor. Nuevos controles de descripción y hash bloquean publicación antes de WhatsApp, pero **no reemplazan una prueba adversarial integral de datos personales**.

## Arquitectura implementada en esta rama

- `ai-central-buyer-auto-release-mvp306.ts`: broker tipado, sin envío; llama una autorización SQL y después `ia_publish_mvp222`, reconcilia respuestas ambiguas.
- `index.ts`: nuevo flag Edge `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED` (solo valor exacto `true`), que usa la misma ruta para texto, continuación de ciudad, TXT/CSV y PDF/DOCX/XLSX probados, sin pedir confirmación. Si flag OFF, mantiene comportamiento anterior.
- `mvp306_auto_release_y_contactos_proveedor.sql`: gate prospectivo OFF y ledger inmutable por fuente original; comprueba comprador autorizado, fuente y SHA de snapshot, totalidad de rubros/destinos, ausencia de revisión existente, consentimiento de cada proveedor y no alteración del original. Extiende la función de autorización común utilizada por las **4 RPC de despacho**. Sin permisos `anon`/`authenticated`.
- `buyer-tracking-confirmation-mvp289.ts`: nuevo modo `auto`, asociado al mensaje de origen, que **no finge confirmación del arquitecto** y solo notifica cuando todos los trabajos fueron aceptados con ID Whapi. Conserva reglas de un único enlace y entrega incierta sin reenvío.
- Pruebas unitarias y fixture sintético PostgreSQL17 con ROLLBACK: identidad ajena, gate OFF, consentimiento ausente/revocado, duplicación, intento de publicación sin prueba, alteración posterior, link token, regresiones de flujo anterior.

## Límites y riesgos pendientes antes de activar

- **No ejecutar ninguna migración de MVP306 sobre PILOTO** ni modificar el flag/credenciales sin `Publicalo`.
- Falta integrar el permiso de divulgación comercial en el **alta única** de cada proveedor. El flujo actual verifica el consentimiento pero no lo obtiene sin interacción. Con los dos proveedores históricos sin opt-in el nuevo circuito no será operativo si se activa prematuramente.
- Falta filtrar desde la selección IA del catálogo los comercios sin permiso en lugar de bloquear al final.
- Un WhatsApp aceptado por API **no demuestra entrega**. No hay E2E real ni garantía de que los dos presupuestos sean verificables. Whapi no fue contratado.
- Revisar recuperación de enlace para rondas automáticas con aviso incierto: actualmente el comando `SEGUIMIENTO COTI` fue diseñado para rondas confirmadas.
- Auditar que no se filtre identidad del arquitecto en texto libre, adjuntos y condiciones de entrega, más allá de las validaciones actuales.

## Aceptación previa a cualquier Publicalo

CI verde (Node, Deno/TS, PostgreSQL17/RLS, UI), pruebas extremas de PII, dedupe y ausencia de consentimiento; cero cambios históricos; 1 ronda auténtica nueva con dos proveedores ya aceptantes, WhatsApps genuinos, dos presupuestos, seguimiento navegador, cierre y revelación correctamente comprobados. No certificar circuito completo solo por SQL/CI.

**Estado:** desarrollo en PR #702, implementación aún sujeta a revisión; **0 cambios en PILOTO, Vercel, Whapi, producción y cron**.

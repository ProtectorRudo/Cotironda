# MVP192 — Catálogo privado de TODOS los originales vigentes del comprador

**04/11/2026 · SOLO DESARROLLO · #525 #529.** No se ejecutó una migración permanente, no se publicó web, no se envió WhatsApp.

## Problema resuelto
Los originales que enviaron los negocios ya están archivados con SHA-256 y ruta privada. La plataforma no podía relacionar **cada documento** con un comprador autenticado de la misma ronda, distinguir revisiones de un proveedor ni construir una lista segura de descargas después del cierre. No se debe exponer un archivo identificable por poseer el enlace de seguimiento, ni limitar los originales a los dos proveedores recomendados.

## Solución
`supabase/piloto/mvp192_private_originals_catalog_and_context.sql` incorpora una RPC **solamente para el servidor bajo service_role**, `cotironda_piloto_originals_private_mvp192(request_id, auth_user_id, auth_session_id, document_id := null)`.

Solo podrá ejecutarse después de que el backend verifique `getUser()`, el JWT/ID de sesión real de **Supabase PILOTO**, y el vínculo de teléfono OTP con WhatsApp que exige MVP191. Los tres argumentos de identidad vienen del JWT verificado en servidor, **nunca del navegador**. Para protegerse incluso de un adaptador mal configurado, la función repite las verificaciones en PostgreSQL: `auth.users` actual y no bloqueado, `auth.sessions` vigente, teléfono verificado y huella SHA-256 igual a la del mensaje auténtico de WhatsApp del comprador, ronda de ese mismo comprador cerrada, política prospectiva ON y ningún segundo comprador activo enlazado al mismo número.

Sin documento especificado, devuelve **únicamente dentro del servidor** `{state:'authorized_catalog',total,originals:[{documentId,mime,kind}]}`. Cada `documentId` es UUID opaco estable derivado del HMAC del mensaje y la ronda; no se usa ID del proveedor, SHA visible del documento ni nombre de archivo. Al solicitar uno específico, la función entrega **solo al backend** la evidencia estructurada requerida por el guardia MVP161 y el servicio HTTP MVP190: fecha de ronda/invitación/consentimiento, autor de fuente, bucket privado, path exacto, SHA-256 y tamaño. El backend continúa obligado a revalidar el vínculo Auth antes y después de leer bytes.

La selección está basada en:
- Documento efectivamente archivado y original de WhatsApp autenticado en la ronda y proveedor correctos; `media_archive.state='stored'`, SHA binario concordante con `supplier_media_quotes.source_sha256`, MIME admitido y ruta exacta `media/<HMAC>`.
- Consentimiento documental **expreso y prospectivo**, otorgado por el proveedor de ESA ronda antes de invitarlo, en un mensaje WhatsApp autenticado, vigente y no revocado. La cotización NO cuenta como consentimiento; el mecanismo de registro de consentimiento sigue pendiente de diseño/activación.
- El **último archivo de cotización** de cada proveedor; una versión reemplazada se descarta. Si dos mensajes de un proveedor tienen exactamente el mismo timestamp, el selector no presume cuál es el vigente.
- Ninguna exigencia de estar primero en un ranking, ganar, tener el menor total o acreditar IVA/flete: una oferta parcial y comercialmente no comparable puede tener un original legítimo. `prueba.verificada` significa **integridad documental archivada**, no aval del precio.
- Hasta 100 documentos como tope de seguridad (NO truncar ni mostrar una lista parcial silenciosa).
- Archivo original del bucket privado únicamente después de SHA de bytes real y doble verificación de revocación MVP190.

`src/server/catalogo-originales-comprador-mvp192.ts` convierte la respuesta privada a la única proyección apta para comprador: **Presupuesto original 01 — PDF**, **Presupuesto original 02 — Excel**, etc. Lista blanca estricta, no URLs, SHA, HMAC, ruta, proveedor, ubicación, total ni contacto. Permite lista vacía para una ronda autorizada sin consentimientos; falla cerrada ante documento duplicado, ID/MIME inválido o discrepancia de totales.

## Auditoría y pruebas reales
En `cotironda-piloto`, solo lectura se corroboró:
- 4/4 originales con archivo archivado, SHA coherente, ruta privada y tamaño admisible, originados por mensajes de proveedor realmente invitado. De los cuatro, ninguno es una versión reemplazada.
- 0 rondas con estado `closed`, 0 usuarios Auth, política MVP178 de originales **no instalada**. Por lo tanto **ningún archivo histórico puede habilitarse hoy**.
- SQL MVP178+MVP191+MVP192 compilado y ejecutado en `BEGIN; ... ROLLBACK`: una identidad de prueba inexistente obtiene `null`, `anon` y `authenticated` NO ejecutan la nueva RPC, `service_role` sí, política OFF. Verificación posterior: función y tablas no persistidas, 0 usuarios, 4 originales intactos.
- Tests automáticos: forma del catálogo, whitelist contra filtrado de datos, derivación UUID opaco, estado cerrado y permisos, vinculación de Auth de teléfono con WhatsApp, fuente, revisiones, consentimiento, no-ranking, y denegaciones.

## Qué sigue abierto (sin declarar funcional el portal)
1. Crear una sesión real de comprador **en PILOTO**, con OTP de teléfono compatible y costos/consentimientos controlados. Confirmar match con el contacto WhatsApp existente. No usar Auth del proyecto DEV.
2. Implementar el registro real del consentimiento documental de cada proveedor, sin introducir aprobaciones rutinarias de precios; acordar un mecanismo prospectivo y de mínima fricción. Dejar política global OFF hasta la prueba consentida.
3. Conectar el adaptador autenticado del portal: sesión PILOTO real → MVP191 bajo JWT comprador → MVP192 **solo servidor** → MVP190 Storage → botón Descargar para **todos** los candidatos autorizados después de cierre. Probar no divulgación cruzada, revocación y dos empresas. No publicar ruta ni firmar URLs antes de esto.
4. Prueba positiva en un ambiente controlado o nueva ronda piloto con consentimiento real. En el piloto actual no existe un caso positivo autorizado y no debe inventarse.
5. Publicar únicamente con instrucción expresa `Publicalo en cotironda-piloto`; respaldos y rollback de la serie MVP188. `main`, Whapi y producción no cambian.

**Nota técnica importante:** la consulta server-only vuelve a acreditar usuario y sesión aunque ya se haya validado MVP191. El servidor debe obtener `auth_user_id` y `auth_session_id` de un token Supabase JWT **validado**, no de identificadores enviados por WhatsApp o del navegador. La tabla de consentimientos MVP178 no debe aceptar una simple cotización como prueba de voluntad de compartir originales.

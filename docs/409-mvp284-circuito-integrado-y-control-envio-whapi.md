# Decisión 409 — MVP284: primera ronda de extremo a extremo simulada y corrección Whapi

Fecha: 06/11/2026 Argentina (07/11 UTC). Autorización: **Luz verde — desarrollo y pruebas, sin desplegar ni enviar WhatsApp real**. Issue #669, PR #670.

## Funcionalidad probada de manera integrada

El laboratorio PostgreSQL 17 no usa servicios externos ni el esquema real de `cotironda-piloto`. Ejecuta en una **única transacción** las 21 migraciones acumulativas y luego un escenario continuo completo, siempre con `ROLLBACK`.

Se verifica:
1. El comprador reconocido entrega un pedido sintético con cemento, pintura y cable; se guardan cantidades, zona La Plata y 3 rubros.
2. La publicación previa a la confirmación es denegada.
3. Se emite revisión de todas las líneas; únicamente el mismo comprador puede confirmar con un código de un solo uso **después** de recibir un ID Whapi simulado para la revisión.
4. La aprobación válida crea 3 trabajos privados. El lease genera un snapshot PDF diferente por negocio; jamás recorta ítems ni revela datos de contacto.
5. Dos proveedores autorizados reciben IDs simulados, contestan citando su solicitud y registran un resumen económico que conserva rubro, precio y condiciones **no informadas**. El tercero queda `uncertain` si falta ID.
6. El comprador, mediante token sintético, ve **2 presupuestos anónimos**, los 3 materiales solicitados y los estados de cobertura, sin adjudicación automática ni comparación engañosa de totales.
7. Una confirmación duplicada o token ajeno no habilitan lectura ni un segundo envío.
8. La modalidad continua MVP274 admite `expires_at=NULL`; al apagar nuevos pedidos se conserva la respuesta de proveedores ya invitados, dentro de plazo. No significa uso irrestricto de OpenAI o Whapi.
9. El laboratorio finaliza con `ROLLBACK` y comprueba que no quedan esquemas sintéticos ni usuarios reales.

Una prueba adicional del **mismo código TypeScript de Edge**, con RPC y Whapi sustituidos por dobles de prueba, encadena revisión, confirmación, dos PDFs, dos presupuestos, ACL de destinatario y rechazo de replays. Los casos de cierre/finalistas/capacidad ejecutan su propia suite SQL transaccional de regresión.

## Error de producto detectado y corregido

**Situación anterior:** `despacharSolicitudCentralMvp223` podía marcar `api_accepted` cuando Whapi respondía `accepted=true` sin devolver un `messageId` válido. El SQL legado MVP222 también admitía `api_accepted` con ID nulo. Eso impedía demostrar a qué solicitud correspondía un presupuesto posterior.

**Cambio:** un ID Whapi inexistente, malformado o demasiado largo obliga a `uncertain` terminal, sin reenvío automático. En el SQL **aún no instalado** MVP280 se redefine la función pública `cotironda_piloto_ia_finish_mvp222` para rechazar `api_accepted` sin ID verificable; el SQL sintético prueba ambas decisiones y el resguardo contra duplicados. La migración original MVP222 ya ejecutada en piloto permanece sin cambios hasta una eventual publicación de MVP280 expresamente autorizada.

Nota: **`api_accepted` tampoco demuestra entrega en el teléfono**; solo acredita aceptación con ID verificable. La entrega final necesita comprobantes de Whapi posteriores.

## Alcance y lo que todavía impide el piloto real

- No se probó transporte real Whapi ni API real OpenAI, OCR de archivos auténticos, navegador con token real, cierre completo en el entorno activo ni avisos reales de ganadores. La prueba de finalistas es un ensayo de regresión separado, no parte de la misma ronda E2E.
- El piloto real sigue con **71 migraciones**, últimas MVP239; faltan las 21 migraciones MVP245–280. En Edge sigue publicado el código anterior; no se activan flags, ni cron, ni envíos. Requiere ensayo de instalación de las 21 migraciones sobre un **dump privado y fiel del esquema actual**, no sobre el esquema sintético (Decisión 408).
- Hay una allowlist de **dos proveedores reales de prueba** y límites técnicos de 25 artículos por vista/archivo en componentes nuevos, 2 despachos por invocación, cuotas de IA y tamaños máximos. **No son capacidades ilimitadas**. El piloto continuo sin fecha de vencimiento evita la caducidad de 90 minutos, pero conserva límites económicos y medidas antispam. Escalar catálogos y múltiples proveedores requiere pruebas separadas de capacidad y monitoreo.
- Vercel ha estado bloqueando comprobaciones de despliegue por `build-rate-limit`. No contratar planes ni prometer que se resuelve automáticamente.
- La copia de seguridad paga sigue como Plan B; antes de aplicar DDL real hace falta una estrategia aceptada de recuperación y su verificación.
- «Luz verde» autoriza pruebas y fusión a desarrollo. **No publicar ni habilitar el piloto real sin «Publicalo» para ese entorno.**

## Criterios de siguiente liberación

Sólo publicar cuando la copia de esquema real PG17 valide las 21 migraciones, exista recuperación verificable o riesgo residual explícitamente aceptado, Edge/portal sean desplegables en el entorno aprobado y las identidades consentidas estén verificadas. La prueba E2E real posterior debe enviar un mensaje nuevo del arquitecto, recibir aprobación, enviar dos PDFs, obtener dos presupuestos y mostrar ranking y cierre desde el navegador y WhatsApp, sin datos de contacto anticipados ni duplicados.

Estado de MVP284: **laboratorio integrado funcional**; estado de publicación del piloto: **NO**.

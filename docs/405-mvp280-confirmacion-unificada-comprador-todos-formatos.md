# Decisión 405 — MVP280: una sola confirmación del comprador para todos los formatos ya verificados

**Fecha:** 6 de noviembre de 2026, horario Argentina. Autorización **«Luz verde»**: desarrollo, rama, pruebas y fusión exclusivamente en GitHub. **NO instalar** migraciones en `cotironda-piloto`, desplegar Edge/Vercel, encender crons ni enviar WhatsApps a compradores o proveedores. Sin presupuesto para servidor o backup: sigue plan B.

## Auditoría de la situación anterior

Los MVP276/278 autentican documentos TXT/CSV y PDF/DOCX/XLSX respectivamente, y el MVP279 aporta la revisión WhatsApp solo para originales binarios. Sin embargo, la ruta textual del comprador y la continuación de localidad `ai-central-zone-mvp233.ts` aún pedían al broker `publicar:true`; la rama TXT/CSV también podía publicar con `COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PUBLISH_ENABLED`. **Tres caminos podían generar invitaciones sin consentimiento vinculado a un snapshot**. El selector, reclamación y PDF del despacho protegían únicamente el origen con evidencia binaria, no los textos ni TXT/CSV. La respuesta con código podía gastar cuota en el clasificador IA legado antes de ser reconocida.

No alcanza con cambiar un booleano de webhook: otra ruta interna con `service_role` podría publicar y despachar la ronda desde SQL. Para hacer universal la autorización también hay que extender el snapshot y las cuatro RPC de envío.

## Decisión e implementación

**SQL `mvp280_confirmacion_unificada_comprador.sql`**, solo después de MVP276/278/279:
- `fuente_revisable_mvp280(request_id)` enlaza la ronda en sombra con el HMAC de origen **verdaderamente recibido** y el comprador consentido. Si es **texto**, exige el SHA exacto del texto original archivado en `whapi_inbox`; si es **TXT/CSV**, usa el validador original SHA del binario MVP276 **y exige objeto real del Storage privado**; si es **PDF/DOCX/XLSX**, exige doble SHA, lector independiente MVP278, número completo de ítems y objeto Storage. No convierte un archivo en `kind='text'` ni acepta un texto reescrito por IA como autoría del remitente.
- Reutiliza la tabla de un solo uso de MVP279, sin duplicar códigos ni guardar el código en claro. `ai_buyer_snapshot_mvp279` ahora incluye el origen, tipo de fuente, MIME/SHA documental cuando corresponde, texto original, zona de entrega, vencimiento, **todos los productos, cantidades, unidades, rubros y correspondencias con catálogo de proveedores**. No se revelan nombres de proveedores en el resumen WhatsApp, pero los cambios internos de routing invalidan la aprobación.
- `ia_review_issue_mvp279` acepta ahora también texto y TXT/CSV verificados, preservando límites de tamaño, conteo y cobertura; `ia_review_confirm_mvp279` continúa exigiendo respuesta exacta firmada de Whapi, hash del mensaje cifrado, mismo comprador/empresa y estado `api_accepted` del envío anterior. Un `api_accepted` prueba aceptación por API, **no entrega real**; la respuesta autenticada del cliente es la prueba fuerte.
- `confirmada_comprador_mvp280` exige revisión vigente, fuente original intacta, identidad/consentimiento no revocados y SHA idéntico de la versión completa. **Las cuatro puertas SQL** (publicación, selector de ronda, claim de job y snapshot PDF) revalidan esta condición para TODOS los orígenes. Una aprobación previa no sobrevive a cambios de cantidades, zona, ítems, rubro o correspondencias de proveedor.
- No modifica RLS ni concede nuevos permisos públicos: funciones privadas `service_role`, datos de revisión privados. El rollback manual `mvp280_rollback_confirmacion_unificada_MANUAL.sql` necesita interruptores IA+despacho OFF, ninguna revisión activa, restaura la versión MVP279 y preserva todos los registros de evidencia.

**Webhook**: el comprador que escribe texto, envía TXT/CSV o PDF/Excel/Word, o contesta la zona pendiente, primero deja la ronda `ronda_en_sombra` con `publicar:false`; recién entonces puede recibir **la misma** previsualización segura `emitirRevisionCompradorMvp279`. Una confirmación `CONFIRMAR COTI <código>` entra directo al mecanismo exacto, sin IA y sin confundirse con localidad, presupuesto ni mensaje nuevo. Aseguramos que `!buyerReviewCommand` excluya el clasificador anterior. 

**Tres switches de consentimiento común, todos OFF:** `COTIRONDA_PILOT_BUYER_REVIEW_SEND_ENABLED` para ofrecer la lista, `COTIRONDA_PILOT_BUYER_REVIEW_CONFIRM_ENABLED` para registrar el código, `COTIRONDA_PILOT_BUYER_REVIEW_RELEASE_ENABLED` para autorizar publicación. Se requiere además la activación previa aprobada del trial, IA Central, transporte y despacho; los switches viejos `...BUYER_BINARY_REVIEW_*` y `...BUYER_DOCUMENT_CENTRAL_PUBLISH_ENABLED` dejan de influir en la nueva integración. Con `COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED=true`, un archivo que no cuente con interpretación independiente **no** puede caer en la invitación heredada; permanece en revisión.

**Ventana temporal:** las rondas aprobadas siguen disponibles para que el comprador confirme unas horas después, sin ampliar la ventana de envío de solicitudes de texto sin aprobar. La cola conserva deduplicación y evita reintentos ante estado Whapi incierto.

## Pruebas exigidas

- PostgreSQL 17 real **aislado y sintético**: test MVP279 previo; luego 3 flujos nuevos `text`, `text/plain`, `text/csv`, con material validado, reserva y ronda en sombra, bloqueo de publicación sin aprobación, huella de origen/Storage, código repetido o erróneo, confirmación firmada, PDF resultante solo si está aprobado, y bloqueo después de alterar materiales. Incluye regresión de PDF binario y termina con `ROLLBACK`.
- Node: pruebas MVP276/279 y MVP280 para interceptar confirmaciones **antes** de llamar al clasificador, que todos los brokers usen `publicar:false`, revisión de texto/localidad/TXT/CSV/PDF sin duplicación, bloqueo del legado en el nuevo modo y mensaje completo sin artículos truncados.
- Deno typecheck del webhook, build Next.js, regresiones de seguridad y autenticación. **No fusionar** si cualquier workflow falla.
- SQL `BEGIN; ... MVP276+278+279+280 ... ROLLBACK` en `cotironda-piloto`: ninguna tabla/función persistente de MVP279/280, gates Central y despacho OFF. Este ensayo no es un backup ni un despliegue.

## Pendientes imprescindibles para el piloto real

1. Preparar publicación controlada de TODAS las migraciones y del webhook en `cotironda-piloto`, verificando dependencias anteriores, modo OFF, rollback y presupuesto; **requiere «Publicalo»**. El estado de GitHub no prueba que el piloto esté actualizado.
2. Realizar E2E con mensajes WhatsApp del arquitecto y dos proveedores consentidos: texto, Excel, PDF, zona, confirmación, PDF por rubro, presupuestos, ranking determinista, cierre y contactos; registrar entrega `api_accepted` separada de recepción comprobada. No afirmar que ya funciona.
3. Imágenes y PDFs escaneados requieren una lectura corroborada distinta. Documentos mayores a 25 renglones requieren segmentación con cobertura completa; **nunca ocultar parte de la lista**. Errores de envío incierto/archivo de origen modificado se escalan, no se reintentan automáticamente.
4. El respaldo pago verificable sigue en **plan B sin gasto**, decisión expresa del propietario, por lo que el riesgo actual de pérdida de datos no está resuelto y no se anunciará un piloto comercial irrestricto.

**Estado técnico:** diseñado para desarrollo y CI; no autoriza publicación, costos extra, ni mensajes reales.

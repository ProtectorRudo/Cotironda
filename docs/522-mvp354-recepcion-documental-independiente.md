# Acta 522 — MVP354: Recepción documental sin depender de interpretar precios

**11/11/2026 — desarrollo bajo «Avanza/Luz verde»**. Sin instalación de RPC en piloto, sin cambiar Edge LIVE, sin enviar WhatsApps ni producción. Rama técnica basada en PR #793 (MVP353). [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## Bloqueo real
El comprador paga por conocer qué negocios respondieron. No puede depender de que la IA extraiga perfectamente IVA, descuentos o unidades para visualizar «archivo recibido». El tracking histórico mezcla contadores de cotizaciones/archivos y proyecciones económicas; la base ya contiene registros media_archived con SHA, pero algunos archivos son de rondas antiguas o ambiguas y **NO** se pueden atribuir por fecha.

## Qué cambia en CÓDIGO (aún no desplegado)
1. `supabase/piloto/mvp354_document_receipts_private.sql`: futura RPC de SOLO LECTURA, accesible únicamente por `service_role` desde el servidor del tracking. Revalida **token hash del comprador, expiración, revocación, consentimiento, ronda y estado**. Cuenta por **proveedor distinto**, no por WhatsApps ni PDFs duplicados. Exige invitación vigente, trabajo de despacho `api_accepted` con identificador Whapi, proveedor real con chat HMAC, archivo original `stored` con SHA/ruta/tamaño y recepción entre despacho y cierre. Si otra ronda aceptada para ese mismo proveedor coincide con la hora del archivo, **no cuenta**: revisión privada antes de atribuir. No usa IA, presupuesto interpretado, descuentos ni precios.
2. `src/domain/ia-central/recepcion-documental-mvp354.ts`: validador del DTO exacto de **8 campos seguros** (cifras y booleanos falsos), falla cerrado si estado del comprador o conteos son incoherentes o aparecen campos extras/privados.
3. Tracking Edge `cotironda-piloto-seguimiento`: flag `COTIRONDA_PILOT_DOCUMENT_RECEIPTS_MVP354_ENABLED='true'` **OFF por defecto**. Solo después de validar token mediante el RPC ya existente llama al nuevo RPC que vuelve a autorizar; devuelve `document_receipts` opcional sin tocar `received_count` ni ofertas viejas. El HTML muestra un texto neutral: «Archivos originales vinculados: X de Y proveedores despachados. No implica precios verificados ni habilita descargas.»
4. Tests unitarios: payload válido con IA fallida, duplicados > número de proveedores, estado cancelado/inválido, campos privados, activación accidental de descarga, comprobación de filtros SQL/ACL y flag del Edge.

## Lo que conscientemente NO resuelve
- No instala la función SQL en Supabase; **no está activo en piloto**.
- No asegura que todos los archivos existentes estén correctamente relacionados a su ronda. Rechaza los ambiguos en lugar de inventar una respuesta; falta prueba real de **2 respuestas** en una nueva ronda.
- Para evitar marcar como cotización una imagen casual, UI dice **archivo original** y no «presupuesto comercial verificado».
- Los mensajes exclusivamente de TEXTO aún requieren camino de archivado inmutable y evidencia separada; `media_archive_mvp095` representa adjuntos.
- No muestra imágenes anonimizadas, contenido, totales, ranking, identidad, contactos ni descargas.
- P0 de política de originales/identidad no está resuelto. El acceso a originales permanece OFF y requiere sesión del comprador en PILOTO y consentimiento prospectivo.
- No reemplaza candado transaccional que impida crear rondas solapadas; MVP353 es solo preflight.
- No basta con un build: falta una prueba integrada PostgreSQL17 + Deno, y navegación comprador para declarar P3.

## Verificación ejecutada al preparar el cambio
- Se leyó función real `cotironda_piloto_tracking_status_mvp091` de Supabase: `received_count` usa cotizaciones de proveedor y `files_pending_review` usa archivo archivado, mientras el precio es otra proyección. Se revisó archivo `media_archive_mvp095` y vínculo `ai_dispatch_jobs_mvp222`.
- SELECT derivado directamente del cuerpo de la SQL nueva, **con token falso de 64 ceros**, devuelve `state=not_found`, sin nombres ni IDs.
- SELECT derivado del mismo cuerpo y **acotado a la ronda prepared vigente**, devuelve `invitados=2, archivos_recibidos=0, pendientes=2`, todos los permisos de precios/contactos/descarga falsos. No altera tablas ni prueba E2E.
- Prueba de los archivos históricos por contexto seguro: 4 filas de `supplier_media_quotes` y archivo con SHA se refieren a rondas CLOSED, pero ninguno tiene trabajo `ai_dispatch_jobs` aceptado correspondiente, por lo que la proyección nueva no los promociona por inferencia.
- Verificar CI, typecheck y pruebas Node por SHA del PR; no atribuir resultados de CI de un PR anterior.

## Criterios obligatorios antes de publicarlo en PILOTO
- [ ] CI Node+Next+Deno y prueba PostgreSQL 17 del DDL completo en transacción revertida.
- [ ] Test con dos archivos distintos, repetición de webhook, dos rondas con mismo proveedor, estado `cancelled`, otro comprador, token vencido/revocado y 0 fugas de datos.
- [ ] Auditoría del contrato `state='stored'` y ruta del original + revisión de seguridad/RLS.
- [ ] Identificar única URL del portal comprador correcta en Vercel y dejar explícita la política de originales (P0).
- [ ] Desplegar RPC privada con marcha atrás probada y activar Edge SOLO con «Publicalo en cotironda-piloto». Cambiar flag OFF no equivale a enviar mensajes.
- [ ] Realizar una ronda E2E con un comprador y dos proveedores y comprobar 2/2 en navegador antes de marcar P3.

**Handoff:** primero resolver P0 autenticación/revelación de originales y correlación P2; luego activar función bajo publicación autorizada. Mientras el flag esté OFF, el tracking se comporta como antes. El progreso es **código de desarrollo**, no piloto terminado.

# Cotironda V2-12 — recuperación automática y acotada del análisis individual

**Fecha:** 12/11/2026. **Estado:** propuesta de desarrollo, no publicada. Base: PR #832, SHA `8442c8deee8a1258dc0a34ef9c65416e22e6ea05`.

## Defecto demostrado en código

La pantalla del arquitecto usaba `analysisAttempted=Set<documentoId>`: **solo enviaba una llamada POST por documento durante toda la sesión del navegador**. La API responde HTTP **202** ante orígenes todavía no disponibles, lector PDF sin configurar, SQL claim en proceso, o fallo de la IA. El Set conservaba el ID para siempre: aunque V2-11 actualizara el catálogo cada minuto, ese documento no volvería a intentar el análisis hasta recargar/cambiar sesión.

La base real contiene la función `cotironda_piloto_v2_analysis_claim_private` de V2-04b: permite un máximo de **3 intentos por original y SHA**, repite `review` solo después de **5 minutos**, y un `processing` atascado solo después del lease de **90 segundos**. Esta regla **ya existe** y no se modifica.

## Corrección desarrollada

- Sustituir el Set por historial de intentos **por documento**, en memoria del navegador, reiniciado si cambia la identidad Auth o se cierra sesión.
- Primera llamada automática al ver un presupuesto sin guía; hasta **2 reintentos** posteriores como máximo, únicamente si transcurrieron **6 minutos** desde el intento previo.
- No repetir si la guía ya aparece; máximo **4 documentos por tanda** y **100 documentos distintos por sesión**. Si el reloj del dispositivo retrocede, la recuperación falla cerrada.
- Solo se inicia con comprador autenticado y pestaña visible. Cada petición conserva JWT privado por `Authorization`, `cache:no-store`, `credentials:omit` y se descarta el resultado si cambió la identidad Auth.
- El backend SQL sigue decidiendo los permisos, vigencia de consentimiento, SHA del archivo, concesión del claim y presupuesto total de intentos; no se cambian ni la autorización ni el análisis económico.
- La política de reintentos no publica por sí sola nada en WhatsApp, no consulta invitados, no crea jobs al recargar el catálogo y no toca el presupuesto original.
- Ante análisis no disponible, el comprador siempre puede descargar el archivo autorizado; la guía queda como «Análisis en preparación», nunca inventada.
- El intervalo de 6 minutos es **un margen mayor que el de 5 minutos del SQL**, no un SLA ni garantía de resultado; faltas permanentes de OCR/modelo/configuración pueden seguir requiriendo revisión.

## Criterios de aceptación y regresión

- [x] Primer presupuesto pendiente genera 1 candidato de análisis.
- [x] Antes de 6 min no vuelve a enviarlo, incluso con actualizaciones GET repetidas o HTTP 202/errores.
- [x] A los 6 min puede repetir si continúa pendiente, sin superar 3 intentos por documento.
- [x] Cuando el análisis aparece, deja de generar intentos.
- [x] Identidad Auth distinta y cierre de sesión borran historial y catálogo; no se ejecutan consultas en pestaña oculta.
- [x] Capacidad de selección: 4 documentos por tanda y 100 distintos por sesión, incluso en el borde 99+4.
- [x] Tests unitarios Node + workflow V2-03 con PostgreSQL 17.
- [ ] GitHub CI **del SHA final** validada (no presumir éxito).
- [ ] Prueba real con primer PDF y Excel de un proveedor autorizado, backend 202→recovery→ready, navegador abierto, sesiones/revocación y presupuesto original idéntico (requiere Preview V2 publicada).

## Seguridad y límites

No se modifica SQL ni la función Whapi v76, esquema Supabase, RLS, secretos, Vercel, respuestas ni el código de comparación. La rama y PR son **solo desarrollo**. El despliegue a `cotironda-portal-dev` sigue bloqueado por vínculo Git y variables V2 faltantes; Auth compradores y consentimientos proveedores siguen pendientes.

**Recomendación para el piloto:** solo después de `Publicalo`, habilitar Preview protegida y enviar un presupuesto real; observar 202 del primer intento, recuperación luego de la ventana SQL y aparición del análisis sin interacción del comprador. La aprobación CI verifica código, no E2E.

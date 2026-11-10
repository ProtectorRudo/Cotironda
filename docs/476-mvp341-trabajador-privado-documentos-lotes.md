# Decisión 476 — MVP341: trabajador interno y originales privados por lotes

**Fecha:** 10/11/2026. **Estado:** SOLO DESARROLLO; sin despliegue, merge ni llamadas pagas.
**Dependencias:** PR #742 → #743 → #745 → #746 → #747.

## Requisito

El proveedor puede cotizar en su formato habitual. Cotironda debe reconocer la fuente original, comprender todos sus renglones y separar interpretación, evidencia y aprobación económica. No se admite truncar materiales, inventar importes, mezclar rondas, reenviar mensajes o repetir costos por reintentos inciertos.

## Código previo auditado

- whapi-media-archive.ts guarda originales con SHA-256 en bucket privado cotironda-piloto-originals y ruta media/<HMAC>, nunca desde un nombre proporcionado por usuario; evita overwrite y limita 8 MiB.
- MVP338 revalida tipo y bytes antes de extraer PDF, DOCX, XLSX, TXT y CSV; mantiene imágenes/escaneos en revisión.
- MVP339 exige dos lecturas independientes por lote y citas literales; no publica precios.
- MVP340 exige reserva SQL única por fuente, ronda, proveedor, chat, plan y recibo privado; solo registra resultado agregado.
- El worker histórico MVP292 permanece intacto, no se reutiliza su endpoint ni se cambia webhook.

## Cambio 1. Preflight de origen privado

Archivo: supabase/piloto/mvp341_candidato_lectura_privada.sql.

Nuevo RPC de lectura cotironda_piloto_source_for_lots_mvp341(p_message_hmac), SECURITY DEFINER y search_path vacío, REVOKE al público/anon/authenticated y GRANT EXECUTE solo a service_role. Lee identidad y origen ya asociado según tablas reales, comprueba invitación, despacho anterior a recepción, comprador y proveedor habilitados, ronda abierta y archivo conservado. Si la asociación es semántica requiere la decisión final linked de MVP291. Si existe una reserva MVP340 devuelve already_processed **sin habilitar otra descarga ni gasto**.

Solo devuelve UUID de ronda, clave de proveedor, HMAC de mensaje/chat, SHA-256, MIME, longitud y ruta privada exacta. **No devuelve** texto comercial, precio, teléfono, credenciales ni URL firmada.

## Cambio 2. Worker privado (sin endpoint HTTP)

Archivo: src/domain/ia-central/worker-privado-lotes-mvp341.ts. Adaptador Deno separado: supabase/functions/cotironda-piloto-whapi/worker-originales-lotes-mvp341.ts.

- Exige flags habilitado y trabajador interno autenticado por el futuro host, HMAC de 64 caracteres y presupuesto explícito de 2 a 12 llamadas.
- Llama al RPC de preflight; valida todos los metadatos y la ruta privada media/<HMAC>. Nunca acepta URL o ruta del proveedor.
- Descarga un único Blob del bucket privado, exige longitud exacta y **recalcula SHA-256 antes de llamar al parser**. Un desacuerdo bloquea el gasto.
- Utiliza la lectura segura MVP338; archivo no corroborable queda en revisión sin reserva.
- Genera plan por lotes MVP337, calcula digest del plan MVP340, **reserva** antes de llamar a IA y ejecuta la doble lectura MVP339. La finalización en SQL conserva estado, cantidad de filas y llamadas; cualquier resultado incierto exige conciliación sin reintentos automáticos.
- La salida del worker nunca incluye lecturas, precios, identidad del comprador, contactos ni documentos. economicPublicationAllowed=false; whatsappMessages=0; quotesPublished=0.
- No hay Deno.serve, cron, URL pública ni importación en el index.ts del webhook actual.

## Pruebas y criterios de aceptación

- Node con DOCX/XLSX ZIP **binarios sintéticos**, XLSX de dos hojas con más de 40 renglones, reserva/finalización RPC simuladas y modelos simulados; sin llamadas externas.
- Rechazo de metadata falsa, MIME/página ilegítima, hash o tamaño alterado, costo insuficiente, permiso de host ausente, reader no corroborable, reentrada del mismo origen, error de modelo y confirmación SQL incierta.
- PG17 acumulado bajo BEGIN/ROLLBACK y sólo fixtures sintéticos MVP336+MVP340: ACL service_role, respuesta ya procesada, origen correctamente vinculado, consentimientos revocados y despacho no entregado a tiempo.
- Typecheck Deno de dominio y adaptador con lectores reales. Integración sin modificar código congelado de webhook.
- Solo se declara probado tras los controles GitHub; no corresponde confundir pruebas simuladas con tasa de acierto real de IA.

## Bloqueantes para un piloto real

- Aún **no existe un entrypoint HTTP interno ni proceso autónomo en ejecución**; faltan autenticación real de host, scheduler, cuotas monetarias por empresa, medidas de costo de tokens y despliegue autorizado.
- MVP340 guarda **solo resultado agregado**, no todas las lecturas de cada lote. Pendiente almacenamiento privado cifrado por renglón con retención y conciliación.
- Pendiente comprobación económica determinista de IVA, descuentos, flete, cobertura, cantidades y totales en 25+ líneas; también OCR independiente de fotos y escaneos, Office legado y fórmulas.
- Pendiente validación de 150+ presupuestos auténticos anonimizados, con oráculo humano, y circuito completo Whapi → publicación anónima → cierre.
- Sin backups de base actualmente contratados; acordar estrategia de recuperación antes de cualquier publicación que altere esquema.

**Decisión:** conservar MVP341 aislado del piloto hasta completar auditoría, costos, persistencia segura, preflight y orden explícita Publicalo para entorno autorizado.

# MVP138 — una prueba de fuente, publicación anónima y comparación separada

Fecha: 03/11/2026. Issue #488. Entorno autorizado: exclusivamente Supabase cotironda-piloto; main/producción no se toca.

## Problema raíz confirmado

Ronda real: Ailín PDF 2 renglones, total declarado $310.359,22, cantidades 40 y 1, unitarios $9.798,58 y $8.004,15 y descuentos explícitos 22,4%. Los importes de líneas $304.148,00 y $6.211,22 suman EXACTAMENTE el total; el viejo MVP103 comparaba unitario×cantidad sin descuento y bloqueaba. El viejo MVP102 exigía coincidencia literal de metadatos de dos IA; notas distintas o ausencia de IVA lo bloqueaban. Nahuel Excel tiene 20×10250=205000,5×3050=15250,total 220250; el guard MVP103 exigía símbolo $ y guard Office rechazaba estilos Excel inocuos. Los ledgers MVP102/103/106 son inmutables, y el publisher MVP107 depende de todos. No se puede falsear esos estados.

## Cambio mínimo

1. Reutilizar WHAPI, identidad consentida, invitación activa, original privado SHA256, parser PDF unpdf / Office ZIP/XML, cuota/cron existente y token comprador ya vigente. NO más prompts ni confirmaciones al proveedor.
2. Un único comprobador determinista independiente source-evidence lee filas del original, coteja en orden descripción, cantidad, unitario, importe, descuento explícito y total, además de todas las condiciones comerciales. Si falta una cifra, hay cargo escondido, falta nota, hay fuente malformada o se mezclan datos, RETIENE. Si el total literal no coincide con la suma de importes, conserva ambos con advertencia y NO altera ninguno. No supone ARS ni IVA. Diferencias entre dos IA no son veto; los errores materiales de fuente sí.
3. **Una única tabla de estado+evidencia por versión** es necesaria: no se puede reutilizar los ledgers antiguos sin falsificar sus resultados históricos inmutables o relajar claves foráneas. Registra revisión y proyección anónima en un lugar con RLS, inmutabilidad, auditoría y control de origen. No crea nuevos clientes ni comprobaciones redundantes.
4. Reutilizar el mismo cron autorizado Vault, con un paso al final que procesa una cotización archivada por ejecución. Reutilizar el token fragmentario y el status tracking; se expone SOLO la presentación propia verificada, siempre anónima. La suma verificada no se proclama ranking: cobertura/equivalencias/IVA/flete/moneda por separado. No revelar ganadores por el mero hecho de publicar una cotización.
5. Conservar el estado anterior y sus registros: no actualizar o borrar cotizaciones antiguas. Las revisiones futuras se vinculan por nuevo message HMAC.
6. El resto de la arquitectura de cierre y notificación se auditará después de comprobar publicaciones reales y 0 filtraciones. **5 días por defecto** en nuevas rondas, sin mutar los 4 días de la ronda existente.

## GO/NO-GO de publicación

GO únicamente cuando documento de Storage byte a byte y SHA256 coinciden, parser admite el formato, TODOS los ítems y cifras/condiciones se comprueban contra fuente, privacidad comprobada y proyección original completa; round/identidad/invitación/token siguen vigentes. NO-GO para variantes no parseables, líneas o montos extra, fórmulas ocultas, fuente ilegible, contacto en proyección o ambigüedad material. Retención NO desencadena confirmación obligatoria al proveedor.

## Evidencia requerida

CI Node/Deno/Postgres, prueba SQL en BEGIN/ROLLBACK con datos reales, validación posterior de tabla privada y buyer_tracking, GET/POST HTTP con token de prueba solo (no exponer token real), 0 mensajes comerciales de prueba, 0 cambios de producción. Si fuente original no es legible, documentar motivo exacto y no afirmar éxito.

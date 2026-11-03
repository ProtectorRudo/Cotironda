# MVP-128 — relectura automática del mismo PDF privado, sin pedir un reenvío

**03/11/2026 · Issue #466 · Piloto Supabase aislado.**

## Objetivo y evidencia

El PDF de Ailín fue recibido y archivado correctamente (`application/pdf`, 12.725 bytes) y pertenece a su ronda vigente. La IA v37 reservó una lectura pero descartó el motivo de error y no registró presupuesto. MVP-127 elimina el silencio, aumenta el presupuesto de salida y preserva borradores. MVP-128 agrega el **trabajador de recuperación** sobre el ARCHIVO ORIGINAL, sin otro WhatsApp ni otro PDF.

## Arquitectura

- `mvp128_legacy_document_recovery_queue.sql`: selecciona exactamente un documento cifrado/privado ya guardado, SHA256 válido, dueño consentido y, si es proveedor, invitación abierta asociada. Solo un webhook **autenticado de un participante registrado** puede habilitar la búsqueda. Acceso RPC exclusivo de `service_role`; ninguna URL, precio, PII o byte de archivo sale al cliente.
- Para archivos antiguos (sin diagnósticos porque v37 descartaba las excepciones), crea `legacy_unclassified`. **No afirma saber cuál fue el fallo anterior.** El código de error real aparece solo a partir de la relectura instrumentada.
- Bloqueo de fila `FOR UPDATE SKIP LOCKED`, reserva posterior de MVP127; máximo tres intentos por archivo, espera mínima de tres minutos, límite operativo de IA cada 24h y una recuperación como máximo por webhook.
- `private-document-recovery.ts`: descarga exclusivamente `media/<HMAC>` desde bucket privado, coteja bytes, tamaño y SHA256 de la fuente contra el registro de archive; dos lecturas independientes de OpenAI sobre esos mismos bytes. Si solo una funciona se guarda como borrador, jamás como corroboración.
- Para proveedores, sigue las mismas puertas comerciales del webhook: guardar encabezado y TODOS los renglones literales, comparar lecturas, auditar sumas exactas y cotejar fuente; el PDF común que el verificador determinista todavía no cubra permanece **privado/en revisión**, sin precio publicado.
- El webhook Whapi, ya autenticado, llama al trabajo en `EdgeRuntime.waitUntil` después de contestar la petición; no bloquea respuestas a clientes ni reenvía solicitudes a negocios. Solo se dispara si IA documental sigue habilitada. No hay un endpoint de administrador público.
- La recuperación se activa con el **próximo mensaje Whapi auténtico** de cualquier participante consentido. No depende de que el proveedor reenvíe el PDF, pero **no existe garantía de tiempo hasta que ocurra otro evento**. Un cron dedicado sería la etapa posterior para disponibilidad continua.

## Tests y seguridad

- Pruebas con archivos sintéticos: SHA256 verificado y lectura única privada, dos pasadas distintas, una fallida sin fingir doble corroboración, rechazar mismatch de hash, no publicar monto de PDF no corroborado, never send/double invite, cuota y permisos.
- Ensayo SQL sobre el registro real de Ailín, **BEGIN / ROLLBACK PASS**: candidato histórico reconocido, reserva exclusiva, segundo candidato bloqueado y permisos anónimos rechazados. No se descargaron bytes ni se hicieron llamadas a OpenAI durante el ensayo SQL.
- No pedir credenciales ni PDF al usuario, no copiar Storage a GitHub, no imprimir números, montos, cuerpos JSON o SHA originales.

## GO pendiente

Hasta que un webhook firmado dispare el worker y se observe la propuesta de Ailín, no se puede afirmar que fue leído. Incluso una propuesta de IA no prueba fidelidad de un PDF complejo: el verificador actual de PDF es deliberadamente conservador. Es necesario integrar un extractor PDF.js/unpdf con geometría/orden de tabla y cotejar **todos los cargos, IVA, flete, condiciones, extras y total** antes de habilitar publicación de ofertas y ranking. Nada de esos datos puede inventarse o omitirse.

La ronda del comprador y los dos envíos de PDF ya aceptados por Whapi se mantienen intactos. Cotironda.com institucional no se modifica con este cambio.

# Decisión 376 — MVP252 OCR independiente de fotos y PDF escaneados (solo desarrollo)

Fecha: 06/11/2026. Capacidad funcional IA Central 3. **Sin activar en PILOTO, sin publicación.**

## Justificación

MVP251 ya comprueba SHA/bytes y concordancia de dos lecturas de IA, pero eso **no demuestra el contenido físico** de la imagen. Para acreditar cada importe necesitamos un lector independiente, cotejo literal estricto y una política de publicación avalada por SQL.

Analizamos un OCR local pesado (Tesseract/Web Workers): las Supabase Edge Functions tienen límites de CPU/memoria y **no admiten Web Workers ni librerías multihilo**, por lo que no se inserta ese motor dentro del webhook. Consultar la [documentación oficial de límites](https://supabase.com/docs/guides/functions/limits). La solución candidata es un **OCR remoto independiente de la IA Central**, llamado únicamente desde el recuperador privado (no desde la recepción principal).

La API de Google Cloud Vision soporta `DOCUMENT_TEXT_DETECTION` de imágenes y solicitudes síncronas `files:annotate` para hasta cinco páginas PDF; requiere credenciales apropiadas. Referencias oficiales: [OCR de imágenes](https://cloud.google.com/vision/docs/ocr), [PDF en lote pequeño](https://cloud.google.com/vision/docs/file-small-batch).

## Contrato nuevo

- `supplier-ocr-google-mvp252.ts`: envía el binario *de archivo ya validado* a un endpoint fijo de Google Vision, con token OAuth de una **cuenta de servicio en secreto**, jamás obtenido desde el remitente. Verifica SHA-256 antes de cualquier salida de red y comprueba tipo de archivo/cabecera.
- Datos remotos solo con **dos flags explícitos**: `COTIRONDA_PILOT_VISUAL_OCR_ENABLED=true` y `COTIRONDA_PILOT_VISUAL_OCR_EXTERNAL_CONSENT=true`. Ambos están OFF por defecto. Se necesita configurar `COTIRONDA_PILOT_VISUAL_OCR_SERVICE_ACCOUNT_JSON` en el gestor de secretos del entorno autorizado; **no colocar credenciales en GitHub**.
- Restricciones: hasta 3 MiB por archivo, PDF escaneado **inspeccionado previamente** y máximo cinco páginas, respuesta limitada a 120 kB, texto <=18k caracteres; palabra con confianza mínima 90%, sin fragmentos faltantes.
- `supplier-visual-ocr-audit-mvp252.ts`: exige dos borradores concordantes, sin identificadores expuestos, y compara las líneas del OCR contra todas las descripciones, cantidades, importes, extras, total general y condiciones mediante el verificador de TXT estricto existente. Los valores no se redondean ni se reinterpretan.
- Resultado positivo **solo** `source_ocr_covered_private`. Siempre `publicationAllowed=false`, `rankingAllowed=false`, `sourceVerified=false`. Esto es una corroboración técnica preliminar, no permiso comercial.
- Conexión de diagnóstico únicamente al flujo privado de **recuperación de documentos**, después de la atribución de proveedor/ronda, doble lectura y auditoría de importes. El webhook crítico queda sin esperas de OCR. Se emite solo el estado, nunca el contenido ni datos personales.
- **Tercer gate obligatorio:** la recuperación consulta `cotironda_piloto_visual_ocr_permission_mvp252` con HMAC del mensaje y SHA del archivo. Debe acreditar consentimiento externo individual y presupuesto/cuota para ese original. **La RPC todavía no está implementada en la base**, por lo que devuelve error y se bloquea el envío de bytes incluso si se configuran las dos flags. Este es un mecanismo intencional de seguridad hasta autorizar y probar el contrato SQL.

## Protección SQL y límites actuales

Las funciones SQL MVP106 y MVP107 **no admiten imágenes para publicación**, y **no se cambian en MVP252**. El recuperador registra en SQL el resultado independiente de la fuente existente (que continúa como revisión para imágenes), **nunca promueve el resultado OCR** al publicador. Los PDF escaneados también siguen privados. No es correcto declarar que «fotos ya se publican automáticamente».

Para admitir fotos/escaneos en un futuro PR hace falta una migración con **registro duradero de procedencia OCR** (proveedor exacto, SHA, versión de lector, páginas, confianza, importes íntegros y evidencia), inspección de privacidad y una autorización de publicación específica. La confianza OCR alta no garantiza haber leído toda la imagen: el motor de conciliación debe continuar fallando de manera conservadora.

## Pruebas y pendientes

- Test Node 22 de OAuth firmado con **RSA sintético**, respuesta de OCR simulada, SHA, imagen, PDF escaneado, páginas faltantes, precios alterados, cantidad falsa, flete omitido, confianza insuficiente, identidad ajena y ausencia de permiso externo. **Sin llamadas reales a Google**.
- Regresión de MVP251, MVP245, recuperación y typecheck Deno (validar CI).
- Prohibido activar el OCR remoto hasta aprobar: **costo por página y presupuesto mensual**, contrato de privacidad/procesamiento de datos con el proveedor externo, consentimiento específico de terceros involucrados y pruebas reales con documentos autorizados.
- En este PR no hay migrations, tablas nuevas, cambios de RLS, publicación, envío de WhatsApp o deploy.

## Futuro necesario para terminar las etapas 1–3

1. Implementar persistencia y verificación SQL de procedencia visual con pruebas PostgreSQL 17 y decisión explícita de privacidad.
2. Probar fotos reales y PDF escaneados multirrubro con documentos cuyos importes se conozcan independientemente.
3. Ejecutar evaluación semántica de >=150 casos de etapa 1; ensayar dos rondas simultáneas reales para etapa 2; correr E2E por WhatsApp y navegador, con proveedor/cliente consentidos, antes de declarar cerrada la etapa 3.

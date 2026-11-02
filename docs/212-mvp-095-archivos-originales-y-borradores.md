# MVP-095 — Originales de archivos entrantes y borrador documental IA

02/11/2026 · Issue #400 / PR #401 · **solo Supabase PILOTO**

## Objetivo
Que arquitectos y negocios puedan enviar PDF, DOCX, XLSX, imágenes o CSV por el WhatsApp de Cotironda, sin perder el archivo fuente. No atribuir una oferta a una ronda incorrecta ni inventar materiales o precios. Los mensajes del usuario son datos, no instrucciones operativas.

## Implementación
- `whapi-media-archive.ts`: descarga del medio exclusivamente por el ID aportado por un **webhook Whapi autenticado** contra `GET https://gate.whapi.cloud/media/{MediaID}` (ruta fija, sin URL arbitraria, redirects deshabilitados). Cota estricta de 3 MiB en Content-Length Y streaming, huella SHA256, magic bytes según PDF/JPG/PNG/WebP/ZIP Office/texto. No se usan enlaces de descarga proporcionados por el cliente.
- `mvp095_private_media_archive.sql`: bucket Storage **privado**, limitado por tamaño y MIME, sin políticas públicas. Tabla `media_archive_mvp095` privada con RLS, huellas, ubicación opaca `media/<HMAC>`, participante, estado, y posible ronda solo si hay **una** invitación activa. Original conservado exactamente como bytes; no se expone por los endpoints públicos.
- SQL `cotironda_piloto_reserve_media_mvp095`: exige inbox firmado y persistido, participante comprador/proveedor consentido y vigente, tipo permitido, mensaje fresco, 8 intentos/24h por contacto, una reserva por HMAC de mensaje. `finish_media` marca `stored` o `uncertain`, sin reintento ciego. Las ofertas antiguas quedan intactas.
- `document-ai-draft.ts`: borrador IA sobre base64 real PDF/Word/Excel o `input_image`; Responses API con JSON Schema estricto, `store:false`, `tools:[]`, máximo 2.300 tokens, timeout 25s. El proveedor puede incluir renglones extras, pallets, descuentos, IVA/flete, TOTAL: el modelo propone, pero **no recalcula ni modifica el original**. La salida es **siempre `review_required`** y se guarda solo en base privada si el lote tiene evidencia suficiente para revisión posterior. Máximo 2 intentos de documentos por contacto/24h.
- Nueva columna de seguimiento `files_pending_review`: un cliente con token privado ve el número de archivos de proveedores recibidos y pendientes por verificar, **separados** del contador de presupuestos fielmente registrados. No ve contenidos, identidades ni precios antes del cierre.
- Dos habilitaciones independientes, **off por defecto**: `integration_flags.media_archive_enabled_mvp095=true` (base privada Supabase) para descargar y archivar el original sin nuevos secretos; `COTIRONDA_PILOT_DOCUMENT_AI_ENABLED=true` (Edge Secrets) para lectura IA documental (requiere token de OpenAI ya previsto por MVP-094 en `COTIRONDA_PILOT_OPENAI_API_KEY`). No mostrar valores en chat/logs, no repetir configuración por cliente.
- La salida de la IA **no** puede crear nuevas invitaciones desde documentos ni rankings o finales; el proceso de extracción debe corroborarse contra el original, y no existe todavía esa garantía total para PDFs/fotos. Cotironda retiene el archivo y muestra estado pendiente, sin fingir un presupuesto validado.

## Verificación
- `tests/unit/mvp095-whapi-media-archive.test.mjs`: descargas por ID, redirección/SSRF, MIME y firmas, tamaños, copia íntegra en Storage privado y SHA, errores/reintentos.
- `tests/unit/mvp095-document-ai-draft.test.mjs`: Responses JSON estricto con mocks, PDF e imagen, campos adicionales, valores faltantes, 401/429/network y rechazo.
- `supabase/piloto/mvp095_smoke_rollback.sql`: 8 documentos y 2 lecturas por día por comprador, deduplicación, proveedor vinculado a una ronda, permisos, rollback; no envía WhatsApps ni hace llamadas externas.
- Control GitHub CI y SQL contra Supabase real obligatorios antes de desplegar funciones. Si alguna prueba falla no habilitar flags.

## Fuera de este alcance / no declarar listo
- Validación independiente de OCR/Excel y enrutamiento por rubro del contenido documental; esto requiere extracción + comprobación de cobertura y tabla de catálogos reales.
- Actualización de presupuesto original de proveedor desde archivo (el archivo sí queda guardado en privado pero no se declara *quote_recorded* hasta normalizar y corroborar).
- Ranking económico y revelación automática de hasta dos finalistas y consentimiento/contactos; comparador offline ya existe pero no se ha conectado.
- Alta dinámica cifrada de proveedores/arquitectos, pagos y despliegue producción. La prueba sigue restringida por el gate de ronda única a Ailín/Nahuel.

Documentación oficial verificada: [Whapi GET Media](https://whapi.readme.io/reference/getmedia), [OpenAI Responses file inputs](https://developers.openai.com/api/docs/guides/file-inputs).

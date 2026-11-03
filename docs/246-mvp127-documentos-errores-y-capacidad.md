# MVP-127 — auditoría de fallos y capacidad de lectura documental (PILOTO)

**03/11/2026 · Issue #464 · entorno: Supabase PILOTO.** El comprador y los proveedores siguen por WhatsApp; no existe requerimiento de reenvío ni de confirmar recepción.

## Evidencia del caso real
El PDF de Ailín fue recibido el 03/11 a las 08:12 AR; se conserva en Storage PRIVADO (`application/pdf`, **12.725 bytes**), asociado a la solicitud correcta. `ai_reserved_at` existe pero `proposal` y los controles posteriores están vacíos. **No se pudo determinar cuál fue el error exacto porque el webhook v37 descartaba silenciosamente cualquier excepción de la lectura.** No hay fundamento para afirmar que el PDF esté mal; el problema operativo es del procesamiento.

## Cambios implementados
1. `document-ai-draft.ts`: el límite de salida estructurada pasa de 2.300 a 7.000 tokens, tamaño de respuesta de 12 KB a 50 KB y timeout a 40 segundos; PDF con `input_file.detail="high"` conforme a documentación vigente de OpenAI. Se mantienen 25 renglones máximos, input de archivo con firma/MIME verificados y salida no confiable privada.
2. Errores clasificados como códigos cerrados sin cuerpos HTTP, prompts, PDF, montos, números ni claves: credenciales ausentes, API no autorizada, 429, 5xx, timeout, cuota, salida incompleta, esquema inválido y fallo de persistencia. No se imprime el error original ni el contenido del archivo.
3. `mvp127_document_ai_failures.sql`: tabla privada con RLS y RPC exclusivas de `service_role` para estado, código, fase y hora. `anon` y `authenticated` no pueden consultar ni escribir. Únicamente se registra sobre archivos originales ya guardados de participantes aún autorizados.
4. Si solo una de dos lecturas devuelve un resultado válido, el sistema conserva **su borrador privado**, pero no simula la segunda verificación ni publica precios. Si ambas fallan conserva el original y registra el motivo. Las comparaciones y ranking continúan requiriendo cotejo económico y de fuente independiente.
5. La función de guardado acepta hasta **40 KB de JSON validado** (antes 10 KB) para no rechazar 25 líneas documentadas con descripción/evidencia extensas. No se relajan los controles de original, autor, privacidad, moneda, extras, IVA ni flete.
6. Pruebas de mocks: respuestas mayores a 12 KB, hasta 25 líneas, PDF detalle alto, clasificación de 400/403/429/502/timeout, exclusión de mensajes privados en errores y rutas de autorización SQL.

## Límite explícito y siguiente etapa
Este cambio elimina silencios y cuellos de botella, pero **no demuestra todavía que el PDF real de Ailín haya sido extraído**. El documento actual ya había consumido la reserva original de IA; instalar la mejora no reejecuta automáticamente archivos históricos. Corresponde implementar un relector interno de archivos PRIVADOS persistidos con llave de servicio, quota real, fuente y hash exactos, control anti-doble procesamiento y auditoría; no usar reenvío del proveedor ni inventar datos.

El lector determinista actual de PDF `supplier-source-pdf.ts` admite exclusivamente PDF de una página y diseño simple sin fuentes embebidas ni tablas. Eso es una LIMITACIÓN del sistema, no error de los proveedores. Para presupuestos comerciales, hace falta una extracción determinista de texto y geometría con una librería PDF moderna, verificación de cobertura de TODOS los renglones y total, y verificación visual/humana si no se puede cotejar. Las dos lecturas de IA por sí solas no son prueba suficiente para publicar un monto.

**GO real:** recuperar del mismo original de 12.725 bytes una propuesta exacta, con renglones, precios, extras y total cotejados contra fuente, registrar oferta sin exponer contacto y visualizar en cotironda.com cuando Vercel permita desplegar la web. No declarar 100% de exactitud universal para archivos ilegibles, dañados o contradictorios: se requiere detección y vía de revisión.

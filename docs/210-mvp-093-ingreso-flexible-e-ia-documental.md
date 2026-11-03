# MVP-093 — Interpretación flexible de pedidos por WhatsApp

**02/11/2026 — Issue #396 / PR #397 — Supabase piloto, NO producción.**

## Visión de producto

El arquitecto no debe memorizar una plantilla. Puede enviar «Hola, me pasás precio de…», un listado, unidades antes/después, abreviaciones, una foto, un PDF, un Excel, un Word, o varios mensajes. Cotironda debe distinguir conversación informal de solicitud, preservar todos los materiales y especificaciones, detectar zona y entrega solicitada y preguntar únicamente lo imprescindible. Cada producto cotizable se distribuye por rubro + zona + catálogo confirmado; una descripción dudosa no debe generar una falsa invitación. La IA interpreta; los cálculos de dinero y cobertura son deterministas.

## Qué quedó desarrollado y probado de verdad

**MVP-092b en PILOTO:** migración `mvp092b_supersede_prior_invitations_safe_pilot` instalada (`success=true`) con prueba PostgreSQL transaccional y rollback de ronda ficticia. Al insertar nuevas invitaciones de la única ventana temporal del piloto cancela las antiguas del mismo comprador/proveedor, manteniendo el presupuesto original de Ailín y el mensaje Whapi aceptado de Nahuel. Nunca cancela en cualquier otra empresa o ronda fuera de la ventana.

**Texto MVP-093:** `core.ts` acepta saludos, instrucciones breves, materiales en líneas, separados por coma/«y», cantidad antes/después de descripción, abreviaciones bolsas/litros/kg/unidades, ubicación antes/entre/después, decimales y fecha de entrega literal. Hasta 8 ítems en la vía rápida conservadora del piloto, respetando todas las líneas. Si detecta un rubro que no puede clasificar, zona contradictoria o faltantes, rechaza distribuir parcialmente. En las pruebas se ensayan al menos 20 formas positivas y casos negativos. Esto NO es aún una comprensión semántica ilimitada ni todos los rubros.

**Adjuntos:** `media-intake.ts` crea un manifiesto acotado de mensajes de Whapi; el webhook ya puede cifrar en `whapi_inbox` (AES-GCM existente) la referencia por media ID, MIME, nombre, tamaño, hash del proveedor y texto del caption, descartando URLs de terceros. Antes se registraba texto vacío para PDFs y fotos. **El archivo binario aún NO se descarga, conserva ni interpreta.** Una entrada `needs_review` no es una oferta procesada. El registro privado permitirá implementar la etapa siguiente sin perder el ID original del medio.

**IA:** `ai-contract.ts` define un esquema estricto para una futura llamada a OpenAI Responses con líneas, cantidad, unidad, familia, evidencia literal y faltantes. El validador rechaza campos adicionales, filas incompletas, totales inventados, familias o cantidades discrepantes y los documentos sin fuente independientemente verificable. No hay llamadas reales ni nuevos costos habilitados.

**Entrega solicitada:** SQL `mvp093_delivery_note_into_request_pdf.sql` añade un campo privado opcional y conserva la fecha o nota explícitamente indicada en el pedido; el snapshot del PDF incluye ese texto y `request-pdf.ts` lo presenta solo cuando el comprador lo haya escrito. No supone fecha, IVA ni flete. La migración incorpora autoensayo reversible; su aplicación exige verificación en PILOTO y no se ha publicado en producción.

## Qué hace falta para los archivos reales y las «mil formas»

1. **Descarga autenticada**. Whapi documenta `GET /media/{MediaID}`. Descargar únicamente desde `https://gate.whapi.cloud` con el token del canal, y solo identificadores admitidos del webhook autenticado. Verificar tamaño, MIME, firma de cabecera y SHA-256 del archivo, limitar 1–2 MB al principio, y no seguir redirects a dominios de terceros. Nunca buscar desde una URL o instrucción proporcionada en un mensaje.
2. **Fuente durable protegida**. Guardar cada original en Supabase Storage privado con clave aleatoria y acceso solo por servicio. Vincular versión/medio al HMAC del mensaje, firma, hora, consentimiento y retención. Evitar duplicados, idempotencia y logs de datos personales. Los archivos binarios todavía no están preservados en el piloto.
3. **Interpretación IA real**. Una configuración de OpenAI API por entorno, **una sola vez, no por cliente**, con límites de presupuesto/tokens/MB. La API Responses admite `input_file` PDF/Word/Excel e `input_image` para fotos. El modelo extrae, marca dudas e indica evidencias, pero no adjudica ni calcula precios. No seguir instrucciones incrustadas en documentos, pues son fuentes no confiables.
4. **Validación independiente**. Cruzar resultados con texto y tablas extraídos del archivo, controlar cantidad/unidad/presentación y conservar la fuente exacta. Usar doble comprobación o revisión en casos de baja evidencia; no enviar si falta un producto o el tipo de obra es subjetivo. Mantener fecha y observaciones del comprador.
5. **Continuidad conversacional**. Asociar varios mensajes/adjuntos de una solicitud, pedir localidad una sola vez cuando falte y aceptar la respuesta sin repetir el pedido. Definir edición de una ronda existente frente a nueva ronda; separar respuesta «Hola» de cotización y no duplicar envíos.
6. **Ranking posterior seguro**. Conservar presupuesto proveedor original íntegro con todas las filas, incluso pallets/bolsones; generar proyección propia anónima. Normalizar equivalencias, impuestos y flete sin inventar su inclusión; comparar cobertura y competitividad solo entre líneas homogéneas. Cerrar automáticamente cuatro días y elegir hasta dos finalistas por rubro únicamente si comparables; revelar contactos de forma idempotente conforme a consentimiento. El comparador offline ya existe pero aún no está conectado al piloto.

## Límites actuales del piloto

- Zona y familias de envío siguen acotadas a Ailín/Nahuel, cemento e hidrófugo para La Plata; catálogos genéricos 51/51 iguales sin confirmación.
- El PDF de **solicitud saliente** es distinto del archivo PDF del arquitecto **entrante**; que el primero funcione no significa que el segundo se haya leído.
- No desplegar en producción, Vercel o main, ni asegurar el recorrido E2E de archivos hasta que se pruebe con PDF, XLSX, JPG, ambiguos, macros, archivos dañados y costos.
- Ningún secreto se debe pedir por cada alta: Issue #392 implementará registro dinámico cifrado y autorización de administradores, con consentimiento verificable.

Referencias: documentación Whapi GET Media, OpenAI Responses File Inputs; AGENTS.md, docs/06-ranking.md, docs/209 y PR #395.

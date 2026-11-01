# 173 — MVP-053: plazo de cotización de 3 a 7 días por WhatsApp

**01/11/2026 · Issue #319 · Rama de desarrollo, sin envíos ni instalación SQL en Supabase DEV.**

## La regla comercial aprobada
El arquitecto manda una lista de materiales por WhatsApp. Si no indica plazo de **recepción de presupuestos**, Cotironda utiliza **5 días** desde la creación de la ronda en el servidor. Puede elegir entre **3 y 7 días, inclusive**, agregando una sola línea opcional a su mensaje:

```text
20 bolsas de cemento CPC 50 kg
Entrega en: La Plata
Plazo de cotización: 7 días
```

También entiende «Plazo: 3 días» y «Plazo para cotizar: 6 días». El plazo es en **días corridos**: se computa desde el reloj del servidor, no desde un supuesto horario local del teléfono. No se pregunta al comprador por el plazo si no lo pide. **No confundir** «entrega en 3 días» (promesa logística) con «plazo de cotización». Un plazo expreso inválido, doble o contradictorio va a revisión, sin cambiarlo silenciosamente por cinco.

Si falta localidad, el sistema pregunta únicamente por la localidad y conserva el texto de origen **junto con su plazo** al recibir respuesta por WhatsApp. No pide que el arquitecto repita la lista.

## Cambios implementados
- `src/domain/plazo-cotizacion-mvp053.ts` extrae solo una línea de plazo inequívoca; conserva el resto del pedido y no altera reglas de clasificación de productos.
- D073 añade `plazoDias` a la orden privada enviada al D081, tanto en ruta directa como al reanudar una solicitud pendiente de zona.
- D081 valida `plazoDias` de 3 a 7 en TypeScript y PostgreSQL. `rounds_v1.ends_at` ahora se almacena con `clock_timestamp()+make_interval(days=>p_days)`; `begins_at` mantiene el retardo legado de 30 segundos. La duración entra en el SHA-256 de idempotencia: un replay con plazo cambiado **no** cambia el vencimiento original. Las llamadas históricas de 8 argumentos a SQL usan `DEFAULT 5` por compatibilidad; las nuevas llamadas incluyen el noveno parámetro.
- D066 obtiene del `ends_at` autorizado el `deadlineAt` UTC y el formateador D066 comunica al proveedor **fecha y hora de cierre argentinas**, sin nombres ni teléfonos. D068 admite ese campo en el paquete privado y sigue revalidando destinatario/catálogo antes de intentar enviar.
- Pruebas nuevas en Node y PostgreSQL 17 cubren 3/5/7 días, plazo omitido, rechazo de 2/8, doble plazo, suplantación, reintentos, continuación tras localidad y mensaje de comercio. **Los resultados de GitHub Actions deben verificarse en el commit final.**

## Lo que todavía NO está listo
Esto NO implementa por sí solo el cierre programado, selección real de dos finalistas o revelación mutua de contactos; esas fases siguen sin backend productivo. D039 es selección de IDs anónimos offline. La primera ronda de WhatsApp real requiere conexión Whapi, descarga/interpretación de archivos y extracción fiable de presupuestos, catálogo/zonas de comercios, workers de cotización, cierre/comparador y difusión de contactos consentida. El portal D064 anterior mantiene su plazo legado; esta modificación se concentra en **WhatsApp-first**, no en un rediseño de la web.

El control de recuperación real DEV #175 permanece pendiente. No tocar `main`, Supabase DEV/PROD, variables, DNS, Whapi ni Vercel sin autorización; no dar por probada una ronda real por superar CI sintético.

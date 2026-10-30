# 66 — Recorrido vertical local: texto del comprador → solicitudes por proveedor

**30/10/2026 · Etapa 02 · Issue #104 · rama `feat/02-text-to-supplier-plans` (hija de PR #103). Sin envío real.**

## Propósito
La decisión D013 establece que el comprador **no revisa artículo por artículo** antes de distribuir. Su acción de enviar la lista, con autorización explícita, permite procesar automáticamente. El objetivo de este PR es probar la **tubería técnica real** entre un texto de comprador y el planificador del PR #103, sin OpenAI, archivos ni WhatsApp.

## Código y responsabilidades
- `src/domain/flujo-texto.ts`: parser de texto de formato **limitado y explícito** (cantidad + unidad + descripción, o descripción - cantidad + unidad). Registra ubicación exacta por línea y nunca infiere cantidad/medida desde el nombre del producto.
- Catálogo de test/de servidor: busca igualdad conservadora de **descripción de producto confirmada + unidad**; el rubro solo se determina si es único entre productos del catálogo. No inventa rubros; sin coincidencia el artículo queda retenido.
- Reutiliza `prepararBorradorDocumental('texto',...)`: validación determinista, decimales como texto, líneas repetidas y dudas preservadas.
- Reutiliza `planificarDespachoAutomatico(...)`: filtra zona de entrega, consentimiento del proveedor, baja, catálogo confirmado, marca obligatoria y exclusión de líneas inseguras. Devuelve **un subconjunto por proveedor**, no el documento entero.
- Devuelve `lineas_no_interpretadas`, `lineas_sin_catalogo`, `lineas_con_rubro_ambiguo`, `plan.retenidas`, ubicación, cantidad de recibidas y preparadas. **Ninguna línea desconocida se elimina en silencio.**

## Ejemplo
Entrada: `20 bolsas de Cemento CPC 50 kg`, `3 unidades de Pintura látex interior 20 l`, `15 unidades de Placa yeso 12,5 mm`.
Con catálogos sintéticos separados: 3 proveedores reciben tres planes independientes y pertinentes. `1.000 bolsas` no se interpreta por ambigüedad de separador; una línea de producto no confirmado se retiene sin afectar las demás.

## Ejecución local de demostración
En la rama correspondiente, Node 22+: `npm run demo:texto`.
Genera JSON con `simulacion:true`, `no_se_envio_whatsapp:true`, resúmenes, solicitudes preparadas y motivos de retención. No requiere .env, Supabase, API externa ni número telefónico. Solo usa materiales y proveedores ficticios.

## Seguridad y pruebas exigidas
- Comprador debe autorizar distribución: sin autorización no se arma plan.
- Catálogo confirmado y consentimientos **deben cargarse de un backend confiable**, nunca de archivos o datos del cliente. En este PR están simulados por fixtures; por ello NO se permite enviar realmente.
- Límite 15.000 caracteres y 100 líneas; control de caracteres binarios. Sin precios ni contactos del comprador en mensajes.
- Variantes con números decimales y unidades explícitas; unitarias cubren 3 rubros, 100 líneas, duplicados, ambigüedad, zonas, opt-out, catálogo inconsistente y contenido hostil.
- CI de TypeScript/Next, tests PostgreSQL 17, PostgREST y regresión. Sin tocar Supabase Auth, RLS, Storage ni Vercel.

## Limitaciones y próximos incrementos
**No** lee documentos PDF/Excel/Word/imagen, **no** integra OpenAI, **no** envía WhatsApp ni encola mensajes, y la gramática texto **no** reconoce listas de cualquier formato. Los nombres comerciales deben coincidir prácticamente exactamente con el catálogo; esto evita errores pero sacrifica cobertura. Antes de usar compradores reales necesitamos extracción robusta, alias técnicos confirmados, autenticación/consentimiento en servidor, controles de archivos/AV, cola persistente, Whapi, cuotas y reintentos. No confundir este simulador offline con un piloto habilitado.

**Integración:** PR draft hijo de #103, que a su vez depende de #101. No fusionar de manera aislada ni publicar a producción.

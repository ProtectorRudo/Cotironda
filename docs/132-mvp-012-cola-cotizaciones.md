# 132 — MVP-012: cola durable de presupuestos por WhatsApp, sin fricción

**31/10/2026 · Issue [#237](https://github.com/ProtectorRudo/Cotironda/issues/237). Código SOLO en laboratorio PG17 efímero; NO hay worker instalado en nube.**

## Por qué

El MVP-011 conectaba la lectura de un mensaje cifrado con una versión de cotización, pero necesitaba que alguien invocara su función para cada mensaje. Un presupuesto de un corralón puede llegar mientras otra cotización se procesa o mientras un worker se reinicia. Queremos **recibir automáticamente sin duplicar ni perder**, manteniendo cero pasos adicionales para el proveedor.

## Implementación

1. `supabase/sql/whapi_quote_queue_d062.sql` crea una **cola privada** que se alimenta con un trigger al insertar un texto ya cifrado en el inbox D028. No modifica el inbox ni consulta la red. Almacena únicamente HMACs de canal/mensaje, IDs privados de ronda/proveedor, estados, tiempos de lease y un código de resultado **sin texto libre ni teléfonos**.
2. `whapi_claim_quote_d062()` toma **un trabajo por vez** mediante `FOR UPDATE SKIP LOCKED` y un token aleatorio de lease por 90 segundos. Los mensajes de **la misma empresa proveedora y ronda se procesan en orden de recepción en la base**; otro proveedor puede avanzar independientemente. Intentos de entregar dos veces el mismo trabajo de forma concurrente no lo duplican.
3. `whapi_finish_quote_d062(...)` acepta solo al titular vigente del token; para finalizar como «recibida» **exige que D060 ya haya escrito la evidencia del precio**. No cree en lo que diga un worker. Tras una caída entre la escritura de D060 y el ACK, un nuevo intento reaprovecha la idempotencia de D060 sin producir otra versión.
4. Si no hay un precio asignable con seguridad, el mensaje se marca como **revisión interna**, no se obliga al proveedor a confirmarlo. Baja o ronda no habilitada se descarta. Los errores transitorios reintentan con demoras de 10, 30 y 120 segundos y **máximo cuatro intentos** antes de pasar a estado `dead` para análisis interno. No hay bucles ilimitados ni gastos de IA repetidos sin tope.
5. `src/server/whapi-quote-worker-d062.ts` realiza `procesarUno()` y `procesarLote(max)` por un **puerto SQL inyectado**, consume la interfaz D061 y confirma mediante D062. **No abre conexiones, no incorpora un cron, ni habilita Whapi real**. Un futuro programador de tareas confiable llamará a esta función bajo un rol dedicado con permiso EXECUTE; nunca desde el navegador.
6. `supabase/tests/ci/117_whapi_quote_queue_d062.sql` valida en PostgreSQL17 el trigger de encolado, dos proveedores independientes, orden/correcciones, lease expirado, token anterior inválido, 4 intentos, revisión interna, opt-out, ACK sin recibo y ausencia de envío «Confirmo». `tests/unit/whapi-quote-worker-d062.test.mjs` prueba la aplicación y el manejo de errores sin datos privados.

## Seguridad y alcance

- Privilegios: roles NOLOGIN, NOINHERIT, NOBYPASSRLS; RLS en la tabla privada, permisos públicos revocados. El rol gateway puede ejecutar claim/ACK pero no leer directamente la cola, el inbox o las cotizaciones. La función trigger tiene dueño de mínimos privilegios.
- La cola **solo genera trabajos para textos**. Archivos PDF, Excel, imágenes y audio necesitan un pipeline independiente antes de llegar al mismo esquema D060. No suponer que ya están conectados.
- No resuelve los casos de cotización con precio comercial ambiguo, marcas o unidades distintas sin fuente verificable; van a revisión interna, y la oferta no se fabrica.
- El paso de **worker de nube activo** queda pendiente: credenciales backend/Secret Manager, conexión y límites, programador seguro, proceso de interpretación con OpenAI y límites de costos por cliente, monitoreo de `manual_review`/`dead` y pruebas E2E reales.
- **El respaldo y restauración auténticos de Supabase DEV (#175)** siguen bloqueando toda instalación en DEV, y tampoco se autoriza producción. No merge ni deploy.

## Criterios aceptados

Un mensaje del proveedor = una cotización si tiene precio atribuible, sin confirmación extra. Una corrección nueva = nueva versión sin borrar la anterior. Si hay un error de infraestructura, reintento acotado e idempotente. Nada de esto debe obligar a comprador o corralón a completar formularios.

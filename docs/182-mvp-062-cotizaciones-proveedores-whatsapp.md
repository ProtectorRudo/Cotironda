# 182 — MVP-062: cotización de proveedor por WhatsApp sin Confirmo

**01/11/2026 · Issue #337 · SOLO código en desarrollo y CI, no instalado ni activado.**

## Objetivo del primer piloto
En un único canal central, el arquitecto pide cemento/pintura/hidrófugo y recibe cotizaciones. La parte de comprador (MVP-059/MVP-060) y el emisor de invitaciones (MVP-061) ya están compuestos. Faltaba un ejecutor PRIVADO para que la respuesta del proveedor no quedara solamente en el inbox cifrado.

La ruta privada `POST /api/integraciones/whapi/cotizaciones` procesa hasta **2 cotizaciones por ejecución**, sin cuerpo, sin parámetros y con secreto distinto del webhook, del comprador y del emisor. Solo está diseñada para **Preview de la rama de integración** con doble flag. Nadie puede proporcionar por HTTP un precio, material, número o ID de ronda.

## Reutilización correcta
- `D062`: el inbox autenticado D028 crea una tarea, la cola respeta orden de correcciones por proveedor, lease y hasta 4 intentos.
- `D061`: lee exclusivamente el texto cifrado del remitente ligado a una ronda/catálogo activo, con snapshot privado de líneas asignadas (D065), y usa el verificador **AES-GCM/AAD D029** existente.
- `D063`: intérprete **determinista** de presupuesto textual sencillo. Reconoce una cantidad, unidad, material inequívoco y precio con `$` en **la misma línea**; no inventa IVA, marca, flete, pago ni disponibilidad.
- `D060`: registra cotización por mensaje/version y precios originales con cita SHA256, sin exigir `Confirmo`; revisiones posteriores producen versiones y no reescriben el historial. Mensaje duplicado conserva la misma versión. Las ofertas parciales se aceptan y el resto queda sin precio.
- `D062` confirma el job; si una escritura pudo hacer COMMIT y se pierde el ACK, repite idempotentemente con el mismo mensaje original y la cola detecta el ledger D060.

La nueva composición `src/server/whapi-quote-pipeline-mvp062.ts` no reinventa nada: une esos cuatro módulos con SQL limitado por puerto.

## Control técnico
- Nueva ruta `apps/portal/app/api/integraciones/whapi/cotizaciones/route.ts`; `GET/PUT`, 405; producción y no autorizados, 503/401. Sin respuesta a WhatsApp ni mensaje de confirmación.
- Tres logins `D092` (cola D062 / lectura D061 / precio D060) con `PASSWORD NULL`, `NOINHERIT`, sin derechos directos, exactamente un `SET ROLE` permitido por sesión. No hay acceso administrador, Auth o service_role.
- Postgres.js: tres sesiones reservadas distintas, `max=1`, TLS CA y verificación hostname, DB DEV referenciada explícitamente y pooler **Session 5432** (no transaction 6543). Validar todas las URLs antes de abrir conexión; terminar sesiones en éxito o error.
- Cada puerto admite **solo** sus RPC con parámetros exactos; nunca consulta texto del comprador ni escribe presupuestos de otros proveedores. El remitente se atribuye exclusivamente en el inbox autenticado, no por el endpoint HTTP.
- Credenciales futuras de Preview: `COTIRONDA_QUOTE_WORKER_ENABLED`, `COTIRONDA_QUOTE_WORKER_PILOT_AUTHORIZED`, `COTIRONDA_QUOTE_WORKER_DB_DRIVER_ENABLED`, `COTIRONDA_QUOTE_WORKER_DB_PROJECT_REF`, `COTIRONDA_QUOTE_WORKER_DB_ROOT_CA_PEM`, `COTIRONDA_QUOTE_DB_URL_QUEUE`, `COTIRONDA_QUOTE_DB_URL_READ`, `COTIRONDA_QUOTE_DB_URL_WRITE`, `COTIRONDA_QUOTE_WORKER_SECRET`. Las claves de cifrado `COTIRONDA_WHAPI_*` son comunes al broker receptor, deben estar en el gestor de secretos y no en GitHub/chat.

## Pruebas de aceptación
`tests/unit/mvp062-whapi-quote-pipeline.test.mjs`: mensaje cifrado AES-GCM real (pero sintético), extracción de precio de cemento, IVA sin informar, ledger con evidencia y recibo; replay, material equivocado, dos precios ambiguos, mensaje sin precio, BAJA, lectura adulterada, caída de DB, HTTP bloqueado, procesamiento limitado y cierre. SQL PG17 `139_whapi_quote_worker_logins_d092.sql` verifica los 3 roles y grants, `Next` compila.

## Limitación comercial explícita
Este circuito **todavía no soporta respuestas complejas en texto libre, fotos de presupuestos, PDF, Excel o Word**, ni interpreta reemplazos de marca/presentación en cotizaciones reales: eso requiere la IA documental y pruebas con archivos/ejemplos del corralón. No vamos a confundir una respuesta ambigua con cotización efectiva ni a mostrar comparaciones falsas. Si algo no es atribuible, estado revisión interna; no se molesta al corralón con confirmaciones.

**Todavía pendientes del piloto de cuatro números:** #175 backup/restauración real y SQL comercial en DEV aislado; contactos/catálogos con consentimiento; Whapi real y acceso webhook; scheduler del comprador, sender y cotizador; extracción IA de archivos y ofertas; ranking verificable + finalistas y contactos al cierre. No desplegar a producción sin `Publicalo`.

**Ninguna modificación remota Supabase DEV, Whapi ni Vercel; ningún WhatsApp real enviado.**

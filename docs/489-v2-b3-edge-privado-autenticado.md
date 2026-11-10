# Acta 489 — V2 B3: función interna autenticada para relectura privada

**Fecha:** 10/11/2026. **Estado:** desarrollo, **NO desplegado**. Autorización: «Luz verde». Se apoya en [Acta 488](488-v2-b2-archivo-privado-versionado.md), [ADR 486](486-adr-motor-presupuestos-v2.md), PR #763 y seguimiento Issue #759/#760.

## Qué conecta esta etapa

El B2 anterior ya permite, desde un trabajador privado, reclamar una fuente revisada, descargar su original desde Storage privado, comprobar tamaño y SHA, leerlo con V2 y guardar un **borrador no verificado** en una tabla privada. Pero B2 no tenía una ruta HTTP autenticada para invocarse en Edge.

**B3 añade un Edge independiente `cotironda-piloto-v2-shadow`**, con una capa de handler puro testeable y un adapter a `@supabase/supabase-js@2.118.0`. No modifica el Edge `cotironda-piloto-auto-recovery`, `cotironda-piloto-document-recovery`, el cron existente, Whapi ni el sitio del comprador. **La creación del código en GitHub NO es un despliegue.**

## Defensa en profundidad

- **Dos interruptores:** variable privada del Edge `COTIRONDA_PILOT_V2_SHADOW_ENABLED` EXACTAMENTE `true` Y tabla `cotironda_piloto_privado.v2_shadow_settings.enabled=true`. Ambos quedan apagados por defecto. B3 no puede activarlos.
- **Autenticación:** reutiliza `authorizeRecoveryMvp294`, ya probado: se requieren el encabezado `x-cotironda-recovery-secret` con el secreto de recuperación existente Y una credencial de servicio del proyecto. Vía moderna: `apikey: sb_secret_...` **sin** `Authorization`; vía heredada: `Authorization: Bearer <JWT service_role>` **sin** `apikey`. Rechaza usuarios comunes, `anon`, keys publishable, y combinaciones de dos tipos. **No se crea ni se reemplaza ningún secreto.**
- **Seguridad HTTP:** solo POST, sin cuerpo ni parámetros; no se acepta HMAC, identificador de ronda, nombre de proveedor, instrucciones ni límite de lote de clientes. El SQL privado elige una sola fuente autorizada por ejecución. Las respuestas contienen solo un estado genérico; jamás texto, precio, HMAC, teléfono, token o error de API.
- **Proyecto exacto:** se verifica `SUPABASE_URL` del piloto y clave de servicio en entorno servidor; API key OpenAI solo se usa desde backend y `store:false` en lector. Credenciales nunca se exponen al navegador, GitHub ni logs.
- **Endpoint:** `supabase/functions/cotironda-piloto-v2-shadow/index.ts` llama al handler y éste al B2. Todo acceso a la base ocurre mediante cliente service_role interno con RLS/grants preparados. El resultado exige `outboundMessages=0` y `publishedOffers=0` incluso si cambiara accidentalmente el contrato del worker.
- **Configuración:** `supabase/config.toml` declara `verify_jwt=false` por compatibilidad con `sb_secret_` (no es JWT). Esto **NO significa público**: el handler aplica su propia doble autenticación y flag de entorno, igual que el worker histórico.

## Qué NO hace

No dispara un cron nuevo, no envía WhatsApps, no asocia rondas, no publica precios ni ofertas anónimas, no revela proveedores o teléfonos, no realiza ranking ni adjudicación. No se descargaron archivos reales ni se cobró una consulta IA real durante la prueba. La salida `candidate_private` significa únicamente que el documento **se transcribió y quedó guardado en revisión privada**, nunca que los importes sean correctos.

## Criterios de aceptación

1. Node: POST válido con doble autenticación moderna y heredada funciona; falsos JWT, navegador, solo una credencial, mezcla de formatos, GET/HEAD/PUT/DELETE, cuerpo o query son rechazados sin invocar cliente ni modelo.
2. Node: flag OFF, proyecto equivocado, OpenAI key ausente, SQL deshabilitado, fallo de red/RPC, respuesta anómala o publicación/salida distinta de cero deben detenerse con respuesta neutra y sin fuga de secretos.
3. Deno: compilación/tipado del **bundle completo** Edge, incluyendo la importación de módulos V2 y supabase-js fijado.
4. PG17: corrida con datos sintéticos y ROLLBACK del ledger B2: flag OFF por defecto, RLS, autorización, SHA/version/duplicado, no mutación del historial MVP292.
5. Regresión general: tests antiguos Whapi, seguimiento, Next.js, seguridad sin cambios funcionales.

## Plan de salida al PILOTO (requiere «Publicalo», NO ejecutar con «Luz verde»)

1. Preflight de la pila de PR #761 → #762 → #763 → B3, auditoría de módulos/versiones, permisos y validación del entorno exacto `cotironda-piloto`.
2. Aplicar migración B2 **con flag SQL apagado**, desplegar función B3 **con flag de entorno apagado**, sin tocar cron ni worker MVP292.
3. Verificar que una llamada sin credenciales da 401 solamente si el flag está encendido; con flag OFF debe responder `shadow_disabled` (503). Nunca mostrar la clave ni pegarla en un chat.
4. Probar autorización de doble factor y un tick controlado **solo cuando los dos flags estén habilitados expresamente**, con evidencia de lectura del SHA y registro privado de la candidata. No repetir al segundo archivo hasta comprobar exactamente cuál fue el resultado del primero.
5. Auditar el resultado contra el original PDF por artículo, cantidad y precio antes de cualquier proyección de seguimiento. Sin auditor de fuente V2 no declarar una oferta publicada ni un ranking completo.
6. Ante cualquier fallo, apagar flags y conservar ledger y originales; no resetear leases ni reactivar el cron de recuperación viejo. No hacer cambios en producción.

## Pendientes reales tras B3

- Prueba de los **dos PDF archivados** con el lector V2 real; solo puede realizarse tras una publicación autorizada y segura del worker. Los archivos ya están conservados; no pedir reenvío a proveedores.
- Auditoría independiente de la fuente por renglón, lectura determinista completa Excel y conciliación precio de lista/efectivo, descuentos, flete, IVA y moneda, sin inventar datos.
- Asociación comercial de ronda inequívoca y proyección anónima de líneas verificadas al comprador; cierre con revelación según reglas. No es E2E todavía.

**Reglas:** «Luz verde» = desarrollo/CI, sin merge obligatorio ni publicación. «Publicalo» = despliegue del piloto autorizado, con preflight y pruebas reales. Nunca confundir un HTTP 200, una candidata privada o un programa sintético con un presupuesto acreditado.
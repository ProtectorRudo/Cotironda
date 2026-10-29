# 46 — Adaptador ClamAV para worker aislado (sin activar cargas)

**29/10/2026 · Issue #64 · PR #65 en borrador, sobre PR #63.**

## Objetivo
Cotironda debe inspeccionar documentos antes de marcarlos como aprobados. La cuarentena y el ledger ya existen sólo en `cotironda-dev` (migración 11), pero **no hay escáner instalado, worker ejecutándose, ruta HTTP, enlaces de subida, cuota validada ni promoción habilitada**.

Este PR prepara una pieza comprobable del backend: un **adaptador Node.js para ClamAV clamd**, no un antivirus desplegado ni un documento aprobado.

## Decisión técnica
- Preferimos **socket Unix local** en un contenedor/worker dedicado. El protocolo TCP de clamd no trae cifrado ni autenticación, por lo que no debe exponerse a internet ni conectarse directamente desde Vercel sin red privada adicional.
- Protocolo oficial `zINSTREAM\0`: enviar el documento en fragmentos de 64 KiB, anteponer a cada fragmento un entero de 32 bits **big-endian** con su longitud; terminar con un fragmento de tamaño 0. No se envían rutas del filesystem, archivos adjuntos de usuarios ni nombres.
- Máximo 10 MiB por documento; timeout de inactividad y **deadline absoluto** entre 100 ms y 30 s; máximo 1024 bytes de respuesta. Un archivo vacío, grande, malformado o una respuesta incierta se rechaza.
- Sólo `stream: OK` completo se interpreta como `clean`; `stream: <firma> FOUND` se interpreta como `malicious` **sin devolver ni registrar la firma**. Socket ausente, `ERROR`, timeout, desconexión, respuesta parcial/ambigua o texto adicional: `analisis_no_disponible`.
- `src/server/documentos/inspeccion.ts`: valida firma y ZIP conservador del formato declarado mediante el validador existente; exige escaneo positivo; únicamente después devuelve ruta canónica, MIME, longitud y SHA-256 de los **bytes recibidos**. No modifica Postgres ni Storage.

## Pruebas y límites de evidencia
`tests/unit/clamav-adapter.test.mjs` levanta **un servidor real de socket Unix dentro del proceso de CI** que simula clamd. Prueba: framing, varias partes, veredicto limpio, malware ficticio, hash SHA-256, MIME falsificado, socket ausente, rutas inválidas, límites de bytes, error de antivirus, respuesta ambigua, parcial, sobredimensionada y deadline. Los tests no contienen datos comerciales.

**Importante: el daemon utilizado en CI es FICTICIO.** No equivale a ClamAV real con firmas actualizadas ni a probar virus genuinos. No ejecutar un servicio de antivirus en producción con solo estas pruebas.

## Integración pendiente (Issue #61)
1. Seleccionar y desplegar contenedor/worker con `clamd` real y actualizaciones de firmas `freshclam`, sin socket accesible desde Internet; versionar imagen, comprobar recursos, monitorizar salud y firma fresca. Validar licencias y costos del hosting.
2. Confirmar `StreamMaxLength` igual o superior a 10 MiB, y límites de clamd para compresión, archivos anidados, tiempo máximo de análisis, concurrencia, memoria y CPU. Rechazar cifrado, bombas ZIP y contenido PDF activo mediante parsing aislado adicional cuando corresponda.
3. Un servidor admite el trabajo tras **autorización firmada y cuota atómica**; una transferencia privada coloca el archivo en cuarentena. El worker lo descarga, valida, escanea y calcula SHA-256; sólo procesos autorizados escriben estados de ledger y promocionan al bucket final.
4. Implementar limpieza de temporales/huérfanos, retención, logs sin PII, reintentos acotados, deduplicación, métricas de gastos y backup/restauración.
5. Probar con el motor real y archivo de ensayo EICAR en un entorno cerrado; probar falso MIME, archivo grande, truncado, scanner offline y concurrentes. Evitar activar archivos comerciales hasta pasar el E2E.
6. Signed upload URLs de Supabase son válidas durante dos horas y Vercel Functions limita el cuerpo a 4,5 MB. No utilizar Vercel para proxy de un archivo de 10 MiB ni emitir links firmados sin controlar riesgo y ciclo de vida.

**Seguridad activa:** ninguna política INSERT en `cotironda-buyer-drafts`; cuarentena sin políticas de usuario; ledger sólo accesible a proceso interno. Este PR **no cambia Supabase ni crea rutas, buckets o permisos nuevos**.

## Referencias
- [ClamAV: Clamd Protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Vercel: payload 4,5 MB](https://vercel.com/docs/errors/function_payload_too_large)
- [Supabase: signed upload URL](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
- [Issue #64](https://github.com/ProtectorRudo/Cotironda/issues/64)
- [PR #65](https://github.com/ProtectorRudo/Cotironda/pull/65)

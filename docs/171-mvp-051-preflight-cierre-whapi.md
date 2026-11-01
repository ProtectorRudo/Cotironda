# 171 — MVP-051: rechazos baratos antes de PostgreSQL + cierre del puerto Whapi

**01/11/2026 · Issue #315 · Sólo rama de desarrollo. Sin conexión Whapi real.**

## Hallazgo y corrección mínima
La ruta Preview D083 ya rechazaba métodos no POST, banderas apagadas y un encabezado secreto incorrecto antes de abrir SQL. Pero el procesamiento D027 revisaba `Content-Type` y `Content-Length` después de pedir el puerto privado. Para entradas sin JSON o con tamaño declarado mayor a 64 KiB esto consumía conexiones innecesarias.

D083 ahora replica **solamente** las dos comprobaciones baratas de cabeceras de D027 **después de autenticar el encabezado y antes de SQL**:
- Tipo distinto de `application/json` => 415 sin conexión.
- Longitud HTTP no numérica o mayor a 65.536 bytes => 413 sin conexión.

D027 continúa siendo la autoridad sobre el contenido y el límite real de 64 KiB: un encabezado ausente o falseado **no** permite superar la lectura acotada, aunque en ese caso aún puede abrirse temporalmente el puerto antes de que D027 lo rechace.

## Ciclo de vida de conexión
El puerto `PuertoPostgresD030` admite `cerrar?():Promise<void>`. En `finally`, D083 lo llama **una vez** en respuestas aceptadas, fallos SQL y puertos inválidos, sin propagar detalles al webhook. El futuro adaptador de PostgreSQL debe proporcionar **release de una conexión prestada**, no cerrar el pool compartido. Si un mensaje ya se persistió exitosamente, un error al liberar el puerto no transforma el 200 en 503: ello podría provocar reenvío innecesario desde Whapi. La deduplicación real sigue en D074/D082.

Este contrato opcional es compatible con los tests históricos que inyectan un puerto sin cierre. No se instaló `pg`, no se abrió DB, no se añadió ni alteró una variable de entorno o permiso.

## Pruebas y límites
`tests/unit/mvp048-whapi-http-preview.test.mjs` incluye pruebas para metadatos rechazados sin abrir SQL, JSON válido, cierre tras aceptación y error SQL, puerto inválido y error de cierre oculto al cliente. GitHub Actions es la fuente de los resultados reales; nunca declarar PASS antes de verificar la ejecución del commit.

**Bloqueante vigente:** #175 (backup y restore auténtico DEV); D024–D084 no instalados, sin credenciales de login técnico, sin Whapi real, sin worker activo, sin mensajes, sin dominio ni producción. El MVP-051 **no habilita el piloto**.

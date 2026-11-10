# Acta 483 — MVP347: proyección anónima de revisión PDF comprobada

**Fecha:** 10/11/2026. **Estado:** desarrollo, sin aplicación a piloto. **Base:** MVP346 PR #756, MVP345 #755, MVP344 #754, MVP343 #752 y MVP336 #742. **Prioridad:** Issue #750.

## Problema

MVP346 guardaba en privado la segunda lectura de un PDF cuando la primera confundía precios. La transcripción inmutable de la primera lectura no podía pasar MVP102 y el seguimiento del arquitecto solo consultaba proyecciones económicas antiguas, por lo que esa interpretación corregida nunca se hacía visible.

## Nueva ruta versionada

1. MVP292 obtiene de nuevo el original desde Storage privado, verifica SHA-256 y usa la lectura independiente existente. No envía WhatsApps ni solicita al proveedor que reenvíe.
2. MVP346 coteja mismas descripciones, cantidades y unidades; verifica centavos, sumas y todas las cifras/condiciones del PDF mediante un lector independiente; almacena la primera lectura y la nueva candidata sin actualizar los datos fuente.
3. **MVP347** verifica otra vez el SHA binario, aritmética y cobertura completa, y llama únicamente al publicador RPC interno. Esta función vuelve a comprobar en PostgreSQL la integridad de la candidata, los permisos de buyer/supplier, invitación vigente, hash, estado de la ronda, suma exacta y privacidad de todas las líneas y aclaraciones.
4. Si las barreras aprueban, se crea una sola proyección **anónima, inmutable y sin ranking** en `anonymous_supplier_revisions_mvp347`. Se guarda la huella de la candidata y la referencia del archivo original; jamás se sobrescriben las propuestas ni verificaciones históricas. Los estados del worker reflejan publicación real solo si la RPC lo confirma.
5. Un overlay SQL, producido a partir de la definición **consultada en vivo y solo lectura** de `cotironda_piloto_tracking_status_mvp091`, agrega estas proyecciones al seguimiento. Conserva autenticación mediante token privado, ocultamiento ante cancelación, selección de la última cotización por proveedor, anonimato, numeración estable, sin filtraciones ni duplicados. Evita contar la revisión publicada como archivo pendiente. El despliegue abortará si cambió la huella SQL de la función original (baseline `b06e282511a1f53a8e69b3d35e2f3cd6a7a9fe3b0fb2bbd4249fb94670aef9de`).
6. La interfaz Vercel/Edge existente no cambia; sigue leyendo la función de seguimiento y mostrando solamente `offers` que ya superaron revisión.

## Casos de prueba

- Candidato válido: la suma exacta y las citas PDF coinciden y la RPC confirma `published_anonymous`; el worker declara `published_private` sin ejecutar el pipeline antiguo de la transcripción errónea.
- Candidato no balanceado, PDF modificado, falta de cobertura, RPC incierta o privacidad rechazada: no hay oferta, se conserva revisión o conciliación.
- PostgreSQL 17 sintético con ROLLBACK: idempotencia, primer intento inválido, candidata legítima, original intacto, huellas, nota con teléfono denegada, candidato corrupto rechazado y permisos anon/auth denegados.
- Regresión general Node, Deno, privacidad y tracking.

## Riesgos y límites

La segunda lectura puede seguir siendo igual de errónea: entonces ninguna candidata pasa. No afirmar que el PDF real de Ailín ya esté solucionado ni que la ronda haya recibido ofertas. Un PDF con estructura/condiciones no atribuibles no se puede publicar silenciosamente.

El overlay de seguimiento se generó de una función real y requiere **comparación de huella previa a cualquier despliegue**. Cambios en funciones o reglas intermedias exigen rehacer el candidato, no quitar el guard.

No altera reglas de IVA, flete, selección, ranking ni contactos. No revela al comprador, y proveedores solo se identifican según reglas de cierre.

**Despliegue**: `Luz verde` autoriza desarrollo, pruebas y documentación. SQL + Edge + recuperación de archivo únicamente con `Publicalo`, preflight real y orden de dependencias verificado.

## Entrega pendiente

1. Pruebas de pipeline y tracking PG17 verde.
2. Contrastar bundles de Edge activos antes de publicarlos.
3. Ejecutar recuperación real de una sola vez y verificar precios originales, publicación anónima y luego Nahuel/cierre, con autorización expresa.


## Evidencia de pruebas y preflight (10/11/2026)

- **Node general:** 3.527 casos, **3.517 aprobados, cero fallidos y 10 omitidos** en GitHub Actions.
- **CI específico MVP347:** Node sintético, Deno y PostgreSQL 17 con ROLLBACK **aprobados**. Los dos ensayos PG17 verifican publicación desde candidata, precio corregido, original inmutable, idempotencia, bloqueo de teléfono/caracteres de control, autorización por token, anonimato estable, última fuente, revocación y cancelación.
- **CI complementario:** Deno webhook, PostgreSQL aislamiento, PostgREST, cobertura de sitio y MVP344 aprobados; compilación Next.js todavía en progreso a la hora del corte.
- **Piloto Supabase, solo lectura:** webhook Whapi v75 ACTIVE, auto-recovery v10 ACTIVE, seguimiento v29 ACTIVE. La tabla candidata MVP346 y la tabla publicada MVP347 no existen en el piloto; tampoco se encontró la tabla de retry MVP336 con el nombre probado. No se han escrito datos, desplegado funciones, usado OpenAI real ni enviado WhatsApps.
- **Vercel:** los estados externos devuelven error de límite de builds del plan. No es evidencia de falla del código Next.js.
- **Realidad comercial:** el archivo de Ailín no fue recuperado en vivo por esta PR; siguen pendientes comprobar precios reales, publicación en el enlace del arquitecto, la respuesta de Nahuel y el cierre.

El orden de despliegue debe verificarse contra los bundles reales: migración y correlador MVP336, módulo MVP346 y su tabla, módulo/publicación/seguimiento MVP347, worker authenticated, luego un solo tick de reintento con registro de SHA y cotización verificable. Si la huella de seguimiento no coincide, detener antes de actualizar SQL. Requiere autorización aparte **Publicalo** y plan de rollback sin romper respuestas de proveedores ya invitados.

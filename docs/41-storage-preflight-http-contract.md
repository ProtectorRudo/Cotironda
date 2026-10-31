# 41 — Contrato de carga/descarga segura de borradores (preflight y SDK)

**29/10/2026 · Etapa 01 · PR #54 en borrador hijo de #52 · Sin publicación.**

## Contexto y límite
El bucket `cotironda-buyer-drafts` fue aplicado **sólo en Supabase dev** con RLS por empresa. Todavía hay **0 organizaciones y 0 objetos**: no existe un usuario Auth real con empresa para un E2E de subida y descarga autorizada. Esta entrega prepara la ruta de carga, **no habilita interfaz, no crea usuarios/empresas ni prueba archivos comerciales reales**.

## Validación determinista anterior a la red
`src/domain/borradores-storage.ts` ofrece `prepararBorrador` y `rutaBorrador`:

- Se requiere Blob no vacío, máximo **10 MiB** y MIME de la lista permitida en el bucket de Storage; se deriva una extensión canónica a partir del MIME y de los bytes, **nunca del nombre original**.
- PDF: comienza con `%PDF-`; JPG: `FF D8 FF`; PNG: firma de 8 bytes; WebP: marcador RIFF y WEBP. Estos chequeos reconocen contenedores, no garantizan contenido benigno.
- DOCX/XLSX: se inspecciona el **directorio central de ZIP clásico**. Se requiere `[Content_Types].xml` y `word/document.xml` o `xl/workbook.xml`, se rechazan ZIP con cifrado, ZIP64, rutas peligrosas o entradas repetidas, marcadores explícitos de macros/cifrado y paquetes con descompresión declarada desproporcionada. El parser evita descomprimir datos. Los documentos Office legítimos de ciertas variantes de ZIP aún pueden requerir adecuación; **no certificar compatibilidad universal sin corpus realista**.
- Ruta generada exclusivamente como `<uuid-empresa>/requests/<uuid-solicitud>/<uuid-archivo>.<ext>`, solo UUID minúsculos y extensiones autorizadas. La ruta es entrada de Storage, **la autorización de cada empresa sigue dependiendo de RLS**.
- Errores acotados, sin devolver datos sensibles, tokens ni contenido de archivo.

## Adaptador del SDK
`apps/portal/lib/storage/borradores.ts` usa `@supabase/supabase-js` real para:
- Cargar mediante `storage.from('cotironda-buyer-drafts').upload(..., {contentType,upsert:false,cacheControl:'0'})`. Nunca guardar en un bucket público, nunca reemplazar un objeto existente.
- Descargar mediante `download` autenticado por el cliente que recibió; no se emiten URLs públicas ni enlaces firmados.
- Traducir errores Storage a mensajes sin detalles internos.

Este adaptador **no está conectado a ninguna pantalla** y nunca crea privilegios elevados ni recibe una clave `service_role`. El usuario autenticado debe ser autorizado según la membresía SQL. En el futuro el servidor deberá comprobar sesión vigente, permisos y antimalware antes de publicar un documento para licitación.

## Tests
- `tests/unit/borradores-storage.test.mjs`: pruebas de los 6 MIME, firmas, nombres hostiles, paths maliciosos, MIME falsificado, payload vacío/grande, estructura ZIP, macros, cifrado, truncado y entradas repetidas.
- `apps/portal/scripts/storage-http-contract.mjs`: SDK **real** con `fetch` **totalmente ficticio**; exige POST a Storage con `FormData` de PDF y `x-upsert != true`, descarga autenticada, bloqueo 403 al pedir rutas de otro cliente, y que archivos inválidos no generen ningún HTTP. Todas las identidades, tokens, URLs y respuestas son inventadas.
- CI: se agregó el contrato Storage al job de Next, antes de `typecheck` y build. Se conservan los tests 94 de RLS PostgreSQL por empresa y la reconstrucción de 8 migraciones.

Durante el desarrollo, las primeras pruebas fallaron por suposiciones de ejecución, **no por cambios productivos**: Node 22 `strip-types` no admite propiedades de constructor TypeScript abreviadas y el SDK arma `FormData` con un nombre de campo que no debe asumirse (`content-type` multipart también lo fija el transporte). Se corrigieron los tests basados en las peticiones reales del SDK.

## Pendientes antes de activar uploads comerciales
1. Validar positivamente la **API real de Supabase Storage por HTTP** con una empresa de ensayo autorizada en un entorno aislado. Esto requiere registrar una empresa de ensayo con flujo oficial o fixture controlado y comprobar anónimo, A/B, suspendido, MIME y límite real.
2. Implementar revisión segura de contenido con antivirus/escáner, descompresión y sandbox con límites. El preflight de bytes no certifica que los archivos sean seguros.
3. Definir retención/borrado y evidencia de backup/restauración; control de costos por empresa, hashes y registro de actividad.
4. Comprobar cierre de sesión y revocación para rutas de descarga sensibles. Las RLS basadas en `auth.uid()` pueden seguir aceptando access tokens válidos hasta su expiración aun después de signOut.
5. Definir acceso de proveedores, documentos de ofertas anónimas, consentimiento y eliminación segura en etapa de licitaciones: **no reutilizar** el bucket de borradores privados del comprador.

**No se modificaron DNS de Hostinger, Vercel Production, `main`, Supabase Auth ni registro comercial.** 

Seguimiento: [Issue #53](https://github.com/ProtectorRudo/Cotironda/issues/53) y [PR #54](https://github.com/ProtectorRudo/Cotironda/pull/54).

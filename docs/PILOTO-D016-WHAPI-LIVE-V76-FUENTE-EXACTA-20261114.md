# Cotironda D016 — Puente WhatsApp: baseline REAL v76, sin reemplazo inseguro

**Fecha de control:** 14/11/2026. **Alcance:** GitHub candidato offline; **NO** se publicó webhook ni se envió WhatsApp.

## Hallazgo bloqueante real

Supabase `cotironda-piloto` sirve actualmente Edge `cotironda-piloto-whapi` **versión 76**, `verify_jwt=false`, **61 módulos**. El archivo `index.ts` realmente desplegado **NO coincide byte a byte** con `index.ts` de la rama GitHub [PR #837](https://github.com/ProtectorRudo/Cotironda/pull/837).

- Fuente exacta activa: 97.198 caracteres; **SHA-256 del index.ts** `349831d3be81d0da95ba0cc3b699256521e35d4b7c0f1923e3dc2a6a714d0c7d`.
- Huella `ezbr_sha256` del bundle activo: `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e`.
- Archivo GitHub: 97.505 caracteres; **16 bloques diferentes** al compararlo línea por línea. Afectan import de correlación de proveedores (`mvp336` frente a `mvp291`), diagnóstico de webhook, comando de prueba de conectividad y compuerta de liberación de pedido. **No reemplazar el webhook por un candidato generado desde la rama GitHub**: podría revertir comportamientos de V1 que siguen atendiendo mensajes.
- El generador `scripts/piloto/v2-d016-whapi-overlay.mjs` original se ejecutaba sobre GitHub con un manifest histórico v70/MVP332, aunque su CI decía `v76 verificado`. El hecho de pasar pruebas no implica que sea el snapshot v76.

## Corrección acotada

En rama separada sobre **SHA exacto f98527c... sin editar PR #837**:

1. Se añade `verificarBaseWhapiV76`: exige **SHA256 exacto del index.ts real v76** y presencia de anclas D016, fail-closed por cualquier deriva.
2. Nuevo modo opcional `--live-v76-source /ruta/privada/index.ts --write-live-v76-candidate`. Genera archivo **local no versionado** `index.v2-d016-live-v76-candidate.ts`, no despliega. El modo anterior de CI queda separado y rotulado explícitamente como **fuente GitHub, NO activa**.
3. El candidato live exige módulo `referencia-pedido-v2.ts` y `buyer-whatsapp-entry-d016.ts` adicionales a la **misma colección de 61 fuentes actualmente desplegadas**; no mezclar otros 61 ficheros de ramas antiguas.
4. Tests Node negativos para fuente vieja, fuente truncada, falta de origen y mezcla de modos; CI D016 los ejecuta. Positivo de identidad: se volvió a consultar el Edge activo y la huella de fuente calculada coincide con el pin; siete anclas de edición necesarias se hallaron **únicas** en el archivo real.
5. Ningún cambio a `supabase/functions/cotironda-piloto-whapi/index.ts`, ni Supabase Edge v76 ni Vercel UI f985. No HMAC en GitHub, no copiar secrets a PG o navegador.

## Mejora comprobable: pin del bundle completo v76

- Se recuperaron **los 61 contenidos exactos** de la función Supabase Edge v76 mediante lectura autorizada, sin desplegar ni acceder a secretos. Se calculó SHA-256 por archivo y se guardaron **solo 61 nombres/rutas y 61 huellas** en `scripts/piloto/v2-d016-whapi-live-v76-bundle-manifest.json` (no se copiaron contenidos reales al repositorio). Se comprobaron `edge_version=76`, proyecto y `ezbr_sha256` del bundle activo, así como SHA del índice.
- El generador `verificarBundleWhapiV76(snapshotRoot)` ahora exige **los 61 archivos exactos** del snapshot local antes de crear un candidato D016. No basta con tener un `index.ts` correcto mezclado con importaciones de otra rama. Rechaza ruta que escapa de la carpeta, archivos ausentes/alterados, repetidos, diferencias de SHA o manifest diferente. El modo anterior de pruebas sintéticas sigue, **pero está identificado como NO LIVE**.
- El comando `--live-v76-source /ruta/snapshot/supabase/functions/cotironda-piloto-whapi/index.ts --write-live-v76-candidate` verifica primero SHA de índice y luego SHA **de cada archivo** contra el manifiesto. Si no está el snapshot completo, **falla de forma cerrada**. La copia generada nunca se despliega automáticamente.
- CI añade pruebas de 61 paths únicos, hash de índice, tolerancia cero a la fuente GitHub vieja, negativa de snapshot ausente y ausencia de candidatos escritos tras un rechazo. Esto es un paso para reproducir un paquete seguro, **no** sustituye las pruebas Deno de todo el bundle final ni la verificación real de mensaje WhatsApp.

## Prueba nueva sobre fuentes realmente activas (14/11)

**HALLAZGO:** comparación byte a byte de **los 61 archivos** del Edge v76 activo con la rama D016: **59 idénticos**, **solo 2 divergentes**: `index.ts` (16 bloques) y `supplier-auto-correlation-mvp336.ts` (3 bloques). No se modifica ninguno de los otros 59.

**CAMBIO mínimo:** `scripts/piloto/v2-d016-whapi-v76-two-file-patch.json` guarda solo las diferencias de líneas entre la rama y el snapshot real de esos 2 archivos. `scripts/piloto/v2-d016-rebuild-live-v76.mjs` reconstruye el checkout efímero de GitHub Actions únicamente si el SHA256 de **todos los 61 archivos** coincide con el manifiesto derivado de Supabase Edge; falla por archivo faltante, diferencia de contenido, hunk alterado, proyecto/bundle inesperado o ejecución de escritura fuera de GitHub Actions. No conecta a red ni cambia Whapi. Tras la validación, el generador D016 usa **la fuente de v76 realmente instalada** y agrega sus dos módulos, no la variante antigua de GitHub. El workflow limpia los archivos temporales.

**PRUEBA D016 GH Actions:** reconstrucción 59 + 2, `verificarBundleWhapiV76` 61/61, generación de candidato D016 sobre v76 y **`deno check` del candidato real con 63 dependencias**: **SUCCESS** en [run 43588912163](https://github.com/ProtectorRudo/Cotironda/actions/runs/43588912163), HEAD `c75b82cebc5716fcda225b68d991799cc794dfa1`. Este éxito es prueba de compilación y estructura real, **NO** demuestra entrega de mensajes, autenticación HTTP, sesión del navegador, consentimiento ni E2E. No desplegar el webhook sobre producción ni piloto por este cambio.

## Pendiente para publicación COMERCIAL

**No desplegar Webhook v76 con este PR.** Primero: publicar UI **f985** en Preview SSO (Vercel HTTP402, reintento único autorizado 14/11 17:07 ART), verificar secret server-side y sesión, conservar la reconstrucción **ya probada por Deno del bundle live v76 + dos módulos** (revalidar hashes ante cualquier versión Edge nueva), y ejecutar pruebas reales de envío sin duplicados con bandera OFF; coordinar HMAC D016 segura en el gestor de secretos de Edge y la misma del portal. El envío D016 debe quedar OFF hasta consentimiento/prospectividad, referencia de ronda, idempotencia y prueba con comprador; no duplicar MVP289. Proveedores todavía tienen **0 consentimientos específicos de originales**, no publicar documentos ni contacto. Nunca tocar producción.

Ver [Estado](https://github.com/ProtectorRudo/Cotironda/blob/docs/cotironda-v2-unica-direccion-20261112/docs/PILOTO-100-ESTADO.md) y [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

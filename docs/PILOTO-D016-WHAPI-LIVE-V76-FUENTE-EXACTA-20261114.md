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

## Pendiente para publicación COMERCIAL

**No desplegar Webhook v76 con este PR.** Primero: publicar UI **f985** en Preview SSO (Vercel HTTP402, reintento único autorizado 14/11 17:07 ART), verificar secret server-side y sesión, preparar exactamente el **bundle live v76 + dos módulos** y probar Deno contra esas mismas fuentes; coordinar HMAC D016 segura en el gestor de secretos de Edge y la misma del portal. El envío D016 debe quedar OFF hasta consentimiento/prospectividad, referencia de ronda, idempotencia y prueba con comprador; no duplicar MVP289. Proveedores todavía tienen **0 consentimientos específicos de originales**, no publicar documentos ni contacto. Nunca tocar producción.

Ver [Estado](https://github.com/ProtectorRudo/Cotironda/blob/docs/cotironda-v2-unica-direccion-20261112/docs/PILOTO-100-ESTADO.md) y [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

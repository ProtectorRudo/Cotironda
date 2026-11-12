# Cotironda V2-09 — descarga fiel al formato recibido

Fecha: 12/11/2026. **Alcance: desarrollo sin publicación**. Rama basada en V2-08, PR #829 (SHA `70b9ede8`).

## Problema detectado en el código de V2

La descarga protegida en servidor ya devuelve `Content-Type` real y `Content-Disposition` seguro según el MIME original. Pero la pantalla del arquitecto calculaba la extensión a partir de una etiqueta de catálogo:
- `Word` → siempre `.docx`, incluso cuando el presupuesto recibido era `.doc`.
- `Excel` → siempre `.xlsx`, incluso cuando era `.xls`.

Los bytes no se modificaban, pero el archivo entregado al comprador quedaba etiquetado con una extensión incompatible. El error es funcional, no una vulnerabilidad verificada.

## Cambio acotado

- El navegador asigna extensión exclusivamente según `Content-Type` que devuelve el endpoint de descarga privado, nunca según marca, etiqueta del comercio ni nombres externos.
- Tabla cerrada de MIME para PDF, Word `.doc/.docx`, Excel `.xls/.xlsx`, PNG/JPEG/WebP, CSV y TXT. MIME desconocido: `.bin` sin suposición.
- ID de documento validado antes de usar sus primeros 8 caracteres en el nombre.
- Preserva la lectura privada, auditoría, SHA256, límite 8 MiB, consentimiento y aislamiento Auth existentes. No cambia APIs, RPC, Whapi, Storage ni modelos IA.

## Criterios de aceptación

1. Presupuesto Word antiguo se descarga como `.doc`, no `.docx`.
2. Presupuesto Excel antiguo se descarga como `.xls`, no `.xlsx`.
3. Archivos modernos siguen `.docx/.xlsx`; PDF e imágenes conservan su tipo.
4. Documento con MIME desconocido usa extensión `.bin` y un ID inválido no inyecta ruta en nombre.
5. El endpoint servidor y el nombre generado por el navegador coinciden en ejemplos de ambos formatos; el contenido binario es idéntico.
6. Las pruebas automáticas de catálogo/autorización/descarga y compilación del portal siguen sin regresiones.

## Evidencia y límites

Pruebas incorporadas: `tests/unit/v2-09-extension-original.test.mjs` y `tests/unit/v2-03b-descarga-original-segura.test.mjs`, junto a un paso dedicado en `cotironda-v2-03-respondedores-pg17.yml`. Los resultados de CI deben comprobarse sobre el SHA final antes de marcar este cambio verificado.

**No representa un despliegue:** `cotironda-portal-dev` sigue sin Git enlazado según última revisión; la cuota Hobby había rechazado un despliegue anterior. El comprador Auth todavía no tiene teléfono verificado, la política V2 de compartir originales permanece OFF y faltan consentimientos prospectivos y E2E por WhatsApp.

Próximo paso externo para Preview: conectar con cuidado `ProtectorRudo/Cotironda` al proyecto DEV exacto sin publicar `main` automáticamente; comprobar cuota, flags OFF y SMS real. Requiere autorización separada de `Publicalo`.

# Decisión 375 — MVP251, revisión explícita de presupuestos visuales

Fecha: 06/11/2026. Etapa funcional 3 de IA Central. Solo desarrollo, ninguna publicación en PILOTO o producción.

## Problema comprobado

Whapi ya descarga y archiva imágenes JPEG, PNG y WebP mediante identificador autenticado, comprueba firma, SHA-256 y almacenamiento privado. El lector documental tiene dos pasadas de IA. Sin embargo, el verificador independiente de fuentes `MVP106` acepta texto verificable PDF/Office/TXT y rechaza imágenes por `unsupported_format`; una foto no puede producir precios auditados únicamente por dos transcripciones de un modelo. Los PDF escaneados también permanecen sin fuente textual contrastable.

## Solución implementada en MVP251

`supplier-source-image-mvp251.ts` añade un diagnóstico conservador, empleado en ambas rutas de ingreso y recuperación documental. Comprueba MIME, cabecera, tamaño, **SHA-256 de bytes reales**, estado documental, líneas y una segunda lectura completa. Detecta discrepancias en descripción, unidades, cantidades, precios, extras, total y notas comerciales, así como CUIT, teléfonos y otros datos de contacto en lo transcripto.

El resultado **siempre** es `needs_source_review` con las banderas `sourceVerified=false`, `publicationAllowed=false` y `rankingAllowed=false`. El motivo permite diferenciar:

- `invalid_source`: bytes/firma/hash no confiables.
- `unresolved`: primera/segunda lectura faltante, incompleta o discrepante.
- `unsafe_contact`: información identificatoria detectada en la transcripción.
- `unsupported_layout`: las lecturas coinciden, pero no existe prueba visual independiente.
- `unsupported_format`: MIME fuera de JPEG/PNG/WebP.

No agrega OCR, no modifica políticas SQL/RLS ni altera permisos de visualización, precios, rondas o herramientas de envío. Los controles SQL de identificación, opt-in, ronda y publicación privada siguen siendo la autoridad.

## Criterios de aceptación y pruebas

- Carga normal y recuperador hacen la misma clasificación de imágenes.
- Dos modelos coincidentes **nunca** habilitan publicación ni ranking.
- Alterar una sola cantidad, precio, nota o renglón marca `unresolved`.
- Hash, cabecera y MIME rechazados; PII retenida.
- Imágenes JPEG/PNG/WebP comprobadas con bytes sintéticos.
- Regresión PDF textual, extras de flete y recuperación sin degradación.

El CI de este PR ejecuta pruebas unitarias en Node 22; la evidencia operativa de fotografías/escaneos auténticos todavía está pendiente.

## Próximo bloqueo

Para convertir **fotos y PDF escaneados** en precios acreditados falta una **lectura visual independiente verificable** (p. ej., OCR independiente más conciliación completa de filas, cifras, extras, condiciones y revisión puntual de discrepancias). La mera coincidencia de dos respuestas de IA nunca será suficiente para promoverlos a fuente original corroborada.

Una vez disponible esa fuente, su comprobador podrá integrarse con la cadena existente: fuente SHA → segunda lectura → cotejo de importes y condiciones → publicación privada por SQL → consulta por rubro. Mantener las reglas de privacidad sin solicitar al proveedor confirmaciones innecesarias para archivos inequívocos.

No marcar la etapa 3 terminada ni activar WhatsApp real a partir de este avance.

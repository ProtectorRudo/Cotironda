# MVP140 — lectores de presupuestos reales, sin confirmaciones adicionales

Fecha: 03/11/2026. Issue #488. Alcance: exclusivamente lector de fuente, reintento versionado y proyección anónima del PILOTO. No modificar Whapi, identidad, catálogo, ranking, ganadores ni producción.

## Evidencia antes del cambio

- Ronda e134c5fc-fe38-4109-bfbd-33acec264b22: 2 cotizaciones recibidas / 4 renglones, 0 ofertas visibles.
- PDF de Ailín: v1 `missing_amount`, v2 `missing_total`.
- Excel de Nahuel: v1 y v2 `unreadable`. El formato concreto de sus bytes originales debe volver a comprobarse con la versión 3; los tests sintéticos no lo prueban.
- Cron de recuperación y enlace del comprador activos, sin cifras publicadas.

## Cambios

1. XLSX: leer todas las hojas **visibles** enlazadas al workbook por `r:id` y archivo `workbook.xml.rels`, con límite de tamaño, entradas ZIP autenticadas por CRC32, sin macros, vínculos externos ni ejecución de fórmulas. Hojas ocultas/no referenciadas se rechazan; no se omiten silenciosamente. Admite cantidades y precios sin `$`.
2. PDF: detectar `TOTAL GENERAL` / `IMPORTE FINAL` cuando su importe está en la fila inmediatamente anterior o posterior, solo si es una cifra aislada y única. Evitar inferir cifras por geometría sin fuente.
3. Garantías: rechazar cargos adicionales no mapeados, incluidos números sin símbolo `$`; preservar detalle literal, descuento y total declarado, condición comercial y anonimato.
4. SQL v3 de evidencia inmutable: v1/v2 no se modifican, selector vuelve a evaluar archivos existentes una sola vez y el tracking usa la revisión verificada más reciente disponible sin duplicados. Servicio restringido a service_role, con HMAC, SHA256, Storage privado, consentimiento, vigencia y revisión del comprador.

## Criterios de aceptación

- Todas las pruebas unitarias, typecheck Deno, seguridad PG17 y portal en CI en verde.
- Ensayo de ZIP XLSX con dos hojas, importes sin `$` y total; hojas ocultas y cargos extra rechazados.
- Ensayo de PDF con TOTAL/importe en filas contiguas; importe alterado o cargo extra rechazado.
- Prueba real **pendiente antes de declarar solucionado**: instalar SQL/Edge solamente en el piloto autorizado, verificar nueva evidencia v3 con archivos SHA originales de Ailín y Nahuel, y consultar tracking de comprador con dos ofertas anónimas sin PII. Rechazos deben conservar los originales intactos. Ningún anuncio de ranking/ganadores.
- `main` y producción aislados. La versión 3 puede revertirse restaurando las RPC de MVP139 y función Edge anterior; evidencia v3 append-only permanece como auditoría.

## Riesgo y límites

La lectura de archivos comerciales no tiene cobertura universal. Formatos como XLSX con dibujos, archivos firmados o PDF escaneado pueden necesitar un lector adicional y no deben declararse completos por un PASS sintético. El alcance aquí corrige restricciones comprobables, pero el éxito del piloto se mide con los archivos originales reales.

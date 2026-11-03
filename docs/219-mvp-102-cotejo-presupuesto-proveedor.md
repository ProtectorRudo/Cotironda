# MVP-102 — Dos lecturas para el presupuesto documental del proveedor

**02/11/2026 · Issue #414 · PR dependiente de MVP-101 · PILOTO exclusivamente.**

## Problema real
El webhook del piloto ya hacía **dos** lecturas con OpenAI del mismo archivo original, pero cuando el remitente era un proveedor solo guardaba la primera. Un renglón omitido, un descuento con signo invertido o un importe distinto en la segunda lectura se perdían como señal de discrepancia.

El objetivo es conservar la versión primaria íntegra de MVP-101 y establecer un **estado independiente, privado, no económico** para cotejarla con la segunda lectura. No implica que ambas interpretaciones sean verdaderas: dos modelos pueden cometer el mismo error visual, o una cifra puede ser ambigua incluso aunque concuerden.

## Implementación
1. `supplier_reading_checks_mvp102` contiene solo HMAC, hash SHA256 del original privado, cantidad de renglones, estado, código de motivo y número de línea discrepante. **No contiene teléfonos, nombres comerciales, importes ni textos de documentos**. RLS sin lectura por clientes, trigger de inmutabilidad e inserción exclusivamente por RPC con rol privilegiado.
2. `cotironda_piloto_compare_supplier_readings_mvp102` exige recibo previo MVP-101, vínculo al original SHA256 idéntico, misma ronda y empresa/proveedor, consentimiento vigente e invitación no vencida. Solo acepta **una** evaluación por HMAC. No permite comparar un archivo de otro proveedor ni atribuir cotizaciones arbitrarias.
3. Coteja **cantidad y orden de todos los renglones**, descripciones, cantidades, unidades, precios unitarios, importes de línea, total textual declarado, condiciones de entrega y preguntas sin resolver. Los dos textos se comparan **literalmente**, sin normalizar signos, centavos, separadores ni corregir totales. La ubicación de evidencia debe existir en ambas lecturas, pero puede tener redacción distinta.
4. Si la segunda lectura falla, está incompleta, omitió un pallet, alteró un importe, contiene dudas, carece de evidencia o difiere en notas/total, el resultado es `needs_source_review` y motivo interno (sin datos económicos). Solo si coinciden todos los campos y no hay ambigüedades se registra `model_readings_match`. Este último estado **no es una oferta verificada**.
5. La recepción real usa las **dos llamadas al modelo que ya se hacían**, sin nuevas llamadas pagas ni mensajes. Si el recibo MVP-101 queda creado, registra la comparación o falta de segunda lectura. En ningún caso cambia `supplier_media_quotes_mvp098.state='awaiting_fidelity_check'`, `offer_versions`, ranking, seguimiento público ni finalistas.

## Pruebas realizadas
- PostgreSQL 17 en el Supabase **cotironda-piloto**, transacción reversible con migraciones MVP-101 y 102, datos ficticios y controles privados: **14 escenarios** (acuerdo completo; precio alterado; signo de descuento alterado; total diferente; pallet omitido; segundo análisis ausente; intención equivocada; nota distinta; preguntas sin resolver; pallet ambiguo; evidencia faltante; respuesta incorrecta; ausencia del tipo documental; eliminación de un campo nulo obligatorio). Resultado **PASS**, `ROLLBACK` verificó que no quedó tabla instalada.
- El supuesto acuerdo conserva exactamente el total del proveedor aunque sea inconsistente con la suma, y la RPC siempre devuelve `source_verified=false` / `ranking_allowed=false`.
- `tests/unit/mvp102-cotejo-lecturas-proveedor.test.mjs` verifica controles de webhook, SQL, permisos, concepto extra, idempotencia y prohibición de convertir esta lectura en oferta comercial. CI pendiente de verificación por PR.
- No se contactó ningún proveedor/arquitecto, no se alteraron datos persistentes ni secretos, y no se hizo despliegue.

## Próximo tramo (NO resuelto por este PR)
- **Fidelidad al documento físico:** contrastar cada línea y literal monetario con evidencia independiente del propio PDF/hoja/foto original, y detectar renglones omitidos, cambios de separadores y notas que el modelo no transcribió. Sin ello no etiquetar «100% fiel».
- Verificación decimal exacta de subtotales y total **por separado del literal del proveedor**, incluyendo IVA, flete, pallets, envases, gastos y descuentos. Donde falten condiciones obligatorias, no inventar importe final.
- Plantilla Cotironda anónima autorizada y revisada, con todos los conceptos y total original, y comparación aparte únicamente de productos técnicamente equivalentes.
- Ampliar límites técnicos de 25 renglones/3 MiB y capacidad de generar PDF de solicitudes mayores a 8 renglones, sin truncamiento. Costos/seguridad por empresa deben continuar protegidos.

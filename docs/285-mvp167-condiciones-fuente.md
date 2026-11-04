# MVP167 — Lectura fiel de IVA, flete y pago desde fuente acreditada

**04/11/2026 · Issues #535, #529, #524. Solo DESARROLLO: no modifica piloto ni producción.**

## Contexto

MVP166 audita descuentos por renglón pero no acredita IVA fiscal, flete, plazos ni stock. Cotironda necesita interpretar condiciones comerciales sin convertir silencios en IVA 0%, envío gratis o contado.

## Implementación

Nuevo módulo puro de dominio: src/domain/auditoria-condiciones-mvp167.ts. Recibe un DocumentoFuente v9 **verificado y vigente**, un conjunto de filas posicionadas extraídas del archivo original y SHA-256 de los bytes corroborado por un llamador privado. Comprueba SHA, request, HMAC (internamente), versión, revisión y total exacto; rechaza duplicados de localizador y archivos mal formados. Resultado **solo categórico**, con ubicaciones página/fila, sin texto completo, nombres, contactos ni SHA.

### IVA

- «IVA incluido 21%» → declaración de inclusión y tasa explícita 21%; NO es prueba de precio unitario neto fiscal.
- «Sin IVA» → declaración de exclusión, tasa nula; no equivale a «IVA 0%».
- «IVA 21%» → tasa mencionada con base incluida/excluida desconocida.
- Notas que afirman incluido y no incluido, o tasas distintas, se marcan contradictorias.
- Preguntas, consultas y condiciones pendientes no se interpretan como hechos.

### Flete

- «Flete sin cargo» y «Flete incluido» se distinguen: en ambos casos incremento de flete 0.00, pero NO se afirma que el transporte real cueste cero cuando está incluido.
- «Flete adicional: $1.250,50» → monto y condición adicional declarados.
- «Flete: $500,00» → monto textual, tratamiento de inclusión desconocido, no se suma dos veces.
- «Flete aparte», «a convenir» y contradicciones quedan sin monto final comparable.

### Pago

Solo notas identificadas como pago / forma de pago, con modalidad contado, transferencia o cuenta corriente a 30 días. Varias opciones son multiple y no crean falsos grupos económicos.

## Límites deliberados

Este módulo NO produce TerminosAuditados, no invoca el comparador y siempre devuelve rankingHabilitado:false, netoSinIvaAcreditado:false, stockCorroborado:false, plazoCorroborado:false y minimoCompraCorroborado:false. No releva proveedor por WhatsApp, no solicita confirmaciones, no revela identidad ni libera documentos originales. Una declaración de stock no es verificación independiente de disponibilidad.

El lector real deberá aportar filas del archivo **descargado en backend** y SHA calculado, y resolver localización **hoja/celda real** de Excel: los ordinales XLSX/DOCX existentes no equivalen a celdas.

## Criterios y pruebas

tests/unit/mvp167-condiciones-fuente.test.mjs: 22 casos de ausencia, tasas 0/10,5/21, IVA incluido/excluido/sin base, contradicciones en una o varias notas, flete adicional/incluido/gratuito/a convenir, pago único o múltiple, datos ausentes, SHA/versiones/revisiones alteradas, totales, locadores duplicados, confidencialidad y no activación de ranking. Estos datos son **sintéticos**, no ejecución contra Ailín/Nahuel.

Falta integrar el extractor servidor real, evidencias de producto/IVA y costo neto, stock, plazos, mínimos, descuentos combinados y originales descargables consentidos en el cierre. Seguir con #535 y luego #524. **No cerrar checklist P0-B o P0-B2 por este módulo puro.**

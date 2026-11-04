# MVP160 — Recomendaciones explicables y checklist de ejecución

## Decisión de producto (03/11/2026)
Cotironda **no adjudica** ni obliga a contratar a los recomendados. Presenta **todas** las ofertas (completas y parciales), ordena solo canastas verdaderamente comparables y puede resaltar hasta dos proveedores o una combinación de dos. Tras el cierre, el comprador debe poder descargar los **documentos originales de todos los candidatos que autorizaron esa divulgación**, no solamente los dos recomendados. Compartir originales es una autorización separada de permitir revelar números telefónicos.

El proveedor que entregó su presupuesto recibe una sola respuesta de agradecimiento, sin propuestas de aumentar, rebajar ni retocar precios.

## Componentes existentes reutilizados
- `src/domain/comparacion-ofertas.ts`: auditoría decimal/BigInt de canasta, hasta 25 artículos, unidad/equivalencia/cantidades, IVA, flete, mínimos, pago, plazo y moneda. Nunca comparar totales parciales.
- `src/domain/comparacion-pares-exacta.ts`: pareja de proveedores con asignación exacta de renglones indivisibles.
- `supplier_evidence_mvp138` v9: documentos auténticos fuente-verificados, **NO** clasificación técnica ni cotización económicamente comparable por el solo hecho de ser legibles.
- `cotironda-piloto-originals`: bucket privado. El almacenamiento original **NO** habilita una descarga al público ni al comprador antes del cierre.
- `cotironda_piloto_plan_coverage_finalists_mvp108`: solo cobertura estricta hasta dos, sin ranking económico. `finalist_activation_mvp113` sigue apagado.

## Implementación inicial
`src/domain/recomendaciones-mvp160.ts` envuelve el comparador económico probado y determina un subconjunto de hasta dos proveedores **anónimos** para la mejor cobertura total comparable. Exige un único grupo de moneda/pago/plazo y demás campos explícitos ya comprobados por el comparador; no cruza grupos ni asume flete/IVA cero. Si hay empate de más de dos candidatos, no inventa desempate ni dos ganadores; si empatan dos, los muestra empatados. Si la opción más económica es una combinación, ambos integrantes son recomendados. Si la opción ganadora individual usa un proveedor, una segunda alternativa solo incorpora a un segundo proveedor cuando la canasta completa queda cubierta; nunca un parcial aislado. No cambia los presupuestos ni inventa descuentos ni contacta por WhatsApp.

Esto es **componente puro offline con pruebas unitarias**, no producción ni ranking real en el seguimiento. La fase siguiente debe adaptar los campos económicos de fuentes reales a este contrato, sin inferir IVA/flete/condiciones ni equivalencias.

## Roadmap y checklist
**Fuente de verdad operativa: Issue #529.**
- #524 ranking y selección transparente;
- #525 originales al cierre y consentimiento por candidato;
- #526 agradecimiento único sin promover cambios;
- #527 memoria comercial/IA conversacional;
- #528 portal/operación;
- #523 avisos finalistas seguros.

Las pruebas sintéticas nunca habilitan acceso a originales ni revelación retroactiva en la ronda actual. Cualquier futura descarga debe verificar en backend, al momento de cada solicitud: comprador auténtico, ronda cerrada, proveedor con consentimiento específico no revocado, documento original completo SHA coincidente, enlace de expiración corta sin PII en URL y auditoría de acceso. PDF original puede contener teléfono, CBU y datos comerciales; el consentimiento previo debe permitir compartirlos con el comprador al cierre.

## Pruebas y siguientes hitos
Node22 unitarios normal/extremo: 1/2/25 productos, dos parciales complementarios, big bag no equivalente, IVA/flete ausentes, moneda/pago/plazo divergentes, empates 2 y 3, privacidad y metadatos inesperados. CI completo antes de integrar. Aún pendientes mapeo técnico con evidencia, integración backend, descarga con consentimiento y E2E real.

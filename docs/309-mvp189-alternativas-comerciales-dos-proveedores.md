# MVP189 — Alternativas de cobertura de uno o dos proveedores al cierre

**04/11/2026 · Desarrollo únicamente · #529, #524, #535 y #528. Sin despliegue ni mensajes.**

## Problema
Los importes auditados por artículo MVP186/187 son útiles, pero el comprador todavía debe inferir qué presupuesto por sí solo, o qué dos cotizaciones combinadas, podrían cubrir su lista. El ranking económico final MVP118 no puede aplicarse a los cuatro documentos reales mientras el IVA/flete/moneda, mínimos y disponibilidad no estén acreditados; comparar totales parciales contra completos sería incorrecto.

## Decisión de producto
Mostrar *al cerrar la ronda* un resumen de **cobertura comercial posible** para todas las ofertas:
- Cuántos artículos solicitados tienen una alternativa razonable por cada «Presupuesto N», incluso si la oferta es parcial.
- Todas las opciones **individuales** que abarcan los artículos del pedido.
- Todas las **parejas verdaderamente complementarias** (ningún proveedor cubre solo la lista; juntos ofrecen alternativas para todos sus artículos), con renglones mostrando qué candidato puede cotizar cada artículo. Si ambos coinciden en uno, se muestran **ambos**: Cotironda no impone una asignación arbitraria ni presupuestos ficticios.
- Si ninguna combinación cubre todo, mostrar la situación y **conservar siempre todas las ofertas parciales**. Nadie es eliminado.
- Nunca dar a estos candidatos una posición económica, llamarlos «ganadores» o revelar contactos.

## Implementación sobre el flujo existente
- Módulo puro `src/domain/alternativas-cobertura-mvp189.ts`: usa únicamente el sobre privado ya autenticado por `buyer_coverage_inputs_mvp175`, diagnostica evidencia documental v9 con `diagnosticarRondaPrivadaMvp172` y exige además el resumen económico MVP180 sin ranking.
- El mapeo de fuente↔presupuesto público es por `publicText` EXACTO de la revisión vigente y anónima; nunca usa el orden de mensajes HMAC para adjudicar etiquetas. Colisiones, fuente incompleta, revocación y discrepancias => `null`.
- Solo estados `alternativa_comercial_con_aclaracion` o `coincide_volumen_nominal_sin_stock` constituyen **posibilidad comercial**, nunca disponibilidad real. Una diferencia explícita, presentación no corroborada o cantidad distinta no cubre ese artículo.
- Hasta 10 cotizaciones × 25 artículos. Todas las parejas complementarias (máximo 45), sin truncar resultados ni ordenar por dinero. No se calcula importe, IVA, costo entregado, flete, mínimos, plazo, stock ni adjudicación.
- La Edge de seguimiento usa la **misma** copia privada ya recuperada por MVP175 y las dos verificaciones de RPC. Solo envía la proyección anónima cuando `state='closed'`; no crea una nueva consulta ni un canal de mensajes.
- Proxy Vercel vuelve a validar cantidad de presupuestos, conteos de cobertura, identidades anónimas, integridad de artículos, unicidad de alternativas y banderas `false`; limpia campos ajenos y privados.
- UI en el enlace del comprador: «Alternativas comerciales para cubrir el pedido», número de artículos por candidato, opciones individuales o parejas bajo detalles expandibles, con advertencia de que no son ganadores. Solo en ronda cerrada; revocación/desconexión limpian el panel.

## Criterios y pruebas
- 1 proveedor completo, 2 parciales complementarios, 2 que no cubren conjuntamente, ofertas idénticas, cantidades ambiguas, IVA silencioso o incluido, revocación, fuente SHA incorrecta, texto v9 duplicado o ajeno, UI XSS y no filtración de PII.
- **No** exigir que el proveedor complete formularios ni vuelva a declarar IVA/flete para mostrar una cobertura razonable.
- CI de GitHub 5/5 en HEAD exacto antes de integrar rama desarrollo; `main` intacto, SQL, Edge/Vercel PILOTO y WhatsApp sin publicar.
- Ronda real aún no probada en navegador porque MVP186/187 y el SQL privado de `publicText` no fueron instalados persistentemente; ejecutar E2E únicamente con `Publicalo en cotironda-piloto` y plan/rollback MVP188.

## Límites que siguen pendientes
- **#535/#524:** convertir solo documentos con cantidades/monedas/IVA/flete/mínimos y stock acreditados al comparador determinista y proponer hasta dos opciones de precio comparables. No seleccionar ganadores por una cobertura comercial.
- **#525:** descargar todos los presupuestos originales autenticados con consentimiento específico posterior al cierre; no se deduce consentimiento de un presupuesto recibido ni se habilita vía enlace de seguimiento.
- **#528/#523:** probar el cierre y los avisos en una **nueva** ronda autorizada, con consentimiento y protección contra duplicados.
- **#529:** continuar checklist hasta circuito entero comprobado. Este PR no declara el piloto terminado.

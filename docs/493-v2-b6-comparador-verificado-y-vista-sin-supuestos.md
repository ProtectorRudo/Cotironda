# Acta 493 — B6: comparación privada y vista de rubros sin condiciones inventadas

**Fecha:** 10/11/2026 (Argentina). **Autorización:** «Luz verde» — exclusivamente desarrollo y pruebas. **PR:** #769 sobre #768 (B5d/B5e), que depende de #767 (B5). **No desplegado** a Supabase, Vercel ni WhatsApp; sin migración SQL ni cambio de flags.

## Hallazgo: Cotironda YA tiene comparador y seguimiento

No corresponde crear otro motor matemático ni otra página. Se revisaron `docs/06-ranking.md`, `src/domain/comparacion-ofertas.ts` (MVP118), `src/domain/comparacion-pares-exacta.ts`, `src/domain/adaptador-documental-mvp162.ts`, los módulos de cobertura MVP255 y la Edge `cotironda-piloto-seguimiento`.

El comparador existente ya calcula con BigInt, verifica coberturas y condiciones, busca una compra completa con un proveedor o una combinación de hasta dos, y **nunca ordena subtotales de cestas diferentes**. El adaptador MVP162 ya exige evidencia independiente por archivo, SHA, vigencia, equivalencia, disponibilidad y condiciones económicas, y descarta cargos no clasificados. Reimplementarlos duplicaría la lógica y multiplicaría riesgos.

## Entregado: nuevo enlace privado B6

`src/domain/presupuestos-v2/comparacion-privada-b6.ts` recibe de un servicio privado y autenticado una ronda, el pedido confirmado y fuentes documentales con prueba *independiente*. Por cada presupuesto llama al adaptador MVP162 y conserva el estado de revisión (sin precio comparable, cobertura y motivos) sin sacar SHA, ID de ronda, nombre ni teléfono en el resultado. **Una candidata de B5d/B5e tiene `sourceVerified=false` y NO es evidencia económica**: su simple lectura o conciliación de centavos no puede entrar en el ranking.

Solo las `OfertaComparable` acreditadas por MVP162 se pasan al motor existente. Este decide opciones de cesta completa para uno o dos proveedores, con fletes, mínimos, moneda, disponibilidad, plazo, IVA explícito y pago corroborados según las reglas del motor; nunca compara sumas entre ofertas parciales. El resultado B6 mantiene `canPublish=false`, `canRevealContacts=false`, `canAdjudicate=false` y `canComparePartialTotals=false`.

Adicionalmente se incorporaron referencias unitarias **por artículo idéntico**, no por presupuesto total: descripción correlacionada, unidad/cantidad demandada y equivalencia acreditadas, mismas moneda, tasa de IVA expresamente corroborada, forma de pago y plazo. La diferencia de fletes/mínimos no se oculta: el resultado lleva explícitamente `solo_precio_unitario_no_incluye_flete_ni_minimos`; se muestran precios netos por presupuesto anónimo ordenados por identificador, **no se declara un ganador global por ese cuadro**. Las alternativas comerciales razonables pueden participar en opciones completas con advertencia si el comparador las acepta, pero no se enfrentan como idénticas.

El código es puro y **no es fuente de autorización**: los tipos `DocumentoFuente`, `PruebaFuente`, `CorrelacionFuente`, `TerminosAuditados` deben construirse desde ledgers privados ya comprobados por RPC/token, nunca con JSON del modelo, del navegador o del proveedor. Esta conexión de servidor no está habilitada todavía. Un UUID ajeno, anonimato duplicado o fuente de archivo duplicada produce entrada inválida sin publicar datos.

## Corrección sobre la vista del arquitecto ya existente

Durante la revisión del seguimiento se descubrió que `vistaCotizacionesRubrosMvp227` convertía `iva=no_informado` en «IVA no informado», `flete=no_informado` en «Flete no informado» y `pago=no_informado` en una frase literal. Esto contradice la regla aprobada de **omitir toda mención fiscal/logística cuando el proveedor calla**. Se corrigió la proyección existente, sin crear UI paralela: ahora esas claves siguen siendo estados internos pero no producen palabras visibles. Se mantienen solo condiciones **expresas**, y «flete a convenir» se muestra exclusivamente si lo dijo el proveedor.

Se agregaron tests del MVP227 para ausencia de las tres condiciones y preservación de `Sin IVA`, `Flete a convenir` y pago expreso. No se cambian SQL ni respuestas de proveedores; falta todavía auditar otras superficies de tracking antes del deploy.

## Casos de aceptación nuevos (datos sintéticos)

1. Dos presupuestos verificados del **mismo** producto y condiciones: precio unitario neto visible por artículo; la canasta íntegra utiliza IVA/flete del comparador previo, sin adjudicación.
2. Dos presupuestos parciales de artículos **distintos**: se ve cobertura 1/2 de cada uno y una combinación completa de dos; los dos subtotales individuales quedan `null`, no se anuncian como primera/segunda posición.
3. Dos ofertas parciales que comparten un producto: mostrar referencia de ese producto sin inventar una compra total.
4. Diferencias de moneda, pago o IVA: no entrar en el mismo grupo de comparación de precio unitario.
5. IVA ausente, fuente B5d no comprobada, disponibilidad no acreditada, cantidades distintas, cargos extra/pallets, equivalencia técnica dudosa: NO crear referencia engañosa.
6. Alternativa de marca/presentación técnica comercial: advertencia, nunca identidad estricta.
7. Fuente repetida, ronda equivocada, UUID/hash, fuga de teléfono/HMAC: fallar sin precio/PII.
8. Regresión existente MVP162 y comparador, tests Node y Deno; no modificar el histórico.

## Bloqueos efectivos para la prueba real de punta a punta

- **B5 pendiente:** verificar contra TODO el PDF/Excel original la cobertura, las columnas de descuentos, totales y condiciones fiscales/entrega. B5d/B5e no certifican fuente integral y no tienen permiso para comparar/publicar.
- **Sin despliegue:** #767, #768 y #769 son propuestas de desarrollo apiladas, no instaladas en `cotironda-piloto` por esta luz verde.
- **B6 servicio:** falta un RPC privado que entregue pruebas fuente/correlaciones/condiciones de cada oferta, ligadas a una única ronda y versión; luego ejecutar esta función detrás del token vigente, sin exponer su envoltorio privado.
- **B7 consumidor:** reutilizar el seguimiento existente, cuyo token, proveedor anónimo durante la ronda y revelación al cierre ya están planteados; no crear otro enlace. Probar pantalla real y revocación antes de conectar nuevas ofertas.
- **E2E real:** ronda nueva completa WhatsApp comprador → solicitudes → dos proveedores reales PDF/Excel → fuente verificada → ofertas anónimas/rubros → cierre y revelación. El PR B6 por sí solo NO cierra la prueba.

**Estado:** desarrollado en rama, sin publicar. La evidencia de CI del commit final debe verificarse en GitHub Actions; ningún acta reemplaza esa ejecución.

## Regresión general detectada y corregida

El primer CI del PR aprobó la batería B6 (75/75) y Deno, pero el conjunto general encontró **un test de MVP295** que esperaba precisamente la frase «IVA no informado» en la vista de rubros del arquitecto. Esa expectativa contradice la regla comercial vigente y el cambio deliberado de MVP227. Se actualizó su aserción para exigir que **ninguna mención IVA/flete/pago se genere por ausencia**. No se retiró la prueba: sigue corroborando que una cotización verificada abre la vista, sin ganador automático. Se incorporó al workflow específico B6 para evitar esta regresión nuevamente.

El CI final debe comprobar que tanto la prueba aislada como la batería completa vuelvan a pasar antes de calificar el PR como validado. Los dos workflows heredados que GitHub reporta como fallidos sin jobs desde PR B5 son incidencias de configuración independientes y no pueden ocultarse ni contarse como aprobación.

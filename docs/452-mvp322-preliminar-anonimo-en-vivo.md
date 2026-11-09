# Decisión 452 — MVP322: vista preliminar de importes y artículos anónimos

**Fecha:** 09/11/2026 ART. **Autorización:** «Luz verde» para desarrollar y probar. **Sin publicar, sin ejecutar SQL real, sin cambiar Whapi, cron, Edge activo, Vercel o producción.** GitHub rama de desarrollo es la única fuente de cambios.

## Objetivo solicitado

El arquitecto abre su enlace privado de seguimiento y **a medida que llegan cotizaciones verificadas** ve cada presupuesto anónimo con lista de artículos, importe por artículo y suma preliminar de los renglones con precio. No espera al cierre para ver los números. Una respuesta en revisión conserva su estado y sus precios NO se exhiben como verificados.

## Fuente y semántica comercial

La proyección nueva no hace llamadas a OpenAI. Usa `cotironda_piloto_ia_buyer_rubros_mvp227` ya autorizada por token privado del comprador, que filtra el **último mensaje** de cada proveedor y sólo expone `ai_supplier_review_mvp227.state='verified'`. Los importes `precios[].centavos` son **totales de renglón**, cuya cantidad, precio unitario, total declarado y fuente fueron conciliados por `precioConfirmado` de `calificador-cotizaciones-mvp225.ts`, no precios unitarios inferidos. `resumenPrivadoMvp245` conserva esa evidencia y los estados IVA/flete/pago.

Cada `Presupuesto N` expone `articulos[]` sólo de ese proveedor, con ID de pedido, descripción solicitada, rubro, cantidad/unidad solicitadas y `importeRenglonCentavos`. La suma `precioDeMaterialesCentavos` se calcula con **BigInt** exclusivamente sobre renglones fuente ya verificados, sin mezclar monedas, sin replicar ítems dentro de una misma oferta y sin presupuestos de otras empresas. Previo al cómputo se recalcula `vistaCotizacionesRubrosMvp227(raw)` y debe coincidir exactamente con la vista ya validada; se comprueban nombres anónimos, rubros, cantidades, estados comerciales y cobertura. La suma NO es el total original del proveedor, NO incluye extras/cargos fuera de esos renglones, NO permite comparar ofertas parciales ni deducir la mejor.

Si hay renglones respondidos sin precio o una cotización parcial, la tarjeta marca **parcial** y muestra `solicitadosAsignados`, `respondidosAsignados` y `articulosConImporte` por separado. La «cobertura completa asignada» no significa que cubra toda la lista del arquitecto: sólo los rubros/artículos que ese comercio tenía asignados. Tampoco se asumen stock, plazo, IVA o flete de modo automático.

## Defensas en las tres capas

- **Dominio** `src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts`: función pura `preliminarAnonimoPresupuestosMvp322(raw,vista)`. Rechaza estado incorrecto, revisiones no verificadas, cantidad inconsistente, líneas duplicadas, categoría ajena, cambios tras validación, moneda desconocida y datos de precio fuera de rango. La salida tiene un esquema limitado, sin nombres, teléfonos, hashes, originales, proveedor, adjudicación o ranking.
- **Edge** `cotironda-piloto-seguimiento/index.ts`: añade la proyección sólo dentro de la misma llamada RPC token-gated del comprador. No emite WhatsApp, no edita base ni altera cierre. Si falla la vista preliminar, el seguimiento antiguo permanece operativo.
- **Vercel** `piloto/seguimiento-web/api/estado.js`: segunda reducción de privacidad, verifica forma exacta de cada objeto, cantidades y categorías, que las etiquetas coincidan con las ofertas ya revisadas y vuelve a sumar todos los importes con BigInt; subtotal adulterado o campo extra sensible => se descarta esa proyección.
- **Navegador** `piloto/seguimiento-web/index.html`, `site.js`, `site.css`: tarjetas anónimas con `textContent` (nunca HTML del proveedor), adaptadas a celular; las ofertas aprobadas originales siguen visibles más abajo, y las pendientes no entran a la suma. Se limpia el panel al revocarse/cambiarse el token o fallar la conexión. Conserva el polling preexistente de **45 s**. No ordena por subtotal.

## Criterios de aceptación

- [ ] Pruebas reales CI en último SHA: nuevo test `mvp322` y regresión MVP227/255/299.
- [ ] Caso 2 presupuestos con coberturas distintas: se ven ambos, suma provisional correcta y sin posiciones ficticias.
- [ ] Ofertas de ARS/USD separadas; altas sumas sin overflow; flete/IVA/condiciones informados sin presumir impuestos.
- [ ] Precios alterados, notas privadas agregadas, duplicados, cambio de hash/source o rubro incongruente no entran al panel.
- [ ] DOM de celular, refresco, revocación del enlace, inyección de campos sensibles, sin duplicar ni hacer llamadas WhatsApp.
- [ ] Integrar PR sólo en desarrollo tras aprobar controles. **No desplegar hasta una nueva orden «Publicalo».**
- [ ] Tras publicación autorizada, verificar con ronda prospectiva real y navegador del comprador; CI de origen simulado no demuestra funcionamiento de punta a punta.

## Límites reconocidos

El RPC MVP227 NO almacena en el resumen público un **total final independiente declarado por el proveedor**, ni todos los cargos adicionales de su archivo original. Por esa razón, este MVP muestra una **suma parcial de líneas**, no puede prometer reproducir todo el presupuesto económico final. Si se desea exhibir el total literal del original incluyendo extras, habrá que implementar por separado una reconciliación de cargos, impuestos, flete y total declarado que preserve la fuente y sea verificable. Tampoco puede revelar identidades comerciales durante la ronda; la revelación de todos los proveedores al cierre es otra operación ya regulada.

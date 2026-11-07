# MVP183 — Que una oferta parcial verificada pueda complementar otra sin crear un ranking ficticio

**04/11/2026 · Issues #524, #535 y #529. Estado: código y pruebas propuestos en rama de desarrollo. No desplegado.**

## Hallazgo verificable
El comparador monetario offline MVP118 y las recomendaciones MVP160 ya admitían una canasta cubierta por hasta **dos proveedores**. En cambio, el adaptador privado MVP162 descartaba con `visible_no_comparable` *cualquier* oferta que no cubriera todos los artículos, aun cuando sus propias líneas, importes, unidades, IVA, flete, disponibilidad y condiciones estuvieran corroborados. Por eso el motor nunca podía aprovechar esos parciales válidos al conectarse con la lectura documental.

## Cambio acotado
- Si el único defecto es `faltan_articulos`, y existe al menos una línea verdaderamente cotizada y verificada, el adaptador devuelve `estado='comparable'` con `ofertaComparable.items` **solo** para los artículos cubiertos, conservando `articulosSinCobertura` y `motivos=['faltan_articulos']`. **Comparable NO significa oferta completa.**
- Se conserva íntegra la exigencia de fuente v9 vigente, SHA, sumas y total documento; unidades, cantidades, variedad, stock y equivalencia acreditados; precio neto tras descuento, IVA por línea, pago, moneda, plazo, flete y mínimo de compra certificados. El total documental no se reduce ni se falsifica.
- La falta de cualquier prueba en un renglón cotizado, un extra sin clasificar (pallet, bolsón, recargo), importes divergentes o un documento sin línea pertinente **sigue impidiendo** construir un `OfertaComparable`.
- Para una oferta parcial que falle también por IVA/flete/precio, el resultado conserva los ítems faltantes y ambos motivos; no se maquilla como oferta completa.
- El motor existente `compararCotizacionesOffline` exige cobertura de **todos los artículos** en la opción, mediante un proveedor o una pareja. Nunca ordena por el subtotal más barato de una oferta incompleta; respeta mínimos, flete y mismas condiciones.
- No se cambia ningún archivo recibido, documento original, SQL, Supabase, Web, Vercel, flag, contacto, mensaje, cierre ni estado de ronda.

## Regresión incorporada
1. Solicitud sintética de dos artículos. Proveedor A cotiza solo cemento (bruto $242,00); B solo arena (bruto $60,50). Cada oferta es parcial y su subtotal **no** genera opción completa; combinadas, la canasta verificada suma $302,50. La salida reconoce ambos como cobertura parcial, sin adjudicación ni contactos.
2. Oferta parcial con flete sin acreditar o stock no probado continúa no comparable.
3. Oferta con pallet extra sin clasificar y documento sin línea asignada quedan fuera de ranking.

**Datos sintéticos:** no son presupuestos reales ni demuestran que los cuatro documentos del piloto puedan ordenarse. En la base actual faltan IVA, flete y stock acreditados; `ranking_allowed=false`. La regla del MVP162 impide que este cambio los convierta mágicamente en candidatos económicos.

## Pendientes para completar #535 / #524
- Obtener `CorrelacionFuente` y `TerminosAuditados` del servicio privado verificador con localizador fuente/SHA/revisión y controles de identidad. No aceptarlos de JSON libre de IA ni navegador.
- E2E de ronda nueva con un PDF y un Excel parciales consentidos, y otro documento con extras: comprobar que el comprador ve **todos** los presupuestos, los faltantes y solo opciones completas comparables.
- Ensayos de dos compradores, revocación, 25 artículos/10 ofertas, empates y distintas condiciones; no habilitar finalistas, originales ni WhatsApp hasta cerrar las demás barreras.

**Criterio de cierre de MVP183:** CI verde en el SHA exacto, regresión del adaptador + recomendador, diff auditado y PR de desarrollo. El E2E real queda separado y pendiente en #535/#529.

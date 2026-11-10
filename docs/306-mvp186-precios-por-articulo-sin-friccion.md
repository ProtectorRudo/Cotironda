# MVP186 — Importes cotizados por artículo desde la ronda real, sin formularios

**04/11/2026 · Desarrollo / PR pendiente · Issues #535, #529 y #525.**

## Objetivo y cero fricción
El proveedor envía PDF/Excel/imagen/texto por WhatsApp como acostumbra. Cotironda no exige formulario, confirmación de recepción, completar unidad fiscal ni reformatear el original. El comprador, con **el mismo enlace privado**, podrá ver las cifras auditadas por artículo, junto a la alternativa comercial y las aclaraciones indispensables, sin esperar un ranking fiscal definitivo.

La convención comercial aprobada MVP185 continúa: **si el documento no dice IVA, el precio cotizado se considera sin IVA para referencia preliminar, no IVA 0% ni IVA calculado.** Si indica «IVA incluido», el valor bruto no se mezcla con bases no acreditadas. Flete, stock, mínimos, condiciones y plazos ausentes no se inventan.

## Comprobación de los dos pedidos de PILOTO (lectura SQL, sin escrituras)
- Dos rondas con cuatro presupuestos y cinco artículos solicitados en total.
- Diez líneas de oferta con IVA sin aclarar y precios comerciales conciliados a la fuente.
- Las diez carecen de unidad estructurada explícita, pero los diez auditores de descuento tienen ubicación original igual a los diez hechos de presentación; las referencias de «cemento 25/50 kg», «hidrófugo 5 litros», «BIG BAG» permanecen en texto original.
- Una presentación razonable solo se muestra con advertencia, no como equivalencia técnica exacta. Las diferencias de variedad y cantidad no se ocultan.

## Integración mínima
1. Reutiliza la RPC de comprador **ya instalada** `cotironda_piloto_buyer_coverage_inputs_mvp175`, que valida el hash del enlace, vigencia, revocación y consentimiento antes de llamar a `private_round_inputs_mvp172` (service_role).
2. La modificación propuesta a `supabase/piloto/mvp172_private_round_inputs.sql` agrega **solo dentro de la respuesta privada** `publicText`, la transcripción pública verificada (versión 9). El Edge la correlaciona **por contenido exacto** con `tracking.offers[*].text`. El orden de documentos por HMAC nunca determina etiquetas del comprador. Duplicados de texto se rechazan por ambigüedad. No se expone `publicText` en API.
3. El Edge recibe una **única** copia del sobre privado de la RPC MVP175, hace cobertura MVP175 y pasa esa misma copia a `resumirImportesCotizadosCompradorMvp186` **solo después** del informe económico MVP180, cuyo SQL exige igualdad de multiconjuntos de textos de las últimas ofertas aprobadas. Si falla cualquier control, se omite la nueva vista, sin bloquear el seguimiento existente.
4. El sumario comprueba SHA v9, revisión vigente, unidades y presentaciones en MVP170/MVP174, descuentos MVP166 de la misma página/fila, centavos unitarios×cantidades, IVA documental y asignación no duplicada a artículos. Los importes son **literalmente los del renglón** del proveedor; ninguna tarifa, impuesto o moneda se fabrica.
5. El proxy Vercel reduce nuevamente los campos con lista blanca y valida flags, conteos, etiquetas y montos. La UI muestra «Artículo N», «Presupuesto N», importe de origen y aclaración; nunca identidades, contactos, HMAC, hash, rutas de archivos ni datos internos. Revocación, caducidad y desconexión borran toda la vista; respuesta antigua no puede restaurarla.

## Qué NO hace
- No adjudica, no selecciona finalistas ni obliga a comprar al candidato recomendado.
- No calcula total final, IVA, flete, stock ni ranking de importes de distintas coberturas. El original íntegro sigue conservado.
- No envía WhatsApps ni solicita a los proveedores que rellenen ninguna condición.
- **No está desplegado.** El SQL propuesto requiere prueba reversible de instalación en `cotironda-piloto`, seguida de autorización de despliegue del Edge y web del piloto. La interfaz actual no debe recibir un sobre privado sin saneamiento y correlación.

## Aceptación y pendientes
- GitHub CI completo en el SHA exacto: unitarias, Deno/Edge cuando aplique, Next.js, sitio, PostgreSQL y PostgREST.
- Tests sintéticos de precios de áridos y presentaciones sin unidad estructurada, congruencia centavo a centavo, transcripciones en orden diferente, revisión suplantada, IVA incluido/contradictorio, XSS, revocación y malformaciones.
- Prueba SQL reversible contra PILOTO, sin dejar cambios de esquema ni de registros, más verificación de permisos.
- Desplegar **solo con orden específica de publicación**. Prueba E2E de enlaces existentes y autorización de originales #525 siguen aparte.

# 127 — MVP-007: presupuesto entrante hacia borrador D046, sin IVA ni flete inventados

**31/10/2026 · [Issue #227](https://github.com/ProtectorRudo/Cotironda/issues/227) · desarrollo OFFLINE, apilado sobre MVP-006.**

## Problema

La ronda D046 ya admite oferta provisoria, pregunta por faltantes y requiere «Confirmo» asociado al borrador. Pero su contrato económico es `precioUnitarioNeto` + `ivaPorcentaje`; pasarle directamente cualquier precio leído por IA arriesga **sumar IVA dos veces** o **asumir flete gratuito** cuando el presupuesto no lo dice.

## Solución mínima sin nuevas pantallas

`src/domain/cotizacion-evidencia-mvp007.ts` crea `prepararPropuestaEconomicaMvp007` como un **puente no persistente** entre la lectura documental offline MVP-006 y la entrada D046.

- La cotización contiene precio de origen, referencia literal a una línea, cantidad/unidad, nota de IVA/flete y condición económica que el comprador pidió. Los precios en moneda tienen que estar **marcados explícitamente con `$` y poder cotejarse con la línea citada**. Un número de bolsas o kg no se convierte en precio.
- Si el documento declara «**más IVA**»: el importe informado puede tomarse como base `precioUnitarioNeto`; la alícuota se queda `null` a menos que sea explícita y no contradictoria.
- Si declara «**IVA incluido 21%**»: solo se calcula una base con división determinista usando enteros en centavos si **reconstituye exactamente** el precio bruto al volver a aplicar la alícuota. Si falta tasa, hay contradicción o no existe la recomposición exacta, base `null` y aclaración pendiente; jamás imputar 21% por defecto.
- Si **no informa IVA**: conservar estado `no_informado`; el comprador puede ver el importe literal original fuera de una comparación, pero no se presenta como neto ni se confirma un total económico.
- Si consta expresamente «**flete incluido**» o «**flete sin cargo**», el adicional para esa misma oferta se representa con 0 explícito. Si consta «**flete adicional $35.00**» con cita de esa misma línea, se acepta el monto. Si dice «flete aparte» sin monto, «a convenir» o no dice nada, queda `null` y D046 pide aclaración; no inventar entrega gratis.
- Si el comprador exigió **CON IVA incluido** y el presupuesto responde «más IVA» o no aclara, se marca incumplimiento/ambigüedad y no se rellena una base para confirmación automática.
- Se transmite a D046 **solo el esquema estricto que admite**. D046 mantiene controles de identidad, ledger/consentimiento/ventana, revisión y confirmación por proveedor. Aun después de «Confirmo», la equivalencia técnica queda `sin_verificar` y no participa en comparaciones de productos supuestamente iguales sin homologación independiente.

## Límites y seguridad

**Todavía no es WhatsApp real, tampoco IA que lee adjuntos.** El módulo supone que un adaptador servidor confiable ya relacionó cada precio con el ítem correcto. Una cita textual demuestra que la cifra existe en una línea, **no** que el ID de artículo sea correcto, ni que el documento sea auténtico, ni que la persona esté autorizada. Estas vinculaciones, almacenamiento inmutable de evidencia y consentimiento deben resolverse por ledger/infraestructura antes de activar el broker comercial. La función no usa red ni base y nunca confirma una oferta ni adjudica.

El ejemplo ensayado contempla IVA bruto 121→neto 100 con tasa expresamente 21%; un precio bruto 100 con esa tasa que no recompone exactamente al centavo se **retiene**, no se falsifica. Es deliberadamente conservador; el tratamiento monetario definitivo debe especificarse con facturas y redondeos comerciales reales, sin introducir centavos imaginarios.

## Pruebas

`tests/unit/mvp-cotizacion-evidencia-007.test.mjs` integra la propuesta con D046, incluye confirmación solo mediante mensaje correlacionado, equivalente técnico todavía no validado, IVA no declarado, tasa no declarada, IVA excluido, incompatibilidad con requisito del comprador, flete separado y sin costo expreso, números y citas forjadas, exactitud centesimal, formato argentino e idempotencia.

**Criterios para piloto real pendientes:** persistencia auténtica de ofertas/citas y control de fuente, interpretación IA contrastada con documentos, normalización de cantidades, IVA de proveedores monotributistas/actividades mixtas, notas generales versus por renglón, correcciones y precios globales de materiales, prueba con WhatsApp real, backup/restore auténtico de DEV (#175). No fusionar ni desplegar sin autorización.

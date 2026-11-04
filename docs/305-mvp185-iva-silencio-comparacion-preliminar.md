# MVP185 — IVA no mencionado: precio cotizado sin IVA para comparación comercial orientativa

**04/11/2026 · Desarrollo exclusivamente · Issues #529/#535/#524. Sin despliegue.**

## Decisión comercial del usuario (04/11)
En la práctica que describe el usuario, **la mayoría de los proveedores no aclara IVA**, y se interpreta que los valores publicados son **sin IVA**. Cuando incluyen IVA, suelen destacarlo explícitamente. Esta es una convención de Cotironda, **no** una estadística de mercado auditada, un dictamen tributario ni una afirmación que el proveedor efectivamente excluyó el impuesto.

## Nueva política: IVA tiene dos planos
1. **Plano documental / fiscal:** si la fuente no menciona IVA, conservar `iva.estado='no_informado'`, `iva.tasa=null`, sin texto literal ni porcentaje inventado. Si dice `IVA incluido`, conservar el hecho explícito. Si hay contradicción, no normalizar.
2. **Plano comparativo preliminar de materiales:** si IVA es `no_informado`, interpretar el **importe efectivamente cotizado** como precio **sin IVA por convención**, exclusivamente para comparar importes BASE de materiales. Si la fuente declara `sin IVA`, usar estado `sin_iva_declarado`. No sumar 21 %, no sustituir `ivaPorcentaje:null` por `0`.
3. **Cuando una oferta dice «IVA incluido»**, NO enfrentar su importe bruto contra cotizaciones que silencian IVA; requiere acreditación de base y alícuota por artículo o se muestra fuera del orden de precio base.
4. **El ranking final / adjudicación / contactos** permanece protegido. Un orden preliminar de importes cotizados no es un costo de entrega ni una elección de ganador: no incluye IVA calculado, flete, stock corroborado, mínimos comerciales o modalidad de pago. No llamar `totalFinal` al subtotal preliminar.

## Implementación
- Nuevo dominio offline `src/domain/precios-cotizados-sin-iva-mvp185.ts` exporta `interpretarSilencioIvaMvp185` y `compararPreciosCotizadosMvp185`.
- Recibe `DocumentoFuente` con prueba v9 vigente y SHA/HMAC consistente, hechos independientes `HechosPresentacionMvp170`, auditoría económica MVP166/167 del mismo hash, moneda corroborada por servicio PRIVADO y correlaciones artículo↔línea del mismo original. **No acepta directamente IA ni frontend como fuente de verdad.**
- Suma importes literales de artículos únicamente si el total de la fuente concilia, los descuentos están auditados y no quedan pallet/flete/recargo u otras líneas sin clasificar. Nunca mezcla ARS con USD: cada divisa forma un grupo independiente y no se combinan proveedores de monedas diferentes. Las cantidades y unidades corresponden al pedido, sin inventar equivalencias ni stock.
- Reutiliza el asignador exacto MVP118 para hasta 25 artículos sin dividir renglones, con una o dos ofertas complementarias. El mínimo de compra **no** se declara cero: se omite del subtotal preliminar y se advierte explícitamente su falta de evaluación.
- El resultado devuelve cantidad de renglones con **precio base homologable** (NO confundir con cobertura comercial, que se muestra en la vista independiente), opciones anónimas, **`subtotalMaterialesCotizadoSinIva`** y `ordenPorPrecioCotizado`; banderas permanentes `impuestosCalculados=false`, `rankingFinalHabilitado=false`, `stockConfirmado=false`, `adjudicacion=false`, `contactosRevelados=false`.
- La vista de seguimiento en código del piloto indica la convención cuando se detectan presupuestos con IVA no informado; **la vista económica actual sigue mostrando conteos y no un ranking**. No se desplegó esta edición.

## Ejemplo explicativo
- Proveedor A: cemento $200, arena $60,50, sin aclarar IVA. Referencia de materiales: **$260,50 sin IVA por convención**.
- Proveedor B: cemento $190 y proveedor C arena $60,50, sin IVA declarado. Dos proveedores complementarios: **$250,50 de materiales**. Ninguno de esos subtotales es un costo final de entrega; si las condiciones cambian, podría cambiar la opción.
- Proveedor D ofrece esos mismos artículos a **$255 con IVA incluido**. No puede aparecer automáticamente más caro o más barato que A/B/C sin una base fiscal homogénea.

## Regresiones y límites
Pruebas del dominio: IVA silencioso, explícito excluido e incluido, combinaciones parciales, sumas fuente y revisiones, fuente y moneda incorrectas, cantidad/unidad divergente, pallet no asignado, privacidad, límites y no retroactividad. La prueba de interfaz solo verifica texto y no habilita posiciones.

**Pendientes prioritarios:**
1. Probar PR y fusionar en rama de desarrollo SOLO con CI aprobado.
2. Conectar el servicio privado real de PDF/Excel, moneda, unidades y correlaciones al nuevo motor. Este PR por sí solo **NO publica un ranking** para los 4 documentos actuales; en ellos también faltan pruebas de unidades, plazos, condiciones y algunos rubros.
3. Permitir resultados preliminares al comprador con token y aislamiento de ronda después de pruebas E2E, sin datos privados. Descartar automáticamente la proyección ante revocación o desactualización.
4. Completar autorizaciones para descarga de todos los presupuestos originales (#525) y finalistas/cierre controlado (#524). Nada de `main`, producción, Whapi ni importes alterados.

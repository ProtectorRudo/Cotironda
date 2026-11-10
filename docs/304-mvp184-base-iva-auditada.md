# MVP184 — Tratamiento del IVA acreditado por renglón

**04/11/2026 · Desarrollo, sin despliegue · Issues #535, #524 y #529.**

## Problema real del puente
El adaptador `adaptarDocumentoMvp162` exige IVA explícito y conciliación exacta con el original, pero antes comparaba SIEMPRE el importe bruto (`neto + IVA`) con el total literal de la línea del proveedor. Esa regla descalificaba automáticamente una cotización que **expresa precios SIN IVA**, cuyo total documental correcto es la base imponible, aunque el impuesto y su alícuota sí estuvieran acreditados.

Esta corrección NO supone que los cuatro presupuestos reales del piloto puedan rankearse: siguen sin IVA fiscal, stock y condiciones corroboradas. Tampoco decide cuál es la alícuota aplicable.

## Contrato auditado MVP184
`TerminosAuditados.precios[]` requiere ahora **por línea y con el mismo SHA**:
- `unitarioNetoTrasDescuento`: precio neto tributario después de TODOS los descuentos, no lista ni precio IVA incluido.
- `ivaExplicito`: alícuota `0`, `10.5` o `21`, comprobada en el original o por atestación fiscal válida; **null NO significa cero**.
- `tratamientoIva`: `incluido_en_total` o `excluido_del_total` **sólo si fue comprobado en fuente**. No inferir del rubro, producto, marca, monto, comprador, LLM ni silencio del documento.

Aritmética BigInt (redondeo HALF UP a centavo, la misma que el comparador MVP118):
1. `base = round(unitarioNetoTrasDescuento * cantidadOriginal, 3 decimales)`.
2. `bruto = base + round(base * IVA, 2 decimales)`.
3. Para **incluido en total**, la línea documental debe ser EXACTAMENTE `bruto`. Para **excluido del total**, la línea documental debe ser EXACTAMENTE `base`.
4. El `OfertaComparable` siempre conserva el neto tributario y la alícuota auditados. **El comparador existente** calculará el bruto final de la canasta. No se agrega IVA dos veces ni se descuenta de la fuente sin prueba.
5. Si el documento y la base informada discrepan, se devuelve `visible_no_comparable` con `importe_no_conciliado`. Tratamiento no informado produce `condiciones_sin_acreditar`; alícuota no informada, `importe_sin_acreditar`. La oferta original permanece visible sin inventar posición.

El archivo, su total literal, su hash, extras, IVA textual, fecha y proveedor se mantienen inmutables. La política de flete (incluido / fuera del total / sin cargo) sigue siendo independiente y requiere corroboración.

## Pruebas sintéticas y regresión
- Con 2 bolsas a $100 netos y **21% excluido**, la fuente dice **$200,00** y la opción económica verificable resulta **$242,00**.
- Mismas 2 bolsas con **21% incluido**, la fuente dice **$242,00**. Cambiar artificialmente el tratamiento en cualquiera de los dos casos **no concilia**.
- IVA ausente, alícuota nula o base desconocida nunca habilitan importe.
- Dos líneas de un mismo archivo con bases fiscales distintas: total fuente **$260,50**, base de comprador con impuestos **$302,50**; ambas líneas conciliadas individualmente y el original sin reescritura.
- Las pruebas de presentaciones áridas MVP165 y de parciales MVP183 preservan su comportamiento, ahora con tratamiento del IVA explicitado en fixtures sintéticas.

## Límite y siguiente paso real
Esto **corrige el contrato monetario**, no constituye un verificador autónomo terminado. Los auditores MVP166/167 leen el original, pero **no producen todavía `TerminosAuditados` completo con acreditación por línea, stock, entrega, mínimo, IVA y flete**. Prohibido alimentar este contrato con valores inventados, una salida libre de IA o el navegador.

Falta el servicio privado que reúna el original PDF/Excel, sus localizadores confiables, fuente v9/SHA y revisiones, y ejecute el adaptador + comparador con todos los proveedores de la ronda; además la prueba E2E buyer y descarga consentida #525. Hasta entonces, **ranking real OFF**, ningún finalista, contactos ni WhatsApp. No se tocó Supabase, Vercel ni producción.

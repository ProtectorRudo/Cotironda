# MVP-118 — comparador económico exacto para 25 artículos y hasta 2 proveedores

**02/11/2026 — Issue #447 — rama de desarrollo, NO instalada ni conectada a WhatsApp real.**

## Hallazgo

La ruta documental MVP117 ya acepta solicitudes de hasta 25 materiales y se comprobó que no recorta el PDF por proveedor. El comparador económico puro de `src/domain/comparacion-ofertas.ts` seguía en un tope **8** y enumeraba todas las posibles asignaciones de artículos para cada par de proveedores: `2^N`. Llevar ese algoritmo a 25 habría producido hasta **33.554.432 asignaciones por pareja**, con hasta diez ofertas y 45 parejas por solicitud. No es apto para un servicio sin demoras.

## Solución implementada

Nuevo helper sin red ni dependencias: `src/domain/comparacion-pares-exacta.ts`.

- Mantiene asignación **indivisible** de cada renglón completo a un solo proveedor, sin agregar cantidades parciales inventadas.
- Calcula costos de renglón con enteros `BigInt` y redondeo por renglón, incluyendo el IVA expresamente declarado.
- Flete final, moneda, pago, plazo y mínimo de compra de cada negocio requieren datos verificados; si falta cualquiera, la modalidad económica es **no comparable**. Nunca presupone flete gratis, IVA 21% ni mínimos cero.
- Los grupos de monedas, formas de pago o plazo diferentes no comparten ranking. Para cada pareja viable, compara el costo total íntegro de materiales con IVA y **cada flete**, respetando los mínimos de compra **independientes**.
- Dos parciales pueden cubrir juntos una canasta; dos importes parciales no compiten solos como presupuesto total.
- Usa enumeración por mitades, clasificación de estados, un árbol Fenwick de prefijos mínimos y desempate estable, con coste aproximado `O(2^(N/2) × N)` por pareja en vez de `O(2^N × N)`. El máximo de 25 implica como mucho 8.192 estados en una de las mitades.
- El resultado indica `comparacion_offline_sin_adjudicacion` y nunca expone teléfonos, adjudica ni envía WhatsApps; sigue declarando `optimoGlobalGarantizado=false` porque no cubre reparto fraccionado de un renglón ni todas las condiciones del mercado.

## Pruebas

`tests/unit/mvp118-economic-25-exact.test.mjs` incluye:
1. **150 escenarios** pequeños contrastados con un algoritmo completamente independiente por fuerza bruta, incluidos montos nulos, faltantes, mínimos y desempates.
2. Veinticinco artículos, importes equivalentes y mínimos asimétricos; elección exacta de 15 artículos al negocio A y 10 al B.
3. Mínimos incompatibles con el valor de la canasta: no genera pareja ficticia.
4. Dos presupuestos parciales con artículos complementarios: opción completa únicamente juntos, con fletes sumados, sin premiar el parcial barato.
5. Veinticinco artículos y diez ofertas para comprobar que no se dispara el cálculo con 45 parejas.
6. IVA/flete/pago/despacho desconocidos: **cero opciones económicas clasificadas**.
7. Rechazo explícito de más de 25 artículos y entradas anómalas.
8. Regresiones existentes de `comparacion-ofertas.test.mjs`, incluyendo dinero, IVA, precios, moneda y privacidad.

## Lo que NO habilita todavía

**No se conecta aún al cierre real del piloto.** Los presupuestos recibidos por WhatsApp están versionados y tienen auditoría de fuente/importes, pero **no existe un contrato verificado que transforme todos los conceptos textuales, IVA, flete, pago, disponibilidad, descuentos e impuestos de la fuente en los campos económicos explícitos que exige el comparador**. Conectarlo directamente a los datos actuales exigiría asumir valores que el proveedor no declaró o perder cargos, contrariando el contrato docs/223.

Antes de declarar «mejor precio» en el piloto se necesita: extracción económica de condiciones de cada presupuesto, comprobación de fuente literal incluida letra chica, cálculo determinista, mismas unidades y cantidad, versiones vigentes y vínculo de identidad privado. Si no se pueden comparar, el cierre comercial debe mantenerse **solo por cobertura** y explicarlo claramente, tal como MVP115.

**No hay publicación ni merge.** Las 13 puertas de base pendientes, Edge de WhatsApp y worker de finalistas no están instalados en la versión actual del piloto. La prueba con 3 teléfonos sigue pendiente y requiere `Publicalo: PILOTO` para desplegar el entorno autorizado. El máximo de 25 ítems es un límite técnico del procesamiento por lote actual y no equivale a «sin límites».

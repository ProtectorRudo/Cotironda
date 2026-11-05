# MVP210 — Fuente verificada v9 → comparador económico → comprador

**Estado: solo desarrollo**. Issue #529 P0-B/P0-C/P0-E, #524, #535.
No se publica ni se envían WhatsApps. No hay adjudicación ni contacto.

## Qué integra

Había dos piezas correctas, pero desconectadas:

- MVP185/MVP205: motor determinista que, cuando el original verifica
  unidad, cantidad, descuento y moneda expresamente declarada, puede
  obtener **subtotales preliminares de materiales**, con una o dos
  ofertas y asignación por artículo, sin afirmar costo total final.
- MVP186/MVP204: pantalla existente con referencias de importes y
  condiciones, que todavía rechazaba el literal monetario `AR$`,
  `US$` o `U$S` por una expresión regular demasiado restrictiva.

El puente `resumirMaterialesCotizadosCompradorMvp210` se ejecuta solo
cuando la ronda está **cerrada**, el enlace privado del comprador
continúa autorizado y están presentes ambos resultados de los RPCs
independientes de comprador MVP175 y MVP180. Vuelve a calcular la
proyección MVP186 desde el MISMO sobre de fuentes v9, comprueba su
igualdad completa y crea las correlaciones técnicas usando los
renglones que el comparador MVP172 ya cotejó contra el pedido.

**No usa el orden interno SQL/HMAC para asociar cotizaciones**:
primero vincula cada fuente al texto completo revisado de la oferta,
después la reordena por la etiqueta visible del comprador. Los
subtotales se calculan EXCLUSIVAMENTE reutilizando el motor MVP185;
se conservan pruebas de bolsón nominal, envases de cemento/hidrófugo,
importe unitario tras descuento y líneas adicionales.

### Seguridad del dato y de la presentación

1. El Edge devuelve solo etiquetas anónimas del comprador, conteos,
   motivo de exclusión dentro de un conjunto fijo de códigos y
   opciones de canasta completa con moneda, asignación e importe.
   Ningún HMAC, SHA, archivo, nombre real, teléfono, descuento privado
   ni camino de Storage sale de la función.
2. El proxy Vercel recalcula el subtotal en centavos con **BigInt**
   recorriendo exactamente un precio fuente por cada artículo de la
   canasta; comprueba misma moneda ARS/USD explícita, estado de
   impuestos, etiquetas, todos los artículos y las advertencias
   obligatorias. Si un campo está alterado, elimina SOLO esta
   proyección y conserva todas las ofertas verificadas.
3. El navegador repite validaciones de estructura y suma de importes,
   construye elementos con `textContent` y limpia todo al revocar
   enlace, cambiar token, perder la conexión o mostrar ronda abierta.
4. `MVP204` usa `monedaExplicitaFuenteMvp205` para distinguir ARS/USD
   **únicamente cuando TODOS los importes del documento v9 tienen
   prefijos originales explícitos y coherentes**. El símbolo `$`
   aislado se mantiene sin acreditación, sin asumir pesos.
5. Una opción puede cubrir hasta dos ofertas, pero NO compara totales
   parciales, NO genera premio, ranking final, contacto, original
   descargable, IA nueva, ni mensaje a proveedores.
6. El comprador ve TODOS los presupuestos recibidos, incluso los que
   no forman ninguna canasta completa.

## Información mostrada

Cuando los originales no permiten calcular una canasta completa (caso
de los cuatro documentos anonimizados actuales del piloto, sin moneda
acreditada), la pantalla muestra **por qué no se puede calcular**
sin exigir otra confirmación ni inventar un número.

Si los originales sí acreditan moneda, unidades, cantidades y
descuentos, la pantalla puede mostrar, por ejemplo:

- *Canasta con Presupuesto 1 + Presupuesto 2; subtotal ARS*
  **100,00** (solo materiales de origen).
- Etiqueta fija: **sin precio final**, flete sin normalizar, stock
  no acreditado, IVA no informado interpretado sin IVA únicamente como
  convención comercial, mínimos/pago no evaluados.

No se muestra una posición numérica de ranking y las distintas monedas
jamás se convierten o mezclan.

## Pruebas y riesgos pendientes

- 2 rondas anonimizadas de PILOTO, 4 originales v9, mezcla PDF/Excel,
  SHA/revisión, IVA, $ ambiguo, orden HMAC invertido.
- Caso de moneda explícita `AR$` preservada hasta el comprador.
- Control de proxy y DOM con subtotales falsificados, moneda
  contradictoria, coberturas incompletas, asignaciones ajenas,
  revocación y desconexión.
- No toca tablas, SQL, Worker Whapi, cron, producción ni PILOTO.

### Para cerrar P0-C de verdad

Sigue faltando atestación de moneda y condiciones comerciales suficientes
para la mayoría de documentos del piloto, su conexión en la versión
publicada, el resultado de cierre prospectivo con una ronda NUEVA y
descargas realmente autorizadas. La oferta puede ser auditada sin ser
económicamente comparable. **No marcar #529 ni #524 completados**.

La conversión de IVA fiscal, flete, mínimos y disponibilidad requiere
fuentes y reglas independientes; no se resuelve con un total menor
ni con una salida de IA.

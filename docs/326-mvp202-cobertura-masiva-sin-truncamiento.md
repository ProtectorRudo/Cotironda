# MVP202 — comparación económica sin truncar participantes (desarrollo)

**Alcance:** comparador económico offline `compararCotizacionesOffline` y
solucionador exacto de pares. **No publicado, sin migraciones, sin WhatsApp,
sin contacto ni producción**. Issues #532, #524, #529.

## Problema constatado
El comparador rechazaba cualquier solicitud con más de 25 materiales
o más de 10 ofertas. Este límite puede ocultar oportunidades comerciales si
los consumidores recortan antes de llamar al motor. No está permitido
ordenar solo un subconjunto de proveedores fingiendo que se estudiaron todos.

## Solución limitada y verificable
- Admite hasta **100 artículos y 200 ofertas** en la capa económica offline,
  sin paginar ni omitir ninguno. Sobrepasar los límites físicos produce un
  error explícito y debe reflejarse en la interfaz; nunca tomar los primeros N.
- La cobertura se calcula para **todas** las ofertas y todos los artículos.
  Los totales de un proveedor individual únicamente se calculan cuando
  todos sus renglones y condiciones económicas están verificados.
- El solucionador exacto puede asignar hasta **100 artículos** a una pareja
  si **no más de 25** son flexibles entre ambos proveedores. El resto
  debe pertenecer necesariamente a uno de los dos (sin dividir cantidades).
- Se ejecuta un preflight de **todas** las parejas posibles usando un
  presupuesto determinista de trabajo, no una selección arbitraria de
  proveedores ni de renglones. Si alguna pareja exige >25 artículos flexibles
  o el costo total excede el presupuesto, se **suspenden TODAS** las
  comparaciones de pares. Se conservan los costos individuales acreditados,
  pero **ninguno recibe posición ni se ordena por precio**. El contrato devuelve
  `comparacionPares=suspendida_por_complejidad` y `paresCalculados=0`.
- Si todas las parejas se pueden calcular, `comparacionPares=exhaustiva`
  y se mantiene el cálculo exacto de costo, IVA explícito, fletes, mínimos,
  condiciones equivalentes y asignación completa de renglones.
- No se generan ganadores ni se exige que una oferta parcial aparezca como
  completa. El motor no tiene acceso a nombres reales ni a teléfonos.

## Pruebas / criterios de aceptación
1. 50 artículos distribuidos entre dos proveedores = pareja exacta de $75,
   50 asignaciones completas, sin inventar cantidades.
2. 50 artículos flexibles con costo exponencial = 2 ofertas conservadas,
   0 pares/rankings fabricados.
3. 120 ofertas × 50 artículos = **6.000 cruces de cobertura** conservados,
   120 referencias individuales y resultados estables ante reordenamiento.
4. 12 ofertas × 2 artículos = 66 parejas calculadas, sin omitir participantes.
5. IVA o flete desconocidos y forma de pago no informada jamás reciben
   costo completo inventado. Entradas >100/200 se rechazan expresamente.

## Qué sigue ABIERTO en #532
- La extracción documental y los esquemas del piloto siguen aplicando límites
  anteriores en varias capas (por ejemplo, el selector MVP196 y el portal).
- Trabajo por grupos de rubros, paginación e infraestructura asíncrona para
  más de 200 proveedores y 100 artículos; benchmarking y presupuestos reales.
- Evaluación económica exacta escalable para 26+ líneas flexibles, sin
  insinuar ranking global ni sacrificar IVA, flete, disponibilidades o mínimos.
- E2E auténtico con fuente v9, dos empresas, cierre y consentimiento.
  Ninguna regla de despacho o adjudicación se modifica.

**No marcar P0-H terminado en #529** hasta que el procesamiento real y el
portal manejen estos volúmenes y los casos que superen el presupuesto tengan
una salida comercial comprensible.

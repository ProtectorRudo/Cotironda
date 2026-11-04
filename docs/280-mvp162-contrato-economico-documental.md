# MVP162 — Puente de la lectura documental al ranking económico

Fecha: 03/11/2026. Issue #533, plan maestro #529. Implementación pura en rama de desarrollo, sin despliegue.

## Auditoría real
Las dos cotizaciones PDF de la ronda 469cb459... tienen 3 artículos cada una. Fuente v9 verificada, sumas y originales íntegros, pero las 6 unidades `unit_literal` son NULL. El comprador pidió arena fina 1 m³, piedra partida 2 m³ y cemento gris 25 bolsas de 25 kg. Los PDF ofrecen BIG BAG sin acreditar equivalencia de volumen y granulometría. Además `ranking_allowed=false` y no constan atestaciones independientes de pago, IVA, flete, mínimo y condiciones. Deben permanecer visibles y sin recomendación económica hasta que un verificador autónomo aporte hechos respaldados.

## Cambio implementado
El módulo `src/domain/adaptador-documental-mvp162.ts` NO reemplaza el lector ni el comparador. Convierte la fila fuente privada y su evidencia en `OfertaComparable` únicamente si:

- Prueba de versión **más reciente y cotización vigente**, mismo request/message/SHA, todas las líneas preservadas, montos fuente no ambiguos, sumas y total declarados exactamente equilibrados; una revisión posterior pendiente impide reutilizar evidencia antigua.
- Correspondencia 1:1 de cada artículo requerido, con cantidad y unidad literales normalizadas, equivalencia técnica y **disponibilidad corroboradas** por un verificador confiable distinto de la predicción de IA. La cantidad cotizada NO prueba que haya stock.
- Ningún concepto adicional queda sin clasificar: no se pierden bolsones, pallets, flete, descuentos o IVA al comparar.
- Auditoría comercial de la misma fuente: moneda, pago, plazo, flete, mínimo y precio neto tras descuentos, con tasa IVA explícita por artículo. Debe constar si el flete es adicional al total fuente, ya incluido en el precio o expresamente sin cargo; **nunca se lo cuenta dos veces**. La aritmética BigInt verifica que el neto con IVA y cantidad sea el importe original de cada renglón.

Cuando falta un dato, devuelve `visible_no_comparable` con motivos para el backend, pero no borra presupuestos ni hace una nueva pregunta obligatoria al proveedor. La cotización fuente verificada sigue visible como ahora. El motor de recomendaciones MVP160 permanece desconectado de estas fuentes hasta validar pruebas posteriores; nunca usar los metadatos económicos de este módulo provenientes de un navegador o salida libre de IA. El primer conector debe obtenerlos de una auditoría de documento confiable que indique página/celda/texto y SHA.

## Pruebas
Se ensayan PDFs con 3 líneas y unidades ausentes, formatos ARS, entrada con IVA/flete/descuento incompleto, extras no incluidos, cantidades de distintas presentaciones, SHA ajeno, relectura pendiente, líneas repetidas, datos privados y un caso completo compatible con el comparador de BigInt actual. No hay nuevos cron, notificaciones, tablas, archivos firmados ni permisos.

## Pendientes
1. Extractor verificado de atributos técnicos y condiciones comerciales de PDFs/Excel/Word con localizador página/celda, sin requerir diccionario cerrado ni inventar datos.
2. Aplicar el adaptador en un servicio privado al cierre, mostrar motivos de comparabilidad por artículo y permitir ranking entre opciones equivalentes sin fingir que todas son iguales.
3. Ejecutar benchmarks y soportar más de 25 artículos/10 ofertas (#532).
4. Comprobar cierre+recomendados+originales consentidos+avisos en una ronda nueva; no alterar rondas antiguas.

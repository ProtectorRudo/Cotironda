# 108 — D045: ensayo comercial integral sin WhatsApp ni IA remota

**31/10/2026 · Issue #193 · PR apilado sobre D044/#192.**

## Para qué sirve

Durante las primeras etapas concentramos pruebas de seguridad y recuperación. D045 prueba un recorrido comercial coherente con UX-001 usando los **motores existentes**, sin crear un segundo cálculo de precios ni afirmar que ya contamos con una plataforma de licitación operativa.

`scripts/demo/ciclo-comercial-d045.mjs` compone:
1. `prepararBorradorDocumental`: cuatro líneas de un pedido sintético, con cantidades, unidades, ubicaciones y confianza documentada por una **salida simulada**, no por IA real.
2. `simularInvitacionesDesdeBorrador`: catálogo curado, producto canónico, zona, opt-in, baja y plan de un único mensaje por proveedor/ronda **sin enviarlo**. Cemento, pintura látex y placas de yeso pueden continuar; el servicio indeterminado queda retenido.
3. `compararCotizacionesOffline`: tres ofertas sintéticas **previamente marcadas como confirmadas y técnicamente verificadas por el fixture**, con precios unitarios, IVA explícito 21%, flete, mínimo de compra, condiciones idénticas y total final calculado por BigInt. No existe ninguna transformación automática de consulta a oferta.

## Cómo ejecutar

Desde una copia local del repositorio en la rama del PR, con Node 22.16 o posterior:

    node --experimental-strip-types scripts/demo/ciclo-comercial-d045.mjs

La salida es un resumen sin identidad comercial de proveedores ni contactos, marcado permanentemente como simulación. No hay DB, Supabase, openAI, Whapi ni operaciones de red.

## Ejemplo económico enteramente ficticio

Pedido **solo para demostrar la comparación**: 20 bolsas cemento 50 kg, 5 L de látex y 10 placas RH. Un proveedor completo ofrece materiales por 4.400,00 netos; IVA 21%: 924,00; flete: 150,00. Total: **5.474,00 ARS**. Otros dos proveedores parciales cubren por separado cemento y acabados, con materiales netos 3.250,00; IVA 682,50; fletes independientes 110,00 + 130,00. Total conjunto: **4.172,50 ARS**.

Estos números NO representan una cotización real ni establecen precios de mercado. Cada oferente del comparador usa un identificador anónimo, y el resultado nunca adjudica ni revela contactos. La comparación sólo es válida para las cantidades, especificaciones y condiciones del fixture.

**Separación crucial:** un comercio que comercializa bolsas CPC de 25 kg recibe una *consulta* si el comprador pide 50 kg; el plan puede señalar 40 bolsas como orientación para cubrir 20 bolsas de 50 kg, pero `comparable_como_identico=false`. El precio por presentación no se homologa ni ingresa al ranking sin confirmación explícita del proveedor y verificación técnica independiente. El fixture de comparación usa exclusivamente líneas cotizadas en las unidades requeridas y marcadas verificadas por el propio test; nunca transforma automáticamente la alternativa de 25 kg en oferta comparable.

## Controles de seguridad y calidad

- Solicitud sin autorización del comprador => excepción y ninguna invitación.
- Proveedores con opt-out, sin consentimiento o fuera de zona => sin invitación.
- Una línea dudosa => retenida, sin impedir el avance de tres líneas seguras.
- Una marca mencionada pero no exigida => no bloquear marcas alternativas; marca explícitamente obligatoria sigue otra regla existente.
- Oferta parcial => cobertura separada, sin total comparable para toda la canasta.
- Combinación de dos proveedores => suma una sola asignación por línea y ambos fletes; no sumar dos ofertas incompletas del mismo artículo.
- Oferta sin confirmar, sin IVA, sin flete o con especificación no verificada => no se presenta como opción económica completa.
- No hay puntos automáticos ni puestos engañosos de proveedores de distinta cobertura; decisión final humana.

## Puertas pendientes para una operación comercial real

D045 no incluye recepción de archivos o presupuestos por Whapi, detección IA real de cotizaciones, confirmación de precios por proveedor, conversión homologada entre unidades/presentaciones, encolado de invitaciones, recuperación persistente de ofertas, RLS de licitaciones instaladas o adjudicación. Se necesita integrar y verificar estas piezas por etapas, luego probar UX con compradores y proveedores reales voluntarios. Etapa 01 sigue abierta por backup/restauración, seguridad de uploads y otros gates; **D024–D035 siguen sin instalarse en DEV**.

Pruebas: `tests/unit/ciclo-comercial-d045.test.mjs` y todos los checks habituales de CI. Registro de resultados concretos en el PR correspondiente. El documento no declara completada la Etapa 03.

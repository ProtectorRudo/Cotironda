# Decisión de arquitectura 340 — Cotironda IA Central y rubros

**Fecha:** 2026-11-05. **Aprobación del propietario:** reconstrucción profunda del
sistema, con IA como cerebro operativo; visualización por rubro para el comprador.
**Estado de esta entrega:** implementación inicial EN RAMA; NO circuito completo.
**Alcance:** piloto, sin cambio en producción ni envío de WhatsApps reales.

## Problema comprobado, no una opinión

El 05/11 un comprador real escribió un pedido trivial de cemento,
bolsones de arena y piedra con entrega en La Plata. El webhook lo recibió,
pero el fast-path rígido no entendió encabezado, presentación y categorías,
y la IA respondió `ask_material`. La reparación MVP215 hizo pasar ese caso
pero no solucionó el problema de arquitectura: `core.ts`, `ai-evidence.ts`,
`ai-contract.ts` y la coincidencia `family_code` del catálogo siguen
imponiendo coincidencia de palabras y familias codificadas, no comprensión
semántica. El proveedor puede tener producto equivalente bajo otro nombre.
Una cotización sin referencia a ronda también puede estar mal asociada.

## Nueva regla esencial

**La IA comprende, planifica, interpreta y explica. PostgreSQL ejecuta
transacciones y cálculos con trazabilidad; WhatsApp actúa solo por un
broker de herramientas con permisos, controles de identidad y deduplicación.**
No codificar diccionarios de posibles errores ortográficos, marcas o sinónimos.
No tratar una segunda coincidencia de expresiones regulares como prueba
universal de comprensión.

## Flujo objetivo y contrato

1. Whapi verifica webhook, firma/origen, identidad, consentimiento y
   `message_hmac`. Fuente original cifrada y eventos idempotentes.
2. **IA lectora** extrae en JSON estructurado intención, localidad,
   materiales, cantidad, unidad, presentación, rubro, dudas y citas
   TEXTUALES EXACTAS de origen, sea lenguaje coloquial, imágenes,
   Word, Excel, PDF o audios debidamente transcritos.
3. **Segunda lectura independiente** sobre los mismos bytes/texto
   confirma completitud, números, unidades y categorías.
   El servidor resuelve offsets y verifica que cada cita exista.
   No se pide aclaración por subtipo desconocido que no fue exigido.
   Si falta una cantidad inequívoca o dos lecturas no concuerdan,
   pedir SOLO la aclaración indispensable, preservando la misma solicitud.
4. **IA enrutadora** consulta herramientas de solo lectura:
   `buscar_proveedores_autorizados`, `leer_catalogo`,
   `verificar_zona`, `historial_de_ronda`. Propone qué ítems
   corresponden a cada proveedor/rubro, según el catálogo REAL que
   declaró, aunque las palabras sean diferentes.
   Broker verifica que esos IDs y rubros estén autorizados,
   comerciante activo y zona correcta; nunca ruta sin prueba de catálogo.
5. **Broker transaccional** `preparar_ronda` crea versiones
   persistentes, líneas por rubro e identificadores de pedido;
   `generar_pdf_por_proveedor` genera listado SOLO de sus rubros;
   `despachar_solicitud` exige idempotencia y estados de entrega.
   Buyer revision/confirmación cuando corresponda al flujo aprobado;
   ningún envío con estado previo incierto.
6. Proveedor responde por cualquier formato. El sistema **asocia**
   primero por mensaje citado de Whapi, código de ronda/documento y
   contexto de invitación. Una única ronda compatible permite vínculo
   contextual; dos rondas plausibles exigen una pregunta puntual. LA IA
   NO resuelve unilateralmente una ambigüedad de identidad económica.
7. IA interpreta CADA original y su contexto sin borrar ítems extra
   como pallets/bolsones, ni inventar IVA, moneda, descuento, flete,
   stock, marcas o totales. Otra lectura + cotejo del documento
   comprueban importes, líneas y condiciones. Agradecimiento breve.
8. Comparador determinista calcula **cobertura por rubro**,
   equivalencias comercialmente razonables y precios de artículos
   realmente comparables. IA propone y explica opciones de hasta dos
   proveedores por rubro; nunca declara ganador por total parcial.
   El comprador puede ver TODOS los presupuestos y seleccionar
   manualmente; si una oferta cubre dos rubros, se conserva íntegra
   y los renglones se vinculan a los rubros pertinentes sin duplicar
   cobros ni originales.
9. Cierre y originales después del plazo, exclusivamente bajo
   permisos/consentimientos válidos, con OTP y bitácora; contactos
   nunca se revelan por decisión libre del modelo.

## Taxonomía para la pantalla del comprador

Los rubros iniciales son `obra_gruesa`, `pintura`, `electricidad`,
`construccion_seca`, `sanitarios`, `ferreteria` y `otros`.
No es un vocabulario de productos: son grupos amplios de compra.
IA propone el rubro por renglón; el backend conserva su fuente y la
categoría elegida en datos de la ronda. Para rondas heredadas,
`rubros-comprador-mvp216.ts` traduce SOLO familias ya curadas a
rubros; lo demás cae en `otros`, sin adivinar. No se ocultan
artículos ni ofertas por faltar categoría.

La misma pantalla `piloto/seguimiento-web` agrupa importes y
alternativas por rubro, y deja los presupuestos completos, incluso
parciales, visibles aparte. No se comparan totales entre rubros ni
entre ofertas de cobertura diferente. La salida pública contiene
solo `itemId,rubro` revisados, sin contactos ni hash de fuente;
la Edge consulta la RPC privada bajo token, el proxy valida lista
completa y el DOM repite validación. Al revocar se limpia todo.

## Módulos entregados en esta primera rama

- `src/domain/ia-central/cliente-openai-v1.ts`: modelo vía Responses,
  dos lecturas y JSON estructurado, sin tools ni almacenamiento remoto,
  con timeout y rechazo ante errores. No está conectado a tráfico real.
- `src/domain/ia-central/contrato-v1.ts`: validación de evidencias,
  doble lectura, broker de ruteo sobre catálogo autorizado,
  asociación determinista de respuesta a ronda.
- `src/domain/rubros-comprador-mvp216.ts`: mapa de rubros por artículo
  sobre fuentes privadas ya verificadas.
- Edge de seguimiento + proxy + navegador: proyección por rubro,
  sin ampliar exposición de originales ni contactos.
- Pruebas unitarias del contrato y del DOM, incluida jerga y ambigüedad.

## Seguridad y costos NO negociables

- IA puede proponer operaciones; una `tool_call` no es autorización.
  Controlar roles por empresa, permisos, rubros, citas de origen y
  deduplicación en SQL en cada ejecución; no confiar en prompt.
- Cifrar originales/contactos; separar DEV, PILOTO y producción.
  No conceder `service_role` al navegador ni reabrir signup.
- Límite por contacto de tokens/llamadas; dos lecturas cuestan el
  doble, por lo que se seleccionarán modelos según evaluación real.
  No reintentar un mensaje Whapi `uncertain` sin conciliación.
- Sumas y rankings: aritmética decimal determinista, moneda acreditada,
  IVA no informado entendido comercialmente sin IVA pero nunca alícuota
  cero; no inventar flete, stock ni una posición.
- Una lista con 200 artículos NO se corta silenciosamente a 25.
  Paginación de catálogo y documentos, procesamiento por lotes con
  cobertura completa o estado de revisión explícito.

## Plan de trabajo desde ahora (reemplaza prioridad de parches)

**Fase A — interpretación semántica en sombra.**
Comparar el motor viejo y el nuevo con un corpus de al menos 150
pedidos/replies, incluyendo 50 con errores, abreviaturas y números
en palabras. Medir ítems detectados, falsos positivos, omisiones,
cantidad, ubicación, costos y tiempos. Ninguna salida por WhatsApp.
Activación por bandera SOLO después de evidencia de fuente y presupuesto.

**Fase B — catálogo por rubro y ruteo semántico.**
Persistir rubro en líneas de pedido; dar al enrutador catálogos reales
solo de negocios autorizados en la localidad. Generar PDF por rubro,
id de solicitud estable y outbox seguro, sin depender de igualdad de
`family_code`. Probar pedido mixto de tres rubros con 6 proveedores
y ofertas parciales.

**Fase C — recepción y asociación.**
Texto, PDF, Excel, Word, imágenes y audio admitidos por prueba real;
firma, archivo SHA, dos lecturas y conciliación de importes. Distinguir
dos rondas abiertas del mismo proveedor; cero asignaciones equivocadas.

**Fase D — vista por rubro.**
Integrar rubros de IA persistidos; comprobar Edge→Vercel→DOM y
revocación con cotizaciones en al menos tres rubros. Publicar SOLO
con autorización del entorno PILOTO, sin esconder presupuestos.

**Fase E — comparación, originales y cierre.**
Por rubro cobertura + comparabilidad económica, máximo dos proveedores
por recomendación; mantener compra manual y todos los originales
autorizados. Completar OTP, consentimientos prospectivos, cron y
notificaciones; jamás extrapolar a producción.

**Fase F — piloto completo REAL.**
Un comprador y dos proveedores ya consentidos, ronda nueva autenticada,
llegada al webhook, PDF a ambos, respuestas en dos formatos,
fuente conciliada, seguimiento, plazo/cierre, verificación de identidad
y descarga autorizada; registrar estados reales, no solo tests CI.

## Puertas de salida

- 0 envíos duplicados y 0 revelaciones sin permiso en pruebas adversariales.
- 0 cotizaciones asociadas a ronda incorrecta en fixtures.
- 0 artículos omitidos silenciosamente; aclaración específica cuando falta.
- Cobertura y precios comparados solo sobre condiciones equivalentes.
- Prueba navegador y WhatsApp REAL documentada antes de cerrar #529.
- PR en rama de integración, código/protocolos revisados y CI completo;
  no fusionar a main ni publicar en producción sin autorización posterior.

**Advertencia:** lo entregado inicialmente es la base y la
organización por rubro, NO un cambio de motor ya activo en Whapi
ni un piloto funcional E2E. El despliegue actual del webhook v47 sigue
vigente y no se reemplaza hasta demostrar la nueva cadena.

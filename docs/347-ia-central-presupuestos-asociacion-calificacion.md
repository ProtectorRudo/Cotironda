# Decisión 347 — Respuesta del proveedor: identificar comprador, leer y calificar sin sesgos

**Fecha:** 2026-11-05.
**Estado:** primera implementación en DESARROLLO, sin activar la bandera ni
desplegar en el PILOTO. Vinculada al plan #597 y checklist #529.

## Flujo acordado, separado en tres obligaciones

1. **Identidad y ronda, antes de interpretar dinero.** El webhook firmado
   recibe texto o documento de un proveedor ya registrado. La base identifica
   el mensaje entrante mediante HMAC. El nuevo RPC
   `public.cotironda_piloto_ia_link_supplier_mvp225` consulta
   exclusivamente el trabajo de despacho MVP222 realmente aceptado por la
   API de Whapi para el **mismo proveedor**, mismo destinatario registrado
   y ronda todavía válida. Si la respuesta cita el ID de ese PDF, ese
   vínculo es inequívoco. Si no cita ningún mensaje, se acepta solo si
   existe UNA ronda activa, incluida la verificación de que no haya
   invitaciones anteriores del circuito legado. Dos candidatas = estado
   `ambiguous_round`; nunca asignar por semejanza de los productos
   a un cliente equivocado.
2. **Interpretación de la fuente original.** Texto entrante: comprobar
   el SHA256 del mensaje exacto, sin guardar otra copia en claro.
   Documento/imagen: comprobar archivo `stored` y SHA256 del binario,
   preservando el original privado y su estado de revisión.
   Luego la IA recibe únicamente texto extraído del origen autenticado y
   los artículos solicitados por ESA ronda. Se hacen dos lecturas
   independientes (Responses API, JSON estrictamente tipado, `store:false`,
   sin herramientas). Ambas deben coincidir en artículos, importes y
   equivalencias, y cada cita literal debe existir en la fuente. La
   prosa explicativa puede diferir; los datos económicos, no. Se
   preservan también artículos no pedidos: pallet, embalajes y cargos.
   La extracción de archivos sigue necesitando verificación de
   formato y cobertura del documento existente; no se atribuye a
   este módulo la capacidad de leer bytes PDF/Excel desde cero.
3. **Evaluación determinista por artículo y rubro.** La IA propone
   correspondencias de producto, no suma precios. El código
   `calificador-cotizaciones-mvp225.ts` compara exclusivamente
   unidades y cantidades idénticas, importes de fuente comprobados y
   moneda, IVA, flete y pago bajo condiciones compatibles.
   La aritmética utiliza centavos exactos `BigInt`: formatos
   argentinos como `$ 1.234,56`, sin punto flotante. Resultado:
   cobertura por rubro completa/parcial/sin cobertura y precios
   comprobados por artículo, con evidencias/faltantes.
   Una presentación alternativa razonable suma a cobertura solo
   si hay correspondencia semántica válida; queda fuera de
   competitividad automática mientras no se acredite conversión.
   Los totales parciales no se comparan como ganadores globales.
   IVA no expresado = `no_informado` (convención comercial sin IVA);
   nunca asumir IVA incluido, alícuota ni flete.
   Hasta dos proveedores podrán considerarse en una combinación
   posterior, pero **no hay adjudicación automática** ni revelación
   de contactos en esta etapa.

## Cambios de código

- `supabase/piloto/mvp225_asociar_presupuestos_ia_central_solo_piloto.sql`:
  tabla privada de vínculo de mensaje original → proveedor → ronda,
  permisos solo `service_role`, RLS y unicidad de IDs Whapi salientes.
  La vinculación no publica oferta ni ranking: queda
  `awaiting_semantic_review`.
- `supabase/functions/cotironda-piloto-whapi/index.ts`: nuevo enlace
  al RPC tras procesar el texto original o almacenar el archivo, solo
  cuando `COTIRONDA_PILOT_AI_CENTRAL_QUOTE_LINK_ENABLED=true`.
  La variable está **OFF por defecto** y nunca se habilitó.
- `src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts`:
  lector semántico de ofertas sobre fuente textual acreditada, dos
  interpretaciones y cotejo literal. La salida es interna,
  `interpretada_para_revision`, NO publicación automática.
- `src/domain/ia-central/calificador-cotizaciones-mvp225.ts`:
  cobertura/comparables, sin contactos, sin ranking total, sin
  posiciones engañosas.
- `supabase/tests/ci/mvp225-proveedor-ronda-identidad-pg17.sql`:
  dos rondas simultáneas de un proveedor, respuesta con ID Whapi que
  apunta a cada una, respuesta sin ID que se abstiene, proveedor ajeno,
  original de texto falsificado, documento con SHA real, duplicación
  y roles públicos sin acceso. Todo sintético, PostgreSQL17/ROLLBACK.
- `tests/unit/mvp225-{asociacion-calificacion-rubros,lector-ia-presupuestos}.test.mjs`:
  pruebas de cobertura, fuente, exactitud monetaria, extras,
  IVA/flete incompatibles y lecturas divergentes.

## Bloqueos para un piloto completo

1. El lector nuevo de presupuestos aún no consume de forma durable
   los textos/documentos asociados por el nuevo RPC. Hace falta
   worker con cuota por cliente/proveedor, reintentos controlados,
   archivos completos, revisión de fuente, y persistencia de oferta
   anónima por ronda sin filtrar identidad.
2. El flujo heredado de archivos puede seguir exigiendo invitación
   con outbox legado: ampliar la autorización de archivado a la
   nueva cola, en SQL, con pruebas adversariales.
3. La comparativa por rubro deberá conectar los registros privados
   aprobados con la vista del comprador, y registrar qué versiones
   presupuestarias son verificadas frente a las pendientes.
4. Reconocer categorías de precios (neto/IVA, descuentos, flete,
   pallets, diferentes marcas y unidades) sin sacrificar
   fidelidad o aritmética. Probar presentación 25 vs 50 kg y
   combos de hasta dos proveedores **sin anunciar ganadores falsos**.
5. Verificar cierre, originales, permisos y contactos de la ronda
   real y completar E2E de tres teléfonos, sin enviar mensajes
   nuevos sin autorización contextual.

**No significa que el piloto esté listo para usuarios**, ni que
#529 esté completo. El contrato de esta fase consiste en asociar
inequívocamente y evaluar propuestas con fuente de origen sin
efectos económicos automáticos.

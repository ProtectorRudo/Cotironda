# MVP196 — sustitución del planificador literal de finalistas por evidencia comercial v9

**Estado: código y SQL propuestos SOLO EN DESARROLLO. No desplegar ni
activar el worker, sus banderas ni WhatsApp sin autorización explícita
"Publicalo" para el PILOTO. No es producción.**

## Por qué es necesario

El SQL existente MVP159 compara `lower(description_literal)` con la
descripción literal del comprador y exige `unit_literal` y cantidad
idénticas. Los 10 renglones v9 reales del piloto carecen de unidad literal
estructurada, aunque los presupuestos originales identifican envases
suficientes para cotejar ofertas comerciales. Esto excluye, por ejemplo,
20 bolsas de cemento de 50 kg vs. 40 bolsas de 25 kg y un bidón de
hidrófugo de 5 litros vs. 5 litros pedidos.

No alcanza con hacer flexible un ranking: hay que decidir primero
**cobertura técnica**, luego comprobar precios equivalentes, y **separar
eso de cualquier permiso de contacto**.

## Arquitectura integrada

1. `seleccionarComercialmenteMvp196` toma exclusivamente
   `cotironda_piloto_private_round_inputs_mvp172` del backend privado,
   con cierre verificado por el llamador. Reutiliza
   `diagnosticarRondaPrivadaMvp172` y `cotejarPresentacionObraMvp174`.
   No compara palabras exactas ni usa texto libre del modelo como
   autorización. Comprueba prueba v9 de última revisión, request, HMAC,
   SHA, evidencia física por página/fila y conciliación de descuentos y
   montos por renglón. Asocia máximo **un renglón por artículo y viceversa**.
2. Distingue individual completa, dos completas y una pareja verdaderamente
   complementaria (ambos aportan al menos un material exclusivo). Si
   existen 3 ofertas completas, 2 parejas posibles, faltan renglones o
   las evidencias no prueban equivalencia, **no elige por orden de llegada
   ni por total parcial**. Conserva todas las ofertas, incluidas las
   parciales y los cargos extras del original, en el resumen informativo.
3. Una RPC nueva, `cotironda_piloto_commercial_due_mvp196`, consulta
   solamente rondas *realmente cerradas*, con comprador consentido y
   creadas **después de la activación prospectiva**. Si está desactivada,
   devuelve `pilot_finalist_off`; no hace backfill.
4. `cotironda_piloto_commit_commercial_plan_mvp196` reconsulta la fuente
   privada *dentro de la misma transacción y bajo lock de solicitud*.
   Revalida exactamente qué HMAC/SHA v9 pertenece al proveedor, sus
   invitaciones/consentimiento, que no existe presupuesto o corrección
   posterior, línea y posición originales, cobertura por artículos,
   proveedores no duplicados y el modo seleccionado. Crea plan privado
   inmutable y una constancia `finalist_source_plans_mvp196`. **No
   encola ni envía WhatsApp ni revela datos**.
5. El worker `cotironda-piloto-finalistas` DEJA de llamar a
   `cotironda_piloto_prepare_finalists_due_mvp110` (selector viejo).
   Exige las banderas de worker y selector v196, de forma independiente.
   Si la bandera adicional de **despacho v196** está OFF, puede
   preparar un plan sin mensajes y devuelve `planned_no_whatsapp`.
6. Solo cuando se habilitara despacho por separado (aún **NO**
   autorizado), la nueva RPC `commercial_queue_due_mvp196` acota el
   lote a planes con certificado v9. La cola legacy sigue requiriendo
   consentimiento de comprador y cada proveedor. Antes del envío,
   `source_plan_sendable_mvp196` comprueba nuevamente el sello v196
   y la ronda cerrada; si falla marca la reserva `uncertain` sin
   transmitir ni reintentar a ciegas.
7. El seguimiento privado (Edge `cotironda-piloto-seguimiento`)
   consulta `cotironda_piloto_tracking_source_plan_mvp196` antes del
   desencriptado de finalistas: token vigente, no revocado, comprador
   consentido, ronda cerrada y sello documental v196. Un plan MVP159
   histórico nunca autoriza por sí mismo la revelación de contactos.
8. El resultado para el comprador se reduce mediante
   `resumirSeleccionComercialMvp196`, SIN supplier_key, hash, dinero ni
   teléfonos. La recomendación **no es un ranking económico ni obliga
   a comprar**. Al cierre, deben verse todas las cotizaciones.

## Seguridad comercial (criterios de aceptación)

- Materiales de otra familia, cantidades físicas distintas, falta de
  litros/kilos, marca obligatoria incompatible, línea repetida, documento
  viejo, SHA incorrecto, IVA/importe posdescuento inconciliado: jamás
  recomendar.
- Todos los originales y accesorios no pedidos permanecen visibles:
  un pallet adicional no se borra ni se finge que pertenece al pedido.
- Un solo negocio suficiente no fuerza a comprar en otro; dos ofertas
  completas se pueden proponer como alternativas. Tres o más completas
  o varias parejas posibles no se desempatan con un criterio arbitrario.
- Ningún total parcial se usa como precio final; IVA/flete/stock/pago
  permanecen desconocidos si no están corroborados.
- Ninguna identidad, número o documento original llega al navegador a
  través de esta nueva función. Consentimiento de originales (#525)
  independiente de consentimiento de contacto (#523).
- Aun con un plan comercial correcto, **no existe autorización de
  adjudicación ni revelación automática**. El consentimiento específico
  y la política de contactos deben comprobarse aparte.
- `main`, producción, rondas históricas, cron de cierre actual y
  Whapi permanecen intactos.

## Estado y verificación pendientes

El SQL **no está instalado** en `cotironda-piloto`, los flags siguen
desactivados, y el nuevo selector solo puede considerarse probado en CI
sobre fixtures sintéticos. Deben verificarse su compilación y SQL
transaccional en PostgreSQL 17 aislado; ejecutar luego lectura/staging
contra ronda nueva de prueba. Después, E2E real con dos empresas,
consentimientos prospectivos y despliegue exclusivamente autorizado.
No prometer enlaces, contactos, mensajes ni selección real aún.

La publicación posterior también necesitará auditoría de la autenticación
del worker, limitación de costes, métricas e idempotencia. El selector
es de cobertura comercial, no sustituye el comparador económico
determinista de #524.

Issues: #529 checklist, #535 evidencia, #524 comparación final,
#523 worker/WhatsApp, #528 cierre, #525 originales.

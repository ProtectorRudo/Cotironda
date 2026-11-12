# COTIRONDA V2 — PLAN MAESTRO Y CHECKLIST

**Aprobado como NUEVA DIRECCIÓN DE PRODUCTO el 12/11/2026. Todavía no desarrollado/desplegado en el piloto.**

**ORDEN OBLIGATORIO DE LECTURA EN TODAS LAS CONVERSACIONES:** [Contrato V2](COTIRONDA-V2-CONTRATO.md) → **este plan** → [Estado y única próxima tarea](PILOTO-100-ESTADO.md) → [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **Estas páginas son las VIGENTES**. [Plan histórico íntegro](historico/2026-11-12-plan-maestro-pre-v2.md) (81 KB), [estado histórico](historico/2026-11-12-estado-pre-v2.md) e [issue histórico](historico/2026-11-12-issue-794-pre-v2.md) conservan evidencia pero NO deben usarse como guía de producto.

## Objetivo único del piloto

Un comprador envía una lista de obra. Cotironda identifica cada producto y consulta por WhatsApp a comercios cuyos catálogos propios incluyan ese producto o una alternativa técnicamente compatible, según zona. **D013: los rubros organizan, no seleccionan proveedores.** Cada respuesta auténtica se guarda intacta y queda asociada a la ronda correcta. **Solo los negocios que respondieron** aparecen en el portal con su nombre, original descargable y comentario de IA útil. **Al cerrar en dos días hábiles**, la IA entrega una comparación general fundamentada por rubro. Sin anonimato, ranking de ganadores, confirmaciones rutinarias ni listas de invitados pendientes.

**Prueba de aceptación final:** 1 comprador real + 2 proveedores reales + 2 originales en formatos diferentes enviados por WhatsApp, vinculados correctamente, visibles y descargables con identidad/permiso del proveedor, análisis individual, cierre e informe general, sin intervención humana en el caso normal. Hasta pasar esta prueba, NO declarar el piloto terminado.

## Reglas de ejecución entre chats

1. Leer los cuatro vínculos anteriores **antes de tocar código** y comprobar GitHub/CI, qué PR están integrados y qué versión está realmente en Supabase/Whapi/Vercel. El último chat no es fuente de verdad.
2. Trabajar sobre la **primera casilla pendiente de la etapa marcada PRÓXIMA** en Estado. No continuar automáticamente PR históricos #804–#814 ni viejas tareas P0–P5.
3. Auditar componentes y dependencias; definir criterio de aceptación; implementar UNA mejora pequeña por rama; probar normal/extremo/seguridad/retrocompatibilidad; abrir PR; actualizar Issue, plan, estado y CHANGELOG. **No transformar CI verde en «E2E real».**
4. «Auditá» = solo lectura; «Documentalo/Reorientá» = documentación en rama; «Avanza/Luz verde» = desarrollar y probar sin desplegar; «Publicalo» = desplegar SOLO versión/entorno expresamente autorizado. Nunca enviar Whapi real para test sin la correspondiente autorización.
5. Al finalizar informar `qué quedó en código / qué probó CI / qué se instaló realmente / qué se comprobó E2E / bloqueos / commit-PR / única siguiente tarea`. Si falta evidencia, marcar PENDIENTE.

## Etapas V2 (orden secuencial, no más números MVP inventados)

| Etapa | Meta | Criterio de aprobación | Estado actual |
| --- | --- | --- | --- |
| **V2-00** | Consolidar dirección e inventario de legado | Documentación coherente, mapa exacto de módulos vivos y PR clasificados | **PRÓXIMA: inventario** |
| **V2-01** | IA por producto, catálogo individual y distribución selectiva | Coincidencias por artículo y equivalencias técnicas, sin filtro por rubro, con zona y deduplicación | Revalidar (parcialmente existente) |
| **V2-02** | Recepción del ORIGINAL y vínculo a ronda | 2 respuestas originales auténticas, SHA+remitente+pedido correcto, incluso con rondas concurrentes | **Bloqueo técnico principal** |
| **V2-03** | Portal comprador, solo respondedores | 0/1/2 respuestas: mostrar únicamente negocios que cotizaron, identidad y original seguro | Pendiente |
| **V2-04** | Análisis breve individual | Cobertura, variantes, condiciones, conclusión accionable, no bloquear original | Pendiente |
| **V2-05** | 2 días hábiles e informe general | Cierre horario verificable + comparación por rubro, parciales, IVA/flete no inferidos | Pendiente |
| **V2-06** | Seguridad, publicación y E2E | Identidad/consentimiento informado, móvil, descarga autorizada y recorrido real de punta a punta | Pendiente |

**Seguridad es transversal:** no publicar originales identificables antes de la aprobación legal/comercial del aviso a proveedores y permisos estrictos del comprador. No dejarlo artificialmente para V2-06.

## V2-00 — PRIMERA ACCIÓN DE DESARROLLO (no iniciar código a ciegas)

**Auditoría de reutilización sobre el código desplegado y el repositorio.** Guardar una tabla `componente → qué hace ahora → ruta/fuente → instalado o no → reutilizar/adaptar/congelar → prueba pendiente`.

- [ ] Inventariar Whapi, webhook autenticado, parsing, **catálogos por producto, normalización de nombres/marcas/presentaciones y zona**, y envíos. Auditar si el legado filtra indebidamente por rubro (**D013**).
- [ ] Inventariar Storage, SHA, inbox, deduplicación, MIME, originales, PDFs/Excel/Word/texto, enlaces al mensaje.
- [ ] Auditar correlación M225/M237/M238/M291/M336: caso histórico `ambiguous_round` entre **dos rondas**, reintento agotado; no falsear vínculo por fecha.
- [ ] Auditar portal comprador/Auth/URLs originales y la viabilidad legal/técnica de revelar nombre + archivo **al recibirse**, no al cierre.
- [ ] Auditar código de análisis individual, comparador económico verificable, reloj/cierre existente, WhatsApp y costos.
- [ ] **Clasificar PR abiertos** en reutilizable/adaptable/obsoleto. **PR #814 NO DESPLEGAR TAL CUAL:** prohíbe que un proveedor participe en dos rondas simultáneas, cosa que Cotironda V2 necesita permitir. Conservar su auditoría de seguridad MVP280, no la restricción comercial.
- [ ] Especificar primer cambio V2-02 pequeño: identificador inequívoco de solicitud/mensaje citado y asociación segura incluso con varias rondas vivas para un mismo comercio, sin pedir reenvíos por fallos nuestros.
- [ ] Actualizar Estado con qué reutilizamos, componentes reales y la primera tarea de implementación. Solo entonces comenzar V2-01/02.

## V2-01 — pedidos y envíos

**D013 — [Decisión obligatoria de catálogos y equivalencias](V2-D013-CATALOGOS-EQUIVALENCIAS.md):** asignar exclusivamente por producto concreto del catálogo, no por nicho. Probar Ceresita↔hidrófugo técnicamente compatible y cemento 50 kg↔25 kg del mismo tipo; respetar marcas excluyentes, especificaciones, cantidades efectivas y conversiones deterministas.

- [ ] Extraer materiales/cantidades/unidades/variantes por rubro de archivos y texto, sin inventos. Solicitar **solo zona** si falta; sin confirmación rutinaria del comprador.
- [ ] Elegir comercios por **coincidencia de cada producto** en su catálogo individual, equivalencias válidas, localidad y consentimiento WhatsApp. Enviar solo líneas compatibles; un proveedor multirrubro puede recibir solicitud parcial. Referencia única para asociar respuestas; no invitar por rubro ni duplicar mensajes.
- [ ] Duplicados, mensajes fuera de rubro, catálogos incompletos y errores de entrega probados.

## V2-02 — recepción y correlación (PRIORIDAD COMERCIAL)

- [ ] Guardar original **idéntico**, hash, fuente, proveedor, fecha y tipo; texto íntegro si responde por mensaje.
- [ ] Probar múltiples rondas simultáneas al mismo negocio con mensajes citados y referencias únicas. Si no hay prueba fuerte, **REVISIÓN INTERNA**; nunca asociar por cercanía temporal sin evidencia.
- [ ] Dos proveedores, dos formatos, misma ronda correcta; respuestas duplicadas o corregidas versionadas, sin IA bloqueando el original.
- [ ] Confirmar fuente Auth, pertenencia y ausencia de filtración de información entre compradores.

## V2-03 — vista comprador

- [ ] Si 0 respuestas, «Todavía no recibimos cotizaciones». **No mostrar invitados, cantidad consultada, nombres pendientes ni cuántos faltan**.
- [ ] Si 1 o más, **solo negocios que respondieron**, nombre, fecha/rubro, original con acceso autenticado/temporal y comentario «en preparación» hasta IA. Si original no autorizado, no exponer.
- [ ] Ronda actual, otra empresa, acceso anónimo, descarga repetida y datos sensibles probados con autorización previamente establecida.

## V2-04 — IA por presupuesto

- [ ] Ficha orientativa de 70–110 palabras, adaptable. **Cobertura**, diferencias técnicas (cantidad/unidad/marca), condiciones informadas o no, **conclusión que ayude a decidir**.
- [ ] Original primero, IA después; si parser falla, original permanece. No proclamar mejor oferta durante la ronda; no comparar canastas diferentes.

## V2-05 — cierre e informe

- [ ] Plazo por defecto **2 días hábiles**, propuesta de cierre a las **18:00 del segundo día hábil siguiente** al envío, zona Argentina, feriados/fines de semana y pruebas de límites. Guardar timestamp de vencimiento desde el inicio.
- [ ] Informe general organizado por rubro, pero cotejado **por productos técnicamente equivalentes** y unidades efectivas (bolsas 50↔25 kg por masa total), cobertura/parcialidad, IVA/flete/pagos/descuentos/disponibilidad, escenarios y recomendaciones justificadas.
- [ ] Casos 0/1/múltiples cotizaciones, llegada tardía, vacaciones/feriados, porcentajes, descuentos y unidades distintas.

## V2-06 — piloto real

- [ ] Condiciones prospectivas al proveedor autorizan identidad comercial y documento original al comprador destinatario; no consentimiento por cada presupuesto. Cumplir protección de datos y contactos sensibles. Comprador autenticado y Storage no público.
- [ ] Ensayo completo por WhatsApp con 1 comprador y 2 proveedores consentidos. Portal móvil real: solo respondedores, originales y comentarios. Cierre de dos días hábiles + informe general descargable.
- [ ] Medir tasa de respuestas, costo real por ronda, fallas y satisfacción. Luego validar trial/subscripción; no implementar pagos primero.

## Decisiones históricas que NO deben reactivarse

**Reemplazadas:** anonimato hasta cierre, ranking en vivo, dos ganadores automáticos/obligatorios, contactos solo de adjudicados, espera a cierre para enseñar originales, 5 días por defecto, mostrar pendientes/invitados, lectura económica perfecta antes de mostrar documentos, reconfirmaciones manuales rutinarias, guard de proveedor con **una ronda a la vez**.

**Se conserva:** historial, código reutilizable, evidencias, pruebas, accesos seguros, trazabilidad, hashes, RLS, whitelist Whapi, cálculos deterministas, confidencialidad de la empresa compradora.

La documentación histórica está archivada, no borrada. Si un nuevo pedido del usuario cambia reglas V2, anotar una nueva decisión con fecha y actualizar simultáneamente **Contrato → Plan → Estado → Issue #794**. No deducir dirección del último PR abierto.

## Plantilla de cierre de avance (obligatoria)

`Etapa / criterio / modificación / estado [DOCUMENTADO | TEST SINTÉTICO | PILOTO INSTALADO | E2E REAL] / commit y PR / evidencia de pruebas / qué NO está activo / siguiente paso único`.

**Nunca marcar listo el piloto sin probar el flujo completo con archivos y navegador reales.**

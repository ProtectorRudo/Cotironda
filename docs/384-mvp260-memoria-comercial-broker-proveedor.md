# Decisión 384 — Etapa 6: usar memoria como guardia de alcance, no de precios (MVP260)

Fecha 06/11/2026. Aprobación «Luz verde»: desarrollar y probar **sin** publicar PILOTO ni producción, sin enviar WhatsApps.

## Cambio funcional

Se integra la memoria del MVP259 en la ruta **de presupuesto textual del proveedor** de IA Central. La memoria sigue siendo un libro de hechos con fuente, no una conversación que el modelo pueda transformar en números.

1. `cotironda_piloto_memory_quote_context_mvp260(chat_hmac,message_hmac,source_sha256)` busca la **ronda real asociada** a la cotización `reserved` de ese proveedor. Ni modelo ni cliente eligen `request_id`. Verifica archivado exacto, rol, consentimiento y fuente SHA, y llama al snapshot vigente MVP259. Su respuesta es una lista blanca de rubros/cantidades **agregadas**, vigencia y banderas siempre `false` para precios/contactos/decisiones automáticas.
2. `validarMemoriaProveedorMvp260` en Edge coteja el snapshot contra **cada renglón del pedido reservado por SQL**: rubro, cantidad de materiales por rubro, totales, etiquetas, caducidad y banderas. Si algo difiere, el modelo no se invoca y el presupuesto queda en `review` con `memory_scope_conflict`. Jamás pasan importes ni memoria a la IA como instrucciones.
3. La lectura de IA y todos los cálculos siguen usando el **documento original AES-GCM**, SHA verificable y el comparador determinista existente.
4. Solo **después** de guardar el presupuesto en `verified` se llama `cotironda_piloto_memory_sync_quote_mvp260`: esta RPC deriva la ronda de la fuente verificada y usa `remember_commercial_mvp259`, que registra el puntero de evidencia idempotentemente. Una respuesta perdida genera `memory_sync_unconfirmed` para conciliación manual, **sin reinterpretar el mensaje ni volver a enviar WhatsApp**.
5. Dos entradas existentes del webhook de IA Central se conectan con `COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED === 'true'`. La opción **está apagada por defecto**; no instalar la migración ni activar la bandera en PILOTO en esta entrega.

## Límites y seguridad

No se añaden endpoints públicos, claves, contacto, tablas RLS nuevas ni modificaciones de precios. Las dos RPC nuevas son `service_role` exclusivas, `SECURITY DEFINER SET search_path=''`, `REVOKE` para PUBLIC/anon/authenticated y ninguna escritura en las tablas de outbox.

Esta entrega **no interpreta correcciones en lenguaje libre usando memoria**: una cotización posterior que esté en revisión invalida la vigencia de la anterior. La próxima integración de etapa 6 deberá modelar los cambios por artículo con trazas, no suponer que «mismo proveedor» implica «misma ronda». Tampoco se conecta todavía la memoria al comprador; el flujo del comprador original no se modifica.

## Aceptación

- PostgreSQL 17 reversible con dos compradores, dos proveedores y rondas distintas: no se solicita memoria sin reserva; no hay lectura con HMAC o SHA de otra empresa; persistencia solo tras `verified`, idempotencia, última revisión anuladora, revocación y ACL.
- Node: bandera OFF preserva calls anteriores; ON coteja rubros; contradicción bloquea modelo; fuente original y precios inalterados; fallo de persistencia no provoca segunda lectura; pruebas de webhook con bandera OFF por defecto.
- CI general Deno, Next.js, PostgreSQL, PostgREST y seguridad, último commit en verde.
- Merge exclusivamente a `feat/mvp174-supplier-packaging-equivalence`. No publicar la etapa 6 como terminada operativamente sin demostrar dos rondas reales, correcciones y recuperación.

## Etapas restantes

La etapa 5 quedó con seguimiento de inciertos con y sin identificador (MVP256–258), pero la conciliación real y avisos operativos siguen pendientes. La etapa 6 tiene una primera integración segura, todavía sin correcciones por chat. Etapa 7 supervisor pendiente. Las pruebas E2E de etapas 1–4 permanecen abiertas. Ninguno de estos cambios implica `7/7` finalizadas.

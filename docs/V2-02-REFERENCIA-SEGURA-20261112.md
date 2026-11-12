# Cotironda V2-02 — Vinculación verificable por referencia de pedido

**Estado:** código propuesto en rama de desarrollo. No instalado en Supabase PILOTO, Edge ni Vercel; WhatsApp no fue utilizado.

## Problema

Una misma tienda puede cotizar varias obras simultáneamente. El código anterior prioriza un mensaje citado de WhatsApp y admite una sola ronda sin cita, pero respuestas sin identificación inequívoca quedan `ambiguous_round`. **No se permite resolver esa ambigüedad por cercanía temporal ni por similitud de importes.**

## Incremento mínimo: aprovechar lo existente

El PDF ya muestra los primeros 8 caracteres del UUID de la solicitud. Se prepara **un overlay V2 aislado** que amplía el caption del PDF enviado por IA Central, con formato `Cotironda pedido: A1B2C3D4`, sin requerir al negocio una acción nueva. La referencia es **identificador público, NO credencial**.

Para mensajes **textuales** del proveedor que incluyen voluntariamente ese código:
1. El webhook Whapi autentica y conserva el mensaje original.
2. Un prefiltrado local del **candidato generado** reconoce la referencia. Activación requiere `COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED=true`, **OFF por defecto**.
3. La RPC privada y exclusivamente de lectura `cotironda_piloto_v2_quoted_id_for_reference` corrobora HMAC, remitente proveedor consentido, SHA exacto de texto, una referencia inequívoca, ronda preparada, invitación vigente y **un único despacho Whapi aceptado enviado a ese proveedor**.
4. Devuelve únicamente el ID del mensaje **saliente realmente acreditado**. El flujo EXISTENTE `cotironda_piloto_ia_link_supplier_mvp225` vuelve a verificar el ID, identidad y fuente antes de persistir una vinculación.
5. Con referencia ausente/ambigua, o varios despachos posibles, se mantiene revisión segura. NO hay invento de correspondencia. No cambia la historia de mensajes antiguos.

Para archivo PDF/Excel/foto **sin cita ni código**, esta mejora no garantiza asociación; sigue pendiente V2-02 correlación automática por prueba material y revisión interna cuando realmente no se sabe. La referencia dentro del pedido y el mensaje citado ofrecen contexto sin trabajo extra del negocio, pero **no aseguran que cada proveedor la use al responder**.

## Orden de instalación futura — NO ejecutar ahora

- Generar el candidato con `node scripts/piloto/v2-02-whapi-overlay.mjs --write-candidate`, desde la versión histórica **intacta** y validada por MVP332. El archivo `index.ts` existente no se modifica ni se despliega por inercia.
- Verificar compatibilidad en PG17 y las protecciones vigentes `mvp225`, `mvp280`, `mvp291` y tráfico Whapi actual. Ejecutar ensayo transaccional + ROLLBACK con datos **sintéticos**: dos rondas al mismo comercio, una respuesta con referencia, otra sin referencia, código de otra tienda, código duplicado/ambiguo y SHA alterado.
- Instalar SQL `supabase/piloto/v2_02_ref_codigo_pedido_solo_lectura.sql` SOLO en piloto autorizado y verificar acceso exclusivo `service_role`.
- Recién entonces revisar y desplegar la variante Edge V2 usando el candidato validado, manteniendo el flag OFF (sin sustituir el webhook histórico a ciegas).
- Activar flag controlado en piloto cuando permisos y evidencia estén listos. No reenviar solicitudes antiguas ni alterar `request_id` históricos.
- Probar de forma completa WhatsApp real: dos obras del mismo negocio, respuesta con referencia y archivo con cita, documento SHA conservado, 0 filtraciones, sin duplicados y portal con permisos.

## Criterios de aceptación

- [x] Código preparado: overlay aislado para caption V2 + prefiltrado sin permisos + RPC de consulta y flujo existente de asociación; el webhook histórico conserva su hash original.
- [x] PR separa de manera explícita cambios de código de publicación real y no aplica migración.
- [ ] Node, TypeScript/Deno del candidato y ensayo PostgreSQL17 + ROLLBACK verdes para **el commit final** (primera ejecución PG17 PASS; la batería general descubrió hashes históricos inmutables y motivó el overlay aislado).
- [ ] Inspección de Edge desplegada, flag y SQL antes de activar.
- [ ] Dos respuestas reales asociadas a solicitudes correctas.
- [ ] Buyer Auth, original descargable y reporte individual funcionando.
- [ ] Cierre de dos días hábiles e informe general comprobados.

**Límite:** la vinculación por código no sustituye prueba del original, documento MIME, consentimiento, control de permisos o deduplicación. No hace que el PILOTO esté 100% completo.

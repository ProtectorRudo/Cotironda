# MVP-122 — localidad contextual para pedidos de texto por WhatsApp

**03/11/2026 · Issue #454 · PILOTO aislado.**

## Incidente real constatado
A las 07:02 AR, el comprador registrado envió un pedido de dos materiales sin zona. Cotironda respondió con la localidad faltante; después recibió «Entrega: La Plata». Supabase confirmó dos mensajes auténticos en `whapi_inbox` con `needs_review`, IA `ask_zone` → `other/ignore`, y cero nuevas rondas, invitaciones y enlaces.

**Causa:** había una función de contexto para documentos pendientes, pero no existía ninguna unión de una localidad de texto con una solicitud de texto previa. La IA solo lee el mensaje actual; «Entrega: La Plata» no contiene cantidades ni productos.

## Solución
- `mvp122_text_zone_context.sql`: dos RPC internas (solo `service_role`, RLS privado). La primera devuelve exclusivamente el ciphertext de **una** fuente del mismo comprador/chat que recibió pregunta `zone` aceptada por Whapi y no se usó; si hay cero o más de una, no produce candidato. La segunda vuelve a validar pregunta, identidad, consentimiento, momento, hash SHA256 exacto del original y los ítems completos, inserta una sola ronda con `source_hmac` único y crea invitaciones según catálogo; vincula ambos mensajes a la ronda. No hay envíos desde SQL.
- Edge `cotironda-piloto-whapi`: cuando la respuesta no corresponde a documento, busca fuente de texto, descifra **solo en memoria** con AES-GCM y AAD de chat+mensaje+tipo, valida SHA256 y ejecuta el parseo determinista del texto original; agrega únicamente la ciudad presente en el mensaje nuevo. No usa contenido inventado por la IA. Usa la misma ruta habitual de enlace privado e invitaciones Whapi.
- Replays, contacto ajeno, ciudad ya presente, material ambiguo y fuente no única quedan sin promover; no se duplica ronda ni se exige segunda confirmación comercial.

## Evidencia técnica
- Comparado `plaintext_sha256` del primer mensaje real contra la literal exacta suministrada por el comprador: **coincide** sin exponer HMAC/teléfonos.
- Ensayo SQL con ambos mensajes reales dentro de `BEGIN/ROLLBACK`: candidato único, hash correcto, ronda con **2 líneas** y **1–2 invitaciones** según catálogo, protección contra segundo intento. Resultado **PASS + rolled_back=true**, sin envío WhatsApp y sin persistencia del ensayo.
- Pruebas de Node/TypeScript y CI se registran en la rama/PR. No confundir ensayo DB con recepción efectiva del PDF por proveedores.

## Despliegue y verificación real
Instalar la migración exclusivamente en PILOTO, comprobar permisos y RLS, desplegar Edge Whapi del mismo commit. Esta corrección no recupera por sí sola eventos ya procesados: el comprador puede responder una vez más «Entrega: La Plata» sin reenviar todo el listado. Comprobar mensaje nuevo `recorded`, ronda, invitaciones y enlace. Confirmar que los PDF se entregaron a dos proveedores antes de declarar el flujo E2E real.

El cierre de finalistas permanece OFF y el seguimiento avanzado sigue pendiente. No enviar mensajes retroactivos ni divulgar originales.

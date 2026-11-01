# 166 — MVP-046: crear ronda real desde un mensaje de WhatsApp (solo PG17 CI)

**01/11/2026 · Issue #305 · Entorno de desarrollo y PostgreSQL17 aislado. SIN Whapi live ni Supabase DEV.**

## Problema concreto

Hasta D077, el arquitecto podía enviar su pedido por Whapi en pruebas, Cotironda lo conservaba cifrado y podía vincular una respuesta «La Plata», pero el puerto `crearRonda` era un *mock*. Además, la RPC D064 de rondas del portal necesita JWT y `auth.sessions`; inventar una sesión web para un comprador por WhatsApp sería un riesgo grave.

## Resultado desarrollado

`supabase/sql/whapi_buyer_round_atomic_d081.sql` agrega una entrada **privada y transaccional** específica del comprador Whapi:

- Identidad respaldada en PostgreSQL: canal y chat HMAC vinculados a organización compradora D074 **verificada, consentida y sin BAJA**; ambos mensajes originales/respuesta se cotejan en D074 por empresa, chat, tipo y tiempo. No acepta elegir empresa desde el texto de Whapi.
- Los artículos JSON se validan estrictamente como en D064: máximo 8, cantidades/unidades válidas, sin líneas duplicadas, familias técnicas reconocidas por `valid_pilot_product_d078`, sin URLs ni especificaciones inventadas, zona de entrega segura y requerimiento de IVA definido.
- En **una única transacción PostgreSQL** crea `rounds_v1`, `round_items_v1`, `round_requests_d064` y `buyer_whapi_round_sources_d081`; si se completaba un pedido por respuesta de localidad, marca la pregunta D077 como consumida y la vincula al **mensaje exacto** y a la ronda. Si algo falla, PostgreSQL revierte todos los cambios. No se abre la ronda ni se envían invitaciones.
- En `round_requests_d064` el campo `created_by` es `NULL` para origen Whapi (no se falsifica usuario, sesión ni email); una constraint trigger **diferible** exige por cada fila sin autor web un origen Whapi persistido y coincidente antes de confirmar COMMIT. La RPC del portal D064 sigue exigiendo propietario/manager web autenticado. D065 y D071 pueden reutilizar la localidad, IVA y los ítems ya normalizados sin cambiar su comparador.
- **Idempotencia:** único `channel+origin_message_key` y hash de contenido. Reintentar el mismo mensaje devuelve la misma ronda; alterar zona/IVA/materiales/respuesta bajo ese ID es un conflicto. Un pending vencido u otra conversación no permite la creación. El lector D077 permite repetir **únicamente la misma respuesta** después de consumirse, no utilizar un pedido viejo en mensajes nuevos.
- `src/server/buyer-whatsapp-round-actions-d081.ts`: puerto SQL parametrizado y aislado para D073, y puerta separada a D071 que prepara invitaciones después de COMMIT. Devuelve estados acotados, **cero WhatsApp enviado**. `buyer-whatsapp-ingress-d073.ts` incorpora `replyMessageKey` HMAC, imprescindible para consumir la pregunta sin mezclar respuestas.
- Roles independientes NOLOGIN/NOBYPASSRLS y RLS; el gateway solo puede `EXECUTE` funciones específicas, no leer contactos, conversaciones ni rondas completas. No se otorga acceso nuevo a `anon`, `authenticated` ni `service_role` sobre la vía Whapi. Es imprescindible que el worker utilice conexiones distintas para D077, D081 y D071, cada una con rol SQL privado correspondiente.

## Pruebas y límites

- `supabase/tests/ci/131_whapi_buyer_round_atomic_d081.sql`: PG17 con fixtures ficticios y rollback. Comprueba ronda directa, respuesta de localidad, consumo ACID, replay, rechazo por otra empresa, otro chat, cambios de materiales/IVA, permisos, conservación del origen y compatibilidad del formato D064.
- `tests/unit/mvp046-whapi-round-actions.test.mjs`: SQL parametrizado, dedup/reintento y planificación D071 después de commit, sin envío, errores sanitizados y entrada malformada fail-closed.
- Sin envío real, secrets, webhook público, login ficticio, datos productivos ni migraciones instaladas en Supabase DEV.
- **Aún falta** instalar D024+ en DEV después de respaldo cifrado real + restauración independiente #175; conectar worker de entrada y pregunta al teléfono cifrado D068; extraer PDF/Excel/Word/fotos con seguridad + IA; conectar Whapi real, workers D071/D061 y ranking real por rubro. Los finales UX-002 son finalistas consentidos, no adjudicaciones dentro de la plataforma.

No está listo para que el arquitecto envíe un PDF y obtenga cotizaciones reales aún. Este incremento elimina la falsificación de sesión y cierra el alta transaccional de la ronda, dejando el siguiente paso concentrado en el backend real y los adjuntos.

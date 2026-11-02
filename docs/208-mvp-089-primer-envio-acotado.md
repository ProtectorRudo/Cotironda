# MVP-089 — primera invitación Whapi REAL, limitada a Nahuel

**02/11/2026 · Issue #390 · Supabase `cotironda-piloto` exclusivamente.**

## Objetivo
Realizar el primer ensayo de solicitud del arquitecto (20 bolsas de cemento CPC 50 kg + 5 litros de hidrófugo, entrega La Plata) a **un único proveedor participante**, Nahuel. Ailín ya cotizó por WhatsApp; no se le debe volver a enviar la invitación. Esta es una **consulta para obtener precio y disponibilidad**: no significa que el catálogo inicial de 51 artículos idénticos entre Ailín y Nahuel sea real ni confirmado.

## Estado live antes de MVP-089 (verificado solo lectura)
- Los tres participantes están vinculados por WhatsApp y tienen consentimiento, sin baja.
- Solicitud del arquitecto preparada, cierre 06/11/2026 01:34 ART; dos invitaciones preparadas. La outbox de Ailín está **cancelled** por oferta previa. La de Nahuel está **pending** y sin mensaje Whapi aceptado.
- Un presupuesto original de Ailín registrado en forma literal. La salida Whapi sigue apagada en BD (`whatsapp_outbound_enabled=false`).
- El mensaje anterior mostraba unidades crudas `20.000 bag` y `5.000 l`, aunque las cantidades y productos del pedido en la base eran correctos.
- El cron de cierre está activo cada 5 minutos, pero **no calcula, comunica ni revela finalistas**.

## Cambios de código
1. `supabase/piloto/mvp089_one_invitation_send_gate.sql`: esquema privado RLS y sin permisos de clientes para autorización **de una sola fila**, por request+proveedor y hora de caducidad. El `claim` (con `SKIP LOCKED`) y la autorización inmediatamente anterior al POST de Whapi exigen esa fila, consentimientos vigentes sin BAJA, entrega La Plata, ronda no vencida, 2 familias exactas, categorías declaradas reconocidas y ausencia de oferta anterior. Solo admite `corralon_nahuel`, y conserva leases y estados `uncertain` sin reintento.
2. Función interna `invitation_body_mvp089`: presenta cantidades en castellano de forma legible y menciona la localidad, sin modificar los materiales, cantidades, especificaciones ni precios originales. Se usará en nuevas invitaciones; la del ensayo se reescribe **solo en estado pending** y con guardas.
3. `mvp089_one_invitation_operator.sql`: preparación operativa de **una única consulta**, que solo se puede ejecutar con outbound desactivado, verificación real del destinatario y solicitud inequívoca; no activa ni transmite.
4. `mvp089_smoke_rollback.sql`: ensayo con PostgreSQL real en transacción reversible, activa el flag solo DENTRO del rollback para demostrar que sin scope no hay claim, que solo Nahuel puede ser arrendado y que BAJA, expiración, lease errado y segundo claim se bloquean.
5. Pruebas unitarias estáticas `mvp089-single-invitation-gate.test.mjs`, CI PostgreSQL 17 y portal.

## Límite de autorización
La orden «dale hagamoslo» permite avanzar con esta **prueba comercial controlada**, NO afirmar que los 51 productos son reales, ni habilitar mensajes a otros negocios, ni fusionar a `main` ni publicar el portal productivo.

**No activar `whatsapp_outbound_enabled` de forma global hasta comprobar:**
- Whapi canal `AUTH`, Edge v15 y webhook entrante operativo con los tres consentimientos, HMAC de chat exacto y destinatarios de secreto `COTIRONDA_PILOT_RECIPIENTS_JSON` correspondientes a las identidades reales de Ailín y Nahuel; **nunca copiar números ni secretos a GitHub o chat**.
- Variables secretas **existentes y correctas** en Edge: `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED`, `COTIRONDA_PILOT_WHAPI_TOKEN`, canal y mapa de destinatarios; nadie debe revelar sus valores. Son independientes del flag SQL.
- Borrador `pending` legible, autorización exacta y plazo vigente, costos del canal acordes al ensayo.
- Un evento entrante autenticado que dispare el worker. Ningún HTTP probe sin autorización puede despachar.
- Estado Whapi `api_accepted` se comprueba en DB (no equivale a entregado/leído); `uncertain` requiere conciliación manual sin duplicado, nunca reintento a ciegas.
- La solicitud de Ailín permanece `cancelled`; no hay nuevos mensajes a terceros.

**Para apagar:** en proyecto PILOTO únicamente, configurar `integration_flags.whatsapp_outbound_enabled=false` y `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED=false` en los secretos de Edge (sin desactivar entrada), verificar que no hay un lease adquirido en vuelo. Nunca deshabilitar el cron seguro ni eliminar un presupuesto recibido.

## No incluido
Esta pieza prepara **el primer envío**, no implementa la clasificación documental IA, los presupuestos propios completos en portal, el cálculo determinista de costos con IVA/flete, ni el ranking y disclosure recíproco al cierre. Ver PR #389 y Issue #388 sobre proyección fiel; no publicar ganadores si faltan fuentes/comparabilidad.


## Instalación efectiva en entorno PILOTO — 02/11/2026

- Se ejecutó primero el **ensayo PostgreSQL 17 con DDL + pruebas y ROLLBACK**. Un primer error `min(uuid)` en el operador/smoke fue corregido por `min(id::text)::uuid` y repetido, posteriormente **PASS**.
- Se verificó el operador de autorización en otra transacción `ROLLBACK`: un único permiso, flag de salida falso, mensaje natural con ambos ítems; **PASS**.
- La migración `mvp089_single_invite_gate_and_human_quantities` se aplicó correctamente con Supabase `apply_migration`, **`success=true`** solo en proyecto `ilggkalaafhtiysyzlmg`. El `mvp089_smoke_rollback.sql` posterior **PASS**, sin cambios de envíos.
- Se ejecutó el operador `mvp089_one_invitation_operator.sql` con éxito, dejando **exactamente un permiso temporal** para la solicitud activa/Nahuel, con ambas líneas, localidad y texto corregidos. No se crearon permisos para Ailín ni otros destinatarios.
- Auditoría posterior: 1 scope vigente, `whatsapp_outbound_enabled=false`, Nahuel `pending` y mensaje con `20 bolsas · cemento CPC 50 kg` y `5 litros · hidrófugo`; Ailín `cancelled` y 1 oferta original preservada; cron de cierre único activo.
- Seguridad RLS en scope `true`; permisos de lectura `anon=false`, `authenticated=false`, `service_role=false`; funciones `claim` no ejecutables por clientes, sí para `service_role`. `claim` con flag OFF respondió `outbound_disabled`. La lectura fue directa del piloto.
- **Aún NO se envió ningún WhatsApp**. Falta verificar en panel propietario la configuración secreta de Whapi outbound (token, canal, mapa exacto de dos números) y la bandera `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED`. La conexión del panel de secretos no permite consultar estos valores con el conector actual, y no deben obtenerse ni divulgarse. Solo tras esa verificación y con costo/consentimiento acotado se permitirá habilitar la salida en SQL para el alcance específico y disparar un evento autenticado.
- El permiso expira 12 horas después de su emisión o al cierre de la ronda, lo que ocurra primero. Si caduca antes de verificar Whapi, se debe revalidar y renovar bajo control, no reactivar automáticamente.


## Activación acotada de DB — 02/11/2026 (tras prueba de reversión)

- El titular autorizó avanzar con la primera prueba a Nahuel. Tras instalar y auditar el único scope, se aplicó mediante un bloque SQL con guardas verificables el cambio **SOLO en `cotironda-piloto`**: `integration_flags.whatsapp_outbound_enabled=true`. El bloque rechazaba cualquier estado distinto a una invitación `pending` exacta para Nahuel, scope único vigente y texto 100% coincidente con el generador. Ailín sigue `cancelled`.
- Consulta posterior comprobó `inbound=true`, `outbound_db=true`, un scope activo que caduca el **03/11 a las 01:03 Argentina**, outbox Nahuel **`pending`**, `whapi_message_id` ausente, cotización Ailín sin cambios y cron activo.
- Este paso habilita solamente el **claim SQL condicionado** a un evento futuro, NO implica un mensaje enviado. El código Edge v15 además exige su **propio flag secreto de salida** y credenciales/allowlist correctas antes de intentar HTTP. Esos secretos no se pudieron comprobar mediante el conector autorizado actual y no se copiaron. El worker nativo despacha al finalizar un **evento entrante autenticado** de Whapi, no se inicia por activar DB.
- El formato del borrador es «20 bolsas · cemento CPC 50 kg / 5 litros · hidrófugo / Entrega: La Plata». Solo se permite **un lease**; si hay error de red, queda `uncertain` sin reintentos ciegos. Nunca se anuncian ganadores en esta etapa.
- Si se requiere detener de inmediato la posibilidad de salida, desactivar el flag de DB mediante SQL controlado en PILOTO, auditar leases en vuelo, y mantener recepción activa. Cuando el scope expire no se autoriza ninguna nueva salida aunque `outbound_db` permanezca `true`.

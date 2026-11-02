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

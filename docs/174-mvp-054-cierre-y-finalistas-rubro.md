# 174 — MVP-054: cierre por vencimiento y hasta dos finalistas por rubro

**01/11/2026 · Issue #321 · desarrollo sin desplegar ni usar clientes reales.**

## Hecho
1. `supabase/sql/round_clock_transitions_d086.sql`: RPC privada `advance_round_clock_d086(uuid)`. Usa exclusivamente `clock_timestamp()` de PostgreSQL y bloquea la fila de la ronda `FOR UPDATE`. Si está programada en fecha de inicio la abre; si está vencida, la cierra; si está cancelada o cerrada, no cambia nada. El resultado es una respuesta de estado y si hubo transición; **no incluye precios, nombres, teléfonos, identidades ni ganadores**. Dos ejecuciones del mismo proceso no producen dos cierres. **El código NO instala ni ejecuta un cron**.
2. Una ronda que quedó `programada` hasta después del cierre puede pasar a `cerrada` una vez vencida, con `opened_at=begins_at` (inicio efectivo, no señal de que un worker corrió) y `closed_at` del reloj SQL. Así se evita dejar rondas caducas abiertas para siempre. El trigger D024 continúa bloqueando cambio anticipado, reescritura de vencimiento, reapertura y transiciones erróneas.
3. Roles PostgreSQL NOLOGIN separados: gateway solo ejecuta la función; el owner de la función solo puede leer/cambiar `status` de `rounds_v1` con políticas RLS propias. No lee contactos ni ofertas; `anon`, `authenticated`, `service_role` no pueden invocar la RPC.
4. `src/domain/finalistas-por-rubro-mvp054.ts` usa D039 y el comparador decimal D022 para cada rubro **por separado** con IDs anónimos, máximo dos candidatos por rubro y ninguno si hay empate indecidible, opciones parciales incomparables, baja, falta de consentimiento, ronda abierta/cancelada o fecha insuficiente. Una tienda que ofrece en múltiples rubros puede aparecer en distintas canastas; materiales duplicados en rubros distintos se rechazan.

## Qué se prueba
- CI PostgreSQL 17 (`134_round_clock_d086.sql`): futura programada sin cambiar, apertura por vencimiento del inicio, cierre tardío después del fin, doble ejecución idempotente, cancelación, inexistente y privacidad de roles. Datos ficticios dentro de transacción revertida.
- Unitarias Node: dos rubros, máximo 2 finalistas por rubro, empate solo bloquea rubro afectado, sin contacto previo, proveedor dado de baja, oferta incompleta, condiciones de pago no comparables, consentimiento y duplicados.

Los resultados solo se consideran aprobados cuando CI del commit final confirma su ejecución.

## Todavía no habilitado
- Un scheduler real (Vercel Cron, worker o job) que invoque periódicamente D086 con autorización estricta. Sin él no ocurre nada automáticamente fuera de tests.
- SQL de snapshot económico comparable con todas las versiones recibidas a tiempo, matching producto técnico e IVA/flete. D039/D054 siguen siendo **motores offline**; la salida de D086 NO calcula ni persiste el ranking.
- Un registro durable e idempotente de revelación recíproca, con consentimiento y baja verificados **en el momento de enviar** y canales cifrados. No revelar ninguna identidad antes de esa implementación. `finalistasAnonimos` no es un permiso de enviar ni es la identidad comercial.
- Webhook Whapi real / archivos / IA, instalación de migraciones comerciales DEV, cierre de #175. `main` y producción no se tocan.

## Decisión de producto
Sin botón «Adjudicar»; el arquitecto envía materiales por WhatsApp y el sistema debe resolver la ronda de 3–7 días (5 predeterminado) de forma automática al habilitar los procesos reales. Mantener el piloto simple sin inventar rankings.

# 179 — MVP-059: cola de pedidos WhatsApp conectada a preparación de invitaciones

**01/11/2026 · Issue #331 · código y tests de desarrollo. No activado en un proceso real.**

## Qué se conectó

Antes D083+D074 cifraban y guardaban el WhatsApp y el trigger D082 creaba una tarea. D077 podía reconstruir mensajes y respuestas de zona, D081 podía abrir la ronda y D071 preparar invitaciones. Estaban desarrollados pero **no había un orquestador único** con el flujo completo.

`src/server/buyer-whatsapp-pipeline-mvp059.ts` **compone** cinco módulos ya existentes, sin duplicarlos:

1. D082 reclama un evento cifrado persistido mediante lease de duración limitada.
2. D077 carga la entrada autorizada, la descifra mediante verificador AES autenticado suministrado por servidor y, si corresponde, reconstruye el pedido previo del mismo chat cuando se responde `La Plata`.
3. D073 + normalizador MVP-058 interpreta texto natural, rubros y plazo. Si falta localidad, D077 encola UNA pregunta sin volver a pedir toda la lista; si hay ítems dudosos se retiene el pedido.
4. D081 crea la ronda **atómicamente e idempotente** por mensaje original (5 días por defecto).
5. D071 filtra por productos concretos, localidad y consentimiento, y prepara la cola privada de invitaciones, sin enviar Whapi.
6. D082 confirma la tarea de la cola o reintenta; después de COMMIT y falla de D071 conserva el mismo identificador de ronda al repetir la operación.

## Seguridad

Cada puerto SQL se suministra **por separado** y tiene lista cerrada de SQL parametrizado; no se aceptan DML, consultas dinámicas, service_role ni la identidad enviada por HTTP. Los cinco puertos son:

| Puerto | RPC autorizadas | Rol SQL necesario (preexistente) |
|---|---|---|
| cola | `whapi_claim_buyer_d082`, `whapi_finish_buyer_d082` | `cotironda_buyer_queue_gateway_d082` |
| lectura | `whapi_zone_context_d077` | rol lector de zona D077 (revisa permisos D076) |
| zona | `whapi_zone_enqueue_d077` | escritor de zona D077 |
| ronda | `whapi_create_buyer_round_d081` | `cotironda_whapi_round_gateway_d081` |
| invitacion | `whapi_prepare_commercial_round_d071` | `cotironda_invite_owner_d070` mediante runner privado |

La implementación **no une los privilegios en un único rol** y no reutiliza el LOGIN limitado D085 de seis RPC para ejecutar tareas adicionales. No hay conexión real a Supabase; un futuro ejecutor deberá proveer sesiones DB con roles comprobados, permitir solo estas RPC, implementar cuotas/timeout, y cerrarlas al terminar.

MVP-059 NO programa un cron, NO invoca APIs de IA ni Whapi, NO descarga archivos, NO procesa presupuestos de proveedores ni envía consultas efectivas; `mensajesWhatsappEnviados=0`. No desactiva los bloqueos por datos ambiguos/consentimiento/zona ni hace público el chat.

## Casos de aceptación y test

`tests/unit/mvp059-whapi-buyer-queue-compose.test.mjs` corre **el módulo real** con puertos SQL falsos en Node:

- Arquitecto envía un único texto de cemento, hidrófugo y látex en La Plata; la tarea se reclama, descifra, se guarda la ronda y se preparan invitaciones (0 mensajes enviados).
- Sin zona: una pregunta en cola y, con respuesta del mismo chat, se recupera el pedido original y se crea la ronda.
- Falla de preparación después del COMMIT: se reintenta **la misma ronda**, no se duplica.
- Materiales dudosos: revisión interna, sin inventar categorías ni descartar silenciosamente.
- Contacto revocado/no verificado y AES inválido: no crear rondas; error de descifrado da retry, no expone secreto.
- Workers apagados: cero lecturas SQL y cero envíos.
- Puertos incompletos: fail-closed.

## Pendientes para operar con los cuatro teléfonos

**#175 sigue bloqueando migraciones comerciales en Supabase DEV actual** por no contar con exportación y restauración auténticas. Los 17 scripts de migración históricas, incluido laboratorio IA, están archivados; el paso crítico es el backup real y una prueba de restore, no seguir reimplementando pruebas sintéticas.

Para un piloto real falta instalar esquema SQL en un ambiente seguro; cargar 1 arquitecto + 3 comercios con sus catálogos, ubicación y opt-in; abrir Whapi con secreto privado; ejecutar este worker por disparador autorizado (cron/worker dedicado con roles separados), y ejecutar el emisor de invitaciones con cuotas. Después se debe probar recepción de respuestas/correcciones, ranking monetario verificable y revelación consentida de finalistas al cierre. Media PDF/Excel/imagen aún no atraviesa esta ruta.

**No se modificaron Supabase DEV ni producción, Vercel ni OFI. Ningún WhatsApp real enviado.**

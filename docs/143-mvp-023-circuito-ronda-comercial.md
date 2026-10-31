# 143 — MVP-023: conectar pedido con proveedores e invitaciones (sin WhatsApp live)

31/10/2026 · Issue #259 · rama `feat/mvp-023-ronda-comercial-orquestada`.

## Objetivo: un pedido, ninguna traba extra

El comprador crea una solicitud con materiales, cantidad, rubro y zona de entrega por D064. A partir de esa ronda **ya programada**, un proceso privado debe detectar proveedores D065 por categorías curadas, provincia y localidad verificadas, revisar consentimiento y preparar la cola D070, sin pedir confirmaciones extra, sin cruzar material de distintos rubros y sin enviar un WhatsApp antes de la autorización de piloto.

## Implementación

- `supabase/sql/whapi_round_orchestrator_d071.sql`: función privada `whapi_prepare_commercial_round_d071(round, channel)`, que llama D065 y D070 dentro de UNA transacción. Reutiliza el control de alcance D066 y el destinatario AES-GCM D068; requiere un único contacto consentido/activo por proveedor y un vault existente.
- Si no hay zona verificable, producto mapeado, proveedor o contacto de destino, retorna conteos y estado técnico preciso, **sin inventar localidad o número**. Otros proveedores pueden seguir sin requerir asistencia del comprador.
- Idempotencia: las sucesivas ejecuciones no crean otro job para la misma ronda/proveedor/canal; D070 mantiene la unicidad. Las bajas posteriores se reflejan en conteos y el guard propio de D070 bloquea el futuro envío antes del transporte.
- La función `SECURITY DEFINER` está en esquema privado `cotironda_private`, pertenece a rol NOLOGIN/NOBYPASSRLS D070 con permisos mínimos y se invoca exclusivamente por gateway privado. Se revocó EXECUTE a `public`, `anon`, `authenticated`, `service_role` y `cotironda_app`. El rol solo puede leer tres columnas de identidad HMAC del vault, nunca `cipher` ni claves.
- `src/server/whapi-round-planner-d071.ts` es un adaptador de servidor que valida forma y cantidad de respuesta, exige RPC inyectado y flag habilitado explícito; **apagado por defecto a nivel de integración**. No se registró ruta de navegador, worker automático, cron ni servicio WhatsApp y no se expone teléfono, HMAC ni texto.
- `supabase/tests/ci/125_whapi_round_orchestrator_d071.sql` reutiliza el fixture PostgreSQL17 de dos comercios: corralón = cemento, pinturería = pintura; prueba destinatario pendiente, enrolamiento posterior cifrado, repetición, canal cruzado, BAJA y cuota sin reservar.
- `tests/unit/mvp023-whapi-round-planner-d071.test.mjs` comprueba validación fail-closed, estados, replays, ausencia de red y secretos.

## Límites verificables

El código solo prepara **intenciones de envío**, NO envía mensajes ni abre una ronda. D055/D070 tienen controles propios para una futura conexión real. **D064 todavía no dispara automáticamente D071**: conectar un worker o evento de servidor exige el gate de despliegue y credenciales privadas; no convertirlo en una llamada directa del comprador o un proceso bajo el JWT del usuario.

Falta la forma genuina de verificar el contacto y consentimiento inicial de un proveedor que todavía no tiene un chat D028, con poca fricción; D069 por diseño no crea ese vínculo desde una entrada no autenticada. Hasta resolver eso pueden existir proveedores elegibles en catálogo pero no contactables.

El proyecto Supabase DEV todavía tiene solo las migraciones base y de laboratorio de IA, **no** tablas de ronda, y se mantiene bloqueada su instalación por **Issue #175, respaldo real cifrado + recuperación aislada**. Ningún SQL de D071 se debe aplicar allí ni en producción todavía. En los tests todos los UUID, proveedores y números son ficticios; el sistema sigue sin piloto Whapi live, sin PDF/Excel/foto interpretados por IA real y sin restauración comercial validada.

## Camino corto al piloto

Primero respaldar DEV y comprobar restauración con roles/Auth/Storage en una instancia aislada. Después instalar selectivamente las migraciones comerciales en DEV con flags apagados, vincular onboarding de un comercio voluntario verificado, configurar un único canal Whapi en allowlist de pruebas y recorrer comprador → D064 → D065/D071 → D070/D055 → respuesta D061/D060 → ofertas anónimas para comprador. No hay presión comercial ni ranking de totales incomparables.

# 136 — MVP-016: seleccionar proveedores habilitados por rubro y zona

31/10/2026 · Issue #245 · SQL sólo para PostgreSQL 17 descartable CI. **No instalado en Supabase DEV/prod.**

## Problema que resuelve
La ronda D064 ya guarda materiales y localidad, pero no tenía proveedores. El comprador no debe buscar corralones ni seleccionar sus contactos: Cotironda debe identificar comercios por **categorías habilitadas, área de entrega y consentimiento WhatsApp**, manteniendo los rubros separados.

## Alcance implementado
- `cotironda_private.item_rubros_d065`: mapeo CURADO de código canónico de material a categoría comercial. **No** deduce rubro a partir del nombre del producto ni asegura stock individual. Un proveedor que declaró la categoría puede recibir consulta y cotizar parcialmente.
- `cotironda_private.delivery_localities_d065`: alias explícito de zona a **provincia y ciudad**. No asumimos que una localidad única en el texto determina una provincia; si no hay mapeo aprobado, queda para revisión interna, sin molestar al comprador con formularios arbitrarios.
- `cotironda_private.prepare_supplier_invites_d065(round,channel)`: sólo rol de backend `cotironda_match_gateway_d065` (NOLOGIN/EXECUTE, jamás `anon`, `authenticated` o `service_role`). Verifica ronda PROGRAMADA, presencia de solicitud D064, región verificada y rubros conocidos; coincide con `supplier_profiles.accepting_quotes`, `supplier_categories.is_enabled`, `supplier_delivery_areas.is_enabled` y ciudad/provincia exactas, más contacto `whapi_contacts_v1` verificado, consentimiento vigente y sin BAJA en ese canal.
- Al seleccionar, inserta hasta 10 invitados en D024 **con alias anónimo** y en `round_supplier_lines_d065` guarda la lista de líneas permitidas para cada proveedor; un corralón no debe recibir ni cotizar líneas destinadas a pinturerías. Ordena por **cobertura de rubro** y desempate determinista, sin sugerir que quien recibió primera invitación tiene mejor precio o ranking.
- Adopta bloqueo transaccional/idempotencia: reintento del mismo canal devuelve `already_prepared`; cambiar a otro canal después de preparar devuelve rechazo; la ronda permanece PROGRAMADA y los mensajes enviados son SIEMPRE 0. No realiza llamadas a WhatsApp, OpenAI, archivos, ni recibe números en claro.
- Roles RLS NOLOGIN, permisos mínimos y tablas privadas sin Data API pública. Los mapas serán provisionados por equipo interno autorizado, nunca por un cliente; **el ensayo no instala ningún mapa real en DEV**.

## Limitaciones que bloquean envío real
1. D061 todavía lee el snapshot general de la ronda; ANTES de activar el emisor real, adaptar el broker que arma solicitudes y lee respuestas para usar `round_supplier_lines_d065`. **Nunca enviar el pedido general a todos los invitados**.
2. El procedimiento no comprueba inventario exacto de cada producto: se usa la categoría voluntariamente habilitada; el proveedor podrá responder con una oferta parcial, sin confirmaciones extra. Una futura homologación de productos individuales debe ser explícita, no textual aproximada.
3. Si un proveedor revoca consentimiento o área de entrega **después** de preparar invitaciones, el emisor futuro DEBE revalidar los criterios al momento de envío. Las invitaciones preparadas no equivalen a autorización permanente.
4. La zona hoy es una cadena validada en D064; para liberar el piloto habrá que curar localidades/provincias reales y revisar casos de ambigüedad, sin inventar mapeos. Cobertura implica ubicación de entrega, no ubicación del comprador.
5. No se abre ni se cierra una ronda automáticamente aquí. Falta el despachador de invitaciones, un worker en nube y un origen documental real PDF/Excel/foto.
6. Backup/restauración auténticos de Supabase DEV #175 siguen pendientes. Ningún SQL del laboratorio se instalará antes de su aprobación.

**Prueba objetivo:** solicitud de 2 materiales, proveedores de 2 rubros, excluyendo BAJA, comercio sin aceptación y entrega en otra provincia; scope de cada invitación correcto; sin mensajes, sin duplicados, permisos aislados en PostgreSQL17.

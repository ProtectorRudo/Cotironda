# ADR 348 — Una sola IA dueña de cada mensaje del comprador

Fecha: 2026-11-05. Rama de DESARROLLO. **No desplegado ni enviado por Whapi**.

## Bloqueo encontrado

El webhook `cotironda-piloto-whapi/index.ts` procesaba los mensajes con
`parseBuyerPilot` y la IA heredada ANTES de archivarlos con el RPC.
Dejar esa lógica y sumar la IA Central duplicaría rondas, respuestas
automáticas y procesamiento de una misma fuente.
La cola nueva de envío MVP222 tampoco se alimentaba desde una
interpretación real del comprador.

## Flujo integrado MVP226

1. Un único webhook WhatsApp con HMAC/canal válidos y hasta 10 entradas.
2. Bandera `COTIRONDA_PILOT_AI_CENTRAL_BUYER_ENABLED=true`
   + permiso privado `ai_central_control_mvp226.enabled=true`;
   **ambas OFF por defecto**. Con estos controles, los mensajes del
   comprador saltan completamente el parser y la IA heredados,
   preservando sin cambios el circuito anterior mientras está apagado.
3. `receive_whapi_v1` archiva el texto cifrado y SHA; no crea ronda
   automáticamente (p_items nulo, p_city='sin solicitud'). La función
   `cotironda_piloto_ia_reserve_buyer_mvp226` confirma identidad
   opt-in, texto original, tipo, SHA, ventana de 10 minutos y cuota
   DURABLE de 6 mensajes por 24 horas. Un HMAC ya reservado no
   vuelve a consumir IA.
4. `procesarCompradorCentralMvp226` ejecuta:
   `interpretarConIaCentralV1` (doble lectura) →
   `cotironda_piloto_ia_catalogo_mvp220` (catálogo real) →
   clasificación semántica por rubro → enrutamiento de proveedor
   registrado → `armarPreparacionSombraMvp221` y
   `guardarRondaSombraMvp221` en una transacción SQL.
5. `cotironda_piloto_ia_lookup_round_mvp226` obtiene exclusivamente
   la ronda creada desde ese mensaje cifrado y su buyer. Sin
   despachos, guarda `staged`. Con la bandera Edge
   `COTIRONDA_PILOT_AI_CENTRAL_DISPATCH_ENABLED=true` y permiso SQL
   `ai_dispatch_gate_mvp222.enabled=true`, llama al publisher,
   prepara `invitation_lines` y la cola privada por proveedor.
   **El despacho Whapi sigue requiriendo su propio lease y HMAC**.
6. Si se publicó, el mecanismo EXISTENTE crea el token privado de
   seguimiento del comprador y envía el enlace por WhatsApp una sola
   vez según su ledger.
7. El proveedor que tiene un despacho IA abierto no pasa por
   la asociación ingenua del texto. `is_supplier_mvp226` aplica
   el mensaje especial de asociación a rondas nuevas. Si tiene
   simultáneamente una invitación legacy, se abstiene ante texto
   ambiguo para no asociar presupuesto a otro cliente.
8. La lectura de archivos de proveedor y la comparación económica
   siguen sujetas a su verificador de fuente y estado del documento.
   No enviar contenido sin esta verificación.

## Pruebas

- `tests/unit/mvp226-circuito-comprador-unificado.test.mjs`:
  bandera OFF→0 llamadas; reserva duplicate/cuota/identidad, plan
  con dos artículos y un proveedor, stage+publish+seguimiento,
  SQL outbound OFF, localidad ausente, discrepancia IA, RPC
  incierta sin reintentar.
- `supabase/tests/ci/mvp226-ia-central-inbound-pg17.sql`:
  fuente SHA real sintetizada, buyer consentido, bloqueo de replay,
  sellado de estado, ronda existente solo para el propio remitente,
  supplier central vs desconocido, límites y permisos service_role.
  Todo en PG17 sintético bajo ROLLBACK.
- El código del piloto con banderas apagadas mantiene lector y
  rondas anteriores. No cambiar passwords, contactos ni secretos.

## Pendientes y límites de esta fase

- Respuesta de localidad aislada cuando el usuario no puso zona en
  el mensaje original: no inventar; requiere un vínculo explícito
  con el mensaje anterior para procesarlo sin volver al parser
  heredado.
- Adjuntos del comprador PDF/Excel/Word/foto todavía utilizan la
  interpretación documental heredada, no la semántica central
  completa.
- La nueva asociación de respuesta ya existe (MVP225), pero falta
  pipeline de cotización IA a persistencia verificable y consulta
  del comprador organizada por rubros.
- No afirmar E2E real hasta simular todos los pasos de ejecución,
  activar permisos y observar WhatsApp real de un comprador y
  dos proveedores opt-in. **No se publicará en producción**.

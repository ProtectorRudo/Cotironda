# 148 — MVP-028: primer pedido de materiales por texto, sin perder especificaciones

31/10/2026 · Issue #269 · rama `feat/mvp-028-pedido-comprador-texto-specs`.

## Problema crítico corregido

D064 guardaba solamente `product_code,quantity,unit`; el paquete D066 tomaba un `display_label` genérico. Un comprador que pedía «20 bolsas de Cemento CPC Loma Negra 50 kg» podía terminar consultando simplemente «Cemento CPC 50 kg» (perdía la marca) o incluso otros atributos técnicos. **Nunca es aceptable despachar una descripción que silencie especificaciones.** D064 no estaba conectado a la pantalla de pegado de texto: no se podía registrar un pedido desde una interfaz real.

## Solución acotada

- `round_items_v1.source_description` preserva de manera privada la descripción **literal del producto** (sin repetir cantidad) hasta 90 caracteres, con comprobación SQL de caracteres y bloqueo de URLs/números de teléfono evidentes. Es nullable para pruebas históricas; las nuevas solicitudes emitidas por la interfaz siempre la incluyen.
- D064 acepta 4 columnas para fixtures anteriores y **5 con `source_description`**; valida contra texto peligroso en HTTP y SQL, guarda el campo en la misma transacción que la ronda y lo incorpora de forma implícita al hash SHA-256 idempotente del JSON. Mismo requestId con descripción cambiada => conflicto, no segunda ronda.
- D066 sigue requiriendo un código curado en `item_display_d066` y rubro/zona/consentimiento válidos, pero **prioriza `source_description` original sobre el nombre genérico** al construir el mensaje privado para cada proveedor.
- Nuevo `src/domain/pedido-piloto-mvp028.ts`: sin IA externa, utiliza `extraerLinea`, `identificarProducto` y `separarCondicionesComprador`. Maneja zona escrita en el pedido o campo del formulario; si falta o hay contradicciones, retiene. Solo 1–8 artículos seguros; guarda literalmente marca, modelo, atributos, peso y espesor. **No descarta silenciosamente** líneas ambiguas, repetidas, excedentes ni IVA contradictorio; retiene la operación y muestra una aclaración. Esto es una limitación conservadora del piloto, no el flujo definitivo de retenciones parciales.
- `/mis-rondas`: formulario móvil sencillo de texto y localidad + botón **Pedir presupuestos**. `POST /api/rondas` existe desde MVP-015; ahora recibe ítems estructurados desde esta pantalla, UUID idempotente mantenido ante retry y muestra estado honesto «pedido registrado, sin mensajes enviados».
- Inicio de sesión Preview comprador sin registrar nuevas empresas y **sin depender** de activar WhatsApp del proveedor (`autenticacionPreviewCompradorMvp028`). Nuevo matcher SSR Proxy para `/mis-rondas`, `/api/rondas`. La lista de solicitudes propias requiere solo lectura de rondas, no activar visualización de ofertas.
- **OFF por defecto**: solo código. Requiere `COTIRONDA_AUTH_PREVIEW_ENABLED`, `COTIRONDA_ROUNDS_READ_ENABLED`, `COTIRONDA_ROUNDS_CREATE_ENABLED` en Vercel Preview con branch de integración, `COTIRONDA_REGISTRATION_ENABLED=false`, Supabase DEV correcto, `COTIRONDA_SITE_ORIGIN` seguro y migraciones D024/D064/D065/D066 instaladas después del backup real. No Whapi ni publicación.

## Ensayos

- Suite `tests/unit/mvp028-pedido-comprador-texto.test.mjs`: varios rubros, CPC 50 kg, Loma Negra, placa RH 12,5, IVA explícito y faltante, localidad requerida, cantidades ambiguas, duplicados, renglones sin reconocimiento, 8+ líneas, caracteres peligrosos; condiciones negativas de login Preview comprador.
- `tests/unit/mvp015-buyer-round-create-http.test.mjs`: fuente literal válida, URL, número telefónico, campo de intrusión y texto inválido (400 antes de RPC).
- PostgreSQL17 en `119_buyer_request_create_d064.sql`: fuente guardada y reproducible bajo idempotencia. `121_supplier_packet_d066.sql`: el proveedor recibe «Cemento CPC Loma Negra 50 kg» en vez de «Cemento CPC 50 kg» del diccionario, sin recibir secretos ni artículos de otro rubro.
- `apps/portal/scripts/smoke-buyer-text-pilot.mjs`: HTTP Next.js compilado con cookies genuinas de `@supabase/ssr` pero **JWT y PostgREST simulados**, confirma formulario visible, signup bloqueado, 401 anónimo, 403 CSRF, 400 fuente maliciosa, 201 ronda guardada **sin invitaciones** y listado de rondas 200; CI corta toda salida a Internet.

## Límites importantes

El diccionario de producto canónico del frontend es **una propuesta**. Un `product_code` no se trata como SKU técnico exacto; D065 solo autoriza distribución cuando el mapeo de rubro/zona/catálogo fue curado y el proveedor opt-in está vigente. La descripción del comprador se comunica como **requisito literal**, no como equivalencia certificada. Un usuario malicioso podría falsear códigos/descripciones por HTTP; D065 requiere curación de códigos y D066 limita caracteres, pero antes de Whapi live hay que verificar concordancia semántica entre código y descripción, no confiar solamente en el navegador.

La versión inicial NO interpreta archivos PDF/Excel/Word/fotos, no consulta IA real, no procesa ofertas reales, no habilita envío automático, no instala migraciones ni crea nuevos proveedores. Si la lista tiene renglones dudosos, retiene toda la operación en lugar de omitirlos; la liberación parcial con seguimiento de pendientes queda para después. La UX aceptable final sigue siendo cero fricción, WhatsApp-first.

Supabase DEV aún está sin backup/restore auténtico **#175**. Los scripts D024/D064/D066 se han modificado solo en GitHub; ejecutar SQL en DEV antes de #175 continúa prohibido. Vercel no se publicó, por límite de builds. Un PASS CI es sintético, NO es ensayo con un comprador/corralón verdadero.

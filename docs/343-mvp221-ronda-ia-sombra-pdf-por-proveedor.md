> **Actualización ADR 346 (05/11/2026):** la confirmación formal de catálogo ya NO es requisito para **invitar a cotizar** a un proveedor con consentimiento y productos registrados. Se conserva la marca real `catalogue_confirmed_at` sin inventarla y se siguen validando identidad, zona, existencia de la línea y cambios de precios. Ver [docs/346](346-mvp224-invitaciones-con-catalogo-registrado-sin-friccion.md). La restricción anterior en este documento queda sustituida solo para invitaciones.

# MVP221 — Ronda IA Central en sombra, líneas por proveedor y rubro

**Estado:** desarrollo, 05/11/2026. No se instalaron objetos en PILOTO ni
se enviaron WhatsApps nuevos. Integración central de issue #597/#529.

## Bloqueo que resuelve

El `receive_whapi_v1` vigente crea rondas de texto y proveedores a través
de `family_code` curado. El snapshot PDF vigente incluye todos los
renglones de un pedido de texto para cada negocio, sin discriminar por rubro,
y el alta de `invitations` dispara un trigger que crea outbox.
Por eso **no** es seguro reutilizar directamente el camino antiguo
para el ruteo semántico de un pedido mixto.

## Nuevo flujo, fase sin despachos

1. `planificador-piloto-mvp220.ts` recibe mensaje ya validado por
   webhook firmado; dos lecturas semánticas identifican cada artículo,
   la IA clasifica rubros y rutea contra líneas de catálogo reales.
2. `puente-sql-rondas-mvp221.ts` une las coincidencias de proveedor
   con la **descripción exacta** de la línea del catálogo leída por
   el RPC de MVP220. Envía al SQL los IDs, rubros, cantidades y
   evidencia de fuente. No acepta proveedores inactivos,
   índices duplicados ni rutas con fuente distinta.
3. `cotironda_piloto_ia_shadow_prepare_mvp221` abre **una única
   transacción** en el servidor. Revalida que el mensaje exista en
   el inbox WhatsApp (chat HMAC, buyer consentido, kind text,
   sha256 byte-a-byte del mensaje original, sin ronda asociada,
   plazo reciente y estado pendiente), valida todas las líneas y
   cada producto del proveedor **contra catálogo confirmado,
   localidad y descripción original**.
4. Solo si todo lo anterior pasa crea `requests.state=draft`,
   todas las `request_lines` y los sidecars privados
   `ai_shadow_requests_mvp221`, `ai_shadow_rubros_mvp221`
   y `ai_shadow_destinos_mvp221`. La marca de familia legacy
   queda NULL para no inventar una equivalencia.
5. **NO crea `invitations`**: el trigger heredado podría crear
   outbox de WhatsApp. Un mensaje repetido devuelve
   `already_staged`; la fuente HMAC tiene UNIQUE.
6. `cotironda_piloto_ia_pdf_preview_mvp221` devuelve por proveedor
   **solo sus líneas**, con `rubro` y producto de catálogo que
   motivó su selección, sin teléfono, precio ni datos del comprador.
   Requiere service_role; no envía ni publica el PDF.

## Pruebas

- `tests/unit/mvp221-puente-sql-rubros.test.mjs` cubre la
  construcción de parámetros usando 3 proveedores y 3 rubros,
  permisos, remitentes inválidos, índice equivocado, duplicados y
  respuesta SQL que pretende haber enviado WhatsApps.
- `supabase/tests/ci/mvp221-ia-rondas-sombra-pg17.sql`
  corre en PostgreSQL17 con tablas y roles sintéticos:
  mensaje real representado por SHA/HMAC, catálogos originales
  con proveedor confirmado, guarda 3 líneas y 3 ruteos;
  cada uno de los 3 preview PDF tiene **1 línea**, y
  `invitations`/`whapi_outbox` permanecen vacíos.
  Testea mensaje falsificado, idempotencia y ACL para los roles
  `anon/authenticated/service_role`. Todo termina en ROLLBACK.
- La RPC no tiene entrada para un token de seguimiento de comprador
  ni acepta parámetros enviados directamente desde el browser.

## Pendientes que impiden habilitar el envío

- En PILOTO, **ambos catálogos siguen sin confirmar**; no tocar
  `catalogue_confirmed_at` por cuenta propia.
- Crear fase de **publicación atómica de borrador** con los mismos
  controles de fuente/catalogo, reinicio transaccional y auditoría;
  no permitir que los triggers existentes envíen antes de validarse.
- Corregir snapshot PDF real / firma de envío para que use el
  nuevo vínculo `ai_shadow_destinos`; preservar rutas históricas.
- Confirmar cobertura de ítems no cotizados y equivalencias
  comercialmente razonables; asociación por quoted WhatsApp ID
  y código de ronda de documentos PDF.
- Conectar a webhook de forma explícita, bajo cuota durable
  e idempotencia, sin repetir mensajes viejos.
- Evaluación con errores ortográficos, listas extensas, fotos,
  Excel y respuestas de proveedores; prueba de teléfonos y navegador.
- Comparación y descarga por rubro, originales y cierre conforme
  permisos. Aún NO hay E2E real ni 14 puntos terminados.

**Ninguna parte de MVP221 autoriza contactos, rankings, ganadores,
envíos WhatsApp ni originales descargables.**

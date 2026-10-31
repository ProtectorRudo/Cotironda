# 135 — MVP-015: alta real de la solicitud del comprador, sin «Confirmo»

31/10/2026 · Issue #243 · **solo código y PostgreSQL 17 descartable CI**; no aplicado a Supabase DEV/producción ni publicado en Vercel.

## Qué resuelve

Antes del MVP-015, existía una interfaz de lista ficticia, un motor probado de recepción de cotizaciones y la vista autenticada del comprador. **No existía un endpoint que creara una solicitud auténtica a partir de los materiales del comprador.** Este cambio conecta el primer dato de negocio con el ledger privado D024.

- `POST /api/rondas`: toma un pedido **ya extraído y revisado** con `requestId` UUID idempotente, `deliveryZone` (localidad), `vatRequest` solo explícita, y 1–8 líneas estructuradas `line_no/product_code/quantity/unit`. `companyId` es opcional: PostgreSQL deduce la única empresa compradora que el usuario administra; si administra varias, exige selección de empresa (no la inventa).
- Validación JSON estricta, tamaño máximo 4096 caracteres, esquema de cantidades/IDs y unidad; rechaza datos extra, artículos repetidos, falta de zona o impuestos falsos, origen cross-site y métodos ajenos. CORS no habilitado. No requiere formulario del proveedor.
- `public.create_buyer_round_d064`: wrapper PostgreSQL **SECURITY INVOKER** con `EXECUTE` únicamente para `authenticated`. Internamente, función privada `SECURITY DEFINER` propiedad de `cotironda_buyer_writer_d064` NOLOGIN, NOBYPASSRLS. Reutiliza D025 para validar JWT, sesión viva en auth.sessions y correo confirmado; verifica empresa compradora, membresía activa y rol owner/manager. Rechaza empresa ajena.
- En **una transacción**, inserta ronda `programada`, los artículos y la evidencia inmutable de zona/condición IVA y huella SHA256. En caso de doble clic o reintento, el `requestId` más un bloqueo transaccional devuelven el MISMO identificador; si se modifica el contenido bajo la misma clave, error de conflicto. No queda una ronda incompleta.
- **No se genera invitación automática**, WhatsApp ni selección de proveedores: **el motor de coincidencia por catálogo/zona y consentimiento todavía necesita conectar sus datos reales**. Nunca se prometen mensajes enviados cuando todavía no existen. Ronda `programada` solo se abrirá luego de preparar distribución legítima. No hay confirmación redundante.

## Ensayos

`supabase/tests/ci/119_buyer_request_create_d064.sql`: en PostgreSQL17 efímero con dos compradores ficticios, prueba creación, replay, colisión, zona, IVA, dos líneas, ninguna invitación, titular ajeno, usuario suspendido, sesión revocada, materiales inválidos y permisos DML cerrados.

`tests/unit/mvp015-buyer-round-create-http.test.mjs`: pruebas del endpoint con validación de zona, unidad, cantidades, anti-CSRF, doble envío, respuestas adulteradas, fallos de RPC opacos y flags.

## Habilitación y limitaciones

El endpoint está **apagado por defecto**; requiere `COTIRONDA_ROUNDS_READ_ENABLED=true` y `COTIRONDA_ROUNDS_CREATE_ENABLED=true` en Vercel Preview de Cotironda DEV con registro general apagado. Nunca se habilita en producción bajo este contrato. **No instalar D024 ni D064 en DEV** antes del backup lógico auténtico y restauración #175.

La etapa documental de PDF/Excel/imagen/IA todavía debe entregar la lista estructurada `items` al endpoint con evidencia revisable por el comprador; **no enviar la demo de proveedores ficticios como solicitud verdadera**. La zona es la única pregunta indispensable, pero nombres/materiales ambiguos requieren advertencia útil y no se convierten a códigos por adivinación.

Próximo objetivo: unir extracción real → catálogo/proveedores reales con consentimiento y zona → transición automática segura a ronda abierta → envío por Whapi → ofertas al comprador. Ninguna adjudicación automática.

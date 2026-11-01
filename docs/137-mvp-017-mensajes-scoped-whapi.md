# 137 — MVP-017: mensaje por proveedor limitado a sus rubros (sin enviar)

31/10/2026 · Issue #247 · **solo PostgreSQL17 CI y código de servidor, no producción ni Supabase DEV**.

## Objetivo

Después de preparar las invitaciones en D065, Cotironda debe construir **solo el pedido destinado a cada proveedor**, sin exponer otras categorías ni pedir «Confirmo». El texto debe ser cómodo para un comercio que responde desde WhatsApp, sin entrar a un portal.

## Implementado

- **SQL D066:** función privada `cotironda_private.preview_invitation_packet_d066(roundId,supplierId,channel)`. Rechaza rondas que no estén programadas o hayan vencido y que no tengan invitación/scope D065 para ese proveedor/canal. Vuelve a comprobar que existe un único contacto Whapi verificado y consentido, sin BAJA; perfil aceptando cotizaciones, rubro habilitado, provincia/ciudad atendidas y mapeo original vigente. Si una línea no cumple, no entrega ningún paquete (falla cerrado).
- **Etiquetas curadas:** `item_display_d066` exige que cada material tenga una descripción comercial humana y acotada, sin URLs, saltos ni instrucciones; no convierte códigos internos a nombres por adivinación. Si no hay etiqueta, no se prepara el mensaje.
- **Privilegios:** reutiliza el rol NOLOGIN y gateway EXECUTE-only de D065. No otorga EXECUTE a `anon`, `authenticated` ni `service_role`; no devuelve número de teléfono, chat key ni datos de otros proveedores. Es una función interna.
- **Formato Node/TypeScript:** `formatearConsultaProveedorD066` valida estructura exacta, zona, productos, unidades, orden, cantidades e IVA. Genera un mensaje claro con lista de materiales por proveedor y localidad de entrega. Solicita precios con IVA o sin IVA **solo cuando el comprador lo indicó**. Si no lo indicó, no pregunta ni presume condiciones. No crea `Confirmo` ni usa red/API/Whapi.
- **Pruebas:** `tests/unit/mvp017-whapi-invitation-preview-d066.test.mjs` y `supabase/tests/ci/121_supplier_packet_d066.sql` con fixture ficticio D065 en PG17; corralón ve cemento, pinturería ve pintura, BAJA después del matching bloquea, cambiar cobertura de zona también bloquea, falta de etiqueta bloquea, canal equivocado no da acceso, sin envíos, no hay PII y payloads adulterados fallan.

## Seguridad y limitación crucial

**D066 es una vista previa y NO constituye un permiso definitivo de envío.** Entre leer un paquete y transmitir por WhatsApp, el proveedor puede darse de baja. El emisor real necesitará una revalidación inmediatamente antes de la llamada externa y un mecanismo de idempotencia transaccional ante timeout/reintento. No se entrega un destinatario real: el chat HMAC actual no permite deducir número/ID de WhatsApp; eso se debe resolver en el broker de forma segura y con autorización, nunca invirtiendo HMAC ni poniendo teléfonos en tablas expuestas.

Tampoco se ha adaptado el procesamiento D061 para limitar cotizaciones entrantes por scope D065 en TODOS los casos. Es obligatorio antes de lanzar Whapi. D066 no manda mensajes ni abre rondas. No ejecuta SQL en Supabase DEV y no despliega código, porque falta backup/restore real #175.

**Criterio comercial:** un comprador carga una vez; el comercio recibe solo lo suyo y responde directamente por WhatsApp. No hay portales obligatorios ni confirmaciones extra.

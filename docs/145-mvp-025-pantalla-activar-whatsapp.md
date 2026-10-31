# 145 — MVP-025: activar WhatsApp desde una sola pantalla

31/10/2026 · Issue #263 · código en PR DRAFT, sin uso de un proveedor real.

## Experiencia móvil

Nueva página privada `/proveedores/whatsapp`. El responsable del negocio ve el nombre del comercio y **un solo botón «Activar mi WhatsApp»**. Si administra más de uno, elige a cuál corresponde. Tras presionarlo, el portal solicita a la RPC D072 un código temporal (128 bits, 15 min) para **esa empresa**, valida en servidor el enlace `https://wa.me/<número-del-bot>?text=COTI%20ALTA%20...` y abre WhatsApp en la misma pestaña. El mensaje se envía solo cuando la persona pulsa Enviar en WhatsApp. Después, D027/D072/D069 —cuando estén conectados en el piloto autorizado— validarán chat y opt-in, almacenarán HMAC y cifrarán destinatario. No hay «Confirmo» ni carga de otro formulario.

## Detalles técnicos

- `src/server/whapi-supplier-self-enroll-d072.ts` reutiliza su emisor de URL mediante `crearEmisorEnlaceProveedorD072` separado del receptor. Así el portal **no conoce claves de HMAC/AES ni funciones de webhook**.
- `src/server/supplier-whatsapp-link-http-d073.ts` coordina POST seguro, con `COTIRONDA_SUPPLIER_WA_UI_ENABLED=true` + entorno **Vercel Preview** real + Auth del proyecto Supabase DEV exclusivo + `COTIRONDA_SITE_ORIGIN` canónico + canal/número de bot válidos. Rechaza producción, variables `service_role`, URL/DSN SQL privados y envío Whapi activo. No activa nada solo por compilar. Valida Origin, content-type, tamaño de 256 bytes **en streaming**, UUID y usuario con correo confirmado. Solicita `public.whapi_issue_supplier_code_d072` **con JWT SSR del comprador/proveedor** (sin privilegio de servicio), mientras D072 SQL revalida sesión vigente y owner/manager actual de proveedor; serializa respuesta opaca y no filtra DB. URL solo de host exacto `wa.me`, sin redirects arbitrarios. Respuesta `private, no-store`, `Referrer-Policy: no-referrer`, `noindex`.
- `apps/portal/app/api/proveedores/whatsapp/enlace/route.ts`: usa `clienteSupabaseServidor`, `auth.getUser` y `rpc(...)` con cookies propias; nunca acepta autoridad desde el cliente ni usa `service_role`.
- `apps/portal/app/proveedores/whatsapp/page.tsx`: SSR con Auth y consulta RLS a empresas donde la membresía del usuario actual es owner/manager activa, filtrada a supplier/both con perfil. No devuelve datos de otras empresas. SQL D072 es quien verifica autoridad al emitir. Sin flag muestra aviso sin consultar Auth ni proveedores.
- `activar-whatsapp.tsx` cliente: selección automática si hay una empresa; selector solo si hay múltiples; no almacena código en localStorage ni lo muestra en la pantalla; redirige a `wa.me` sin popups. Si el operador se equivocó de WhatsApp, deberá abrir el enlace nuevamente desde la app correcta.
- `apps/portal/.env.example`: variables **server-only** nuevas, todas apagadas o vacías.
- La página de alta de empresas enlaza a esta pantalla solo con el flag habilitado.

## Validación y límites

- `tests/unit/mvp025-supplier-whatsapp-link-http-d073.test.mjs`: seguridad de flags Preview, host/canal, CSRF-Origin, cookies inválidas, payload extra/UUID, límite de bytes, error SQL oculto, enlace wa.me válido, apagado que ni consulta Auth.
- `apps/portal/scripts/smoke-disabled.mjs`: Next.js HTTP real con flags apagados; `/proveedores/whatsapp` muestra aviso sin botón y POST `/api/proveedores/whatsapp/enlace` rechaza 503 antes de llamar DB.
- Las pruebas de D072 + PG17 del MVP-024 siguen vigentes; **no hay prueba E2E real del enlace con proveedor**.
- **Bloqueo #175**: no instalar D024–D072 en Supabase DEV ni habilitar estos flags sin respaldo auténtico cifrado y restore aislado. Tampoco activar webhook, Whapi, costos, envíos, signup público ni publicar. El código está listo para integrarse posteriormente, no demuestra un alta real. No se abre registro desde esta UI; una empresa debe existir y estar correctamente autorizada.

## Próximo mínimo corte de piloto

Backup DEV y restore comprobado (#175), pruebas reales de permisos Auth y migraciones comerciales en DEV con flags OFF, primer proveedor voluntario con cuenta de ensayo, activar el botón en Preview protegido y conectar webhook/Whapi de prueba con allowlist. Confirmar baja, duplicados, costo, límite y ciclo de cotización antes de autorizar producción.

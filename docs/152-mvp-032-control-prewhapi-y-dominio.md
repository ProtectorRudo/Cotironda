# 152 — MVP-032: último control antes de WhatsApp + decisión de dominio

31/10/2026 · Issue #277 · rama `test/mvp-032-ultimo-control-whapi-y-dominio`.

## La decisión comercial sobre cotironda.com

**NO apuntar todavía `cotironda.com` ni `www.cotironda.com` al portal.** La compra del dominio en Hostinger está confirmada por el emprendedor, pero el servicio productivo real todavía no está habilitado. Redirigir ahora confundiría una página pública con un portal en fase de laboratorio, mezclaría entornos y requeriría preparar DNS, Auth callbacks y política de cookies para un servicio que no puede todavía completar el pedido.

Auditoría de Vercel del 31/10: existen dos proyectos distintos en el mismo equipo:
- `cotironda` (`prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8`), sitio raíz sin framework Next.js.
- `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`), **portal correcto**, Next.js.
- Ningún proyecto tiene dominios `cotironda.com` ni `www.cotironda.com` registrados. Los dos muestran solamente `.vercel.app`.
- Preview correcto: despliegue `dpl_9gccXTE24gicUSu7TsdRsVoXvBqm`, SHA `29f36d52f385e7d1f654be2aaf2179ef069098e1`, Vercel `READY`, `target:null`, protegido por SSO, en `https://cotironda-portal-xpnmgrgoz-protector-rudo-s-projects.vercel.app`. Compilación confirmó las rutas /probar, /mis-rondas, /api/rondas y /proveedores/whatsapp. La navegación autenticada en esa URL **no ha sido verificada por navegador**.

### Secuencia de activación del dominio — sin cambios todavía

1. Continuar con la Preview privada y feature flags de registro y envíos comerciales OFF. La base DEV no tiene todavía migraciones comerciales; #175 backup/restore real sin ejecutar.
2. Completar recuperación de DEV, activar funciones comerciales en DEV y ensayar un comprador y dos proveedores voluntarios; QA móvil, inventario, cotizaciones y contactos WhatsApp con consentimiento.
3. SOLO después de la aprobación de publicación: verificar en Vercel el proyecto productivo definitivo, asignar `cotironda.com` y `www.cotironda.com` al proyecto autorizado y leer los **registros DNS exactos que indique Vercel para ese dominio**. Recién entonces cambiar DNS en Hostinger y verificar propagación, HTTPS, redirect apex/www, políticas de sesión, rutas y logs sin duplicar envíos. Nunca redirigir el dominio a Preview como producción.
4. No copiar URLs de preview como `COTIRONDA_SITE_ORIGIN` de producción, ni mezclar clientes Supabase DEV/PROD, keys o permisos de empresas.

## Auditoría D070/D068/D066/D080 — seguridad del último instante

**No había que crear otro sistema de mensajería.** El flujo de producción previsto ya contiene:
- `whapi_begin_invite_d070`: reserva cupo y marca `in_flight` antes de permitir HTTP.
- `whapi_authorize_invite_d070`: llamada hecha por D055 inmediatamente antes del HTTP. Vuelve a consultar `whapi_read_recipient_packet_d068`, que llama a `preview_invitation_packet_d066`. Ese último chequea nuevamente la categoría, zona, opt-in, producto de catálogo activo y huella de referencia curada D080.
- El worker `crearEmisorInvitacionD070` envía solo con `habilitado=true`, `pilotoAutorizado=true`, token, allowlist de teléfonos y respuesta `true` de la autorización inmediata. Cualquier rechazo o problema de Whapi después de BEGIN se marca `uncertain` y **no genera reintento automático**, evitando duplicar mensajes.

**Mejora MVP-032:** no se crean nuevos privilegios, tablas ni validaciones redundantes. Se agrega **prueba de regresión sobre PostgreSQL 17 real** en `supabase/tests/ci/124_whapi_invitation_outbox_d070.sql`, ejecutada sobre datos sintéticos: tras un `BEGIN` lógico y la reserva, modificar la descripción del producto revoca la autorización; restaurarla la recupera; desactivar el producto la revoca; registrar la BAJA de WhatsApp la revoca; deshacer cambios dentro del rollback de CI permite completar el caso existente de `uncertain`. La prueba verifica que una solicitud fuera del catálogo real **no llegue hasta el HTTP**. El fixture SQL usa una sola transacción con `set local role` y settings de solo CI; verifica el mismo flujo SQL, **no una concurrencia auténtica entre transacciones distintas**.

El intervalo de pocos milisegundos entre última autorización y red queda sujeto a condición de carrera (no se puede prometer transacción atómica entre PostgreSQL y WhatsApp). La gestión correcta es opt-in vigente verificado lo más tarde posible, consentimiento claro, allowlist estricta, monitorización y prevención de reenvíos. No declarar *garantía absoluta* de cancelación si el destinatario se da de baja durante una solicitud HTTP ya iniciada.

## Qué NO se hizo

No se cambiaron DNS, Vercel variables, Supabase DEV SQL, Auth, WhatsApp o producción. No se desplegó una nueva versión de Next; el portal Preview existente sigue protegido y la prueba de usuario real espera #175. No se extrajeron secretos o claves personales. Se preparó **una protección comprobable** para el trabajo de envío que ya existía.

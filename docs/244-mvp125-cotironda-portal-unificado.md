# MVP-125 — Cotironda.com como portal único (decisión producto y ejecución por capas)

**03/11/2026 · Issue #460 · decisión autorizada por el titular.**

## Decisión

**Una única identidad de marca y una única dirección pública:** `https://www.cotironda.com` (canónica `https://cotironda.com`, www redirige a apex con 308). WhatsApp es el canal de operación sin fricción; la web es el lugar para consultar rondas e historial. Ni Render, ni subdominios de Supabase, ni otro portal SSO deben presentarse como el destino final al comprador.

Rutas de experiencia:
- `/seguimiento#<token>`: vista de una ronda, sin cuenta, autorizada por token privado de 256 bits, anónima durante el plazo. **Ya se desarrolló en el sitio institucional** con proxy interno `/api/seguimiento`.
- `/ingresar`: acceso web simple, preferentemente enlace mágico por correo sin contraseña, con límites por cuenta e IP; no confundir autenticar email con demostrar propiedad de un WhatsApp.
- `/mi-cuenta`: empresa, permisos y estado del vínculo del WhatsApp.
- `/mis-cotizaciones`: comprador ve todas SUS solicitudes; proveedor solo SUS invitaciones, su presupuesto literal y su estado. La asociación multiempresa requiere permiso aprobado.
- `/cotizaciones/[id]`: detalle propio de esa ronda. Ofertas de otros proveedores jamás visibles para proveedores; comprador ve solo ofertas proyectadas, anónimas y verificadas mientras esté abierta.

## Investigación de fuente de verdad (03/11)

Vercel `cotironda`: proyecto estático institucional, propietario de `cotironda.com` y `www.cotironda.com` (www 308 a apex). Vercel `cotironda-portal-dev`: Next.js con SSO `deploymentType=all`, sin credenciales para PILOTO; sesión de Auth amarrada expresamente al proyecto Supabase DEV ref `qkercsoqhehbenbbncwk` y a preview. **No corresponde apuntarlo sin auditoría al PILOTO.**

Supabase PILOTO ref `ilggkalaafhtiysyzlmg`: tres participantes WhatsApp con consentimiento y **0 usuarios Auth / 0 identidades**. La ronda real creada el 03/11 y sus invitaciones no tienen cuenta web. No inferir identidad porque alguien escribió un teléfono o email. No fusionar las bases DEV y PILOTO ni trasplantar permisos.

El sitio raíz `site/` sigue con un simulador ilustrativo (datos ficticios). Preservar ese contrato mientras se integra gradualmente el portal real. El proyecto institucional no debe pasar a producción autenticada hasta habilitar Auth/RLS y auditar rutas y sesiones.

## MVP125-A — seguimiento real dentro del dominio (código preparado)

Se copiaron el HTML, CSS y JS previamente auditados de `apps/seguimiento-piloto` a `site/seguimiento/`. No hay dependencias ni credenciales. El enlace lleva un fragmento secreto que **no viaja en GET**. El navegador hace POST JSON `{token}` a `/api/seguimiento` (origen propio). `site/vercel.json` reescribe esa ruta a la Edge JSON de Supabase; el backend valida el hash del token en SQL; frontend usa `textContent`, filtra ofertas no aprobadas y finalistas durante ronda abierta. Sin cache, indexación, referers ni scripts externos. El usuario debe seguir viendo la portada de la marca.

**Importante:** Vercel devolvió 402 `api-deployments-free-per-day` el 03/11; el código no está publicado en `cotironda.com` por ese solo hecho. Nunca cambiar el GET antiguo de Supabase a redirección hasta comprobar que `cotironda.com/seguimiento` responde 200 `text/html` y el POST del proxy funciona con token privado. El browser conserva el fragmento al seguir un `Location` que no especifica uno (RFC 9110); la API POST de la Edge debe continuar sin redirección.

**Criterios de verificación de release:**
1. Tests y CI verde del commit congelado, también HTML/CSP/ausencia de secretos.
2. Deploy de *sitio institucional* con los archivos de `site/` y `site/vercel.json`, no un portal alternativo. Verificar que `cotironda.com` y `www.cotironda.com` preservan la portada.
3. `GET https://cotironda.com/seguimiento`: HTTP 200, `Content-Type: text/html`; CSS/JS 200 sin fallas, no SSO.
4. `POST /api/seguimiento`: token inválido → `not_found`, sin campos privados; un token legítimo del piloto consulta ronda. Probar con navegador sin publicar el token en logs/tickets.
5. Luego actualizar exclusivamente la respuesta GET de la Edge antigua a 302 `Location: https://cotironda.com/seguimiento` sin fragmento ni parámetros y actualizar nuevos enlaces Whapi. El POST actual debe permanecer idéntico. Nunca reemitir PDF ya aceptados.

## MVP125-B — cuentas por empresa y rol (aún NO implementado)

Implementar sobre un mismo proyecto Auth validado y el modelo real de participantes, **sin reutilizar DEV ni crear usuarios automáticos de WhatsApp**:

1. Inicio con enlace mágico o código por correo a cuenta verificada (sin contraseñas, ideal opcional). Limitar altas a invitación hasta probar seguridad y costos.
2. Vincular UNA VEZ el WhatsApp ya verificado al usuario web mediante desafío único, aleatorio, de vencimiento corto; el código se envía desde ese mismo WhatsApp al número Cotironda. Verificar en backend firma del webhook, consentimiento y propiedad de canal; serializar y consumir desafío con idempotencia. Nunca otorgar acceso por coincidencia de teléfono/email o parámetros desde la URL.
3. Relación `auth.uid() -> empresa/participant_key -> rol` controlada en PostgreSQL. RLS y funciones `security definer` con `search_path` fijado, sesión activa, altas/bajas/revocaciones y auditoría. Separar comprador y proveedor y controlar permisos cuando un usuario pertenece a varias empresas.
4. El comprador accede a sus rondas por ID y a proyecciones seguras; **no** archivos de otros proveedores ni identidades antes del cierre. El proveedor ve sus solicitudes y sus respuestas, nunca ofertas ajenas ni datos de otros compradores no autorizados.
5. Casos extremos obligatorios: usuario de otra empresa, cuenta revocada, invitación vencida, token usado dos veces, sesión caducada, múltiples empresas, adjunto privado, presupuestos parciales, cierre y retiro de consentimiento.
6. El WhatsApp sigue funcionando sin cuentas web y sin pedir una segunda confirmación comercial. Activar alta pública solo después de auditar acceso cruzado, costes y límites.

No presentar `/ingresar` o `/mis-cotizaciones` como funcionales hasta instalar realmente Auth, vinculación y RLS en PILOTO. El portal existente de Next.js sirve como código reutilizable, no como prueba de que ya hay usuarios del piloto.

## Estado de entrega

MVP125-A: archivos y test bajo PR con despliegue pendiente de disponibilidad Vercel. MVP125-B: contrato y criterios aquí documentados, **no terminado**. Producción institucional no se modificó en este trabajo hasta publicación verificada.

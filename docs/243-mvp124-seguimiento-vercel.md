# MVP-124 — página HTML real de seguimiento en Vercel (PILOTO)

**Incidente confirmado 03/11/2026.** Al ingresar en el enlace privado enviado al arquitecto en la ronda real con Ailín y Nahuel, Chrome muestra el HTML **como código fuente**, no como sitio. El GET de `cotironda-piloto-seguimiento` devuelve HTML pero Supabase reescribe `Content-Type: text/html` a `text/plain` en sus dominios compartidos: [límite documentado](https://supabase.com/docs/guides/functions/http-methods). No modificar headers ni cambiar a XHTML para esquivar esa medida.

## Arquitectura
- Frontend aislado: Vercel project **cotironda-seguimiento-piloto** (sin login/SSO, separado de cotironda.com institucional y del portal DEV SSO). Archivos versionados en `apps/seguimiento-piloto`: `index.html`, `styles.css`, `app.js`, `api/status.js`, `vercel.json`, `robots.txt`.
- El navegador obtiene un token de 256 bits **exclusivamente del fragmento** URL, no de query/cookie. GET no incluye el token. El JavaScript POSTea `{token}` mediante same-origin `/api/status`; Vercel hace POST a la misma Edge API JSON existente. No guarda credenciales ni mensajes. La Edge backend valida SHA256 del token y el estado de la ronda en RPC privada.
- La API de Vercel hace proyección explícita: `state`, `received_count`, `files_pending_review`, `deadline`, `can_open`; ofertas solo `can_open=true` y finalistas únicamente si están emitidos por backend **y la ronda está cerrada**. Nunca reenvía filas, originales, otros campos de DB o contactos no autorizados.
- La UI crea elementos con `textContent`, jamás con `innerHTML`. Sin CDNs, fuentes remotas, cookies, trackers o imágenes externas. CSP `default-src 'none'`, JS/CSS/conexión solo al propio origen, no-referrer, no-store, noindex y frame deny. Actualiza cada 45 segundos mientras la pestaña está visible y tiene botón manual.
- **Compatibilidad:** cambiar exclusivamente el GET de la función Supabase antigua a una respuesta HTTP 302 con Location `https://cotironda-seguimiento-piloto.vercel.app/seguimiento`, sin fragmento ni parámetros. Según RFC 9110 §10.2.2 el navegador **hereda el fragmento original** al redireccionar cuando Location no especifica fragmento. El POST JSON de Edge mantiene el mismo procedimiento seguro de validación; no copiar la URL con token a tickets o PR. No redirigir POST.

## Criterios y pruebas
1. CI unit tests de frontend/proxy, rechazo de token inválido y query inesperada, no filtración de campos, CSP y noindex.
2. Vercel deployment **production del proyecto aislado**, respuesta `200 text/html` en `/seguimiento`, assets CSS/JS disponibles y `/api/status` exclusivo POST; no SSO ni password.
3. Supabase Edge mismo proyecto PILOTO, GET redirige `302 Location` al nuevo dominio y mantiene la respuesta POST tal como ya funcionaba; nunca se proporciona el secreto real a pruebas externas.
4. Comprobar con navegador que el enlace histórico (sin pegar aquí su fragmento) muestra la página, el contador de presupuestos recibidos y la fecha límite, sin revelar identidades mientras esté abierta.
5. Verificar que los PDFs ya confirmados como recibidos por Ailín y Nahuel **no se vuelven a enviar**. Las cotizaciones todavía requieren prueba en formato real y revisión económica independiente.

**Seguridad:** el hash que aparece después de `#` es una contraseña de acceso a esa ronda; no incluirlo en logs, screenshots públicas, GitHub ni comentarios.

**No incluido:** ranking económico sin cotejo, envío de finalistas sin consentimientos, cierre retroactivo, activación de producción institucional. El piloto no está comercialmente GO por una mera página visible.

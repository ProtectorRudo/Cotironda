# MVP176 — Seguimiento del comprador en el mismo origen Supabase (PILOTO)

**04/11/2026 · Desarrollo · #529 P0-B2r · PR apilado sobre #550.**

## Problema reproducido
El enlace enviado por WhatsApp usa `https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento#<token>`. En la Edge v10, GET devolvía HTTP 302 hacia una URL fija de Vercel. En la Preview disponible (commit `5fbf2ec7`), HTTP GET `/seguimiento` devolvía HTTP 200 pero **HTML antiguo**; `/seguimiento/index.html`, `/seguimiento/app.js` y `/api/seguimiento` dieron HTTP 404. El enlace seguía siendo unusable pese a tener Edge/SQL correctas. La cuota Vercel Hobby (402) impide usar una publicación nueva como solución inmediata.

## Corrección MVP176
- GET de la Edge **existente** devuelve HTML y assets estáticos (CSS y JS inline) de `site/seguimiento`. No redirige ni necesita Vercel. Token solo en fragmento; nunca GET/query, HTML o logs.
- POST sigue en la misma Edge y mantiene MVP091 + revalidación MVP175 con hash/token, rol, consentimiento, expiración/revocación, ACL service_role y respuesta anónima reducida; se respeta el flag existente de finalistas (sin activarlo).
- El frontend elige `location.pathname` si comienza con `/functions/v1/` y conserva `/api/seguimiento` cuando funciona en Vercel. Solo envía token por POST a su **propio origen**.
- `clearPrivateView` borra también recuento, fecha y actualización ante falla/revocación, además de ofertas y cobertura.
- Módulo `buyer-page-mvp176.ts` es snapshot derivado de HTML/CSS/JS del sitio; pruebas exigen igualdad byte a byte para evitar divergencia.
- Cabeceras `no-store`, `no-referrer`, `DENY`, CSP cerrada; no fuentes remotas, sin contenido de oferentes en GET.

## Aceptación y límites
1. GET al enlace de seguimiento en PILOTO: HTTP 200 HTML con cobertura y script funcional, **sin 302**.
2. POST con token inventado: estado `not_found` sin filtraciones; POST con tokens reales solo mediante canal privado permitido.
3. Dos enlaces vigentes recuperan **solo sus propias rondas**; revocación y fallas no conservan datos en pantalla.
4. `cotironda-piloto-document-recovery` v25 y Whapi sin modificaciones; sin ranking fiscal, contactos, originales o mensajes.
5. `main` y producción inalterados.

## Verificación y publicación
- Pruebas unitarias nuevas para snapshot exacto, rutas POST Edge/Vercel, preservación de los controles de autenticación y CSP, validación de sintaxis del JS y no exposición del token en URL.
- Deno/TS/Next.js CI y smoke HTTP en PILOTO, más la RPC de solo lectura del checklist.
- Antes de reemplazar Edge v10, volver a leer su version/hash y preparar rollback exacto. No declarar finalizado hasta HTTP GET y POST verdaderos, y prueba posterior de los dos enlaces con comprador.

**Reversión prevista:** redeplegar el paquete v10 de 10 archivos de PR #550 a la misma Edge de PILOTO (mismo control de JWT), sin tocar base, documentos, mensajes, producción o `main`.

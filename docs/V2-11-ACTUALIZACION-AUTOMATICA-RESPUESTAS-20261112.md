# Cotironda V2-11 — cotizaciones que aparecen sin tocar «Actualizar»

**Fecha:** 12/11/2026. **Estado:** desarrollo sin publicar.  
**Base:** PR #831 (`74eaf01e4545a1c56bb5aca25359ff40944e4d7e`), no se integró a `main`.

## Causa hallada en código real

La pantalla `apps/portal/app/piloto/v2/rondas/[rondaId]/respuestas-comprador.tsx` hacía un solo `GET` privado cuando el arquitecto ingresaba, y después refrescaba exclusivamente al pulsar el botón. Si un proveedor cotizaba durante la sesión, el navegador no reflejaba esa respuesta nueva hasta una acción manual. Es contrario a la regla Cotironda V2: **el comprador debe ir viendo cada comercio que efectivamente respondió**, sin ver invitados o pendientes.

## Corrección mínima

1. Una vez autenticado, el portal consulta `GET /api/piloto/v2/rondas/:id/respuestas` con el JWT actual en el encabezado Authorization, sin credenciales de cookies, con `cache: no-store`, cada **60 segundos** cuando la pestaña está visible. Se refresca también al recuperar la visibilidad o el foco.
2. No inicia consultas si el comprador no está autenticado, la pestaña está oculta, hay una operación del usuario o ya existe otra consulta en curso. Un corte de red tiene límite de espera de 15 segundos.
3. Nunca usa canales WhatsApp ni consulta o publica el listado de invitaciones. La ruta del servidor sigue exigiendo `getUser`, sesión Supabase y RPC privada que solo proyecta documentos de proveedores que respondieron.
4. Si cambia el usuario o sale de sesión, aumenta una generación de autorización; una respuesta HTTP de una sesión vieja **no puede repoblar** la pantalla. Se borra el catálogo en el logout. Ante error, flag retirado o recurso inaccesible, se borra el catálogo en vez de conservar datos sensibles potencialmente revocados.
5. Se conserva el botón manual. Los nuevos documentos siguen disparando la guía individual existente con un único intento por original por sesión, usando el claim SQL idempotente; el GET periódico **no** llama IA por sí mismo.
6. La vista avisa que las respuestas se actualizan automáticamente; no hay modificación del archivo original, del ranking, del sistema de invitaciones ni de precios/IVA/flete.

## Criterios de aceptación

- [x] Actualización a los 60 segundos o al volver a una pestaña visible, sin acción manual del arquitecto.
- [x] No hay consultas periódicas sin sesión, en pestaña oculta, mientras está ocupado ni si otra consulta sigue en curso.
- [x] `GET` privado con JWT exclusivamente en Authorization; no URLs públicas, listado de invitados, WebSocket abierto ni mensajes WhatsApp.
- [x] El logout borra la lista y evita que un GET atrasado la vuelva a mostrar.
- [x] Pruebas unitarias en `tests/unit/v2-11-respuestas-automaticas.test.mjs` y workflow V2-03.
- [ ] CI completa del SHA final.
- [ ] Prueba de navegador real con 0, 1 y 2 respuestas mientras la pestaña permanece abierta, incluyendo cambio de usuario, revocación y pérdida de red. Solo podrá comprobarse después de desplegar una Preview protegida autorizada.

## Límites

**No se publicaron cambios** y no se tocaron Supabase, WhatsApp v76, Vercel, secretos ni producción. No se creó el comprador Auth ni se probó un SMS. `cotironda-portal-dev` continúa sin vínculo Git verificado y faltan las variables V2. No confundir una CI aprobada con el circuito comercial completo: sigue pendiente la comprobación WhatsApp → PDF/Excel proveedor → original + análisis en navegador → cierre.

La única política de Vercel modificada anteriormente en el PR #831 habilita una **rama release específica todavía no creada**, no habilita esta rama de trabajo.

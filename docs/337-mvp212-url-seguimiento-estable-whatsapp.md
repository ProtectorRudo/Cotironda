# MVP212 — Seguimiento correcto para compradores desde WhatsApp

**Estado:** corregido en desarrollo; no desplegado en PILOTO ni producción.
Bloqueo concreto de P0-G / P2-A, checklist #529.

## Causa comprobada

- El webhook `cotironda-piloto-whapi` emitía enlaces con base
  `https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento#TOKEN`.
- El GET de esa Edge redirigía (302) a un hostname de **deployment temporal**
  `...-boqnfg2gk.vercel.app/seguimiento`. Funcionaba como puente, pero
  dependía de una versión efímera, no de un dominio estable del proyecto.
- El propietario Vercel **cotironda-seguimiento-vista-piloto** tiene alias
  **`cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app`**.
  Consulta autenticada de Vercel el 05/11/2026: el alias resuelve a
  `dpl_2mfhKSheCCHTe1CCD4kXqEuxQxDp`, READY, proyecto correcto
  y ruta `/seguimiento` declarada en `vercel.json`.
  Eso acredita propiedad y asignación Vercel; **no** equivale a prueba
  navegador autenticada desde teléfono real.
- La web lee el token desde `window.location.hash` y lo entrega por
  POST únicamente a su proxy de mismo origen. Nunca ponerlo en query
  ni agregarlo a logs o respuestas publicables.

## Cambio mínimo, sin un sistema paralelo

1. Un único helper puro `src/domain/enlace-seguimiento-piloto-mvp212.ts`
   mantiene **dominio estable, HTTPS, ruta exacta y fragmento `#`**,
   validando token de 64 caracteres hex minúsculos.
2. La Edge Whapi utiliza el helper tras recibir `issued` del RPC
   `cotironda_piloto_issue_tracking_mvp091`: el cliente recibe
   `https://[dominio estable]/seguimiento#TOKEN` directamente.
   Se conservan ledger `api_accepted/uncertain` y prohibición de
   reenvío automático al desconocerse el resultado de WhatsApp.
3. El GET **heredado** de la Edge de seguimiento usa exactamente la
   misma URL como redirección, preservando enlaces ya enviados.
   Rechaza query string, nunca accede a contactos ni documentos.
4. No cambia el proxy, token, empresas, consultas ni cotizaciones.
   El dominio es un alias de PILOTO, no `cotironda.com` en producción.

## Pruebas y cierre real pendiente

- Token correcto/incorrecto, sin query, URL arbitraria, redirección
  heredada, ruta Vercel, token solo en `#`, uso del proxy POST,
  privacidad Referer, no duplicados.
- Test Deno del webhook y de la Edge, Next.js y sitio, CI completo.
- Para comprobar **P0-G/P2-A de verdad**: publicar con orden explícita
  `Publicalo en cotironda-piloto`, validar alias activo y recursos
  HTTP 200 desde navegador, enviar un NUEVO pedido WhatsApp consentido,
  hacer click en su enlace con token real sin exponerlo en el chat,
  cerrar y corroborar ofertas/finalistas/originales según permisos.
  Prohibido publicar o activar outbox/avisos indirectamente.

# MVP146 — Seguimiento PILOTO por Vercel, sin HTML crudo en Supabase

03/11/2026 · Issue #497 · No modificar producción ni `main`.

## Diagnóstico
Supabase reescribe `GET text/html` como `text/plain` en dominios `*.supabase.co`. La captura real del arquitecto mostró HTML como texto. Fuente: https://supabase.com/docs/guides/functions/http-methods

## Corrección prevista
En proyecto Vercel aislado `cotironda-seguimiento-vista-piloto`, publicar sitio estático `/seguimiento` y API `/api/estado`. La API reenvía POST con bearer de 64 hex al Edge existente; no conoce clave service_role ni guarda datos. El token sigue en #fragment, no se emite en query/referrer. La vista usa exclusivamente `textContent`; sin HTML de proveedores ni ranking prematuro, CSP estricta, cache no-store.

El Edge `cotironda-piloto-seguimiento` conserva POST actual, y GET 302 a Vercel sin #fragment: el navegador conserva el fragmento original según semántica HTTP. Esto evita reenviar manualmente el enlace privado.

## Pruebas obligatorias
- Unitarias: POST válido, inválido, caída del upstream, política CSP, token fragment, 302 legacy.
- Deployment Vercel piloto `READY` + respuesta GET `text/html; charset=utf-8` e interfaz legible.
- Supabase piloto: GET 302 al dominio Vercel; POST sigue aislado; ronda real Ailín/Nahuel 2 ofertas verificadas, 0 pendientes; sin filtrar contactos.
- Prueba en Chrome móvil con enlace original pendiente de usuario: el test HTTP no sustituye E2E de navegador.
- Cero Whapi saliente, cero modificaciones a presupuestos, cero cambios en `cotironda.com`.

Rollback: redeploy versión previa de Edge solo GET; Vercel no modifica base ni WhatsApp.

Proyecto Vercel PILOTO Git aislado: `cotironda-seguimiento-vista-piloto` (`prj_0kZzvuzEg7vL4FzsqbdARKeoHzLk`), raíz `piloto/seguimiento-web`. Validar `READY` y HTTP antes del GET 302.

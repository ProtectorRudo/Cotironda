# MVP154 — Prueba externa HTTP del seguimiento PILOTO

03/11/2026 · Issue #497, PR #511. Sin producción ni secretos.

La prueba `scripts/piloto/seguimiento-http-smoke.mjs` se ejecuta en GitHub Actions con Node 22 y verifica mediante solicitudes HTTPS reales que:
1. El alias de **preview confirmado por Vercel** entrega `/seguimiento` con HTTP 200 y `text/html`.
2. Hay CSP restringida, no hay cache ni referrer, y el HTML contiene el estado y listado de ofertas.
3. El JavaScript mantiene el token exclusivamente en `#fragment` y comunica con `/api/estado`.
4. La API rechaza un GET y un token inválido (405/400); nunca se usa un token real.
5. La función Supabase de seguimiento del piloto devuelve GET 302 a **ese mismo preview**, sin token en Location.

No se prueban por Internet presupuestos reales con bearer, ni entrega de Whapi, ni cerrado/finalistas: requieren verificación aparte. La prueba no declara la ronda completa lista, solo el enlace web y su envoltorio de seguridad. No alterar prod/main.

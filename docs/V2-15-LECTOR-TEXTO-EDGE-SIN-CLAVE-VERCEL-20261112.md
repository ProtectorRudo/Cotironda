# Cotironda V2-15 — texto WhatsApp con AES sólo en Supabase

**Fecha:** 12/11/2026 · **Estado:** desarrollo y CI, sin despliegue · **Base:** PR #835 (`64fb6d354a2eed79f1bd6eae6dcaef97edc8162a`).

## Riesgo resuelto en desarrollo

V2-14 había implementado lectura fiel de presupuestos por texto, pero exigía configurar `COTIRONDA_PILOT_AES_HEX` también en Vercel. Esa es la misma clave maestra de AES-256-GCM que cifra mensajes entrantes en el webhook Supabase Whapi v76. Replicarla en otro servicio ampliaría la superficie de impacto de una filtración.

**Decisión:** **la clave AES histórica permanece únicamente en Supabase PILOTO**. En Vercel sólo se podrá configurar un secreto **nuevo y segregado**, `COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET`, de uso exclusivo del lector de texto. Ese secreto no permite descifrar por sí mismo ni sustituye el JWT del comprador.

## Arquitectura

`Navegador comprador → API Next privada (JWT) → RPC catálogo/fuente (permisos) → Edge lector textual (JWT firmado + secreto interno) → RPC fuente (misma sesión Auth, ronda, consentimiento) → AES-GCM/SHA en Supabase → texto exacto vía HTTPS a Next → revalidación Auth+fuente y auditoría SQL → navegador`.

Se incorporan:
- `supabase/functions/cotironda-piloto-v2-text-reader/index.ts`: función Edge nueva, **no modifica Whapi v76**. Configuración `verify_jwt=true` para el JWT Auth del comprador, `getUser(jwt)` y secreto interno independiente; `service_role` exclusivamente dentro de Edge para la RPC restringida.
- `text-core.ts`: handler puro con control de JSON acotado (512 B), no URLs elegidas por comprador, origen autorizado por RPC, sesión original y teléfono verificado, doble consulta de permisos y Auth, AES-256-GCM con AAD exacto `chatHmac|messageHmac|text` y SHA original, 5–4000 bytes UTF-8 sin normalizar y respuesta `application/octet-stream` con `no-store`. Nunca logs de claves, ciphertext, datos personales ni precios.
- `src/server/v2-15-texto-edge-client.ts`: sólo puede llamar al endpoint de Supabase PILOTO fijado, con JWT comprador y secreto segregado. Verifica el SHA anunciado y los bytes, limita respuesta a 4000 B y falla cerrado.
- Adaptadores Next `piloto-v2-descarga-http.ts` y `piloto-v2-analisis-http.ts`: abandonan el descifrado local y **no consultan `COTIRONDA_PILOT_AES_HEX`**. Conservan el source SQL, la revalidación doble, auditoría SQL de descarga y claim idempotente del análisis.

## Configuración futura y requisitos de activación

- **Supabase cotironda-piloto**, funciones Edge y entorno de secretos: mantener `COTIRONDA_PILOT_AES_HEX` ya usada por webhook, sin revelar su valor. Crear `COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET` aleatorio nuevo de 48–96 caracteres, distinto de token de WhatsApp, claves SB y PDF. `COTIRONDA_PILOT_V2_TEXT_ENABLED=true` **sólo después** de probar la Preview.
- **Vercel sólo proyecto `cotironda-portal-dev` Preview**: configurar `COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET` con exactamente el valor de Edge, `COTIRONDA_PILOT_V2_TEXT_ENABLED=true` cuando el endpoint se haya auditado y publicado, además de envs V2 de Auth y datos. **NO instalar `COTIRONDA_PILOT_AES_HEX` en Vercel**. Prohibido `NEXT_PUBLIC_*` para credenciales.
- Activar el lector sólo con `Publicalo` **para PILOTO Preview**: instalar nueva Edge con `verify_jwt=true`, confirmar autenticación y comportamiento en el gateway, comprobar gates, costos, SSO, permisos y revocación real. El SQL V2 pendiente en PILOTO debe publicarse con su SHA exacto, no desde `main` (carece de `apps/portal`).
- Limitar políticas originales a consentimientos V2 prospectivos; no tratar el texto histórico `semantic_unique_mvp291` como publicable retroactivamente.
- No desplegar, generar secretos, hacer merge, modificar Auth, activar política de originales, enviar WhatsApp, ni afectar producción bajo orden `Avanza`.

## Riesgos y límites pendientes

- La Edge entrega texto al servidor Next por HTTPS. Next lo conserva **en memoria exclusivamente durante la solicitud**, con no-store; el navegador recibe el original sólo tras auditoría. El gateway rechaza llamadas sin JWT válido; el handler necesita **también** el secreto interno y la RPC valida la sesión actual. Un navegador con JWT válido pero sin el secreto interno NO puede invocar el lector.
- El secreto segregado que vive en Vercel es igualmente confidencial, aunque su alcance sea mucho menor que la clave AES. Rotarlo si se filtra; no enviarlo por chat.
- No hay límite específico por minuto en Edge: JWT/RPC y límites de tamaño acotan el acceso, pero antes del piloto masivo corresponde controlar abuso y costes. 
- Los tests offline simulan `getUser`: **no sustituyen** la validación del gateway Supabase ni una comprobación real de Auth SMS.
- Los PDF/Excel siguen usando el circuito Storage y el lector de PDF existente; esta versión no valida un cierre general ni equivale a piloto 100 %.
- `src/server/v2-14-texto-whatsapp-cifrado.ts` se conserva sólo para pruebas offline/regresión; **no** está importado por los adaptadores Next.

## Criterios de aceptación

- [x] No entregar `COTIRONDA_PILOT_AES_HEX` a Next/Vercel.
- [x] No usar endpoint de texto abierto, sin JWT o con secreto corto.
- [x] Supabase Edge revalida fuente SQL y Auth antes y después del descifrado.
- [x] No enviar ciphertext, teléfonos, HMAC ni AES desde Vercel al broker; sólo IDs opacos, JWT y credencial de servicio.
- [x] Tests creados para salida byte a byte, SHA, AAD, token/clave erróneos, sesión ajena/vencida, revocación entre llamadas, límite de bytes y falta de CORS.
- [ ] GitHub Actions **SHA final** sin fallos.
- [ ] Confirmar `verify_jwt=true` frente a un JWT Supabase PILOTO real en Preview protegida y la denegación de llamadas directas.
- [ ] Probar presupuesto real de texto con Auth comprador y consentimiento prospectivo; descarga y análisis, PDF/Excel y cierre de ronda de punta a punta.

**Aprobación:** código y CI no autorizan despliegue. No declarar el circuito real funcionando hasta la prueba E2E.

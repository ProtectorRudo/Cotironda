# Cotironda V2-19 — primer SMS sin habilitar presupuestos

**Fecha:** 13/11/2026. **Estado:** solo código y pruebas, no publicado. PR #836 en rama `fix/v2-15-texto-edge-sin-clave-vercel-20261112`.

## Bloqueo verificado

El arquitecto existente del piloto ya está habilitado como identidad WhatsApp, pero no tiene un usuario en `auth.users`: inventario SOLO LECTURA de Supabase `ilggkalaafhtiysyzlmg`:

| Dato agregado, sin PII | Observado |
| --- | ---: |
| Compradores activos con consentimiento | 1 |
| Compradores con canal WhatsApp único/probado | 1 |
| Canales duplicados de comprador | 0 |
| Usuarios Supabase Auth | 0 |
| RPC de comprobación `cotironda_piloto_v2_bootstrap_buyer_check_private` | Instalada |
| Rondas históricas | 7 |

**Bloqueo de software:** `apps/portal/app/piloto/v2/rondas/[rondaId]/page.tsx` exigía `respuestasV2Habilitadas(process.env)`, la cual necesita service-role, flags comerciales `RESPONDERS_ENABLED=true`, SHA y datos privados. Como **aún no tenemos el secreto del servidor ni autorización prospectiva de proveedores**, el formulario daba `404` antes de siquiera pedir SMS. Activar todo lo comercial solo para probar el teléfono sería incorrecto.

## Solución de menor fricción

Separa explícitamente **verificar al comprador** de **leer ofertas**:

1. `src/server/v2-03-respuestas-http.ts`: función independiente `ingresoCompradorV2Habilitado`. Para mostrar formulario requiere **solo**:
   - `COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED=true` (nuevo switch, `false` por defecto si falta);
   - `COTIRONDA_AUTH_PREVIEW_ENABLED=true`, `VERCEL_ENV=preview`;
   - `COTIRONDA_REGISTRATION_ENABLED=false` (nunca abre altas públicas);
   - URL exacta del PILOTO y clave **publicable** `sb_publishable_*` para el navegador;
   - `COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA` igual al `VERCEL_GIT_COMMIT_SHA` de la Preview real.
   - El proyecto Vercel `cotironda-portal-dev` debe conservar SSO activado para todos los despliegues; este control es externo al código.
2. La página V2 exige ese switch propio. Genera el formulario para OTP aunque `RESPONDERS_ENABLED=false` y falte `COTIRONDA_PILOT_SUPABASE_SECRET_KEY`. **No necesita ese secreto para autenticar al comprador**.
3. La interfaz V2 recibe `puedeConsultarRespuestas` calculado **en el servidor** mediante el gate comercial original. Con `false`: no hace GET de catálogo, no consulta cada minuto, no lanza IA, no descarga documentos y no muestra ningún proveedor, invitado ni información de ronda. Después del OTP real informa: `Teléfono verificado. La consulta de presupuestos todavía está deshabilitada en este entorno de prueba.` (sin afirmar que tiene acceso autorizado a una ronda).
4. APIs de cotizaciones, análisis y originales **no cambian**: conservan autorización Auth + sesión viva + buyer_key + proveedor V2 consentido + SHA + servicio secreto, y devuelven `503` mientras están apagadas. La página jamás habilita el servidor por si misma.
5. Tests `tests/unit/v2-19-sms-sin-ofertas.test.mjs` verifican 404 si el switch o SSO Preview/release SHA fallan, Auth posible sin service-role, APIs sin tocar, ningún polling/descarga/IA y rechazo con registro público abierto. El workflow `cotironda-v2-03-respondedores-pg17.yml` corre los casos y Build Next.js verifica tipado/UI.

## Próximo Publicalo (solo previa verificación)

- Configurar en `cotironda-portal-dev` **Preview** las claves públicas que Supabase PILOTO ya tiene (sin copiarlas al chat):
  `NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY` y, opcional para luego, `COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY`; la URL piloto pública ya está instalada en Preview.
- Mantener `COTIRONDA_PILOT_V2_RESPONDERS_ENABLED=false`, `COTIRONDA_PILOT_V2_ANALYSIS_ENABLED=false`, `COTIRONDA_PILOT_V2_PDF_ENABLED=false`, `COTIRONDA_PILOT_V2_TEXT_ENABLED=false`; **no se necesita todavía service-role para SOLO SMS**.
- Publicar la nueva rama/commit a Preview protegida, actualizar `COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA` a la SHA exacta y activar `COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED=true` **solo en Preview**, una vez auditados SSO y SMS.
- Comprobar proveedor SMS real desde `src/server/v2-18-auth-publica-preflight.ts`; si responde `BLOCKED`, no crear usuario ni enviar SMS. No basta con la clave publicable.
- Dar de alta primer comprador únicamente por el comando V2-07 autorizado y su número WhatsApp con hash verificado; nunca confirmar por admin ni hacer signup público. Desde la URL de la ronda, el propio comprador comprueba OTP real, después su sesión válida.
- La validación del teléfono **NO** revela presupuestos ni sustituye permisos de una ronda. La apertura comercial posterior necesita secret server, consentimiento V2 prospectivo y prueba E2E.
 
**Nada de lo anterior se ejecutó en Supabase, Vercel o WhatsApp con esta orden `Avanza`**. GitHub seguirá siendo fuente de verdad; esta versión exige nueva publicación explícita.

## Refuerzo de seguridad del comprador — 13/11/2026, SOLO CÓDIGO

Se comprobó en el componente `respuestas-comprador.tsx` que una descarga comenzada con una sesión válida podía completar la conversión a `Blob` y el `anchor.click()` aun si la identidad Auth cambiaba durante la lectura asíncrona. El backend ya protege las descargas mediante JWT, sesión y permisos; el ajuste evita **entrega local tardía** por la interfaz tras logout/cambio de comprador.

- Cada intento de descarga captura `authGeneration.current` y verifica que siga igual **después de obtener el token, después de recibir el response y después de leer el arrayBuffer**. Si cambió, no genera URL local ni descarga. Los errores de una sesión vieja no sustituyen el estado de la nueva.
- La descarga usa `AbortSignal.timeout(20_000)`; un cambio de cuenta limpia el estado `busy`. La finalización de un refresh/descarga de identidad antigua no borra `busy` de la nueva.
- La validación del teléfono para envío de SMS y alta inicial ahora acepta como máximo **15 dígitos E.164**, excluido `+` (`/\^\\\+[1-9]\\d\{7,14\}\$/u` como representación textual del patrón); se rechazan números de 16 dígitos antes de llamar a Supabase.
- Nuevas pruebas en `v2-19-sms-sin-ofertas.test.mjs` y `v2-07-primer-comprador-auth.test.mjs`. Comprueban guardias de identidad y límite de longitud sin enviar SMS ni abrir ofertas.

**Estado:** código y pruebas en la rama draft #836; falta CI del HEAD y `Publicalo` para Preview. Sin mutaciones en Supabase, ningún OTP enviado, sin actualización del webhook ni producción. **No resuelve la configuración GoTrue bloqueada** (signup público abierto / Phone no acreditado): debe corregirse externamente y validarse de nuevo antes del primer acceso real.

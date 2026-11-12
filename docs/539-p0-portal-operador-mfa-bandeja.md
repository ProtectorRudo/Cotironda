# Acta 539 — P0: portal privado para revisar aceptación por WhatsApp con Supabase Auth MFA

**Fecha:** 12/11/2026. **Orden:** «Avanza y registra en nuestro checklist y plan maestro». **Sólo desarrollo.** No se publicó ni creó/activó un operador ni se enviaron WhatsApps. No hubo cambios en Supabase PILOTO ni rondas nuevas.

## Qué faltaba realmente

La revisión M538 ya podía verificar criptográficamente la respuesta entrante y guardar el evento si un operador con Supabase Auth AAL2 la aprobaba. Pero carecía de un camino de interfaz y HTTPS que permitiera a esa persona autenticarse, consultar respuestas pendientes y decidir. Hasta tenerlo, era incorrecto decir que P0 estaba listo para una prueba real.

Se revisaron los handlers del operador existentes `operador-piloto-http-mvp267.ts`, `apps/portal/lib/piloto-operador-cliente.ts`, rutas `/api/piloto/operador`, el paquete de Next.js 16/Supabase 2.118.0, la ruta de Auth del proyecto PILOTO y los contratos SQL M267/M362. Se reutiliza la seguridad existente **sin crear un rol, panel genérico ni base nueva**.

## Implementación (PR de desarrollo, apilado sobre #811)

1. **Límite HTTPS:** `src/server/whapi-terms-mfa-http-p0.ts`, tres acciones POST **`bandeja`**, **`preparar`** y **`decidir`**, bajo `/api/piloto/operador/terminos/...`. Exige:
   - `operadorPilotoHabilitado` del MVP267, `COTIRONDA_P0_TERMS_REVIEW_UI_ENABLED=true`, claves AES de 32 bytes, Vercel **Preview**, proyecto PILOTO y **SHA de release autorizado igual al deploy actual**; otros entornos quedan OFF.
   - JWT Bearer obtenido del Supabase Auth PILOTO, comprobado contra `auth.getUser(jwt)` antes de interpretar claims; AAL2 en JWT y revalidación por SQL M267 de la **sesión Auth vigente** y rol `incident_manager`.
   - Mismo origen HTTPS en URL y cabecera Origin, cuerpo JSON pequeño con campos exactamente permitidos, sin cookies como autorización, ni query tokens.
   - Respuestas `private, no-store`, no-frame, no-referrer, sin errores SQL ni criptográficos y sin acceso a claves desde cliente.
2. **Bandeja privada mínima:** RPC `public.cotironda_piloto_terms_review_queue_auth_p0()` dentro de la migración aún **NO INSTALADA**. Comprueba operador AAL2 y devuelve hasta 12 mensajes pendientes cuyo proveedor, chat, aviso previo, versión y política superaron la validación M538; sólo HMAC opaco, clave de proveedor y fecha. **No muestra teléfono, texto ni ciphertext en lista.**
3. **Adaptador sin service_role:** se extiende la whitelist cerrada de `apps/portal/lib/piloto-operador-cliente.ts` con exactamente las tres RPC nuevas. Reutiliza la clave **publicable** y `getUser(jwt)` del PILOTO, no credenciales de administrador. `apps/portal/lib/piloto-operador-terminos-http.ts` enlaza las rutas.
4. **Panel del operador:** `/piloto/operador/terminos`, página SSR oculta fuera de release autorizado. El navegador recibe únicamente la **clave publicable** de Supabase; inicia sesión con credenciales de operador existente, exige factor TOTP previamente verificado y un código, mantiene la sesión en memoria (`persistSession:false`), nunca ofrece registro ni aprobación automática. Lista respuestas pendientes, muestra **texto original descifrado** y condiciones completas, exige confirmación humana y dispone de dos acciones distintas: **`explicit_accept`** o **`not_explicit`**. Ante ambigüedad se elige no explícito. La decisión relee el inbox y SQL guarda una única evidencia; el rechazo no habilita originales.
5. **CI y configuración:** `tests/unit/p0-whapi-terms-mfa-http.test.mjs` cubre acceso desactivado, producción, SHA, autenticación ausente o AAL1, origen distinto, mensajes/bodies forjados, bandeja contaminada, respuesta exacta y doble operación. El fixture SQL PG17 cubre ACL de bandeja, operador ausente, dos respuestas válidas y su desaparición al ser revisadas; finaliza en `ROLLBACK`. `apps/portal/.env.example` documenta las dos variables nuevas sin incluir secretos. CI final debe verificarse por commit.

## Advertencias importantes (no suponer éxito operativo)

- **Ninguna cuenta de operador real ha superado MFA**, y ningún proveedor aceptó estas condiciones en WhatsApp en un ensayo autorizado. Los JWT y SMS de CI son sintéticos; el SQL de M267 verifica el MFA real sólo después de desplegarlo y aprovisionar el operador.
- La clave privada AES del webhook reside hoy en Supabase Edge y para este diseño deberá aprovisionarse **con custodia equivalente** al servidor Preview. No copiarla en un chat, en GitHub ni en una variable `NEXT_PUBLIC_`. El canal no se activa sin ese secreto en un almacén autorizado, rotación y una revisión de permisos.
- Las **condiciones comerciales y legales** para publicar originales identificables de proveedores no adjudicados continúan en borrador. No se habilita la política de descargas ni se infiere consentimiento por participación previa.
- El panel permite que un operador marque una aceptación, pero **no puede verificar la comprensión semántica humana**. Debe leer textualmente la respuesta; ante duda marcar `not_explicit`. Un actor con sesión legítima y acceso a la interfaz sigue requiriendo controles internos de confianza.
- Este PR no conecta el ejecutor de avisos a cron ni instala SQL o crea usuarios; **ningún mensaje real ni E2E**.
- Comprador Auth Phone/OTP, dos originales de una ronda, seguimiento, cierre/descarga HTTPS y reglas de contactos aún sin prueba completa. **P0–P5 ABIERTOS.**

## Criterios de aceptación

- [x] Handler HTTP separado de las rutas económicas, con API cerrada a operador Auth AAL2 y acceso OFF.
- [x] Página SSR sólo de Preview SHA-pinned y panel React sin almacenamiento persistente de tokens.
- [x] Bandeja sólo de metadatos sin mensajes/PII; contenido en claro sólo para vista de operador tras MFA.
- [x] Controles Node/PG17 añadidos; **CI por SHA final aún por verificar**.
- [ ] Aprobación comercial de términos y revisión independiente de seguridad del flujo de originales.
- [ ] Provisionar y probar Auth MFA real, auditoría y custodia AES entre Supabase y Vercel Preview, sin exponer claves.
- [ ] `Publicalo en cotironda-piloto` explícito antes de migrar SQL, activar flags o enviar.
- [ ] Prueba E2E real: comprador + 2 proveedores + 2 originales de una misma ronda + seguimiento + cierre/descarga.

**Siguiente acción única:** verificar CI final y resolver los bloqueos de aprobación comercial + operador real MFA. Después realizar un ensayo controlado de una sola aceptación, sin inventar contactos, y continuar **inmediatamente** con la prueba comercial de dos presupuestos. No introducir otra etapa del parser económico.

Fuentes: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [Acta 538](538-p0-revision-mfa-respuesta-expresa.md).

# Cotironda V2-07 — Primera cuenta Auth del arquitecto sin registro público

**Fecha:** 12/11/2026 · **Estado:** candidato de desarrollo, NO instalado, ninguna cuenta creada, ningún SMS enviado. La ejecución real exige la orden explícita **«Publicalo»** y el alcance PILOTO. Contrato: D015 (infraestructura apagada antes del primer login).

## Problema comprobado

Supabase PILOTO `auth.users=0` (lectura real), mientras la interfaz V2 hace `signInWithOtp({phone,options:{shouldCreateUser:false}})`. Sin un comprador registrado de antemano no puede iniciar sesión ni ver sus originales. Activar el registro público sería riesgoso y **no** solucionaría la autorización por empresa; tampoco se debe confiar en un nombre o un enlace para revelar archivos privados.

## Procedimiento preparado

- `supabase/piloto/v2_07_buyer_auth_bootstrap_check_private.sql`: RPC privada de PostgreSQL que devuelve **solo true/false**, disponible exclusivamente al servidor `service_role`. Corrobora que el participante tiene rol comprador, consentimiento de participación, no revocó el acceso, dispone de un canal WhatsApp vinculado con una prueba `whapi_inbox` de origen real y que la huella del contacto no corresponde a otro comprador activo. La huella SHA se deriva del teléfono E.164 sin `+`, concatenado con `@s.whatsapp.net`, igual que la comprobación V2-03. No muestra ni guarda teléfonos de nuevo.
- `src/server/v2-07-primer-comprador-auth.ts`: servicio de preparación **solo para el primer comprador del PILOTO**. Verifica proyecto Supabase exacto, `preview`, inscripción pública desactivada, SHA del código coincidente, `auth.users=0`, vínculo Whapi único y permisos. Modo predeterminado `dry-run`: **ninguna escritura ni envío de SMS**.
- `apps/portal/scripts/v2-buyer-bootstrap.mjs`: CLI exclusivo del operador, con `@supabase/supabase-js` server-only, modo `--execute` bloqueado salvo autorización adicional `PUBLICALO_SOLO_COTIRONDA_PILOTO_AUTH_V2` y commit exacto. En una ejecución autorizada, crea `auth.admin.createUser({phone,phone_confirm:false})` una sola vez. **Nunca** marca la propiedad del número como confirmada; la prueba de posesión ocurre con el OTP real que ya solicita el portal. No crea contraseñas ni abre registro público.
- Ni el CLI ni el servicio registran número telefónico, ID de comprador, token, clave secreta o huella WhatsApp en stdout. Los errores se reducen a códigos de estado no sensibles; no escribe archivos de log.
- Ante cuenta Auth preexistente, coincidencia dudosa del canal, duplicación o fuentes no disponibles, retorna `BLOCKED`. El procedimiento inicial **no** registra segundos compradores: después del primer usuario se debe diseñar otro flujo autorizado e idempotente.

## Seguridad y límites

Se consultó [Supabase `auth.admin.createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser): requiere ejecutarse en servidor con clave secreta, y `phone_confirm:false` deja la confirmación pendiente. El portal conserva `shouldCreateUser:false` y `verifyOtp({type:'sms'})`. Esto no prueba que el **proveedor SMS** esté configurado en el PILOTO: hay que verificarlo antes de pedir el primer código y completar un smoke test real. Si Supabase rechaza el acceso a usuarios sin teléfono confirmado, estudiar ese caso en un entorno controlado sin inventar verificación del número ni hacer bypass de Auth.

La ruta HTTP de cotizaciones y descarga continúa verificando `getUser(jwt)`, JWT con `session_id` y RPC privada de datos de empresa, independientemente de `app_metadata` o `user_metadata`. El alta **no da acceso automáticamente** a una ronda distinta ni a archivos de proveedores que no tengan consentimiento prospectivo. La autorización se aplica en cada lectura del original.

No convertir `COTIRONDA_AUTH_BOOTSTRAP_APPROVAL` en una variable permanente ni cargarla en entornos públicos. Es una barrera operativa complementaria, **no reemplaza la aprobación humana** para publicar. Variables del operador deben configurarse en el propio entorno seguro, nunca en archivos `.env` versionados ni en el chat:

- `COTIRONDA_PILOT_SUPABASE_URL` (proyecto PILOTO exacto)
- `COTIRONDA_PILOT_SUPABASE_SECRET_KEY` (solo servidor)
- `COTIRONDA_AUTH_BOOTSTRAP_TARGET=preview`
- `COTIRONDA_REGISTRATION_ENABLED=false`
- `COTIRONDA_AUTH_BOOTSTRAP_BUYER_KEY` (comprador comprobado)
- `COTIRONDA_AUTH_BOOTSTRAP_PHONE_E164` (teléfono autorizado, sin imprimir)
- `COTIRONDA_AUTH_BOOTSTRAP_RELEASE_SHA` (SHA real del commit desplegable)
- Exclusivamente para ejecución autorizada: `COTIRONDA_AUTH_BOOTSTRAP_APPROVAL`.

**Simulación, solo cuando la RPC esté instalada en un entorno autorizado:**

```bash
cd apps/portal
node --experimental-strip-types scripts/v2-buyer-bootstrap.mjs --dry-run
```

**Ejecución real:** `--execute` solo cuando un lanzamiento PILOTO haya sido expresamente autorizado con `Publicalo`, tras backup/preflight y comprobación de los datos de comprador sin publicar sus identificadores. No incluir claves ni teléfonos en los comandos o argumentos; pasarlos por el gestor seguro de configuración del operador.

## Criterios de aceptación

- [ ] Node: dry-run no llama a `createUser`; nunca crea si falta autorización, SHA, identidad exacta o entorno preview.
- [ ] PG17 sintético con ROLLBACK: comprador validado, proveedor rechazado, número distinto, revocación, consentimiento, contacto compartido con otro comprador y ACL de `anon/authenticated`.
- [ ] Build Next.js del portal y regresiones Whapi v76.
- [ ] Lanzamiento autorizado, instalar RPC privada, comprobar SMS configurado y prueba real `signInWithOtp`/`verifyOtp` con comprador PILOTO.
- [ ] Primer original auténtico descargado con JWT de esa sesión. Exigir consentimiento prospectivo proveedor V2 y vinculación fuerte del presupuesto; los documentos históricos asociados ambiguamente no cuentan.

**Prioridad siguiente:** finalizar CI, preparar instalación apagada de RPC/Auth/portal y verificar un comprador real antes de perseguir más parsers. No considerar `READY_DRY_RUN` un alta efectuada.

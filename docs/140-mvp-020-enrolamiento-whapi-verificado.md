# 140 — MVP-020: enrolamiento controlado de destinatarios, sin envíos

31/10/2026 · Issue #253 · rama `feat/mvp-020-enrolamiento-whapi-verificado` basada en MVP-019 / PR #252. **Laboratorio exclusivamente**: no se han enrolado contactos reales, instalado SQL en Supabase DEV/producción, creado rutas públicas ni realizado envíos.

## Qué faltaba y qué reutilizamos

D028 guarda canal + HMAC irreversible. MVP-019 / D068 ya creó vault cifrado y función privada `whapi_store_recipient_d068`, pero no tenía un enlace desde el broker D029 ni un adaptador de registro desde onboarding. MVP-020 no crea otro Whapi, otra tabla de teléfonos ni otro sistema de consentimiento. D055 es el transporte preparado de **respuestas**, y NO se conecta a invitaciones aquí.

## Contratos incorporados

- `src/server/whapi-recipient-enrollment-d069.ts`: adaptador server-only `crearEnroladorDestinatarioD069`. Exige flag de desarrollo explícito, canal fijado, clave separada AES del destinatario, HMAC de identidad y autorizador inyectado por una fuente de onboarding **autenticada y confiable**. Primero cifra D068, solicita aprobación sobre `(canal, proveedor, chatHMAC)` sin revelar número, y solamente entonces llama SQL D068 con parámetros fijos y bytes cifrados en hex. La función SQL **vuelve a verificar** contacto existente, `verified_at`, consentimiento, proveedor exacto y ausencia de BAJA. No crea contacto ni da de alta consentimiento. Devuelve solo `registrado` o `ya_registrado`.
- **Puede usarse antes de una ronda activa** desde un proceso de onboarding autorizado que ya tenga la identidad comprobada. La función D030 para **cotizaciones entrantes** requiere ronda abierta y NO sirve para dar de alta contactos iniciales: confundirlas generaría un bloqueo circular (para invitar hace falta destinatario; para recibir respuesta hay que haber invitado).
- `src/server/whapi-crypto-broker.ts`: puerto **opcional** `enroladorContacto`, apagado por ausencia. En un futuro webhook autenticado D027, **después** de guardar D028 y reconsultar el vínculo actual de proveedor/ronda/consentimiento, entrega el remitente comprobado al adaptador D069. La falla genera no-ACK del webhook; los replays D028 son idempotentes y permiten recuperar el enrolamiento, sin duplicar la entrada. BAJA no pasa por esta ruta.
- No se solicita teléfono, firma ni «Confirmo» en la cotización. El onboarding de un comercio aún deberá tener su propia verificación legítima de que el canal pertenece a esa empresa y registrar consentimiento real, fuera de mensajes de precios.

## Seguridad, responsabilidades y límites

- **El cuerpo de Whapi y la IA no pueden elegir el proveedor ni acreditar opt-in**. La validación de `autorizarContacto` debe provenir de identidad administrada por servidor; **retornar `true` por defecto en producción está prohibido**. D068 autentica la coincidencia HMAC y la existencia de aprobación SQL previa, no demuestra por sí solo que esa aprobación se obtuvo legalmente.
- Un chat aún no registrado en `whapi_contacts_v1` es rechazado. No otorgar INSERT directo a navegador, `anon`, `authenticated` o `service_role`; el aprovisionamiento real y la verificación/consentimiento inicial necesitan un diseño auditado propio.
- El broker es un módulo **no expuesto**; la integración en D029 no activa webhook público ni automatiza mensajes. Sin `enroladorContacto` conserva el flujo anterior.
- Un mismo `(canal, chatHMAC)` permanece asociado a un único proveedor y clave. La tabla cifrada D068 es inmutable, **no** rotar automáticamente: inventario/retención/re-cifrado requieren otra etapa.
- Existe una carrera entre verificación inicial y BAJA: D068 SQL comprueba consentimiento al almacenar; un opt-out posterior bloquea lectura D068/D066 y debe bloquear inmediatamente el sender futuro en su propia reserva y chequeo pre-HTTP. El vault no equivale a permiso de envío.
- Fallas SQL, autorización, adulteración o configuración incompleta son **fail closed**, sin logs de teléfono, sin cuerpo de mensaje, sin exponer errores del DB al webhook.
- Límite esencial: **todavía no existe una interfaz real de onboarding que establezca `whapi_contacts_v1` con prueba de identidad y opt-in**, ni credenciales/worker reales. Esta entrega agrega el enlace, no inventa la evidencia de consentimiento. No afirma piloto operativo.

## Pruebas

- `tests/unit/mvp020-whapi-enrollment-d069.test.mjs`: HMAC vs teléfono, parametros SQL cifrados, reintento idempotente, claves separadas, canal y empresa adulterados, autorización denegada, SQL caído, payload inesperado, integración con webhook sintético autenticado → D029 → D028 → D069, y rechazo de suplantación/BAJA/error de persistencia.
- `supabase/tests/ci/123_whapi_encrypted_recipient_d068.sql` (invocada por fixture D065 dentro de `BEGIN/ROLLBACK`) extiende casos de BAJA posterior y HMAC inexistente en PostgreSQL17. La ruta D028/D068 sigue en CI efímero con roles privados, RLS y sin teléfonos en texto claro.
- Ninguna prueba sintética equivale a consentimiento real, webhook de Whapi live o respaldo auténtico de DEV.

## Siguiente corte de entrega

1. **MVP-021**: outbox comercial única por ronda/proveedor/canal, preautorización/cupos y BAJA revalidados, estado incierto sin reenvío automático; consumir D055 con allowlist autorizada, **no** insertar invitaciones en la outbox D047 de respuestas.
2. Antes de instalar SQL en Supabase DEV, completar copia cifrada **auténtica** y restauración aislada #175; conciliación histórica de migraciones y permisos. Ningún token, número, correo o secreto compartido por chat/repositorio.
3. Probar consentimientos reales con un comercio voluntario únicamente después de configurar un proceso de enrolamiento auténtico, no con un número aleatorio ni mediante inferencia de la IA.

**UX-001:** cero confirmaciones redundantes al comprador o al comercio. La complejidad se resuelve en el servidor.

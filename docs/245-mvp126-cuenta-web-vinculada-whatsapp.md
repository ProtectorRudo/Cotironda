# MVP-126 — cuenta web vinculada una sola vez con WhatsApp verificado

**03/11/2026 · Issue #462 · rama de desarrollo del Piloto.**

## Objetivo
Un único sitio oficial **cotironda.com**. El comprador puede consultar todas sus rondas y el proveedor solo las solicitudes que recibió y la cantidad de versiones de su propio presupuesto. **WhatsApp sigue siendo el canal principal.** No se exige registrarse para seguir participando ni se solicita confirmación adicional en cada operación.

## Modelo de identidad
No se puede identificar un usuario web por un número o email escrito libremente. El piloto real tiene **3 contactos con consentimiento WhatsApp y 0 cuentas Auth**. En PostgreSQL se añaden dos tablas privadas: `web_link_challenges_mvp126` (desafíos) y `web_account_links_mvp126` (vínculos vigentes y revocados). Ambas con RLS, sin acceso directo a `anon` ni `authenticated`. Los participantes existentes no se modifican.

El flujo **opcional y de una sola vez**:
1. El participante inicia sesión en el MISMO proyecto Supabase que guarda sus rondas, con un usuario confirmado, activo y no anónimo. El servidor comprueba que `auth.sessions` sigue conteniendo esa sesión: no basta un JWT que sobreviva al logout.
2. La cuenta solicita un código con el rol **comprador** o **proveedor**. PostgreSQL genera un secreto aleatorio de 96 bits que se muestra SOLO a esa sesión; guarda únicamente SHA256. Vence en 10 minutos, limita emisiones (2 minutos entre pedidos y 8 al día) y jamás incluye teléfono, email, chat ni contenido comercial.
3. El usuario escribe o envía el mensaje `VINCULAR <código>` **desde el WhatsApp que ya tiene registrado**, a Cotironda. El webhook exige autenticación y canal Whapi, almacena el mensaje original cifrado con HMAC e invoca la RPC de vínculo como `service_role`. No pasa el código por IA ni lo interpreta como cotización.
4. La base vuelve a exigir el MISMO chat/participante y consentimiento vigente; el mensaje debe existir en inbox y haberse recibido después de emitir el desafío. El código se consume una sola vez y el vínculo es único por participante y cuenta activa.
5. El navegador puede consultar `cotironda_piloto_my_rounds_mvp126()`: solamente metadatos de las rondas del comprador o invitaciones del proveedor, número de artículos, plazo y conteos. Jamás textos originales de terceros, precios no publicados, teléfonos, tokens ni HMAC.

La revocación posterior desactiva el vínculo y el permiso; un contacto que escribe BAJA pierde acceso por la comprobación de consentimiento vivo aunque el vínculo siga guardado para auditoría.

## Riesgos y límites
- **No están creados aún los usuarios reales.** El piloto WhatsApp funciona sin cuentas y sin nuevas trabas.
- **Supabase Auth SMTP:** el proveedor de email integrado solo envía a direcciones preautorizadas del equipo. Para invitar clientes reales mediante magic link/OTP se deberá configurar SMTP propio y revisar rate limits; no anunciar acceso abierto antes.
- La API Auth puede configurar `signInWithOtp({options:{shouldCreateUser:false}})` para impedir autorregistro. Una cuenta verificada por email **no** demuestra la titularidad del WhatsApp hasta completar el desafío.
- **Una cuenta vinculada a un participante por ahora.** Organizaciones con muchos empleados, roles owner/manager y delegaciones requieren su propia etapa RLS/auditoría. No otorgar membresías multiempresa por heurística.
- El dashboard preliminar devuelve **conteos de ofertas originales sin verificar** (no totales, rankings ni datos comerciales); el rótulo exacto expresa la diferencia. La publicación de ofertas anónimas sigue requiriendo todas las puertas de fuente aprobada.
- Antes de desplegar el webhook que reconoce `VINCULAR`, la migración SQL debe estar instalada en el MISMO proyecto Piloto. Si falta, el webhook responderá 503 en ese caso, sin inventar una vinculación. Sin vinculación no hay acceso web a las rondas.
- La separación de proyecto DEV Auth respecto de Supabase PILOTO se conserva; **no** apuntar el antiguo portal DEV a este nuevo modelo sin eliminar su acceso inseguro/incorrecto.

## Evidencia y criterios de GO técnico
- SQL de migración: `supabase/piloto/mvp126_web_link_and_role_dashboard.sql`.
- Fixture reversible: `supabase/piloto/mvp126_role_dashboard_smoke_rollback.sql`: genera usuarios y sesiones ficticios, verifica inicio sin vínculo, OTP único, rate limit, rol comprador, rol proveedor, chat erróneo, replay y sesión revocada. Todo dentro de **BEGIN/ROLLBACK**; sin emails ni WhatsApps reales.
- Tests Node: `tests/unit/mvp126-whatsapp-account-binding.test.mjs`. Comprobar además Deno typecheck del webhook y Next.js CI.
- **Bloqueo UI:** para probarlo desde cotironda.com faltan despliegue oficial (Vercel limitó la cuota el 03/11) y pantalla de autenticación real con usuario autorizado; el código SQL/Edge preparado no equivale a una cuenta ya activada.
- No habilitar envíos de finalistas ni pedir presupuestos de nuevo durante esta etapa.

## Estado comercial
La ronda del 03/11 sigue abierta hasta el 07/11 a las 07:17 AR. Ailín y Nahuel recibieron PDF. A la auditoría, **cero presupuestos ingresados**, y el sistema debe seguir esperándolos sin reenviar ni inventar importes.

# MVP191 — Verificación privada del comprador por WhatsApp + Auth de Supabase

**04/11/2026 · solo desarrollo · #525 / #529.** No despliegue ni WhatsApps reales.

## Problema real y simplificación
El **mismo comprador** tiene la identidad de contacto WhatsApp ya verificada por un mensaje entrante y su documento original almacenado de forma privada. El portal Auth existente usa **Cotironda DEV** (`qkercsoqhehbenbbncwk`), mientras el piloto WhatsApp utiliza otro Supabase (`ilggkalaafhtiysyzlmg`), con **0 cuentas Auth**. Un token compartible de seguimiento, un correo suministrado en texto o una identidad DEV NO pueden abrir originales con nombres, precios y contactos del comercio.

No queremos otro formulario de inscripción. La solución propuesta es usar **una verificación de teléfono de Supabase Auth dentro del MISMO proyecto PILOTO**, una vez cuando se requiera acceso a documentos identificables, y luego conservar sesión segura. Auth OTP vía WhatsApp es soportado por Supabase **solo con Twilio/Twilio Verify**, no directamente con Whapi; SMS u otro proveedor configurado también son opciones, pero **ninguno está activado por este PR**. Fuente: documentación oficial de Supabase Phone Sign-in actualizada a octubre de 2026.

## Prueba de identidad — SQL mínimo, sin tabla nueva
`supabase/piloto/mvp191_buyer_verified_phone_identity_prospect_only.sql` añade **solo** la función booleana `cotironda_piloto_buyer_identity_mvp191(p_request_id uuid)`. Requiere:
- JWT firmado por Supabase PILOTO, rol `authenticated`, `auth.uid()` y `session_id` actual existente en `auth.sessions`, `exp` no vencido; `auth.users` activo, sin ban, no anónimo y `phone_confirmed_at` acreditado. Nunca usa `raw_user_meta_data`, teléfono pasado como parámetro ni el token de seguimiento.
- Teléfono del usuario Auth confirmado, normalizado a E.164 sin `+` y transformado en la identidad `<número>@s.whatsapp.net`, cuya SHA-256 se comprueba **dentro de PostgreSQL** contra `participant_channels_mvp109.contact_sha256` del mensaje de WhatsApp autenticado. Ningún teléfono, HMAC ni hash sale por el RPC. No copia la clave Whapi al servidor web. Si WhatsApp usa un JID no numérico (LID), o el teléfono de Auth difiere del de WhatsApp, falla cerrado y requiere otro método explícito, no una inferencia de IA.
- Comprador dueño de la ronda y su contacto de Whapi comprobado; consentimiento general vigente, sin baja; ausencia de otros compradores activos vinculados a la misma huella.
- Política de originales MVP178 `enabled=true` (inicialmente OFF), ronda creada **después** de `activated_at`, estado cerrado y fecha de cierre vencida. **Ninguna ronda histórica recibe acceso automático.**
- Función `SECURITY DEFINER` con `search_path=''` y **EXECUTE solo a `authenticated`**: `anon` y `service_role` no la ejecutan. Se usa únicamente con la sesión Supabase PILOTO del comprador real.

## Conexión real con las descargas MVP190
El manejador existente ahora necesita obligatoriamente un puerto `verificarVinculoPiloto(rondaId)`. El puerto debe ejecutar la función anterior utilizando **el JWT real del comprador**, no un cliente de administración. El manejador la comprueba **antes de buscar el documento** y **otra vez después de leer el archivo de Storage**, para rechazar cambios de sesión o vínculo en mitad de la operación. Además del vínculo siguen exigiéndose el guard MVP161, consentimiento individual vigente del proveedor para esa ronda, archivo original con SHA-256 de bytes y correlación de empresa/proveedor.

**Esto NO crea un endpoint de descarga ni permite usar el enlace de WhatsApp como sesión.** Queda sin conexión a UI/Storage hasta disponer de OTP real con pruebas y una ronda prospectiva consentida.

## Ensayo REAL sobre cotironda-piloto, sin dejar cambios
Se inspeccionaron las columnas de `auth.users`, `auth.sessions`, `participants`, `participant_channels_mvp109`, `requests` y originales:
- 1 comprador con consentimiento vigente y canal de WhatsApp archivado.
- 3 solicitudes y 4 documentos originales.
- 0 usuarios Auth, 0 sesiones Auth y **ninguna tabla de consentimiento MVP178 instalada**.
- Se ejecutó `BEGIN; SQL MVP178; SQL MVP191; DO smoke (identidad sin Auth debe dar FALSE, política OFF, ACL autenticado solamente y cero consentimientos); ROLLBACK;`, seguido por controles de inexistencia de función/tablas nuevas, 0 Auth y 4 originales. **PASS**.

El positivo con comprador Auth real **NO se probó** porque no existe aún un usuario autenticado dentro del proyecto piloto; no se inventa un éxito. El control prospectivo en SQL garantiza NO-GO hasta ese momento.

## Pendientes para un circuito habilitable
1. Confirmar configuración de proveedor OTP de teléfono del proyecto piloto y costo, límites de intentos y consentimiento para autenticación. Preferir método transparente de una sola verificación por comprador; no atribuir soporte WhatsApp OTP a Whapi si no existe.
2. Hacer la prueba de acceso autenticado real con número de prueba verificado y un enlace controlado; ante diferencias entre JID WhatsApp y teléfono Auth, no forzar el vínculo.
3. Instalar MVP178+MVP191 **solo con «Publicalo en cotironda-piloto»**, dejar política de originales OFF hasta consentimiento voluntario de nuevas rondas.
4. Implementar el selector privado del identificador opaco de cada documento y su permiso individual desde fuente/v9, integrar Storage/HTTP, trazabilidad de descargas y lista **de todos los candidatos autorizados**. Nunca solo de dos ganadores ni después de una aprobación retroactiva.
5. Probar dos empresas, IDs ajenos, usuarios revocados, mismo número en varios compradores, cancelaciones, archivos modificados, cierre, reintentos y tasa/abuso. No dar por terminado #525 hasta E2E.

**Seguridad:** no guardar ni publicar teléfonos, HMAC, SHA de contactos, tokens de sesión, textos originales, bytes o identificadores privados en GitHub/logs de salida. `main`, Supabase y Vercel de producción permanecen intactos.

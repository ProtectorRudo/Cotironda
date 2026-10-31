# 114 — D051: puerto PostgreSQL para confirmación WhatsApp segura

**31/10/2026 · Issue #205 · PR apilado sobre D050/#204. PostgreSQL 17 CI exclusivamente.**

## Qué agrega

D050 ya valida un texto «Confirmo» extraído de un mensaje cifrado de Whapi.Cloud y lo asocia a la cita exacta de una respuesta saliente. Pero sus puertos de lectura eran simulados. D051 crea accesos reales de **consulta privada en PostgreSQL 17** y un adaptador de servidor capaz de preparar la prueba D050 y pasar sus parámetros a la confirmación transaccional D049.

### En la base privada

`supabase/sql/whapi_confirmation_read_port_d051.sql` añade:

- `whapi_confirm_load_inbox_d051(channel,message_key)`: devuelve únicamente ciphertext, nonce, tag, huella HMAC y versión de clave de D028/D032, junto con canal, chat HMAC, empresa y ronda derivados de la fila. **No descifra en SQL**, no devuelve texto ni teléfono.
- `whapi_confirm_find_ack_d051(channel,ack_hmac)`: busca únicamente un trabajo D047 con estado `accepted_by_transport` y procedencia acreditada por D048. Devuelve job UUID, canal, chat HMAC, empresa/ronda/revisión, origen y HMAC de acuse, sin identificadores WhatsApp en claro.
- Índice único parcial para impedir que dos trabajos aceptados del mismo canal utilicen la misma huella de acuse de transporte.

La seguridad utiliza rol propietario `cotironda_confirmation_reader_d051` NOLOGIN/NOINHERIT/NOBYPASSRLS, políticas RLS SELECT puntuales, SECURITY DEFINER con `search_path=''` y funciones ejecutables solo por `cotironda_confirm_gateway` D049, también NOLOGIN. No se crean roles de inicio de sesión, no hay acceso por `anon`, `authenticated`, `service_role` ni Data API pública. Nadie recibe SELECT directo a las tablas por ser gateway.

### En el servidor (sin conexión real)

`src/server/whapi-confirmation-postgres-d051.ts` expone un puerto **server-only, con conexión inyectada, no creada**:

1. Lee un registro cifrado y valida estrictamente longitud, campos y estructura de las columnas.
2. Descifra autenticando AES-GCM mediante el broker D029 inyectado. D050 verifica el «Confirmo», el `quoted_id` y su HMAC contra el acuse saliente obtenido desde el SQL privado D051.
3. Llama con seis parámetros SQL fijos a `whapi_confirm_from_inbox_d049`, que vuelve a verificar permisos, consentimiento, estado, revisión, IVA/flete y crea una versión inmutable en una transacción.
4. Verifica formato de respuesta y rechaza toda anomalía sin filtrar errores SQL, datos personales ni credenciales.

No se expone ruta HTTP, no se guardan credenciales ni se envían mensajes. El mismo evento D050 genera UUID/HMAC deterministas y D049 reconoce repeticiones en base, pero D051 **no afirma entrega exactamente una vez**. El trabajador confiable futuro deberá abrir la conexión con credenciales aisladas y hacer autenticación, cuotas y monitoreo.

## Evidencia

- `tests/unit/whapi-confirmation-db-port-d051.test.mjs`: casos normales y adversariales usando el receptor D027 y broker AES D029 auténticos con mensaje, claves y acuse ficticios, y consultas parametrizadas con resultados controlados. Ninguna red/Whapi/OpenAI.
- `supabase/tests/ci/110_whapi_confirmation_read_port_d051.sql`: PostgreSQL 17 real, con datos sintéticos en BEGIN/ROLLBACK, comprueba roles, RLS, privilegios, lectura cifrada e idempotencia de referencia, acuse con procedencia D048 y consulta de canal/huella incorrectos.
- Se ejecuta después de D024–D049 en GitHub Actions.

## Limitaciones y bloqueo

**No es un conector real a WhatsApp.** Las pruebas no prueban el ID real enviado por Whapi.Cloud ni los metadatos del webhook real. Tampoco hay un worker con conexión de BD y claves cargadas desde un gestor seguro, recepción de presupuesto por IA, ni emisor de resúmenes. El componente solo prepara un camino verificable, sin publicar.

Para piloto faltan: integración con Whapi real con consentimiento del proveedor; vínculo seguro del ID de salida/acuse y reconcilación ante timeouts; gestión de secretos y TLS, transacciones y workers con RBAC de servicio; validación de costos; controles de IA documental; prueba desde celulares. Las equivalencias técnicas siguen `sin_verificar` hasta homologación independiente. Ninguna adjudicación automática.

**Supabase DEV/producción intactos**. D024–D051 no están instalados en DEV; respaldo/restore real #175 continúa bloqueante. El PR permanece en borrador y la documentación de CI se ajustará a resultados verificados.

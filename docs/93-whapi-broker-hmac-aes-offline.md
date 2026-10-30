# 93 — D029: broker HMAC + AES-GCM de WhatsApp (OFFLINE)

**30/10/2026 · Issue #159 · PR apilado sobre #158. No es una integración Whapi desplegada.**

## Qué construye

`src/server/whapi-crypto-broker.ts` implementa el adaptador concreto de los puertos D027: `resolverProveedor`, `persistirEntrada` y `registrarBaja`. Los conecta **por interfaces inyectadas** con un futuro almacenamiento privado D028; no abre HTTP, no crea claves, no ejecuta SQL y no instala servicios.

- `resolverProveedor(channel,chat)`: genera HMAC-SHA256 del chat, envía solo ese pseudónimo al resolutor server-only y recibe un vínculo comprobado con empresa y única ronda autorizada. No acepta `supplierOrgId` ni `roundId` del webhook como permiso.
- `persistirEntrada`: genera HMAC-SHA256 de mensaje y una huella HMAC de contenido para idempotencia; cifra el texto normalizado con `AES-256-GCM` usando nonce aleatorio de 12 bytes, tag de 16 bytes y AAD que vincula canal, chat pseudónimo, mensaje pseudónimo, tipo y timestamp. Envía al puerto SQL solo `channel,chatKey,messageKey,fingerprint,kind,ciphertext,nonce,tag,sourceUnix`. **No reenvía texto, teléfono ni empresa declarada por el cliente** al puerto de escritura. D028 determina la empresa/ronda mediante vínculo e invitación reales.
- `registrarBaja`: usa identificadores HMAC y huella HMAC **calculada en servidor**, ignorando el SHA sin clave que proporciona D027; envía solo los cinco campos autorizados a D028. Funciona sin invitación activa. El almacenamiento debe verificar el contacto ya registrado y realizar la baja irrevocable.
- `verificarContenido`: rutina interna de prueba/futuro worker que exige metadatos conformes y descifra sólo con la clave correcta, verificando la autenticidad GCM + AAD. Nunca usarla en navegador, logs o respuesta al usuario.

## Secretos y versiones

Tres claves **separadas**, de 32 bytes cada una, inyectadas por un proceso confiable: `identidadHmac`, `huellaHmac`, `contenidoAes`. Se validan, se copian a buffers propios y se rechazan claves vacías/iguales. No crear llaves con contraseñas humanas ni hardcodearlas, no usar `NEXT_PUBLIC_*` ni `service_role` en el cliente, no registrar bytes o representaciones hex de secretos. `secretoWebhook` debe ser independiente de esas claves.

**Pendiente:** gestor de secretos por entorno, versionado de claves en mensajes persistentes, rotación de HMAC/cifrado con migración y re-cifrado sin perder de-duplicación, backup y control de acceso del worker. La versión lógica de AAD `1` en la implementación **no sustituye** un key-id persistente. No activar sin resolverlo.

## Seguridad y alcance real

El cuerpo del webhook de Whapi es no confiable. El receptor D027 verifica un encabezado compartido para canal configurado, pero **no equivale a una firma HMAC nativa certificada de Whapi**; una fuga del secreto del encabezado permitiría suplantación. Solo después de verificar canal, remitente y vínculo confiable, el broker cifra la entrada.

El puerto de almacenamiento **todavía es una interfaz**; las pruebas unitarias usan un `Map` sintético. No se conectó el SQL D028 a PostgreSQL DEV ni a una RPC pública, y no se otorgaron privilegios nuevos. La persistencia SQL D028 se probó por separado en PostgreSQL17; esta entrega NO prueba una transacción real entre Whapi y la BD. Antes de activar hay que implementar un worker servidor que use un rol mínimo autorizado para las funciones privadas, soporte reintentos, límites de costo y auditoría, y comprobar integración E2E con un canal Whapi de pruebas.

No se almacena URL remota de foto, audio o documento: D027 los retiene como `tipo` con `texto:null`. **Su descarga, cuarentena y extracción documental son otro módulo**, con control de tamaño, antivirus y prevención SSRF. No interpretar multimedia todavía.

La BAJA es una operación sensible que **no exige login, portal ni invitación vigente**, pero sí autenticidad de webhook y vínculo verificable del chat. No se enviaron mensajes de confirmación; outbox y política de opt-out siguen pendientes.

## Cómo se prueba

`tests/unit/whapi-crypto-broker.test.mjs` conecta webhook D027 con broker D029 y un almacén sintético, y verifica: texto cifrado (sin teléfono ni presupuesto legible en columnas), HMAC por canal/clave, reintentos sin duplicación, colisión de mensaje con texto diferente, manipulación de ciphertext/tag/AAD, clave equivocada, claves mutadas, media sin acceso a URL, BAJA sin ronda, replay de BAJA, consentimiento revocado, recibo falso del almacén y autenticación fallida. Mantiene las pruebas SQL D028 existentes y toda la suite.

**Decisión UX-001:** WhatsApp sigue siendo la vía natural para responder; ninguna credencial, contraseña o planilla nueva se exige al proveedor. El broker aporta complejidad interna, no pasos adicionales para las personas.

**Sin instalar DEV, sin despliegue/producción, sin tokens IA, sin envíos de WhatsApp, sin webhook público.**

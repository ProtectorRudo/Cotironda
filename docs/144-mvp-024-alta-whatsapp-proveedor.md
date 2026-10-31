# 144 — MVP-024: activar WhatsApp de un proveedor con un solo mensaje

31/10/2026 · Issue #261 · laboratorio PostgreSQL17 y Node22 CI, sin instalación en Supabase DEV ni WhatsApp real.

## Problema corregido

D028/D030 exigían un contacto verificado y una ronda activa antes de interpretar un WhatsApp entrante; D068/D069 exigían un contacto previo para guardar el número cifrado. Esa dependencia circular impedía dar de alta el **primer** corralón. El comprador no debe solucionar eso ni confirmar invitaciones; el alta es una acción voluntaria del proveedor.

## Experiencia prevista

Un dueño o gerente de proveedor ya autenticado en Cotironda toca **«Activar mi WhatsApp»**. El servidor crea un código aleatorio de 128 bits con caducidad de 15 minutos, guarda solo su SHA-256 vinculado a empresa/canal y abre la URL oficial de WhatsApp:

`https://wa.me/NUMERO_COTIRONDA?text=COTI%20ALTA%20CODIGO`

El usuario envía ese único mensaje desde el WhatsApp del negocio. Ese acto explícito es el consentimiento para recibir solicitudes en ese canal. No pedimos foto del número, contraseña adicional, «Confirmo», carga de formulario ni indicamos al usuario que edite un presupuesto. Para cotizar luego solo responde a su consulta por WhatsApp. El enlace **no envía el mensaje automáticamente**: WhatsApp lo muestra prellenado y el comercio lo envía.

Fuente oficial WhatsApp Click to Chat: https://faq.whatsapp.com/5913398998672934

## Contrato de seguridad

- **Emisión D072**: función pública de solo EXECUTE `public.whapi_issue_supplier_code_d072` ejecutada por `authenticated`, con JWT no anónimo, correo verificado y sesión Auth viva mediante `storage_session_active()`, más membresía owner/manager ACTIVA de empresa supplier/both con perfil existente. Cinco emisiones por empresa/canal cada 24 h. Emitir uno invalida los anteriores. El token de 128 bits está disponible una sola vez al solicitante, no se guarda en claro ni se escribe en logs.
- **Recepción D027**: se reutiliza el receptor Whapi actual y su encabezado secreto verificado, canal exacto, mensaje entrante de chat directo, remitente y marca temporal coherentes. Solo el patrón literal `COTI ALTA <32 hex minúsculas>` se deriva a D072 antes de buscar una ronda; el resto conserva el comportamiento D027. Un mensaje arbitrario no crea consentimiento.
- **Consumo D072**: RPC SQL en esquema privado, gateway de ejecución mínima NOLOGIN/NOBYPASSRLS, hash SHA-256 del token en contexto de canal, lock transaccional, control de vencimiento, caducidad y membresía todavía activa. Registra HMAC de chat, fecha de verificación y fecha de consentimiento en D028. Rechaza otro canal, teléfono ya asociado, empresa ya con contacto, segundo chat e intento de reactivar BAJA. Mismo message ID de un replay válido devuelve `already_registered`; otro message ID se rechaza.
- **Cifrado D069**: tras **COMMIT** del consumo D072 se ejecuta la función ya existente D069 con autorizarContacto server-only y verificación final SQL D068, para guardar el destinatario bajo AES-GCM. Si falla el vault, el receptor responde error reintentable, y el mismo evento puede completar D069 sin registrar dos contactos.
- **Datos privados**: SQL no contiene teléfono/chat legible, mensajes en texto, contraseña del proveedor, URL completa ni claves AES/HMAC. La vista buyer no obtiene los códigos ni contactos. La interfaz de alta muestra el enlace únicamente al usuario autorizado; no debe incluirlo en analytics, logs, Referer ni estados públicos.
- **Alcance UX**: el proveedor define categorías/rubros y zona de entrega en su perfil. La emisión D072 no deduce categorías ni habilita recepción si `accepting_quotes` está apagado; D065 realiza la selección real.
- **Límites de la solución**: un código es una credencial transferible dentro de 15 min. Si el dueño deliberadamente lo reenvía a otro teléfono, ese número puede quedar vinculado. El usuario debe abrir el enlace desde el WhatsApp comercial correcto. Rotación de número o revocación de BAJA requiere proceso supervisado; no reactivar automáticamente.

## Pruebas

`supabase/tests/ci/126_supplier_whapi_self_enroll_d072.sql`: PG17 real descartable: identidad Auth ficticia con sesión, autorización owner/manager, rechazo de cruce de empresas, código hash, primer consumo, mismo evento repetido, replay desde otro teléfono/mensaje, canal incorrecto, BAJA, revocación de sesión y permisos.

`tests/unit/mvp024-whapi-supplier-self-enroll-d072.test.mjs`: URL `wa.me`, sin envío automático, D027 con webhook secret correcto, D029 opcional, validación de HMAC, rechazos/fallos.

**No se activó ningún webhook, endpoint ni proceso automático, no se instaló SQL en DEV/producción, no se enlazó un número real y no se hizo backup/restore real de DEV.** El PR es draft y sigue el bloqueo #175. Para el piloto habrá que habilitar una interfaz privada de alta y credenciales secretas; este incremento aporta el núcleo de lógica, no un onboarding público listo.

## Próximos pasos mínimos

1. Completar backup real + recuperación aislada DEV #175.
2. Aprobar e instalar incrementalmente D024–D072 en Supabase DEV, revisar los permisos alojados y habilitar registro supplier controlado.
3. Conectar la pantalla del proveedor autenticado a la función de emisión D072 y el webhook D027/D029 a su alta real (sin canales ajenos).
4. Probar con **un comercio que voluntariamente acepte**: activa WhatsApp → recibe consulta de su rubro/zona → responde precio → comprador ve oferta anónima; verificar BAJA, duplicados y costo. Mantener producción apagada hasta «Publicalo».

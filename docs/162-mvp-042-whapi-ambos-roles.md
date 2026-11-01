# 162 — MVP-042: un WhatsApp, entrada de comprador y proveedor

**01/11/2026 · Issue #297 · entrega en rama de integración privada, SIN webhook real/DEV.**

## Diferencia práctica

Hasta hoy, D027 aceptaba exclusivamente proveedores; un arquitecto que enviaba su pedido al número de Cotironda era **rechazado** por falta de invitación de proveedor. Eso impedía arrancar el negocio WhatsApp-first aunque Whapi estuviera vinculado por QR.

Este incremento reutiliza el **mismo receptor Whapi** y el **mismo broker AES-GCM/HMAC** para ambos roles. El administrador conecta un solo número a Whapi; comprador y negocio escriben al mismo canal. No se agrega registro/curso/carga de formulario por WhatsApp. **No se interpreta el cuerpo para adivinar el rol**: el sistema debe resolver la pertenencia vigente del chat en tablas privadas mediante HMAC. La vinculación comercial sigue pendiente de SQL real.

## Código

- `src/server/whapi-inbound-offline.ts`: nuevos puertos opcionales `resolverComprador`, `persistirEntradaComprador`, `registrarBajaComprador`. Antes de guardar consulta los dos vínculos del chat, valida identidad y consentimiento, **rechaza dualidad** y atribuye el evento solo al buzón de su empresa. Si falta vínculo, rechaza; jamás da de alta a un comprador desconocido por enviar texto. Se mantiene intacta la conducta y protocolo de proveedores sin puertos de comprador. El ACK de entrada solo declara **persistida** o **duplicada**: nunca cotizada, reenviada ni rankeada.
- `src/server/whapi-crypto-broker.ts`: resuelve comprador por HMAC del chat, **revalida identidad inmediatamente antes de escribir**, cifra contenidos con AES-256-GCM y AAD *distinto del de proveedores* que ata `comprador`, canal, chat HMAC, mensaje HMAC, empresa, tipo, hora y versión de clave; huella HMAC de contenido. El puerto privado de almacenamiento debe ser atómico, idempotente y único por canal+messageKey a través de ambos roles. Introduce `verificarContenidoComprador` que exige AAD y falla si alguien altera identidad/clave/fecha/rol.
- **BAJA de comprador** pasa por puerto separado sin afectar proveedores. Puede registrarse aun si el consentimiento para futuros mensajes ya estaba retirado. `COTI ALTA` sigue siendo protocolo de **proveedor**. Media recibida queda cifrada como `text:null`, sin seguir URL ni inventar que el archivo fue leído.
- La llegada a `src/server/buyer-whatsapp-ingress-d073.ts` continúa **desconectada** hasta que exista una función SQL privada que descifre la bandeja comprador y cree la ronda en una transacción. Para presupuestos proveedores, D061/D062 tienen flujo propio. No se creó webhook público ni hubo mensajes, URL externos, números reales ni ejecución de IA.

## Condiciones de aceptación

- Legados D027/D029 y altas/bajas de proveedores no se rompen.
- Buyer text/document/media se guarda cifrado con vínculo a la empresa **solo si confirmado por gateway**.
- Nunca comprador/proveedor según texto o campo suministrado por Whapi.
- Si un chat tiene ambos roles, retorna 403 sin almacenamiento.
- Duplicados inmutables; misma ID con texto diferente retorna 503 sin sobrescribir.
- BAJA comprador sí, con HMAC propio y sin modificar proveedor; bajo pérdida de consentimiento no debe pedirse un «Confirmo».
- Error o timeout de almacenamiento devuelve 503, NO acuse exitoso.
- Tests de cifrado/auditoría, entrega ACK, duplicados, spoof, BAJA, media y regresión completa.

## Puertas hasta piloto auténtico

**VERIFICADO read-only:** `cotironda-dev` tiene 17 migraciones, ninguna ronda comercial D024+ instalada. Debemos completar el respaldo y restauración aislada #175 antes de instalar D024+ en DEV. Luego se requieren SQL de vínculo comprador/verificación de chat + inbox privado cifrado, workers D073/D061/D071, webhook HTTPS que confirme guardado antes del 200, extracciones PDF/Word/Excel/fotos por IA segura, consentimiento de proveedores y envío Whapi con allowlist; al cierre ranking D022 real por rubro y finalistas UX-002 con contacto mutuo autorizado.

**NO habilitar Whapi desde código sin tener esas piezas**, no añadir endpoint que devuelva 200 sobre mensajes descartados y no usar `SUPABASE_SERVICE_ROLE_KEY` en navegador. Ningún SQL/Whapi/Vercel/DNS/main/productivo modificado en este PR. La meta sigue siendo una única acción para comprador (mandar su pedido) y otra por proveedor (enviar presupuesto), con mínima aclaración solo cuando falten datos vitales.

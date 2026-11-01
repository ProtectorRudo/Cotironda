# 164 — MVP-044: leer el pedido cifrado del arquitecto y pasarlo al motor D073

**01/11/2026 · Issue #301 · SOLO GitHub/CI, sin instalaciones comerciales ni envíos Whapi.**

## Brecha técnica resuelta

MVP-043 creó el buzón cifrado del comprador D074 en PostgreSQL, pero **ningún trabajador podía leerlo**. MVP-044 agrega un lector SQL de permisos vigentes y un adaptador privado que descifra y entrega la lista al procesador de pedido existente D073. La primera versión del piloto sigue siendo **WhatsApp primero**, portal opcional y sin adjudicación en Cotironda.

### 1. Lectura PostgreSQL protegida

`supabase/sql/whapi_buyer_inbox_read_d076.sql` implementa `cotironda_private.whapi_buyer_read_d076(channel,messageKey)` bajo un rol lector **NOLOGIN/NOBYPASSRLS**. Solo entrega el ciphertext AES-GCM, IV, tag, HMAC de identidad de chat y mensaje, ID de empresa, tipo de mensaje y versión de clave. No entrega contacto ni texto en claro.

La función exige que el contacto de comprador esté **verificado, consentido, vigente y sin BAJA en el momento de la lectura**, que no exista vínculo de proveedor con el mismo chat y que sea una entrada pendiente (nunca un evento BAJA). Si se revoca el contacto, los mensajes viejos se vuelven ilegibles por la ruta de trabajo. Un segundo rol gateway NOLOGIN solo recibe permiso **EXECUTE**, nunca SELECT de las tablas; ninguna función o tabla nueva se expone a anon, authenticated, service_role ni a PostgREST.

### 2. Traspaso al pedido real sin duplicar parser

`src/server/buyer-whatsapp-inbox-reader-d076.ts` obtiene el registro cifrado vía SQL fijo parametrizado, valida la forma y tamaños, reconstruye AES y llama `verificarContenidoComprador` del broker D029/MVP-042 para autenticar **rol, empresa, chat, mensaje, hora y clave en AAD**. Si falla, no pasa texto al procesamiento. Luego usa el `crearConsumidorCompradorWhatsappD073` ya existente:

- Texto confiable con productos y zona → invoca el **puerto privado** de creación de ronda y después la preparación de invitaciones D071. **Esos puertos siguen sin implementación comercial instalada**, así que este código no crea rondas reales ni dispara WhatsApp.
- Texto confiable con materiales pero sin zona → invoca el puerto para registrar **una sola** pregunta con la lista original. **Falta instalar/crear el almacenamiento transaccional de pregunta y la correlación con la respuesta**; por ahora no se prueba un chat vivo que continúe la conversación.
- Archivo o imagen sin extracción autenticada → queda esperando extracción segura. No se sigue un link de Whapi, no se le considera un documento leído y no se llama IA por detrás.
- BAJA o consentimiento retirado → no se devuelve contenido; no hay contacto indebido.

Los efectos se realizan solo por **puertos inyectados y transaccionales**, que deben revalidar identidad/consentimiento al momento de escritura. El flag de trabajo está **apagado** fuera de CI; no hay endpoints públicos ni secretos.

### 3. Pruebas y alcance del piloto

- `supabase/tests/ci/129_whapi_buyer_inbox_read_d076.sql`: PostgreSQL 17 descartable, datos ficticios y ROLLBACK. Lectura autorizada, lookup inexistente, aislamiento de canal, revocación en mensajes antiguos, negativa a acceder a tablas o ejecutar RPC desde clientes no autorizados, validación de índices y formato.
- `tests/unit/mvp044-buyer-inbox-read-worker.test.mjs`: webhook simulado D027 → broker cifrado D029 → buzón simulado D074 → lector SQL simulado D076 → parser D073. Casos con zona, sin zona, documento pendiente, HMAC falso, error SQL, empresa/nonce/tag manipulados, status OFF y respuestas SQL de forma extraña.
- 5 workflows del PR, PostgreSQL/RLS, Auth/PostgREST, unitarias y build Next/TypeScript. No informar PASS antes de resultados.

## Próximo paso concreto

El **siguiente vacío operativo** no es otro panel: es un backend privado conectado a Supabase DEV que ofrezca en transacciones idempotentes el puerto `registrarFaltaZona` y `crearRonda` del D073; después se necesita el endpoint HTTPS webhook seguro, el worker de propuestas/proveedores y la extracción de PDF/Word/Excel/fotos. El cierre debe seleccionar hasta dos finalistas por rubro/condiciones comparables sin adjudicar compras.

**Gate pendiente #175:** el backup cifrado real y la **restauración independiente** de DEV necesitan acceso seguro local al DSN, PostgreSQL17 y la identidad age. La prueba CI de un respaldo sintético NO acredita recuperabilidad de Supabase DEV. Ni D074 ni D076 se instalaron en DEV. No solicitar contraseñas por chat y nunca transportar respaldos con datos personales a GitHub/Vercel.

**Ningún envío real ni URL pública activados.** En MVP-044 no se tocó main, producción, DNS, Vercel ni WhatsApp real.

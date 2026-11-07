# Decisión 403 — MVP278: doble SHA documental PDF/DOCX/XLSX → IA Central

**Fecha:** 06/11/2026 (Argentina). **Luz verde = desarrollo y tests; NO publicar.** No enviar WhatsApps ni cambiar crons, producción, piloto real o gastos. Respaldo pago permanece Plan B.

## Auditoría previa

En GitHub la rama de desarrollo incluye MVP275 (TXT/CSV original, doble lectura, fuente textual), MVP276 (autoridad SQL solo para TXT/CSV) y MVP277 (lectura independiente de PDF posicionado y OpenXML DOCX/XLSX con CRC y fuentes sin folios ocultos). El **piloto real todavía no tiene estas migraciones ni webhook actualizado**. Un PDF original no puede presentarse como `kind='text'`: hay que conservar la huella del binario, su ruta Storage y **otra huella distinta del texto derivado**. Un lector independiente que acredita 2 renglones no autoriza un plan que genere 1 o 3 renglones.

## Diseño implementado

**SQL:** `supabase/piloto/mvp278_autorizacion_binarios_lectura_independiente.sql` solo instalar cuando haya autorización separada para entorno PILOTO y dependencias verificadas. Crea tabla privada `ai_buyer_binary_evidence_mvp278`, con:
- `message_hmac`, `chat_hmac`, `buyer_key`, `mime`;
- `original_sha256` de **todos los bytes del PDF/DOCX/XLSX** archivado en Storage;
- `derived_text_sha256` calculado de las líneas **extraídas por el lector del binario**, nunca de un texto atribuido al remitente;
- número exacto de líneas/materiales acreditados (1–25), longitud del texto y versión del verificador, con anotación de fecha.

Solo el servidor confiable (llave `service_role` en Edge, nunca navegador, mensaje/IA ni GitHub) llama a `cotironda_piloto_ia_attest_binary_mvp278` **después** de MVP277. SQL no puede interpretar por sí solo PDF/ZIP ni garantizar que se ejecutó el lector independiente; esa es una frontera de confianza explícita del código de servidor. La función valida la fuente Whapi autenticada, comprador activo/consentido, MIME, ruta privada, registro Storage existente, SHA de archivo archivado, límites de tamaño, estado `stored`, y calcula por su cuenta el SHA del texto derivado. **No guarda el texto derivado en la tabla de evidencia ni lo devuelve al cliente.** Ante una segunda atestación idéntica responde `already_attested`; ante revisión diferente responde `conflicting_evidence`. No permite modificar evidencia registrada.

La función privada `fuente_binaria_comprador_mvp278` se reevalúa **en los cuatro gates** de IA Central ya existentes: reserva MVP226, preparación en sombra MVP221, publicación MVP222 y búsqueda para despacho MVP223. Requiere identidad y consentimiento vigentes, bytes archivados no sustituidos, mismos dos SHA, MIME y existencia del objeto Storage. Para las últimas tres etapas exige además `verified_items` igual al número de materiales que se están intentando preparar/publicar/despachar. Así no puede reducir de 2 ítems corroborados a 1. Las ramas SQL existentes para texto y TXT/CSV permanecen intactas. RLS activo, sin grants de tabla a `service_role`, `anon` o `authenticated`, funciones restringidas a `service_role`.

**Edge:** `ai-central-buyer-binary-broker-mvp278.ts` verifica identidad y original con MVP277; atestigua con la nueva RPC; entrega **una única vez** el texto extraído al broker semántico existente `procesarCompradorCentralMvp226`, usando el SHA del texto derivado y el HMAC del mensaje **documental original**, nunca falsificando `kind='text'`. El SQL vuelve a cotejar esa relación. Reconciliación conservadora ante errores/timeout/duplicados; sin un reintento ciego de WhatsApp, sin exponer archivo, contenido, dirección ni proveedor en el resultado.

La rama del webhook se habilitará exclusivamente con `COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_ACTIVE_ENABLED=true`, actualmente **OFF por defecto** y además subordinada a los controles anteriores de IA Central, consentimiento, transporte y ventana de piloto. La ruta es excluyente con la previsualización MVP277 y el preparador heredado; sin activar el flag se conserva el comportamiento anterior.

**Punto fundamental del negocio:** se fuerza `publicar:false` para este camino, incluso si otros flags están habilitados. **Nunca se dispara un WhatsApp por la verificación del archivo**. Se puede preparar en sombra, pero para habilitar el despacho real desde PDF/Office falta una **confirmación auténtica del comprador** con autoría/versión de su solicitud, vinculada por SQL. No se autoriza un envío que el comprador todavía no revisó.

**Rollback manual:** `mvp278_rollback_binarios_MANUAL.sql` exige gates IA/despacho OFF y ninguna ronda documental activa, restaura las cuatro RPC a la versión MVP276 TXT/CSV, revoca los grants de atestación y **conserva íntegra la tabla de evidencia**, para auditoría posterior.

## Pruebas

- SQL PostgreSQL 17 sintético real `mvp278-binary-evidence-pg17.sql` recupera todo el fixture MVP276, agrega registro Storage simulado y ejercicio de PDF + atestación, hash original erróneo, archivo inexistente, modificación posterior, conteo de ítems distinto, duplicación, alias de otra empresa/chat, consentimiento revocado, ACL y deduplicación. Termina **ROLLBACK**, sin servicios externos.
- Pruebas Node de Edge `mvp278-buyer-binary-central-broker.test.mjs`: autenticación, bytes del original y lectura independiente, hash dual, una sola atestación, broker sin publicar, error incierto sin reintento, flag OFF y exclusión de rutas.
- Deno typecheck real del webhook, regresiones generales y compilación Next.js. Fusión solo cuando todas estén verdes.
- Ensayo de compatibilidad en PILOTO con `BEGIN; SET LOCAL lock_timeout; ... MVP276 + MVP278; ROLLBACK`: debe confirmar tablas y funciones **no instaladas después** y gates OFF. Ese ensayo no prueba recuperación de datos ni E2E.

## Pendientes de lanzamiento

1. Instalación y configuración piloto de migraciones MVP245/248/250/274/276/278 y dependencias de etapas posteriores, **solo con autorización «Publicalo» y plan de reversión**. Nunca afirmar que un PR equivale a publicación.
2. El comprador debe poder **ver y confirmar explícitamente** los materiales/rubros antes de que la ronda documental genere invitaciones. La rama de archivos solo crea rondas en sombra hasta completar ese permiso.
3. Prueba real en un único circuito con comprador y los dos proveedores consentidos por WhatsApp: texto/PDF/Excel, localidad, PDF por rubro, respuestas, IVA/flete, pantalla por rubro, cierre y dos ganadores, con observabilidad de costos y dedupe. Un `api_accepted` no demuestra entrega.
4. Fotografías y PDF escaneados requieren fuente independiente u otra revisión legítima. `>25` materiales en un mismo documento exige lotes con cobertura total, nunca recorte silencioso.
5. Infraestructura/backup externo **Plan B, sin gasto nuevo**; riesgo de pérdida de datos reales no resuelto y por eso no anunciar lanzamiento comercial irrestricto.

**Estado:** implementación en rama de desarrollo y pruebas. Ninguna migración/Edge publicada ni credencial expuesta.

# MVP-131 - recuperación documental interna sin otro WhatsApp

03/11/2026 - Issue #473. Desarrollo solamente. No se publicó en PILOTO.

## Evidencia real
Archivo PDF de Ailín de 12.725 bytes, Storage privado, propietario consentido, invitación y ronda abiertas, hash y ruta correctos, sin propuesta ni diagnóstico. El trabajador v39 solamente se activa ante otro mensaje Whapi firmado; no es autónomo.

## Contrato
- Función interna cotironda-piloto-document-recovery con clave secreta en apikey autenticada por @supabase/server y verify_jwt=false; nunca clave publishable ni invocación desde browser. Bandera adicional COTIRONDA_PILOT_DOCUMENT_RECOVERY_ENABLED OFF por defecto, además del flag de IA documental existente.
- Solo POST, proyecto exacto y OpenAI API key disponible antes de consultar SQL.
- Función SQL pública solo en nombre, no abierta a usuarios: execute revocado de PUBLIC, anon, authenticated y otorgado exclusivamente a service_role. Devuelve un chat HMAC de participante elegible sin datos comerciales, exige consentimiento, fuente privada, invitación y ronda abiertas, cuota de 24h y reintento elegible.
- Se delega al mismo worker MVP128, que verifica nuevamente todas las condiciones y bloquea el trabajo bajo transacción. Descarga solo media/HMAC del bucket privado, coteja tamaño y SHA256, realiza dos lecturas y verifica cada importe, concepto adicional y total. No modifica el original.
- Ninguna invitación, mensaje WhatsApp o salida comercial se origina en el servicio. La respuesta HTTP solo incluye código sin texto, nombres, HMAC o precios.
- Una ejecución no procesa más de un documento. Si faltan evidencias, el presupuesto permanece privado; no fingir que un draft equivale a presupuesto aprobado.

## Pendientes y autorizaciones
- Verificar Deno typecheck del endpoint y pruebas unitarias; luego prueba SQL real en PostgreSQL17 aislado.
- Solo ante autorización Publicalo: solo PILOTO, instalar selector SQL y función Edge en la instancia de pruebas, con la nueva bandera OFF hasta prueba de acceso autorizado y rechazo de apikey inválidas.
- Para ejecución programada, configurar pg_cron y pg_net con credencial secreta en Vault, revisando permisos a cola pg_net. Nunca guardar tokens en GitHub, SQL o chat.
- Después, consultar el registro real del PDF de Ailín y comprobar si existe borrador y presupuesto verificado. No declarar éxito sin comparar todos los artículos, extras y el total. Nunca publicar a ciegas.

Se agregó prueba SQL PG17 real en CI con datos sintéticos que exige revocación para anon/authenticated, SELECT mediante service_role, rechazo por baja, vencimiento, ruta de storage distinta y cuota agotada. Esto no ejecuta SQL en el piloto ni procesa el PDF real.

## Publicación autorizada en PILOTO — 03/11/2026

El usuario autorizó explícitamente ejecutar en `cotironda-piloto`. En la base aislada se aplicó `mvp131_private_document_recovery_service_trigger` (versión de migración `20261103133640`); se verificó RPC con resultado `candidate` para el PDF ya almacenado de 12.725 bytes y permisos efectivos: `anon` y `authenticated` denegados, `service_role` habilitado. No se extrajeron hashes ni contenido a ningún log.

Se desplegó la nueva Edge Function `cotironda-piloto-document-recovery` **v1 ACTIVE**, con `verify_jwt=false` y autenticación de clave secreta en el handler mediante `@supabase/server`. La condición adicional `COTIRONDA_PILOT_DOCUMENT_RECOVERY_ENABLED=true` permanece sin configurar/verificar: la implementación falla cerrada. No se invocó el worker con credencial de servidor y por tanto **el presupuesto de Ailín aún está sin extraer**. La sesión de ChatGPT tiene acciones de desplegar y SQL pero no herramientas de administrar secretos Edge o invocar la función con la clave privada; no afirmar éxito de relectura. La fuente original, estado comercial, WhatsApp v39 y sitio cotironda.com permanecen sin cambios.

El CI `cotironda-piloto-recovery-edge-auth.yml` prueba en vivo tres solicitudes no autorizadas, únicamente códigos HTTP, sin credenciales y sin activar recuperación. Aún hace falta habilitar la bandera en Edge, invocar con una clave secreta de servidor para efectuar la lectura real y revisar luego el estado `media_archive_mvp095`/diagnósticos/renglones, sin revelar oferta si la fuente no corrobora.

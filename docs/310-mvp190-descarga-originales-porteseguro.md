# MVP190 — Descarga original protegida por sesión, consentimiento y SHA (solo desarrollo)

**04/11/2026.** Alcance: implementación del transporte servidor y tests del contrato existente de autorización MVP161. No activa enlaces ni modifica Supabase, Vercel o WhatsApp. #525, #529.

## Problema que resuelve
El comprador debe poder descargar, al concluir su ronda, **todos los archivos originales auténticos** de los proveedores que consintieron compartirlos, sin obligarlo a comprarle a un supuesto ganador. Una oferta parcial también puede estar autorizada. Un presupuesto de archivo original puede contener nombres, contactos, CBU o precios sensibles; por eso **el token de seguimiento de WhatsApp, que se puede reenviar, NO es autenticación suficiente**.

En la arquitectura actual, el portal usa Supabase Auth **DEV** `qkercsoqhehbenbbncwk`; el piloto WhatsApp está en `ilggkalaafhtiysyzlmg` y tiene **0 usuarios Auth**. Ningún acceso puede conectarse automáticamente entre esos proyectos por nombre, teléfono o enlace. La futura resolución debe establecer una identidad probada del comprador en el entorno de piloto sin formularios innecesarios.

## Implementación MVP190
`src/server/originales-descarga-http-mvp190.ts` exporta un único manejador HTTP `procesarDescargaOriginalMvp190` que, **sin incluir una ruta pública ni ejecutarse en piloto**, organiza el acceso futuro:
1. Feature flag deliberadamente requerido `habilitado=true`. Solo `GET`; IDs `UUID` de ronda y documento, sin token en query string.
2. Sesión fresca del comprador obtenida **del servidor** mediante `verificarSesion`, exigencia de usuario/empresa, rol buyer, vencimiento y no revocación. El portal de seguimiento no puede inyectar usuario, empresa, contacto, HMAC ni permiso.
3. El servidor busca el identificador opaco de documento mediante `leerContexto({rondaId,documentoId,usuarioId,empresaId})` **contra una función privada que deberá existir antes del despliegue**. La consulta ha de comprobar sesión real de Supabase Auth + `auth.sessions`, empresa, buyer de ronda, consentimiento voluntario individual y estado actualizado. Las fuentes no se adquieren desde entrada del navegador.
4. Reutiliza `evaluarDescargaOriginalMvp161`: ronda efectivamente cerrada tras plazo, creada después de política activada, consentimiento versión `cotironda-originales-v1` antes de invitación, proveedor correcto, bucket privado exacto, HMAC + ruta exacta, sha/bytes/mime y revisión vigente. Se corrigió asimismo un caso histórico: consentimiento no puede anteceder creación de ronda **ni** inicio de política.
5. Lee **bytes originales** de Storage privado con una dependencia `leerArchivo` administrada por servidor; **no genera URL firmada en navegador**. Cap de 8 MiB, solo PDF/JPEG/PNG/WebP/DOCX/XLSX/TXT/CSV, calcula SHA-256 de los bytes con WebCrypto y lo compara con SHA auditado antes de entregar.
6. Justo antes de responder revalida **sesión, consentimiento, vínculo fuente y versión vigente**. Si el usuario o proveedor revocó, o cambió el contenido/registro, falla cerrado. No hay listado ni permiso por ranking; cada archivo se evalúa de forma independiente.
7. Si autoriza, entrega `application/pdf` u otro MIME original con `Content-Disposition: attachment`, `Cache-Control: no-store`, CSP sandbox y un nombre neutral `cotironda-original-<identificador parcial>.<ext>`. Sin URL firmada, teléfono, HMAC, ruta o identidades en headers/errores JSON.

## Pruebas
Regresión con pruebas sintéticas del manejador de descarga por bytes; sesiones inexistentes/otra empresa/expiradas, consentimiento revocado, aceptación pre-política y pre-ronda, versiones/cifras SHA adulteradas, otro proveedor/archivo, MIME activo, revocación y cambio de fuente **durante lectura**, error seguro sin IDOR, PDF y Excel auténticos del fixture. El contrato sin posición ni finalistas de MVP161 sigue.

## Faltantes CRÍTICOS antes de ofrecer descargas reales
- **No hay endpoint activo**: está deliberadamente sin route handler hasta disponer de comprador autenticado EN PILOTO y conexión segura WhatsApp→Auth/empresa (sin confiar en token de seguimiento). Nunca usar una cuenta DEV como autorización PILOTO.
- Desarrollar un selector privado por identificador opaco de documento, con RLS/ACL de servicio, pertenencia a comprador, consentimiento prospectivo **por proveedor/ronda**, fuente SHA y una política global inicialmente **OFF**. La propuesta de SQL MVP178 ya está probada reversiblemente, pero no instalada. No crear permisos implícitos por recibir presupuesto.
- Vincular físicamente el adaptador Storage privado y SQL al manejador, auditar accesos sin volcar bytes/HMAC y agregar límites de frecuencia. Verificar ausencia de acceso cruzado entre empresas con pruebas PostgREST reales.
- Darle al comprador una lista de **todos los documentos permitidos** al cerrar, no solo de dos recomendados; ninguna ronda histórica puede heredar permiso. Implementar integración E2E consentida en una **nueva ronda** después de activar política autorizada.
- Debe existir orden separada `Publicalo en cotironda-piloto` para modificar piloto; no `main`, no producción, no WhatsApps, no alias de dominio.

**Resultado esperado de este PR:** transporte HTTP real preparado, fail-closed y con pruebas, **sin credenciales reales ni interfaz pública hasta resolver identidad y autorización**. No marcar #525 terminado ni prometer descarga inmediata.
